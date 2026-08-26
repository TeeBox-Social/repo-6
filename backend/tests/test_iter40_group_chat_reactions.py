"""Backend tests for iteration 40: Group Chat Reactions.

Covers:
  * POST /api/groups/{gid}/chat/{mid}/react toggle (add/remove) with allowed emoji
  * 400 for emoji not in allow-list
  * 403 for non-member reactor
  * 404 for missing message
  * GET /api/groups/{gid}/chat surfaces `reactions` field (empty by default)
  * POST /api/groups/{gid}/chat returns `reactions: {}` on freshly created message
  * Multiple users reacting aggregates correctly (same emoji + different emoji)
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
if not BASE_URL:
    # Fallback for the containerized preview which sets EXPO_PUBLIC_BACKEND_URL in the frontend .env only.
    # Read backend URL from frontend/.env if not already in env.
    _f = "/app/frontend/.env"
    if os.path.exists(_f):
        with open(_f) as fh:
            for line in fh:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break

API = f"{BASE_URL}/api"

REESE = ("reese@teebox.demo", "password123")
JORDAN = ("jordan@teebox.demo", "password123")
KURT = ("kurt@teebox.demo", "password123")

ALLOWED = ["👍", "❤️", "😂", "😮", "🔥", "🎉", "⛳"]


def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return data


@pytest.fixture(scope="module")
def reese():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    auth = _login(s, *REESE)
    s.headers.update({"Authorization": f"Bearer {auth['access_token']}"})
    s.user = auth["user"]  # type: ignore[attr-defined]
    return s


@pytest.fixture(scope="module")
def jordan():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    auth = _login(s, *JORDAN)
    s.headers.update({"Authorization": f"Bearer {auth['access_token']}"})
    s.user = auth["user"]  # type: ignore[attr-defined]
    return s


@pytest.fixture(scope="module")
def outsider():
    """A brand-new registered user who is NOT a member of the test group."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_iter40_outsider_{uuid.uuid4().hex[:8]}@example.com"
    reg = s.post(
        f"{API}/auth/register",
        json={"email": email, "password": "password123", "display_name": "Iter40 Outsider"},
        timeout=15,
    )
    assert reg.status_code == 200, f"register outsider failed: {reg.status_code} {reg.text}"
    data = reg.json()
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    s.user = data["user"]  # type: ignore[attr-defined]
    return s


@pytest.fixture(scope="module")
def group_and_message(reese, jordan):
    # Create a fresh group named TEST_iter40_...
    gname = f"TEST_iter40_{uuid.uuid4().hex[:6]}"
    r = reese.post(f"{API}/groups", json={"name": gname, "description": "reactions test"}, timeout=15)
    assert r.status_code == 200, r.text
    g = r.json()
    gid = g["id"]

    # Add jordan via invite -> accept
    add = reese.post(f"{API}/groups/{gid}/members", json={"user_id": jordan.user["id"]}, timeout=15)  # type: ignore[attr-defined]
    assert add.status_code == 200, add.text
    invite_id = add.json()["invite_id"]
    acc = jordan.post(f"{API}/groups/{gid}/invites/{invite_id}/accept", timeout=15)
    assert acc.status_code == 200, acc.text

    # Send a chat message as reese
    m = reese.post(f"{API}/groups/{gid}/chat", json={"text": "hi from iter40"}, timeout=15)
    assert m.status_code == 200, m.text
    msg = m.json()
    yield gid, msg

    # cleanup: delete the group
    try:
        reese.delete(f"{API}/groups/{gid}", timeout=15)
    except Exception:
        pass


# -------------------- Tests --------------------

def test_send_message_includes_empty_reactions(group_and_message):
    _, msg = group_and_message
    assert "reactions" in msg, f"Message missing 'reactions' key: {msg}"
    assert msg["reactions"] == {}, f"Fresh message reactions should be empty, got {msg['reactions']}"


def test_get_chat_includes_reactions_field(reese, group_and_message):
    gid, _ = group_and_message
    r = reese.get(f"{API}/groups/{gid}/chat", timeout=15)
    assert r.status_code == 200, r.text
    msgs = r.json()
    assert isinstance(msgs, list) and len(msgs) >= 1
    for m in msgs:
        assert "reactions" in m, f"GET chat msg missing reactions: {m}"
        assert isinstance(m["reactions"], dict)


