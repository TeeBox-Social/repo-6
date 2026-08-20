"""Groups & Leagues: private groups with a shared feed and season leaderboard.

Feature spec:
  * Group cap: 50 members (including the admin).
  * The creator (admin) chooses at creation time whether only they can add
    new members ("admin") or any current member can invite others ("any").
  * Season = calendar year. The leaderboard is computed from all scored
    round posts by group members inside the current year, and ordered by
    18-hole-equivalent average score (ascending, ties broken by rounds
    played desc so the more active player edges out).
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from db import chat_reads_col, follows_col, groups_col, messages_col, rounds_col, users_col
from helpers import (
    batch_course_par_cache,
    emit_notification,
    enrich_round,
    extrapolate_18_score,
    now_iso,
    public_user,
)
from models import GroupAddMemberIn, GroupChatIn, GroupIn, GroupJoinIn, GroupUpdate
from security import get_current_user

router = APIRouter()

MAX_GROUP_MEMBERS = 50
INVITE_CODE_LEN = 8


# ---- helpers ----
def _new_invite_code() -> str:
    """URL-safe short alphanumeric invite code (uppercase for readability)."""
    # 8 chars from a 32-char alphabet ~= 40 bits of entropy — plenty for
    # invite codes that also get manually typed by friends.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # skip 0/1/O/I to reduce OCR pain
    return "".join(secrets.choice(alphabet) for _ in range(INVITE_CODE_LEN))


def _serialize_group(g: dict, viewer_id: str, member_users: list[dict] | None = None) -> dict:
    """Public projection with viewer-scoped flags."""
    member_ids = g.get("member_ids") or []
    return {
        "id": g["id"],
        "name": g["name"],
        "description": g.get("description") or "",
        "invite_code": g.get("invite_code"),
        "admin_id": g.get("admin_id"),
        "member_add_policy": g.get("member_add_policy") or "admin",
        "member_count": len(member_ids),
        "max_members": MAX_GROUP_MEMBERS,
        "created_at": g.get("created_at"),
        "is_admin": viewer_id == g.get("admin_id"),
        "is_member": viewer_id in member_ids,
        "members": member_users or [],
    }


async def _fetch_members(member_ids: list[str]) -> list[dict]:
    if not member_ids:
        return []
    docs: dict = {}
    async for u in users_col.find(
        {"id": {"$in": member_ids}}, {"_id": 0, "hashed_password": 0, "email": 0},
    ):
        docs[u["id"]] = public_user(u)
    # preserve insertion order (admin first is nice, but we already have that in member_ids)
    return [docs[uid] for uid in member_ids if uid in docs]


async def _get_group_or_404(group_id: str) -> dict:
    g = await groups_col.find_one({"id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g


def _require_member(g: dict, user_id: str) -> None:
    if user_id not in (g.get("member_ids") or []):
        raise HTTPException(status_code=403, detail="Not a group member")


def _require_admin(g: dict, user_id: str) -> None:
    if g.get("admin_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the group admin can do this")


# ---- CRUD ----
@router.post("/groups")
async def create_group(data: GroupIn, user=Depends(get_current_user)):
    # Cap groups-per-user so nobody spams the collection.
    owned = await groups_col.count_documents({"admin_id": user["id"]})
    if owned >= 20:
        raise HTTPException(status_code=413, detail="You've hit the 20-groups-owned limit")

    # Retry once on the (astronomically unlikely) invite-code collision.
    for _ in range(5):
        code = _new_invite_code()
        if not await groups_col.find_one({"invite_code": code}, {"_id": 0, "id": 1}):
            break
    else:
        raise HTTPException(status_code=500, detail="Could not allocate invite code")

    group_id = str(uuid.uuid4())
    doc = {
        "id": group_id,
        "name": data.name.strip(),
        "description": (data.description or "").strip(),
        "invite_code": code,
        "admin_id": user["id"],
        "member_ids": [user["id"]],
        "member_add_policy": data.member_add_policy or "admin",
        "created_at": now_iso(),
    }
    await groups_col.insert_one(doc)
    members = await _fetch_members(doc["member_ids"])
    return _serialize_group(doc, user["id"], members)


@router.get("/groups/mine")
async def list_my_groups(user=Depends(get_current_user)):
    out: list[dict] = []
    async for g in groups_col.find(
        {"member_ids": user["id"]}, {"_id": 0},
    ).sort("created_at", -1):
        out.append(_serialize_group(g, user["id"]))
    return out


@router.get("/groups/{group_id}")
async def get_group(group_id: str, user=Depends(get_current_user)):
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    members = await _fetch_members(g.get("member_ids") or [])
    return _serialize_group(g, user["id"], members)


@router.patch("/groups/{group_id}")
async def update_group(group_id: str, data: GroupUpdate, user=Depends(get_current_user)):
    g = await _get_group_or_404(group_id)
    _require_admin(g, user["id"])
    updates = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if "description" in updates:
        updates["description"] = (updates["description"] or "").strip()
    if updates:
        updates["updated_at"] = now_iso()
        await groups_col.update_one({"id": group_id}, {"$set": updates})
    fresh = await _get_group_or_404(group_id)
    members = await _fetch_members(fresh.get("member_ids") or [])
    return _serialize_group(fresh, user["id"], members)


@router.delete("/groups/{group_id}")
async def delete_group(group_id: str, user=Depends(get_current_user)):
    g = await _get_group_or_404(group_id)
    _require_admin(g, user["id"])
    await groups_col.delete_one({"id": group_id})
    return {"ok": True}


# ---- Membership ----
@router.post("/groups/join")
async def join_by_code(data: GroupJoinIn, user=Depends(get_current_user)):
    code = data.invite_code.strip().upper()
    g = await groups_col.find_one({"invite_code": code}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="No group matches that invite code")
    members = g.get("member_ids") or []
    if user["id"] in members:
        return _serialize_group(g, user["id"], await _fetch_members(members))
    if len(members) >= MAX_GROUP_MEMBERS:
        raise HTTPException(status_code=413, detail="Group is full (50 member cap)")
    await groups_col.update_one({"id": g["id"]}, {"$addToSet": {"member_ids": user["id"]}})
    # Notify admin so they know someone joined via their invite.
    admin_id = g.get("admin_id")
    if admin_id and admin_id != user["id"]:
        await emit_notification(
            user_id=admin_id,
            pref_key="follow",  # reuse the follow pref bucket for now
            type_="group_join",
            title="New group member",
            body=f'{user.get("display_name") or "Someone"} joined "{g["name"]}".',
            extra={
                "group_id": g["id"],
                "actor_id": user["id"],
                "actor_name": user.get("display_name"),
            },
        )
    fresh = await _get_group_or_404(g["id"])
    return _serialize_group(fresh, user["id"], await _fetch_members(fresh.get("member_ids") or []))


@router.post("/groups/{group_id}/leave")
async def leave_group(group_id: str, user=Depends(get_current_user)):
    g = await _get_group_or_404(group_id)
    if user["id"] not in (g.get("member_ids") or []):
        return {"ok": True}
    if g.get("admin_id") == user["id"]:
        raise HTTPException(
            status_code=400,
            detail="Group admin cannot leave — delete the group or transfer ownership instead.",
        )
    await groups_col.update_one({"id": group_id}, {"$pull": {"member_ids": user["id"]}})
    return {"ok": True}


@router.post("/groups/{group_id}/members")
async def add_member(
    group_id: str,
    data: GroupAddMemberIn,
    user=Depends(get_current_user),
):
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    policy = g.get("member_add_policy") or "admin"
    if policy == "admin" and g.get("admin_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Only the admin can add members to this group")
    members = g.get("member_ids") or []
    if len(members) >= MAX_GROUP_MEMBERS:
        raise HTTPException(status_code=413, detail="Group is full (50 member cap)")
    if data.user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Already a member")
    if data.user_id in members:
        raise HTTPException(status_code=400, detail="User already in group")
    target = await users_col.find_one({"id": data.user_id}, {"_id": 0, "hashed_password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await groups_col.update_one({"id": group_id}, {"$addToSet": {"member_ids": data.user_id}})
    # Notify the added user.
    await emit_notification(
        user_id=data.user_id,
        pref_key="follow",
        type_="group_added",
        title="Added to a group",
        body=f'{user.get("display_name") or "Someone"} added you to "{g["name"]}".',
        extra={
            "group_id": group_id,
            "actor_id": user["id"],
            "actor_name": user.get("display_name"),
        },
    )
    fresh = await _get_group_or_404(group_id)
    return _serialize_group(fresh, user["id"], await _fetch_members(fresh.get("member_ids") or []))


@router.delete("/groups/{group_id}/members/{user_id}")
async def remove_member(
    group_id: str,
    user_id: str,
    user=Depends(get_current_user),
):
    g = await _get_group_or_404(group_id)
    # Self-remove == leave (mirror /leave semantics, don't 403).
    if user_id == user["id"]:
        if g.get("admin_id") == user["id"]:
            raise HTTPException(
                status_code=400,
                detail="Group admin cannot leave — delete the group instead.",
            )
        await groups_col.update_one({"id": group_id}, {"$pull": {"member_ids": user_id}})
        return {"ok": True}
    _require_admin(g, user["id"])
    if user_id == g.get("admin_id"):
        raise HTTPException(status_code=400, detail="Cannot remove the group admin")
    await groups_col.update_one({"id": group_id}, {"$pull": {"member_ids": user_id}})
    return {"ok": True}


@router.get("/groups/{group_id}/candidates")
async def list_add_candidates(
    group_id: str,
    q: str = Query("", max_length=60),
    user=Depends(get_current_user),
):
    """People the viewer could add to the group — restricted to their
    following-graph (people they follow OR who follow them) so you can't
    yank strangers into private groups. Excludes existing members."""
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    policy = g.get("member_add_policy") or "admin"
    if policy == "admin" and g.get("admin_id") != user["id"]:
        return []  # non-admins under admin-only policy get no candidates
    following_ids = {f["target_id"] async for f in follows_col.find({"user_id": user["id"]}, {"_id": 0, "target_id": 1})}
    follower_ids = {f["user_id"] async for f in follows_col.find({"target_id": user["id"]}, {"_id": 0, "user_id": 1})}
    connections = list(following_ids | follower_ids)
    if not connections:
        return []
    existing = set(g.get("member_ids") or [])
    candidate_ids = [c for c in connections if c not in existing]
    if not candidate_ids:
        return []
    query: dict = {"id": {"$in": candidate_ids}}
    q_trim = (q or "").strip()
    if q_trim:
        # Case-insensitive substring match on display name.
        import re as _re
        safe = _re.escape(q_trim[:60])
        query["display_name"] = {"$regex": safe, "$options": "i"}
    out = []
    async for u in users_col.find(query, {"_id": 0, "hashed_password": 0, "email": 0}).limit(30):
        out.append(public_user(u))
    out.sort(key=lambda x: (x.get("display_name") or "").lower())
    return out


# ---- Feed ----
@router.get("/groups/{group_id}/feed")
async def group_feed(
    group_id: str,
    limit: int = Query(30, ge=1, le=100),
    user=Depends(get_current_user),
):
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    member_ids = g.get("member_ids") or []
    if not member_ids:
        return []
    cursor = rounds_col.find(
        {"user_id": {"$in": member_ids}},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    return [await enrich_round(r, user["id"]) async for r in cursor]


# ---- Leaderboard (calendar-year season) ----
@router.get("/groups/{group_id}/leaderboard")
async def group_leaderboard(
    group_id: str,
    season: int | None = Query(None, ge=2000, le=2100),
    user=Depends(get_current_user),
):
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    member_ids = g.get("member_ids") or []
    if not member_ids:
        return {"season": season or datetime.now(timezone.utc).year, "entries": []}

    year = season or datetime.now(timezone.utc).year
    start = f"{year}-01-01T00:00:00+00:00"
    end = f"{year + 1}-01-01T00:00:00+00:00"

    # Pull all scored round posts in the window for the members.
    docs = [
        r async for r in rounds_col.find(
            {
                "user_id": {"$in": member_ids},
                "post_type": {"$in": ["round", None]},
                "total_score": {"$ne": None},
                "created_at": {"$gte": start, "$lt": end},
            },
            {
                "_id": 0,
                "user_id": 1,
                "total_score": 1,
                "holes_played": 1,
                "par": 1,
                "course_name": 1,
                "created_at": 1,
            },
        )
    ]

    course_par_cache = await batch_course_par_cache(d.get("course_name") for d in docs)
    per_user: dict = {}
    for d in docs:
        uid = d.get("user_id")
        if not uid:
            continue
        raw = d.get("total_score")
        if raw is None:
            continue
        equiv = extrapolate_18_score(
            float(raw),
            d.get("holes_played"),
            d.get("par"),
            course_par_cache.get(d.get("course_name")),
        )
        slot = per_user.setdefault(uid, {"scores": [], "best_raw": None, "last_played": None})
        slot["scores"].append(equiv)
        # "best" surfaced to the UI is the actual score (not the 18-hole extrapolation)
        if slot["best_raw"] is None or raw < slot["best_raw"]:
            slot["best_raw"] = raw
        played_at = d.get("created_at")
        if played_at and (slot["last_played"] is None or played_at > slot["last_played"]):
            slot["last_played"] = played_at

    # Hydrate user info for every member so the leaderboard renders even
    # for people who haven't posted yet (they show at the bottom with dashes).
    user_map = {u["id"]: public_user(u) async for u in users_col.find({"id": {"$in": member_ids}}, {"_id": 0, "hashed_password": 0, "email": 0})}

    scored: list[dict] = []
    unscored: list[dict] = []
    for uid in member_ids:
        info = user_map.get(uid) or {"id": uid, "display_name": "Unknown"}
        slot = per_user.get(uid)
        if slot and slot["scores"]:
            avg = sum(slot["scores"]) / len(slot["scores"])
            scored.append({
                **info,
                "round_count": len(slot["scores"]),
                "avg_score": round(avg, 1),
                "best_score": slot["best_raw"],
                "last_played": slot["last_played"],
            })
        else:
            unscored.append({
                **info,
                "round_count": 0,
                "avg_score": None,
                "best_score": None,
                "last_played": None,
            })

    scored.sort(key=lambda e: (e["avg_score"], -e["round_count"]))
    for i, e in enumerate(scored):
        e["rank"] = i + 1
    for e in unscored:
        e["rank"] = None

    return {
        "season": year,
        "entries": scored + unscored,
    }


# ---- Season history: which years have a leaderboard worth browsing ----
@router.get("/groups/{group_id}/seasons")
async def group_seasons(group_id: str, user=Depends(get_current_user)):
    """Years the member can page through on the Leaderboard tab — from the
    group's creation year through the current year, newest first. Computed
    from ``created_at`` rather than scanning rounds so it's a single cheap
    lookup regardless of group activity."""
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    current_year = datetime.now(timezone.utc).year
    created_year = current_year
    created_at = g.get("created_at")
    if created_at:
        try:
            created_year = datetime.fromisoformat(created_at.replace("Z", "+00:00")).year
        except ValueError:
            pass
    start_year = min(created_year, current_year)
    return {"seasons": list(range(current_year, start_year - 1, -1))}


# ---- Group chat (member-only, silent — no per-message notifications to
# avoid spamming larger groups; members simply see new messages when they
# open the tab). Shares the messages_col/chat_reads_col store with DMs via
# thread_type="group" so both use identical pagination semantics. ----
@router.get("/groups/{group_id}/chat")
async def group_chat_messages(
    group_id: str,
    before: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    user=Depends(get_current_user),
):
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    query: dict = {"thread_type": "group", "thread_id": group_id}
    if before:
        query["created_at"] = {"$lt": before}
    cursor = messages_col.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    msgs = [m async for m in cursor]
    msgs.reverse()
    if not msgs:
        return msgs
    sender_ids = list({m["sender_id"] for m in msgs})
    senders = {
        u["id"]: public_user(u)
        async for u in users_col.find({"id": {"$in": sender_ids}}, {"_id": 0, "hashed_password": 0, "email": 0})
    }
    for m in msgs:
        m["sender"] = senders.get(m["sender_id"])
    return msgs


@router.post("/groups/{group_id}/chat")
async def send_group_chat_message(group_id: str, data: GroupChatIn, user=Depends(get_current_user)):
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message can't be empty")
    doc = {
        "id": str(uuid.uuid4()),
        "thread_type": "group",
        "thread_id": group_id,
        "sender_id": user["id"],
        "text": text,
        "created_at": now_iso(),
    }
    await messages_col.insert_one(doc)
    await chat_reads_col.update_one(
        {"thread_type": "group", "thread_id": group_id, "user_id": user["id"]},
        {"$set": {"last_read_at": doc["created_at"]}},
        upsert=True,
    )
    out = dict(doc)
    out.pop("_id", None)
    out["sender"] = public_user(user)
    return out


@router.post("/groups/{group_id}/chat/read")
async def mark_group_chat_read(group_id: str, user=Depends(get_current_user)):
    g = await _get_group_or_404(group_id)
    _require_member(g, user["id"])
    await chat_reads_col.update_one(
        {"thread_type": "group", "thread_id": group_id, "user_id": user["id"]},
        {"$set": {"last_read_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}
