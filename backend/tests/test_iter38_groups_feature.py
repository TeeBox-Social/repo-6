"""Iteration 38: Group-scoped posts (share-to-group), group invites w/
accept-decline, and public-groups-on-profile w/ request-to-join.

Covers:
  - POST /rounds with group_id -> visible in /groups/{id}/feed, excluded from
    /feed and other-viewer profile, 403 for non-members on the round itself.
  - POST /groups/{id}/members creates a pending invite (not immediate add);
    accept/decline flows; notifications to invitee + inviter.
  - PATCH /auth/me public_group_ids persistence + server-side membership
    filter; GET /groups/{id}/preview; POST /groups/{id}/join-requests +
    approve/deny flows.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
PASSWORD = "password123"


def _signup(email_prefix: str) -> dict:
    email = f"TEST_{email_prefix}_{uuid.uuid4().hex[:8]}@teebox.demo"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": f"Test {email_prefix}"},
    )
    assert r.status_code in (200, 201), r.text
    data = r.json()
    token = data["access_token"]
    user = data["user"]
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return {"session": session, "user": user, "email": email}


@pytest.fixture(scope="module")
def users():
    """3 fresh users: A (group admin), B (member/invitee), C (outsider)."""
    a = _signup("groupA")
    b = _signup("groupB")
    c = _signup("groupC")
    return {"a": a, "b": b, "c": c}


@pytest.fixture(scope="module")
def group(users):
    a = users["a"]["session"]
    r = a.post(f"{BASE_URL}/api/groups", json={"name": "TEST_Group38", "description": "iter38"})
    assert r.status_code == 200, r.text
    g = r.json()
    yield g
    a.delete(f"{BASE_URL}/api/groups/{g['id']}")


class TestShareToGroup:
    def test_create_round_with_group_id_requires_membership(self, users, group):
        c = users["c"]["session"]
        r = c.post(
            f"{BASE_URL}/api/rounds",
            json={"post_type": "text", "notes": "TEST outsider try", "group_id": group["id"]},
        )
        assert r.status_code == 403

    def test_create_round_with_group_id_success(self, users, group):
        a = users["a"]["session"]
        r = a.post(
            f"{BASE_URL}/api/rounds",
            json={"post_type": "text", "notes": "TEST shared to group", "group_id": group["id"]},
        )
        assert r.status_code == 200, r.text
        round_doc = r.json()
        assert round_doc["group_id"] == group["id"]
        pytest.shared_round_id = round_doc["id"]

    def test_group_feed_shows_it(self, users, group):
        a = users["a"]["session"]
        r = a.get(f"{BASE_URL}/api/groups/{group['id']}/feed")
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.shared_round_id in ids

    def test_general_feed_excludes_it(self, users):
        a = users["a"]["session"]
        r = a.get(f"{BASE_URL}/api/feed?scope=followers")
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.shared_round_id not in ids

    def test_other_viewer_profile_excludes_it(self, users):
        b_session = users["b"]["session"]
        a_id = users["a"]["user"]["id"]
        r = b_session.get(f"{BASE_URL}/api/users/{a_id}/rounds")
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.shared_round_id not in ids

    def test_author_own_profile_includes_it(self, users):
        a_session = users["a"]["session"]
        a_id = users["a"]["user"]["id"]
        r = a_session.get(f"{BASE_URL}/api/users/{a_id}/rounds")
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert pytest.shared_round_id in ids

    def test_non_member_gets_403_on_round_get(self, users):
        c_session = users["c"]["session"]
        r = c_session.get(f"{BASE_URL}/api/rounds/{pytest.shared_round_id}")
        assert r.status_code == 403

    def test_non_member_gets_403_on_like(self, users):
        c_session = users["c"]["session"]
        r = c_session.post(f"{BASE_URL}/api/rounds/{pytest.shared_round_id}/like")
        assert r.status_code == 403

    def test_non_member_gets_403_on_comments_get(self, users):
        c_session = users["c"]["session"]
        r = c_session.get(f"{BASE_URL}/api/rounds/{pytest.shared_round_id}/comments")
        assert r.status_code == 403

    def test_non_member_gets_403_on_comment_post(self, users):
        c_session = users["c"]["session"]
        r = c_session.post(
            f"{BASE_URL}/api/rounds/{pytest.shared_round_id}/comments", json={"text": "TEST hi"},
        )
        assert r.status_code == 403

    def test_member_can_view_and_like(self, users, group):
        # add B to the group directly via DB-free path: invite+accept flow
        # already covered elsewhere; here just check A (member) can like own.
        a_session = users["a"]["session"]
        r = a_session.post(f"{BASE_URL}/api/rounds/{pytest.shared_round_id}/like")
        assert r.status_code == 200
        assert r.json()["liked"] is True

    def test_empty_group_feed_for_group_with_no_shared_posts(self, users):
        a_session = users["a"]["session"]
        r = a_session.post(f"{BASE_URL}/api/groups", json={"name": "TEST_EmptyGroup38"})
        assert r.status_code == 200
        g2 = r.json()
        feed = a_session.get(f"{BASE_URL}/api/groups/{g2['id']}/feed")
        assert feed.status_code == 200
        assert feed.json() == []
        a_session.delete(f"{BASE_URL}/api/groups/{g2['id']}")


class TestGroupInvites:
    def test_invite_creates_pending_not_immediate_member(self, users, group):
        a = users["a"]["session"]
        b_id = users["b"]["user"]["id"]
        r = a.post(f"{BASE_URL}/api/groups/{group['id']}/members", json={"user_id": b_id})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["invited"] is True
        pytest.invite_id = body["invite_id"]
        # B should NOT be a member yet
        g = a.get(f"{BASE_URL}/api/groups/{group['id']}")
        assert b_id not in [m["id"] for m in g.json()["members"]]

    def test_duplicate_invite_returns_already_pending(self, users, group):
        a = users["a"]["session"]
        b_id = users["b"]["user"]["id"]
        r = a.post(f"{BASE_URL}/api/groups/{group['id']}/members", json={"user_id": b_id})
        assert r.status_code == 200
        assert r.json()["already_pending"] is True

    def test_invitee_sees_notification(self, users):
        b = users["b"]["session"]
        r = b.get(f"{BASE_URL}/api/notifications")
        assert r.status_code == 200
        notifs = r.json()["notifications"]
        matched = [n for n in notifs if n.get("type") == "group_invite" and n.get("invite_id") == pytest.invite_id]
        assert len(matched) >= 1, notifs[:3]

    def test_accept_invite_adds_member(self, users, group):
        b = users["b"]["session"]
        r = b.post(f"{BASE_URL}/api/groups/{group['id']}/invites/{pytest.invite_id}/accept")
        assert r.status_code == 200
        assert r.json()["status"] == "accepted"
        a = users["a"]["session"]
        g = a.get(f"{BASE_URL}/api/groups/{group['id']}")
        member_ids = [m["id"] for m in g.json()["members"]]
        assert users["b"]["user"]["id"] in member_ids

    def test_inviter_notified_on_accept(self, users):
        a = users["a"]["session"]
        r = a.get(f"{BASE_URL}/api/notifications")
        assert r.status_code == 200
        matched = [n for n in r.json()["notifications"] if n.get("type") == "group_invite_response"]
        assert len(matched) >= 1

    def test_decline_flow(self, users, group):
        a = users["a"]["session"]
        c_id = users["c"]["user"]["id"]
        r = a.post(f"{BASE_URL}/api/groups/{group['id']}/members", json={"user_id": c_id})
        assert r.status_code == 200
        invite_id = r.json()["invite_id"]
        c = users["c"]["session"]
        r2 = c.post(f"{BASE_URL}/api/groups/{group['id']}/invites/{invite_id}/decline")
        assert r2.status_code == 200
        assert r2.json()["status"] == "declined"
        g = a.get(f"{BASE_URL}/api/groups/{group['id']}")
        member_ids = [m["id"] for m in g.json()["members"]]
        assert c_id not in member_ids

    def test_inviter_notified_on_decline(self, users):
        a = users["a"]["session"]
        r = a.get(f"{BASE_URL}/api/notifications")
        matched = [n for n in r.json()["notifications"] if n.get("type") == "group_invite_response" and n.get("accepted") is False]
        assert len(matched) >= 1


class TestPublicGroupsAndJoinRequests:
    def test_patch_public_group_ids_filters_non_member_groups(self, users, group):
        """B is now a member of `group` (from invite accept above); attempt to
        set public_group_ids to include a group B is NOT in -> filtered out."""
        b = users["b"]["session"]
        fake_group_id = str(uuid.uuid4())
        r = b.patch(f"{BASE_URL}/api/auth/me", json={"public_group_ids": [group["id"], fake_group_id]})
        assert r.status_code == 200
        me = r.json()
        assert group["id"] in (me.get("public_group_ids") or [])
        assert fake_group_id not in (me.get("public_group_ids") or [])

    def test_public_group_ids_persist_after_reload(self, users, group):
        b = users["b"]["session"]
        r = b.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert group["id"] in (r.json().get("public_group_ids") or [])

    def test_profile_shows_public_group(self, users, group):
        c = users["c"]["session"]
        b_id = users["b"]["user"]["id"]
        r = c.get(f"{BASE_URL}/api/users/{b_id}")
        assert r.status_code == 200
        public_groups = r.json().get("public_groups") or []
        assert any(pg["id"] == group["id"] for pg in public_groups)

    def test_group_preview_non_member(self, users, group):
        c = users["c"]["session"]
        r = c.get(f"{BASE_URL}/api/groups/{group['id']}/preview")
        assert r.status_code == 200
        body = r.json()
        assert body["is_member"] is False
        assert body["pending_request_id"] is None
        assert len(body["admins"]) == 1

    def test_request_to_join(self, users, group):
        c = users["c"]["session"]
        r = c.post(f"{BASE_URL}/api/groups/{group['id']}/join-requests")
        assert r.status_code == 200
        body = r.json()
        assert body["requested"] is True
        pytest.join_request_id = body["request_id"]

    def test_preview_shows_pending_after_request(self, users, group):
        c = users["c"]["session"]
        r = c.get(f"{BASE_URL}/api/groups/{group['id']}/preview")
        assert r.status_code == 200
        assert r.json()["pending_request_id"] == pytest.join_request_id

    def test_admin_notified_of_join_request(self, users):
        a = users["a"]["session"]
        r = a.get(f"{BASE_URL}/api/notifications")
        matched = [n for n in r.json()["notifications"] if n.get("type") == "group_join_request"]
        assert len(matched) >= 1

    def test_approve_join_request_adds_member(self, users, group):
        a = users["a"]["session"]
        r = a.post(f"{BASE_URL}/api/groups/{group['id']}/join-requests/{pytest.join_request_id}/approve")
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        g = a.get(f"{BASE_URL}/api/groups/{group['id']}")
        member_ids = [m["id"] for m in g.json()["members"]]
        assert users["c"]["user"]["id"] in member_ids

    def test_requester_notified_on_approve(self, users):
        c = users["c"]["session"]
        r = c.get(f"{BASE_URL}/api/notifications")
        matched = [n for n in r.json()["notifications"] if n.get("type") == "group_join_response" and n.get("approved") is True]
        assert len(matched) >= 1

    def test_deny_join_request_flow(self, users, group):
        # New outsider user D requests, admin denies
        d = _signup("groupD")
        r = d["session"].post(f"{BASE_URL}/api/groups/{group['id']}/join-requests")
        assert r.status_code == 200
        req_id = r.json()["request_id"]
        a = users["a"]["session"]
        r2 = a.post(f"{BASE_URL}/api/groups/{group['id']}/join-requests/{req_id}/deny")
        assert r2.status_code == 200
        assert r2.json()["status"] == "denied"
        g = a.get(f"{BASE_URL}/api/groups/{group['id']}")
        member_ids = [m["id"] for m in g.json()["members"]]
        assert d["user"]["id"] not in member_ids
        rn = d["session"].get(f"{BASE_URL}/api/notifications")
        matched = [n for n in rn.json()["notifications"] if n.get("type") == "group_join_response" and n.get("approved") is False]
        assert len(matched) >= 1

    def test_already_member_cannot_request(self, users, group):
        b = users["b"]["session"]  # B is already a member
        r = b.post(f"{BASE_URL}/api/groups/{group['id']}/join-requests")
        assert r.status_code == 400
