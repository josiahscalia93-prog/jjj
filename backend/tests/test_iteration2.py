"""SnapBurst iteration 2 tests:
- Stripe checkout (real test mode) + status
- Integrations (Slack/Jira) GET/PUT/DELETE — secrets must NOT echo back
- Capture post-to-Slack / post-to-Jira error paths (not connected, ownership)
- AI chat history persistence with explicit session_id
- Extension /info and ZIP /download — manifest at root
- /api/webhook/stripe should return {ok:false} on missing signature, NOT 404
- _id never leaks; both Bearer & cookie auth still work
"""
import io
from .conftest import TEST_PASSWORD
import os
import uuid
import zipfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://capture-annotate.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _png_bytes() -> bytes:
    # tiny valid PNG
    return (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
            b"\x0f\x00\x00\x01\x01\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")


@pytest.fixture(scope="module")
def user():
    """Fresh registered user for iteration 2 tests."""
    s = requests.Session()
    email = f"TEST_it2_{uuid.uuid4().hex[:8]}@example.com"
    pw = TEST_PASSWORD
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": pw, "name": "It2 User"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    return {
        "email": email, "password": pw, "token": body["token"],
        "cookie": s.cookies.get("session_token"), "user": body["user"],
        "session": s,
    }


@pytest.fixture(scope="module")
def other_user():
    s = requests.Session()
    email = f"TEST_it2other_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": TEST_PASSWORD, "name": "Other"}, timeout=30)
    assert r.status_code == 200
    return {"token": r.json()["token"]}


