"""Direct messaging: 1-to-1 conversations between users.

MVP transport is REST + client-side polling (no websocket infra) — the
client polls ``GET /messages/conversations/{id}/messages`` every ~4s while
the chat screen is focused. Conversation ids are deterministic per user pair
(via ``pair_key``) so re-messaging the same person always resumes the same
thread instead of forking new ones.

Group chat lives in ``routers/groups.py`` (thread_type="group") but shares
the same ``messages_col``/``chat_reads_col`` storage.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from db import chat_reads_col, conversations_col, messages_col, users_col
from helpers import emit_notification, now_iso, public_user
from models import ConversationStartIn, MessageIn
from security import get_current_user

router = APIRouter()

MAX_MESSAGE_LEN = 2000


def _pair_key(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))


async def _get_conversation_or_404(conv_id: str, user_id: str) -> dict:
    c = await conversations_col.find_one({"id": conv_id}, {"_id": 0})
    if not c or user_id not in (c.get("participant_ids") or []):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


async def _serialize_conversation(c: dict, viewer_id: str, other_hint: Optional[dict] = None) -> dict:
    other_id = next((p for p in c["participant_ids"] if p != viewer_id), None)
    other = other_hint
    if other is None and other_id:
        u = await users_col.find_one({"id": other_id}, {"_id": 0, "hashed_password": 0, "email": 0})
        other = public_user(u) if u else {"id": other_id, "display_name": "Unknown"}
    read = await chat_reads_col.find_one(
        {"thread_type": "dm", "thread_id": c["id"], "user_id": viewer_id}, {"_id": 0, "last_read_at": 1},
    )
    last_read_at = (read or {}).get("last_read_at")
    last_msg_at = c.get("last_message_at")
    unread = bool(
        last_msg_at
        and c.get("last_sender_id") != viewer_id
        and (not last_read_at or last_msg_at > last_read_at)
    )
    return {
        "id": c["id"],
        "other_user": other,
        "last_message_text": c.get("last_message_text"),
        "last_message_at": c.get("last_message_at"),
        "last_sender_id": c.get("last_sender_id"),
        "unread": unread,
        "created_at": c.get("created_at"),
    }


@router.post("/messages/conversations")
async def start_conversation(data: ConversationStartIn, user=Depends(get_current_user)):
    if data.user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You can't message yourself")
    target = await users_col.find_one({"id": data.user_id}, {"_id": 0, "hashed_password": 0, "email": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    key = _pair_key(user["id"], data.user_id)
    existing = await conversations_col.find_one({"pair_key": key}, {"_id": 0})
    if existing:
        return await _serialize_conversation(existing, user["id"])
    doc = {
        "id": str(uuid.uuid4()),
        "pair_key": key,
        "participant_ids": [user["id"], data.user_id],
        "created_at": now_iso(),
        "last_message_text": None,
        "last_message_at": None,
        "last_sender_id": None,
    }
    await conversations_col.insert_one(doc)
    return await _serialize_conversation(doc, user["id"], public_user(target))


@router.get("/messages/conversations")
async def list_conversations(user=Depends(get_current_user)):
    out = []
    async for c in conversations_col.find(
        {"participant_ids": user["id"], "last_message_at": {"$ne": None}}, {"_id": 0},
    ).sort("last_message_at", -1):
        out.append(await _serialize_conversation(c, user["id"]))
    return out


@router.get("/messages/unread-count")
async def unread_count(user=Depends(get_current_user)):
    total = 0
    async for c in conversations_col.find(
        {
            "participant_ids": user["id"],
            "last_message_at": {"$ne": None},
            "last_sender_id": {"$ne": user["id"]},
        },
        {"_id": 0, "id": 1, "last_message_at": 1},
    ):
        read = await chat_reads_col.find_one(
            {"thread_type": "dm", "thread_id": c["id"], "user_id": user["id"]}, {"_id": 0, "last_read_at": 1},
        )
        last_read_at = (read or {}).get("last_read_at")
        if not last_read_at or c["last_message_at"] > last_read_at:
            total += 1
    return {"unread_conversations": total}


@router.get("/messages/conversations/{conv_id}/messages")
async def list_messages(
    conv_id: str,
    before: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    user=Depends(get_current_user),
):
    await _get_conversation_or_404(conv_id, user["id"])
    query: dict = {"thread_type": "dm", "thread_id": conv_id}
    if before:
        query["created_at"] = {"$lt": before}
    cursor = messages_col.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    msgs = [m async for m in cursor]
    msgs.reverse()
    return msgs


@router.post("/messages/conversations/{conv_id}/messages")
async def send_message(conv_id: str, data: MessageIn, user=Depends(get_current_user)):
    c = await _get_conversation_or_404(conv_id, user["id"])
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message can't be empty")
    doc = {
        "id": str(uuid.uuid4()),
        "thread_type": "dm",
        "thread_id": conv_id,
        "sender_id": user["id"],
        "text": text,
        "created_at": now_iso(),
    }
    await messages_col.insert_one(doc)
    await conversations_col.update_one(
        {"id": conv_id},
        {"$set": {"last_message_text": text, "last_message_at": doc["created_at"], "last_sender_id": user["id"]}},
    )
    # Sending a message counts as having read up to now — avoids the sender's
    # own outbound text showing up as "unread" in their own inbox.
    await chat_reads_col.update_one(
        {"thread_type": "dm", "thread_id": conv_id, "user_id": user["id"]},
        {"$set": {"last_read_at": doc["created_at"]}},
        upsert=True,
    )
    other_id = next((p for p in c["participant_ids"] if p != user["id"]), None)
    if other_id:
        await emit_notification(
            user_id=other_id,
            pref_key="direct_message",
            type_="direct_message",
            title=f'{user.get("display_name") or "Someone"} sent you a message',
            body=text[:140],
            extra={
                "conversation_id": conv_id,
                "actor_id": user["id"],
                "actor_name": user.get("display_name"),
            },
        )
    doc.pop("_id", None)
    return doc


@router.post("/messages/conversations/{conv_id}/read")
async def mark_read(conv_id: str, user=Depends(get_current_user)):
    await _get_conversation_or_404(conv_id, user["id"])
    await chat_reads_col.update_one(
        {"thread_type": "dm", "thread_id": conv_id, "user_id": user["id"]},
        {"$set": {"last_read_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}
