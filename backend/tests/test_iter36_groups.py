"""Backend tests for the Groups & Leagues feature (iter36).

Covers:
- CRUD (create/list/get/patch/delete) + auth policies
- Invite-code shape (8 chars, uppercase, alphabet excludes 0/1/O/I)
- Join by code, leave, add/remove member (policy=admin & policy=any)
- Candidates from follow-graph
- Feed & season leaderboard (calendar year default, 18-hole extrapolation)
"""
from __future__ import annotations

import os
import re
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

INVITE_ALPHABET = set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")


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


@pytest.fixture(scope="module")
def created_group(reese):
    """Create a group and clean up at the end of the module."""
    payload = {
        "name": f"TEST_Weekend Warriors {int(time.time())}",
        "description": "Sunday crew",
        "member_add_policy": "admin",
    }
    r = requests.post(f"{API}/groups", headers=_h(reese["token"]), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    g = r.json()
    yield g
    # Cleanup
    requests.delete(f"{API}/groups/{g['id']}", headers=_h(reese["token"]), timeout=20)


# ---------------- CRUD ----------------
class TestGroupCRUD:
    def test_create_group_response_shape_and_invite_code(self, created_group, reese):
        g = created_group
        assert g["name"].startswith("TEST_Weekend Warriors")
        assert g["description"] == "Sunday crew"
        assert g["admin_id"] == reese["user"]["id"]
        assert g["member_count"] == 1
        assert g["max_members"] == 50
        assert g["is_admin"] is True
        assert g["is_member"] is True
        assert g["member_add_policy"] == "admin"
        assert reese["user"]["id"] in [m["id"] for m in g["members"]]

        code = g["invite_code"]
        assert isinstance(code, str) and len(code) == 8
        assert code == code.upper()
        assert re.fullmatch(r"[A-Z2-9]{8}", code)
        # Alphabet excludes 0/1/O/I
        assert set(code).issubset(INVITE_ALPHABET), f"invite code has forbidden chars: {code}"
        for c in "01OI":
            assert c not in code

    def test_get_mine_contains_created(self, created_group, reese):
        r = requests.get(f"{API}/groups/mine", headers=_h(reese["token"]), timeout=20)
        assert r.status_code == 200
        ids = [g["id"] for g in r.json()]
        assert created_group["id"] in ids

    def test_get_detail_includes_members(self, created_group, reese):
        r = requests.get(f"{API}/groups/{created_group['id']}", headers=_h(reese["token"]), timeout=20)
        assert r.status_code == 200
        g = r.json()
        assert g["id"] == created_group["id"]
        assert isinstance(g["members"], list)
        assert any("display_name" in m and m["id"] == reese["user"]["id"] for m in g["members"])

    def test_patch_admin_can_update(self, created_group, reese):
        r = requests.patch(
            f"{API}/groups/{created_group['id']}",
            headers=_h(reese["token"]),
            json={"description": "Updated crew desc", "member_add_policy": "admin"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["description"] == "Updated crew desc"

    def test_patch_non_admin_forbidden(self, created_group, jordan, reese):
        # Ensure jordan is not already a member first
        # Try patch as non-member/non-admin, expect 403 (or 404 if not member; 403 preferred by _require_admin)
        r = requests.patch(
            f"{API}/groups/{created_group['id']}",
            headers=_h(jordan["token"]),
            json={"name": "hacked"},
            timeout=20,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------------- Membership ----------------
class TestGroupMembership:
    def test_join_wrong_code_404(self, jordan):
        r = requests.post(
            f"{API}/groups/join",
            headers=_h(jordan["token"]),
            json={"invite_code": "ZZZZZZZZ"},
            timeout=20,
        )
        assert r.status_code == 404

    def test_join_success(self, created_group, jordan):
        r = requests.post(
            f"{API}/groups/join",
            headers=_h(jordan["token"]),
            json={"invite_code": created_group["invite_code"]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["is_member"] is True
        assert g["member_count"] == 2

    def test_join_idempotent(self, created_group, jordan):
        r = requests.post(
            f"{API}/groups/join",
            headers=_h(jordan["token"]),
            json={"invite_code": created_group["invite_code"]},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["is_member"] is True

    def test_non_admin_cannot_add_under_admin_policy(self, created_group, jordan, sam):
        r = requests.post(
            f"{API}/groups/{created_group['id']}/members",
            headers=_h(jordan["token"]),
            json={"user_id": sam["user"]["id"]},
            timeout=20,
        )
        assert r.status_code == 403

    def test_add_member_by_admin(self, created_group, reese, sam):
        r = requests.post(
            f"{API}/groups/{created_group['id']}/members",
            headers=_h(reese["token"]),
            json={"user_id": sam["user"]["id"]},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        g = r.json()
        assert sam["user"]["id"] in [m["id"] for m in g["members"]]
        assert g["member_count"] == 3

    def test_add_unknown_user_404(self, created_group, reese):
        r = requests.post(
            f"{API}/groups/{created_group['id']}/members",
            headers=_h(reese["token"]),
            json={"user_id": "does-not-exist-xyz"},
            timeout=20,
        )
        assert r.status_code == 404

    def test_admin_cannot_leave(self, created_group, reese):
        r = requests.post(
            f"{API}/groups/{created_group['id']}/leave",
            headers=_h(reese["token"]),
            timeout=20,
        )
        assert r.status_code == 400

    def test_non_admin_can_leave(self, created_group, sam):
        r = requests.post(
            f"{API}/groups/{created_group['id']}/leave",
            headers=_h(sam["token"]),
            timeout=20,
        )
        assert r.status_code == 200
        # Verify sam is no longer a member
        r2 = requests.get(f"{API}/groups/{created_group['id']}", headers=_h(sam["token"]), timeout=20)
        assert r2.status_code == 403  # non-member cannot GET detail

    def test_admin_cannot_be_removed(self, created_group, reese):
        # remove admin as admin (self via delete) should return 400
        r = requests.delete(
            f"{API}/groups/{created_group['id']}/members/{reese['user']['id']}",
            headers=_h(reese["token"]),
            timeout=20,
        )
        assert r.status_code == 400

    def test_admin_can_remove_member(self, created_group, reese, jordan):
        # jordan is a member from earlier join
        r = requests.delete(
            f"{API}/groups/{created_group['id']}/members/{jordan['user']['id']}",
            headers=_h(reese["token"]),
            timeout=20,
        )
        assert r.status_code == 200
        # Verify
        r2 = requests.get(f"{API}/groups/{created_group['id']}", headers=_h(reese["token"]), timeout=20)
        assert jordan["user"]["id"] not in [m["id"] for m in r2.json()["members"]]


# ---------------- Candidates ----------------
class TestGroupCandidates:
    def test_candidates_admin(self, created_group, reese):
        r = requests.get(
            f"{API}/groups/{created_group['id']}/candidates",
            headers=_h(reese["token"]),
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Reese's follow-graph should have at least one candidate (jordan/sam seed)
        assert len(data) >= 1
        # Reese should not be in candidates
        assert all(c["id"] != reese["user"]["id"] for c in data)

    def test_candidates_non_admin_under_admin_policy_empty(self, created_group, reese, jordan):
        # Add jordan back so he's a member
        requests.post(
            f"{API}/groups/{created_group['id']}/members",
            headers=_h(reese["token"]),
            json={"user_id": jordan["user"]["id"]},
            timeout=20,
        )
        r = requests.get(
            f"{API}/groups/{created_group['id']}/candidates",
            headers=_h(jordan["token"]),
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json() == []


# ---------------- Feed & Leaderboard ----------------
class TestGroupFeedLeaderboard:
    def test_feed_returns_list(self, created_group, reese):
        r = requests.get(f"{API}/groups/{created_group['id']}/feed", headers=_h(reese["token"]), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_feed_forbidden_for_non_member(self, created_group, sam):
        r = requests.get(f"{API}/groups/{created_group['id']}/feed", headers=_h(sam["token"]), timeout=20)
        assert r.status_code == 403

    def test_leaderboard_default_season_current_year(self, created_group, reese):
        r = requests.get(
            f"{API}/groups/{created_group['id']}/leaderboard",
            headers=_h(reese["token"]),
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["season"] == datetime.now(timezone.utc).year
        assert isinstance(data["entries"], list)
        # Should contain every member (reese + jordan currently)
        member_ids = [e["id"] for e in data["entries"]]
        assert reese["user"]["id"] in member_ids

    def test_leaderboard_extrapolates_9hole(self, created_group, reese):
        """Log a 41 on 9 holes → avg ~ 82 for 18-hole extrapolation."""
        payload = {
            "course_name": "TEST_League Course",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "total_score": 41,
            "par": 36,
            "holes_played": 9,
            "nine": "front",
            "post_type": "round",
        }
        r_create = requests.post(f"{API}/rounds", headers=_h(reese["token"]), json=payload, timeout=20)
        assert r_create.status_code in (200, 201), r_create.text
        rid = r_create.json().get("id")
        try:
            r = requests.get(
                f"{API}/groups/{created_group['id']}/leaderboard",
                headers=_h(reese["token"]),
                timeout=20,
            )
            assert r.status_code == 200
            entries = r.json()["entries"]
            reese_entry = next(e for e in entries if e["id"] == reese["user"]["id"])
            assert reese_entry["round_count"] >= 1
            assert reese_entry["avg_score"] is not None
            # avg should be near 82 (41 on 9-hole par 36 → 82 for 18-hole par 72)
            assert 78 <= reese_entry["avg_score"] <= 86, f"unexpected avg: {reese_entry['avg_score']}"
            assert reese_entry["rank"] == 1 or reese_entry["rank"] is not None
        finally:
            if rid:
                requests.delete(f"{API}/rounds/{rid}", headers=_h(reese["token"]), timeout=20)


# ---------------- Delete ----------------
class TestGroupDelete:
    def test_non_admin_delete_forbidden(self, created_group, jordan):
        r = requests.delete(f"{API}/groups/{created_group['id']}", headers=_h(jordan["token"]), timeout=20)
        assert r.status_code == 403

    def test_admin_delete_and_404(self, reese):
        # Create a throwaway group to delete
        payload = {"name": f"TEST_ToDelete {int(time.time())}", "member_add_policy": "admin"}
        r = requests.post(f"{API}/groups", headers=_h(reese["token"]), json=payload, timeout=20)
        assert r.status_code == 200
        gid = r.json()["id"]
        r2 = requests.delete(f"{API}/groups/{gid}", headers=_h(reese["token"]), timeout=20)
        assert r2.status_code == 200
        r3 = requests.get(f"{API}/groups/{gid}", headers=_h(reese["token"]), timeout=20)
        assert r3.status_code == 404


# ---------------- Policy=any ----------------
class TestGroupPolicyAny:
    def test_any_member_can_add(self, reese, jordan, sam):
        # Create policy=any group, add jordan; then jordan adds sam
        payload = {"name": f"TEST_OpenCrew {int(time.time())}", "member_add_policy": "any"}
        r = requests.post(f"{API}/groups", headers=_h(reese["token"]), json=payload, timeout=20)
        assert r.status_code == 200
        gid = r.json()["id"]
        try:
            r2 = requests.post(
                f"{API}/groups/{gid}/members",
                headers=_h(reese["token"]),
                json={"user_id": jordan["user"]["id"]},
                timeout=20,
            )
            assert r2.status_code == 200
            # Now jordan (non-admin) adds sam under policy=any
            r3 = requests.post(
                f"{API}/groups/{gid}/members",
                headers=_h(jordan["token"]),
                json={"user_id": sam["user"]["id"]},
                timeout=20,
            )
            assert r3.status_code == 200, r3.text
            assert sam["user"]["id"] in [m["id"] for m in r3.json()["members"]]
        finally:
            requests.delete(f"{API}/groups/{gid}", headers=_h(reese["token"]), timeout=20)
