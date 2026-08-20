"""Iteration 34 focused re-test: verify admin-approved edits on OpenGolfAPI-sourced
courses (having ``external_id``) are NOT reverted by ``_ensure_course_details()``
on subsequent GETs.

Previously (iter 33) the ``test_course_updated_after_approve`` case passed on
Pebble Beach because Pebble is OSM/community-sourced (no external_id) — the
clobber only manifested on OpenGolfAPI-sourced courses (e.g. Cimarron Golf).
This module targets that path explicitly.

Fix under test:
1. admin.admin_approve_course_edit -> ``$addToSet`` edited field names into
   ``courses.manually_edited_fields``.
2. courses._ensure_course_details -> filter ``manually_edited_fields`` out of
   the OpenGolfAPI-detail write dict.
3. courses._cache_opengolf_compact -> same filter on search-cache upsert.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://course-crew-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "reese@teebox.demo"
USER_EMAIL = "jordan@teebox.demo"
PASSWORD = "password123"


def _login(email: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return tok


def _h(tok: str):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL)


@pytest.fixture(scope="module")
def user_token():
    return _login(USER_EMAIL)


def _find_opengolf_course(user_token: str) -> str:
    """Return the name of an OpenGolfAPI-sourced course we can safely edit.
    Searches a few likely names; falls back to any /courses/search hit whose
    detail endpoint reports source='opengolfapi' or the course exposes an
    external_id-driven field like tees/holes.
    """
    for q in ("Cimarron", "Bethpage", "Torrey Pines", "Chambers", "TPC"):
        r = requests.get(f"{API}/courses/search", headers=_h(user_token), params={"q": q}, timeout=20)
        if r.status_code != 200:
            continue
        for c in r.json():
            name = c.get("name")
            if not name:
                continue
            # Fetch detail to determine source
            d = requests.get(f"{API}/courses/{name}", headers=_h(user_token), timeout=25)
            if d.status_code != 200:
                continue
            body = d.json()
            if body.get("source") == "opengolfapi":
                return name
    pytest.skip("No OpenGolfAPI-sourced course found in search; cannot exercise this path")


# --------------------------------------------------------------------- tests
class TestEditPersistenceOnOpenGolfCourse:
    """Focused re-test of the iter-33 HIGH bug fix."""

    @classmethod
    def setup_class(cls):
        cls.course_name = None
        cls.edit_id = None
        cls.new_website = None
        cls.new_address = None

    def test_pick_opengolf_course(self, user_token):
        name = _find_opengolf_course(user_token)
        TestEditPersistenceOnOpenGolfCourse.course_name = name
        assert name

    def test_submit_edit(self, user_token):
        assert self.course_name is not None
        TestEditPersistenceOnOpenGolfCourse.new_website = f"https://example.com/admin-{uuid.uuid4().hex[:6]}"
        TestEditPersistenceOnOpenGolfCourse.new_address = f"TEST admin address {uuid.uuid4().hex[:6]}"
        payload = {
            "course_name": self.course_name,
            "website": self.new_website,
            "address": self.new_address,
            "note": "TEST iter34 — verify persistence on OpenGolfAPI-sourced course",
        }
        r = requests.post(f"{API}/courses/edit-requests", headers=_h(user_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert "website" in body["proposed_changes"]
        assert "address" in body["proposed_changes"]
        TestEditPersistenceOnOpenGolfCourse.edit_id = body["id"]

    def test_admin_approve(self, admin_token):
        assert self.edit_id is not None
        r = requests.post(f"{API}/admin/course-edits/{self.edit_id}/approve", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_first_get_after_approve_keeps_edit(self, user_token):
        """First GET may trigger _ensure_course_details() re-fetch — approved
        fields must survive."""
        r = requests.get(f"{API}/courses/{self.course_name}", headers=_h(user_token), timeout=25)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("website") == self.new_website, (
            f"1st GET reverted website. expected={self.new_website!r} got={body.get('website')!r}"
        )
        assert body.get("address") == self.new_address, (
            f"1st GET reverted address. expected={self.new_address!r} got={body.get('address')!r}"
        )

    def test_second_get_after_approve_keeps_edit(self, user_token):
        """Small delay then second GET — the previously-broken code path
        clobbered on the 2nd GET when the OpenGolfAPI cache TTL freshness
        gate re-fetched detail. Confirm the fix holds on repeated fetches."""
        time.sleep(2.0)
        r = requests.get(f"{API}/courses/{self.course_name}", headers=_h(user_token), timeout=25)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("website") == self.new_website, (
            f"2nd GET reverted website (regression). expected={self.new_website!r} got={body.get('website')!r}"
        )
        assert body.get("address") == self.new_address, (
            f"2nd GET reverted address (regression). expected={self.new_address!r} got={body.get('address')!r}"
        )

    def test_third_get_after_search_cache_refresh(self, user_token):
        """Trigger /courses/search which calls _cache_opengolf_compact() —
        this was the *other* clobber path. The manually_edited_fields filter
        there must also hold. """
        # Hit search with the course's name to force a search-cache upsert.
        r_search = requests.get(f"{API}/courses/search", headers=_h(user_token), params={"q": self.course_name[:8]}, timeout=25)
        assert r_search.status_code == 200
        time.sleep(1.0)
        r = requests.get(f"{API}/courses/{self.course_name}", headers=_h(user_token), timeout=25)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("website") == self.new_website, (
            f"post-search-cache GET reverted website. expected={self.new_website!r} got={body.get('website')!r}"
        )
        assert body.get("address") == self.new_address, (
            f"post-search-cache GET reverted address. expected={self.new_address!r} got={body.get('address')!r}"
        )

    def test_manually_edited_fields_persisted(self, admin_token):
        """Verify the admin-approve step wrote website & address into
        manually_edited_fields (via /admin/course-edits/pending? not enough —
        use the DB proxy: fetching via search/detail doesn't expose the array,
        so we use a targeted approach: submit a *new* no-op edit on the same
        two fields with the SAME values — expected 400 'No changes detected'
        proves the DB now holds those values (which combined with the earlier
        assertions proves the manual-edit tracking is effective)."""
        # Sanity: attempt to re-submit an edit setting website to the SAME approved value.
        # Since it now equals current, backend must return 400 'No changes detected'.
        user_tok = _login(USER_EMAIL)
        payload = {"course_name": self.course_name, "website": self.new_website, "address": self.new_address}
        r = requests.post(f"{API}/courses/edit-requests", headers=_h(user_tok), json=payload, timeout=10)
        assert r.status_code == 400, (
            f"Expected 400 'no changes detected' proving website+address are persisted, got {r.status_code}: {r.text}"
        )