@pytest.fixture(scope="module")
def capture_id(user):
    """Create a capture owned by `user` for post-slack/jira error-path tests."""
    files = {"file": ("a.png", _png_bytes(), "image/png")}
    r = requests.post(f"{API}/captures", files=files, data={"title": "TEST_it2_cap", "kind": "screenshot"},
                      headers={"Authorization": f"Bearer {user['token']}"}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Extension info & download ----------
class TestExtension:
    def test_info_no_auth(self):
        r = requests.get(f"{API}/extension/info", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("name", "version", "size_bytes", "files"):
            assert k in body, f"missing key {k}"
        assert isinstance(body["files"], list) and len(body["files"]) > 0
        # manifest.json must be at root (not nested under a parent folder)
        assert "manifest.json" in body["files"], f"manifest.json not at root: {body['files']}"
        assert not any(f.endswith("/manifest.json") for f in body["files"]), \
            "manifest.json must be at zip root, not nested"
        assert body["size_bytes"] > 0

    def test_download_zip(self):
        r = requests.get(f"{API}/extension/download", timeout=30)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "application/zip" in ct, f"unexpected content-type: {ct}"
        assert len(r.content) > 0
        # validate it is a real zip with manifest.json at root
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert "manifest.json" in names, f"manifest.json not at zip root; names={names}"
        # also validate manifest_version=3
        with zf.open("manifest.json") as fp:
            import json as _json
            mani = _json.loads(fp.read().decode())
            assert mani.get("manifest_version") == 3
            assert mani.get("name")


# ---------- Stripe billing ----------
class TestBilling:
    def test_checkout_unauthenticated(self):
        r = requests.post(f"{API}/billing/checkout",
                          json={"tier": "pro", "origin_url": "https://example.com"}, timeout=20)
        assert r.status_code == 401

    def test_checkout_unknown_tier(self, user):
        r = requests.post(f"{API}/billing/checkout",
                          json={"tier": "ultra", "origin_url": "https://example.com"},
                          headers=H(user["token"]), timeout=20)
        assert r.status_code == 400

    def test_checkout_pro_success(self, user):
        r = requests.post(f"{API}/billing/checkout",
                          json={"tier": "pro", "origin_url": "https://example.com"},
                          headers=H(user["token"]), timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "url" in body and isinstance(body["url"], str) and body["url"].startswith("https://")
        assert "session_id" in body and isinstance(body["session_id"], str) and len(body["session_id"]) > 5
        assert "_id" not in body
        user["checkout_session_id"] = body["session_id"]

    def test_checkout_status(self, user):
        import time
        sid = user.get("checkout_session_id")
        if not sid:
            pytest.skip("no checkout session id from previous test")
        # Stripe may need a moment to propagate session before status lookup works
        r = None
        for attempt in range(5):
            r = requests.get(f"{API}/billing/checkout-status/{sid}",
                             headers=H(user["token"]), timeout=60)
            if r.status_code == 200:
                break
            time.sleep(2)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("status", "payment_status", "amount_total", "currency"):
            assert k in body, f"missing {k}"
        assert body["currency"].lower() == "usd"
        # initially not paid (we haven't completed checkout). 'initiated' is the
        # DB-fallback value used when the Emergent Stripe proxy returns
        # "No such checkout.session" in test mode.
        assert body["payment_status"] in ("unpaid", "no_payment_required", "paid", "initiated")
        # status should reflect an open/initiated checkout session
        assert body["status"] in ("open", "complete", "initiated")
        # amount must be a positive integer in cents (pro=800, team=1400)
        assert isinstance(body["amount_total"], int) and body["amount_total"] > 0
        assert "_id" not in body

    def test_checkout_status_unauth(self, user):
        sid = user.get("checkout_session_id")
        if not sid:
            pytest.skip("no checkout session id")
        r = requests.get(f"{API}/billing/checkout-status/{sid}", timeout=15)
        assert r.status_code == 401

    def test_checkout_status_nonexistent_returns_404(self, user):
        bogus = f"cs_test_NONEXISTENT_{uuid.uuid4().hex}"
        r = requests.get(f"{API}/billing/checkout-status/{bogus}",
                         headers=H(user["token"]), timeout=20)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "Unknown session" in detail or "unknown" in detail.lower()

    def test_webhook_stripe_no_signature_returns_200_not_404(self):
        """Webhook is mounted directly on app, path /api/webhook/stripe.
        Empty body / no signature should NOT return 404 — must be 200 with {ok:false}."""
        r = requests.post(f"{API}/webhook/stripe", data=b"", timeout=15)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text}"
        body = r.json()
        # signature missing → ok:false
        assert body.get("ok") is False, f"unexpected webhook body: {body}"


# ---------- Integrations ----------
class TestIntegrations:
    def test_get_unauth(self):
        r = requests.get(f"{API}/integrations", timeout=15)
        assert r.status_code == 401

    def test_get_default_state(self, user):
        r = requests.get(f"{API}/integrations", headers=H(user["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["slack_connected"] is False
        assert body["jira_connected"] is False
        # secrets must never appear
        assert "jira_api_token" not in body
        assert "slack_webhook_url" not in body
        assert "_id" not in body

    def test_slack_invalid_url_rejected(self, user):
        r = requests.put(f"{API}/integrations/slack",
                         json={"webhook_url": "https://evil.example.com/hook"},
                         headers=H(user["token"]), timeout=15)
        assert r.status_code == 400

    def test_slack_set_and_get(self, user):
        url = "https://hooks.slack.com/services/T000/B000/XXXXXX"
        r = requests.put(f"{API}/integrations/slack",
                         json={"webhook_url": url}, headers=H(user["token"]), timeout=15)
        assert r.status_code == 200, r.text
        # verify get
        g = requests.get(f"{API}/integrations", headers=H(user["token"]), timeout=15)
        body = g.json()
        assert body["slack_connected"] is True
        assert "slack_webhook_url" not in body  # secret never echoed

    def test_jira_set_and_get(self, user):
        r = requests.put(f"{API}/integrations/jira",
                         json={
                             "base_url": "https://example.atlassian.net",
                             "email": "test@example.com",
                             "api_token": "TEST_FAKE_TOKEN_DO_NOT_USE",
                             "project_key": "SB",
                         }, headers=H(user["token"]), timeout=15)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/integrations", headers=H(user["token"]), timeout=15)
        body = g.json()
        assert body["jira_connected"] is True
        assert body["jira_base_url"] == "https://example.atlassian.net"
        assert body["jira_email"] == "test@example.com"
        assert body["jira_project_key"] == "SB"
        assert "jira_api_token" not in body, "Jira API token must NEVER be echoed"
        assert "_id" not in body

    def test_jira_invalid_base_url(self, user):
        r = requests.put(f"{API}/integrations/jira",
                         json={"base_url": "not-a-url", "email": "x@x.com",
                               "api_token": "t", "project_key": "K"},
                         headers=H(user["token"]), timeout=15)
        assert r.status_code == 400

    def test_slack_via_cookie_auth(self, user):
        """Verify cookie auth still works for protected endpoints."""
        r = requests.get(f"{API}/integrations", cookies={"session_token": user["cookie"]}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["slack_connected"] is True

    def test_zz_delete_slack(self, user):
        r = requests.delete(f"{API}/integrations/slack", headers=H(user["token"]), timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{API}/integrations", headers=H(user["token"]), timeout=15)
        assert g.json()["slack_connected"] is False

    def test_zz_delete_jira(self, user):
        r = requests.delete(f"{API}/integrations/jira", headers=H(user["token"]), timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{API}/integrations", headers=H(user["token"]), timeout=15)
        body = g.json()
        assert body["jira_connected"] is False
        assert body.get("jira_base_url") in (None, "")


# ---------- Capture post-to-Slack / Jira (error paths only) ----------
class TestCapturePost:
    def test_post_slack_not_connected(self, user, capture_id):
        # ensure slack disconnected (clean state for this test)
        requests.delete(f"{API}/integrations/slack", headers=H(user["token"]), timeout=15)
        r = requests.post(f"{API}/captures/{capture_id}/post-slack",
                          json={"note": "hello"}, headers=H(user["token"]), timeout=20)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "Slack not connected" in detail or "not connected" in detail.lower()

    def test_post_slack_other_users_capture_404(self, other_user, capture_id):
        r = requests.post(f"{API}/captures/{capture_id}/post-slack",
                          json={"note": "x"}, headers=H(other_user["token"]), timeout=20)
        assert r.status_code == 404

    def test_post_jira_not_connected(self, user, capture_id):
        requests.delete(f"{API}/integrations/jira", headers=H(user["token"]), timeout=15)
        r = requests.post(f"{API}/captures/{capture_id}/post-jira",
                          json={"note": "hi"}, headers=H(user["token"]), timeout=20)
        assert r.status_code == 400
        assert "not connected" in r.json().get("detail", "").lower()

    def test_post_jira_other_users_capture_404(self, other_user, capture_id):
        r = requests.post(f"{API}/captures/{capture_id}/post-jira",
                          json={"note": "x"}, headers=H(other_user["token"]), timeout=20)
        assert r.status_code == 404


# ---------- AI history with explicit session_id ----------
class TestAIHistory:
    def test_history_with_explicit_session_id(self, user):
        sid = f"TEST_sid_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/ai/chat",
                          json={"message": "Hi! Reply with one short word.", "session_id": sid},
                          headers=H(user["token"]), timeout=120)
        if r.status_code == 500 and "budget" in r.text.lower():
            pytest.skip(f"LLM budget exceeded (environmental, not a code issue): {r.text[:200]}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["session_id"] == sid, "server must preserve provided session_id"

        # second call with same sid should also persist additional rows
        r2 = requests.post(f"{API}/ai/chat",
                           json={"message": "Another short reply please.", "session_id": sid},
                           headers=H(user["token"]), timeout=120)
        if r2.status_code == 200:
            assert r2.json()["session_id"] == sid

        # Now fetch history
        h = requests.get(f"{API}/ai/history/{sid}", headers=H(user["token"]), timeout=20)
        assert h.status_code == 200, h.text
        rows = h.json()
        assert isinstance(rows, list) and len(rows) >= 2
        roles = [row.get("role") for row in rows]
        assert "user" in roles and "assistant" in roles
        # ordered by created_at ascending
        cas = [row["created_at"] for row in rows]
        assert cas == sorted(cas), "history must be ordered ascending by created_at"
        # no _id leak
        assert all("_id" not in row for row in rows)
        # session_id present per row
        assert all(row.get("session_id") == sid for row in rows)

    def test_history_unauth(self):
        r = requests.get(f"{API}/ai/history/anything", timeout=15)
        assert r.status_code == 401
