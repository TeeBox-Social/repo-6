"""Backend tests for iter37: Direct Messaging, Group Chat, Season History.

Covers:
- DM conversations: start/resume, self-message 400, unknown user 404
- DM list/unread-count, message pagination, notification triggered only for recipient
- Group chat: member-only (403 non-member), sender enrichment, NO notification emitted
- Group seasons endpoint (member-only, year range)
- Regression: group leaderboard with season query param
"""
from __future__ import annotations

import os
import time
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
BASE_URL = (BASE_URL or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

REESE = ("reese@teebox.demo", "password123")
JORDAN = ("jordan@teebox.demo", "password123")
SAM = ("sam@teebox.demo", "password123")


def _login(email: str, password: str) -> tuple[str, dict]:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    d = r.json()
    return d["access_token"], d["user"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def reese():
    tok, user = _login(*REESE)
    return {"token": tok, "user": user}


@pytest.fixture(scope="module")
def jordan():
    tok, user = _login(*JORDAN)
    return {"token": tok, "user": user}


@pytest.fixture(scope="module")
def sam():
    tok, user = _login(*SAM)
    return {"token": tok, "user": user}


# ---------------- DM: start conversation ----------------
class TestStartConversation:
    def test_self_message_400(self, reese):
        r = requests.post(
            f"{API}/messages/conversations",
            headers=_h(reese["token"]),
            json={"user_id": reese["user"]["id"]},
            timeout=20,
        )
        assert r.status_code == 400

    def test_unknown_user_404(self, reese):
        r = requests.post(
            f"{API}/messages/conversations",
            headers=_h(reese["token"]),
            json={"user_id": "does-not-exist-xyz"},
            timeout=20,
        )
        assert r.status_code == 404

    def test_start_creates_conversation(self, reese, jordan):
        r = requests.post(
            f"{API}/messages/conversations",
            headers=_h(reese["token"]),
            json={"user_id": jordan["user"]["id"]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert data["other_user"]["id"] == jordan["user"]["id"]

    def test_start_is_idempotent_resumes_same_thread(self, reese, jordan):
        r1 = requests.post(
            f"{API}/messages/conversations",
            headers=_h(reese["token"]),
            json={"user_id": jordan["user"]["id"]},
            timeout=20,
        )
        r2 = requests.post(
            f"{API}/messages/conversations",
            headers=_h(jordan["token"]),
            json={"user_id": reese["user"]["id"]},
            timeout=20,
        )
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"], "pair_key should resolve to same conversation regardless of direction"


# ---------------- DM: messages, notifications, unread ----------------
class TestDMMessagesAndNotifications:
    @pytest.fixture(scope="class")
    def conv(self, reese, jordan):
        r = requests.post(
            f"{API}/messages/conversations",
            headers=_h(reese["token"]),
            json={"user_id": jordan["user"]["id"]},
            timeout=20,
        )
        assert r.status_code == 200
        return r.json()

    def test_send_message_persists_and_updates_conversation(self, conv, reese, jordan):
        text = f"TEST_hello_{int(time.time())}"
        r = requests.post(
            f"{API}/messages/conversations/{conv['id']}/messages",
            headers=_h(reese["token"]),
            json={"text": text},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["text"] == text
        assert msg["sender_id"] == reese["user"]["id"]

        # GET to verify persistence
        r2 = requests.get(
            f"{API}/messages/conversations/{conv['id']}/messages",
            headers=_h(reese["token"]),
            timeout=20,
        )
        assert r2.status_code == 200
        texts = [m["text"] for m in r2.json()]
        assert text in texts

        # Conversation list shows updated last_message_text
        r3 = requests.get(f"{API}/messages/conversations", headers=_h(reese["token"]), timeout=20)
        conv_ids = {c["id"]: c for c in r3.json()}
        assert conv["id"] in conv_ids
        assert conv_ids[conv["id"]]["last_message_text"] == text

    def test_sender_does_not_see_own_message_as_unread(self, conv, reese):
        r = requests.get(f"{API}/messages/conversations", headers=_h(reese["token"]), timeout=20)
        c = next(c for c in r.json() if c["id"] == conv["id"])
        assert c["unread"] is False, "sender's own outbound message should not count as unread for sender"

    def test_recipient_sees_unread_true_and_unread_count(self, conv, jordan):
        r = requests.get(f"{API}/messages/conversations", headers=_h(jordan["token"]), timeout=20)
        c = next(c for c in r.json() if c["id"] == conv["id"])
        assert c["unread"] is True

        r2 = requests.get(f"{API}/messages/unread-count", headers=_h(jordan["token"]), timeout=20)
        assert r2.status_code == 200
        assert r2.json()["unread_conversations"] >= 1

    def test_mark_read_clears_unread(self, conv, jordan):
        r = requests.post(f"{API}/messages/conversations/{conv['id']}/read", headers=_h(jordan["token"]), timeout=20)
        assert r.status_code == 200

        r2 = requests.get(f"{API}/messages/conversations", headers=_h(jordan["token"]), timeout=20)
        c = next(c for c in r2.json() if c["id"] == conv["id"])
        assert c["unread"] is False

    def test_notification_triggered_for_recipient_only(self, conv, reese, jordan):
        text = f"TEST_notify_{int(time.time())}"
        requests.post(
            f"{API}/messages/conversations/{conv['id']}/messages",
            headers=_h(reese["token"]),
            json={"text": text},
            timeout=20,
        )
        time.sleep(1)
        # Jordan (recipient) should have a direct_message notification
        r = requests.get(f"{API}/notifications", headers=_h(jordan["token"]), timeout=20)
        assert r.status_code == 200
        items = r.json()["notifications"]
        dm_notifs = [n for n in items if n.get("type") == "direct_message" and n.get("body", "").startswith("TEST_notify")]
        assert len(dm_notifs) >= 1, f"expected direct_message notification for jordan, got types: {[n.get('type') for n in items[:10]]}"

        # Reese (sender) should NOT get a notification for their own outbound message
        r2 = requests.get(f"{API}/notifications", headers=_h(reese["token"]), timeout=20)
        items2 = r2.json()["notifications"]
        sender_dm_notifs = [n for n in items2 if n.get("type") == "direct_message" and n.get("body", "").startswith("TEST_notify")]
        assert len(sender_dm_notifs) == 0, "sender should not receive a notification for their own message"

    def test_empty_message_400(self, conv, reese):
        r = requests.post(
            f"{API}/messages/conversations/{conv['id']}/messages",
            headers=_h(reese["token"]),
            json={"text": "   "},
            timeout=20,
        )
        assert r.status_code == 400

    def test_non_participant_404(self, conv, sam):
        r = requests.get(
            f"{API}/messages/conversations/{conv['id']}/messages",
            headers=_h(sam["token"]),
            timeout=20,
        )
        assert r.status_code == 404

    def test_pagination_limit_and_before(self, conv, reese):
        # send a few messages
        for i in range(3):
            requests.post(
                f"{API}/messages/conversations/{conv['id']}/messages",
                headers=_h(reese["token"]),
                json={"text": f"TEST_page_{i}_{int(time.time()*1000)}"},
                timeout=20,
            )
        r = requests.get(
            f"{API}/messages/conversations/{conv['id']}/messages",
            headers=_h(reese["token"]),
            params={"limit": 2},
            timeout=20,
        )
        assert r.status_code == 200
        assert len(r.json()) <= 2

    def test_list_conversations_sorted_desc_by_last_message(self, reese, sam):
        # start+message with sam too, to create a 2nd conversation
        r = requests.post(
            f"{API}/messages/conversations",
            headers=_h(reese["token"]),
            json={"user_id": sam["user"]["id"]},
            timeout=20,
        )
        conv2 = r.json()
        requests.post(
            f"{API}/messages/conversations/{conv2['id']}/messages",
            headers=_h(reese["token"]),
            json={"text": f"TEST_latest_{int(time.time())}"},
            timeout=20,
        )
        r2 = requests.get(f"{API}/messages/conversations", headers=_h(reese["token"]), timeout=20)
        convs = r2.json()
        assert len(convs) >= 2
        times = [c["last_message_at"] for c in convs]
        assert times == sorted(times, reverse=True), "conversations should be sorted by last_message_at desc"


# ---------------- Group chat ----------------
class TestGroupChat:
    @pytest.fixture(scope="class")
    def group(self, reese):
        payload = {"name": f"TEST_ChatGroup_{int(time.time())}", "member_add_policy": "admin"}
        r = requests.post(f"{API}/groups", headers=_h(reese["token"]), json=payload, timeout=20)
        assert r.status_code == 200
        g = r.json()
        yield g
        requests.delete(f"{API}/groups/{g['id']}", headers=_h(reese["token"]), timeout=20)

    def test_non_member_403_get_chat(self, group, sam):
        r = requests.get(f"{API}/groups/{group['id']}/chat", headers=_h(sam["token"]), timeout=20)
        assert r.status_code == 403

    def test_non_member_403_post_chat(self, group, sam):
        r = requests.post(
            f"{API}/groups/{group['id']}/chat",
            headers=_h(sam["token"]),
            json={"text": "TEST_hack"},
            timeout=20,
        )
        assert r.status_code == 403

    def test_member_can_send_and_receive_with_sender_enrichment(self, group, reese):
        text = f"TEST_gc_{int(time.time())}"
        r = requests.post(
            f"{API}/groups/{group['id']}/chat",
            headers=_h(reese["token"]),
            json={"text": text},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["text"] == text
        assert msg["sender"]["id"] == reese["user"]["id"]
        assert "display_name" in msg["sender"]

        r2 = requests.get(f"{API}/groups/{group['id']}/chat", headers=_h(reese["token"]), timeout=20)
        assert r2.status_code == 200
        msgs = r2.json()
        found = next(m for m in msgs if m["text"] == text)
        assert found["sender"]["id"] == reese["user"]["id"]

    def test_group_chat_message_emits_no_notification(self, group, reese, jordan):
        # add jordan to group first
        requests.post(
            f"{API}/groups/{group['id']}/members",
            headers=_h(reese["token"]),
            json={"user_id": jordan["user"]["id"]},
            timeout=20,
        )
        text = f"TEST_silentgc_{int(time.time())}"
        requests.post(
            f"{API}/groups/{group['id']}/chat",
            headers=_h(reese["token"]),
            json={"text": text},
            timeout=20,
        )
        time.sleep(1)
        r = requests.get(f"{API}/notifications", headers=_h(jordan["token"]), timeout=20)
        items = r.json()["notifications"]
        matching = [n for n in items if text[:30] in (n.get("body") or "")]
        assert len(matching) == 0, "Group chat should be silent - no notification expected"

    def test_whitespace_only_group_message_400(self, group, reese):
        r = requests.post(
            f"{API}/groups/{group['id']}/chat",
            headers=_h(reese["token"]),
            json={"text": "   "},
            timeout=20,
        )
        assert r.status_code == 400

    def test_mark_group_chat_read(self, group, reese):
        r = requests.post(f"{API}/groups/{group['id']}/chat/read", headers=_h(reese["token"]), timeout=20)
        assert r.status_code == 200

    def test_mark_group_chat_read_non_member_403(self, group, sam):
        r = requests.post(f"{API}/groups/{group['id']}/chat/read", headers=_h(sam["token"]), timeout=20)
        assert r.status_code == 403


# ---------------- Group seasons ----------------
class TestGroupSeasons:
    @pytest.fixture(scope="class")
    def group(self, reese):
        payload = {"name": f"TEST_SeasonGroup_{int(time.time())}", "member_add_policy": "admin"}
        r = requests.post(f"{API}/groups", headers=_h(reese["token"]), json=payload, timeout=20)
        assert r.status_code == 200
        g = r.json()
        yield g
        requests.delete(f"{API}/groups/{g['id']}", headers=_h(reese["token"]), timeout=20)

    def test_member_only_403(self, group, sam):
        r = requests.get(f"{API}/groups/{group['id']}/seasons", headers=_h(sam["token"]), timeout=20)
        assert r.status_code == 403

    def test_seasons_includes_current_year(self, group, reese):
        r = requests.get(f"{API}/groups/{group['id']}/seasons", headers=_h(reese["token"]), timeout=20)
        assert r.status_code == 200
        data = r.json()
        current_year = datetime.now(timezone.utc).year
        assert current_year in data["seasons"]
        assert data["seasons"] == sorted(data["seasons"], reverse=True)

    def test_leaderboard_with_season_param_still_works(self, group, reese):
        current_year = datetime.now(timezone.utc).year
        r = requests.get(
            f"{API}/groups/{group['id']}/leaderboard",
            headers=_h(reese["token"]),
            params={"season": current_year},
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["season"] == current_year
        assert isinstance(data["entries"], list)

    def test_leaderboard_past_season_no_error(self, group, reese):
        r = requests.get(
            f"{API}/groups/{group['id']}/leaderboard",
            headers=_h(reese["token"]),
            params={"season": 2024},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["season"] == 2024
