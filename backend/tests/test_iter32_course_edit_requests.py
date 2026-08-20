"""Iteration 32: Course Edit Requests + Feed Refresh feature backend tests.

Covers:
- POST /api/courses  (new-course submission with extended NewCourseIn)
- POST /api/courses/edit-requests  (suggest an edit; server-side diff)
- GET  /api/courses/submissions/mine
- GET  /api/courses/edit-requests/mine
- GET  /api/admin/course-edits/pending
- POST /api/admin/course-edits/{id}/approve  -> notification 'course_edit_approved'
- POST /api/admin/course-edits/{id}/reject   -> notification 'course_edit_rejected'
- 403 on admin endpoints for non-admin users
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://course-crew-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "reese@teebox.demo"
NON_ADMIN_EMAIL = "jordan@teebox.demo"
PASSWORD = "password123"


def _login(email: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token") or (body.get("tokens") or {}).get("access_token")
    assert tok, f"no access token in login body: {body}"
    return tok


def _h(tok: str):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL)


@pytest.fixture(scope="module")
def user_token():
    return _login(NON_ADMIN_EMAIL)


@pytest.fixture(scope="module")
def user_id(user_token):
    r = requests.get(f"{API}/auth/me", headers=_h(user_token), timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------------------- Auth / role gating ----------------------------
class TestAdminRoleGating:
    def test_non_admin_pending_edits_403(self, user_token):
        r = requests.get(f"{API}/admin/course-edits/pending", headers=_h(user_token), timeout=10)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_non_admin_approve_edit_403(self, user_token):
        r = requests.post(f"{API}/admin/course-edits/{uuid.uuid4()}/approve", headers=_h(user_token), timeout=10)
        assert r.status_code == 403

    def test_non_admin_reject_edit_403(self, user_token):
        r = requests.post(f"{API}/admin/course-edits/{uuid.uuid4()}/reject", headers=_h(user_token), json={"reason": "x"}, timeout=10)
        assert r.status_code == 403


# ---------------------------- New course submission ----------------------------
class TestSubmitNewCourse:
    """POST /api/courses -> creates pending course; visible in submissions/mine."""

    course_name = f"TEST_NewCourse_{uuid.uuid4().hex[:8]}"

    def test_submit_new_course(self, user_token):
        payload = {
            "name": self.course_name,
            "address": "1 Fairway Dr, Testville",
            "par": 72,
            "city": "Testville",
            "region": "CA",
            "country": "USA",
            "num_holes": 18,
        }
        r = requests.post(f"{API}/courses", headers=_h(user_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("created") is True
        assert body["course"]["name"] == self.course_name
        assert body["course"]["par"] == 72
        TestSubmitNewCourse._created_id = body["course"]["id"]

    def test_submissions_mine_shows_pending(self, user_token):
        r = requests.get(f"{API}/courses/submissions/mine", headers=_h(user_token), timeout=10)
        assert r.status_code == 200, r.text
        items = r.json()
        match = next((x for x in items if x["name"] == self.course_name), None)
        assert match is not None, f"submitted course not in submissions/mine: {[i['name'] for i in items[:5]]}"
        assert match["status"] == "pending"


# ---------------------------- Edit request flow (approve) ----------------------------
class TestEditRequestApprove:
    """Submit edit -> admin approves -> course updated + notification."""

    @classmethod
    def setup_class(cls):
        cls.course_name = None
        cls.edit_id = None

    def test_pick_verified_course(self, user_token):
        r = requests.get(f"{API}/courses/search", headers=_h(user_token), params={"q": "Pebble"}, timeout=15)
        assert r.status_code == 200, r.text
        results = r.json()
        assert results, "no verified courses returned for search 'Pebble'"
        verified = next((c for c in results if c.get("verified")), results[0])
        TestEditRequestApprove.course_name = verified["name"]

    def test_submit_edit_request(self, user_token):
        assert self.course_name is not None
        new_website = f"https://example.com/{uuid.uuid4().hex[:6]}"
        payload = {
            "course_name": self.course_name,
            "website": new_website,
            "note": "TEST edit — please approve",
        }
        r = requests.post(f"{API}/courses/edit-requests", headers=_h(user_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["course_name"] == self.course_name
        assert "website" in body["proposed_changes"]
        assert body["proposed_changes"]["website"] == new_website
        TestEditRequestApprove.edit_id = body["id"]
        TestEditRequestApprove.new_website = new_website

    def test_no_change_returns_400(self, user_token):
        # Re-submitting the exact current value should now say "No changes detected"
        # but our just-submitted request is still PENDING (not applied), so field
        # differs. Submit with an unrelated no-op (empty) payload -> 400.
        payload = {"course_name": self.course_name}
        r = requests.post(f"{API}/courses/edit-requests", headers=_h(user_token), json=payload, timeout=10)
        assert r.status_code == 400, f"expected 400 no-changes, got {r.status_code}: {r.text}"

    def test_edit_requests_mine_shows_pending(self, user_token):
        r = requests.get(f"{API}/courses/edit-requests/mine", headers=_h(user_token), timeout=10)
        assert r.status_code == 200, r.text
        match = next((x for x in r.json() if x["id"] == self.edit_id), None)
        assert match is not None
        assert match["status"] == "pending"

    def test_admin_sees_pending_edit(self, admin_token):
        r = requests.get(f"{API}/admin/course-edits/pending", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        assert any(x["id"] == self.edit_id for x in r.json()), "submitted edit not in admin pending list"

    def test_admin_approve_edit(self, admin_token):
        r = requests.post(f"{API}/admin/course-edits/{self.edit_id}/approve", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_course_updated_after_approve(self, user_token):
        r = requests.get(f"{API}/courses/{self.course_name}", headers=_h(user_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("website") == self.new_website, "approved edit did not apply to course"

    def test_notification_course_edit_approved(self, user_token):
        # Give backend a moment in case emit_notification is async-fired.
        time.sleep(1.5)
        r = requests.get(f"{API}/notifications", headers=_h(user_token), timeout=10)
        assert r.status_code == 200, r.text
        notifs = r.json() if isinstance(r.json(), list) else r.json().get("notifications", [])
        matches = [n for n in notifs if n.get("type") == "course_edit_approved" and n.get("course_name") == self.course_name]
        assert matches, f"no course_edit_approved notification found. types seen: {[n.get('type') for n in notifs[:10]]}"

    def test_approve_twice_400(self, admin_token):
        r = requests.post(f"{API}/admin/course-edits/{self.edit_id}/approve", headers=_h(admin_token), timeout=10)
        assert r.status_code == 400, f"expected 400 on double approve, got {r.status_code}"


# ---------------------------- Edit request flow (reject) ----------------------------
class TestEditRequestReject:
    @classmethod
    def setup_class(cls):
        cls.course_name = None
        cls.edit_id = None

    def test_pick_course_and_submit_edit(self, user_token):
        r = requests.get(f"{API}/courses/search", headers=_h(user_token), params={"q": "Pebble"}, timeout=15)
        assert r.status_code == 200
        verified = next((c for c in r.json() if c.get("verified")), r.json()[0])
        TestEditRequestReject.course_name = verified["name"]
        payload = {
            "course_name": self.course_name,
            "phone": f"555-0{uuid.uuid4().hex[:6]}",
            "note": "TEST edit — please reject",
        }
        r2 = requests.post(f"{API}/courses/edit-requests", headers=_h(user_token), json=payload, timeout=15)
        assert r2.status_code == 200, r2.text
        TestEditRequestReject.edit_id = r2.json()["id"]

    def test_admin_reject_edit(self, admin_token):
        r = requests.post(
            f"{API}/admin/course-edits/{self.edit_id}/reject",
            headers=_h(admin_token),
            json={"reason": "TEST rejection"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_notification_course_edit_rejected(self, user_token):
        time.sleep(1.5)
        r = requests.get(f"{API}/notifications", headers=_h(user_token), timeout=10)
        assert r.status_code == 200
        notifs = r.json() if isinstance(r.json(), list) else r.json().get("notifications", [])
        matches = [n for n in notifs if n.get("type") == "course_edit_rejected"]
        assert matches, f"no course_edit_rejected notification found. types seen: {[n.get('type') for n in notifs[:10]]}"

    def test_edit_request_status_rejected(self, user_token):
        r = requests.get(f"{API}/courses/edit-requests/mine", headers=_h(user_token), timeout=10)
        assert r.status_code == 200
        match = next((x for x in r.json() if x["id"] == self.edit_id), None)
        assert match is not None
        assert match["status"] == "rejected"


# ---------------------------- Not-found + validation ----------------------------
class TestEdgeCases:
    def test_edit_unknown_course_404(self, user_token):
        payload = {"course_name": f"TEST_DOES_NOT_EXIST_{uuid.uuid4().hex[:8]}", "par": 71}
        r = requests.post(f"{API}/courses/edit-requests", headers=_h(user_token), json=payload, timeout=10)
        assert r.status_code == 404, r.text

    def test_approve_unknown_edit_404(self, admin_token):
        r = requests.post(f"{API}/admin/course-edits/{uuid.uuid4()}/approve", headers=_h(admin_token), timeout=10)
        assert r.status_code == 404