def test_react_add_then_toggle_remove(reese, group_and_message):
    gid, msg = group_and_message
    mid = msg["id"]
    uid = reese.user["id"]  # type: ignore[attr-defined]

    # Add 👍
    r1 = reese.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "👍"}, timeout=15)
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["id"] == mid
    assert body1["reactions"].get("👍") == [uid], body1

    # Verify persisted via GET
    r_get = reese.get(f"{API}/groups/{gid}/chat", timeout=15)
    found = next((m for m in r_get.json() if m["id"] == mid), None)
    assert found is not None and found["reactions"].get("👍") == [uid]

    # Toggle off
    r2 = reese.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "👍"}, timeout=15)
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert "👍" not in body2["reactions"], f"toggle should remove key, got {body2['reactions']}"


def test_disallowed_emoji_400(reese, group_and_message):
    gid, msg = group_and_message
    r = reese.post(f"{API}/groups/{gid}/chat/{msg['id']}/react", json={"emoji": "💩"}, timeout=15)
    assert r.status_code == 400, r.text


def test_non_member_403(outsider, group_and_message):
    gid, msg = group_and_message
    # Outsider is a freshly registered user, definitely not a member.
    r = outsider.post(f"{API}/groups/{gid}/chat/{msg['id']}/react", json={"emoji": "👍"}, timeout=15)
    assert r.status_code == 403, r.text


def test_missing_message_404(reese, group_and_message):
    gid, _ = group_and_message
    fake_mid = "nonexistent-" + uuid.uuid4().hex
    r = reese.post(f"{API}/groups/{gid}/chat/{fake_mid}/react", json={"emoji": "👍"}, timeout=15)
    assert r.status_code == 404, r.text


def test_missing_group_404(reese):
    r = reese.post(f"{API}/groups/does-not-exist-xyz/chat/some-mid/react", json={"emoji": "👍"}, timeout=15)
    assert r.status_code == 404, r.text


def test_aggregate_multiple_users_and_emojis(reese, jordan, group_and_message):
    gid, msg = group_and_message
    mid = msg["id"]
    r_id = reese.user["id"]  # type: ignore[attr-defined]
    j_id = jordan.user["id"]  # type: ignore[attr-defined]

    # reese: 🔥
    r1 = reese.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "🔥"}, timeout=15)
    assert r1.status_code == 200
    # jordan: 🔥 (same emoji)
    r2 = jordan.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "🔥"}, timeout=15)
    assert r2.status_code == 200
    fire = set(r2.json()["reactions"].get("🔥", []))
    assert fire == {r_id, j_id}, f"expected both users under 🔥, got {fire}"

    # jordan: 🎉 (different emoji) — jordan should now have two active reactions
    r3 = jordan.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "🎉"}, timeout=15)
    assert r3.status_code == 200
    reactions = r3.json()["reactions"]
    assert set(reactions.get("🔥", [])) == {r_id, j_id}
    assert reactions.get("🎉") == [j_id]

    # jordan toggles 🔥 off; reese should still be counted
    r4 = jordan.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "🔥"}, timeout=15)
    assert r4.status_code == 200
    reactions = r4.json()["reactions"]
    assert reactions.get("🔥") == [r_id]

    # Verify via GET endpoint too
    r_get = reese.get(f"{API}/groups/{gid}/chat", timeout=15)
    m = next((x for x in r_get.json() if x["id"] == mid), None)
    assert m is not None
    assert m["reactions"].get("🔥") == [r_id]
    assert m["reactions"].get("🎉") == [j_id]

    # cleanup toggles so state doesn't leak between test runs conceptually
    reese.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "🔥"}, timeout=15)
    jordan.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": "🎉"}, timeout=15)


@pytest.mark.parametrize("emoji", ALLOWED)
def test_all_allowed_emojis_accepted(reese, group_and_message, emoji):
    """Sanity: every emoji in the allow-list is accepted (and cleaned up)."""
    gid, msg = group_and_message
    mid = msg["id"]
    r = reese.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": emoji}, timeout=15)
    assert r.status_code == 200, f"{emoji} -> {r.status_code} {r.text}"
    # Toggle off to keep state clean for other tests
    reese.post(f"{API}/groups/{gid}/chat/{mid}/react", json={"emoji": emoji}, timeout=15)
