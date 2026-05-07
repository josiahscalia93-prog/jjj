"""SnapBurst backend pytest suite.
Covers: auth (register/login/me/logout), captures CRUD + file, public share, AI chat (text + image).
"""
import io
import os
import base64
import time
import uuid
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://capture-annotate.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- helpers / fixtures ----------
def _make_png_bytes(text: str = "SNAPBURST TEST") -> bytes:
    """Generate a real PNG with visible features (text + shapes)."""
    img = Image.new("RGB", (480, 240), (245, 230, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 460, 220], outline=(120, 60, 200), width=4)
    d.ellipse([60, 60, 180, 180], fill=(255, 200, 80))
    d.rectangle([220, 80, 420, 160], fill=(80, 180, 255))
    d.line([(20, 20), (460, 220)], fill=(220, 60, 120), width=3)
    d.text((40, 200), text, fill=(20, 20, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_with_features() -> bytes:
    """Real JPEG with prominent recognizable features (shapes, colors, text)."""
    img = Image.new("RGB", (640, 360), (250, 245, 235))
    d = ImageDraw.Draw(img)
    # big red circle (sun)
    d.ellipse([60, 60, 220, 220], fill=(230, 70, 60))
    # blue rectangle (building/box)
    d.rectangle([300, 120, 560, 320], fill=(50, 110, 220))
    # green triangle (mountain)
    d.polygon([(380, 60), (520, 60), (450, 200)], fill=(80, 170, 90))
    # text
    d.text((40, 300), "HELLO SNAPBURST", fill=(20, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def primary_user(session):
    """Register a fresh user; fall back to login on alice if registration collides."""
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    name = "Test User"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name}, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
    assert data["user"]["email"] == email.lower()
    assert "_id" not in data["user"]
    cookie = r.cookies.get("session_token")
    assert cookie, "session_token cookie not set on register"
    return {
        "email": email,
        "password": password,
        "name": name,
        "token": data["token"],
        "cookie": cookie,
        "user": data["user"],
    }


@pytest.fixture(scope="session")
def secondary_user():
    """Second user for cross-user authorization checks."""
    s = requests.Session()
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "Second User"}, timeout=30)
    assert r.status_code == 200
    return {"email": email, "password": password, "token": r.json()["token"], "session": s}


# ---------- health ----------
def test_health(session):
    r = session.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- auth ----------
class TestAuth:
    def test_register_already_exists(self, session, primary_user):
        r = session.post(f"{API}/auth/register",
                         json={"email": primary_user["email"], "password": "x", "name": "x"}, timeout=15)
        assert r.status_code == 400

    def test_login_success(self, primary_user):
        r = requests.post(f"{API}/auth/login",
                          json={"email": primary_user["email"], "password": primary_user["password"]}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and len(data["token"]) > 10
        assert data["user"]["email"] == primary_user["email"].lower()
        assert "_id" not in data["user"]
        assert "password_hash" not in data["user"]
        assert r.cookies.get("session_token"), "cookie not set on login"

    def test_login_wrong_password(self, primary_user):
        r = requests.post(f"{API}/auth/login",
                          json={"email": primary_user["email"], "password": "wrong-pass"}, timeout=15)
        assert r.status_code == 401

    def test_me_via_bearer(self, primary_user):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == primary_user["email"].lower()
        assert body["user_id"] == primary_user["user"]["user_id"]
        assert "_id" not in body

    def test_me_via_cookie(self, primary_user):
        r = requests.get(f"{API}/auth/me",
                         cookies={"session_token": primary_user["cookie"]}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["email"] == primary_user["email"].lower()

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_logout_revokes_session(self):
        # fresh user so we can revoke without breaking other tests
        email = f"TEST_logout_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register",
                   json={"email": email, "password": "pw12345!", "name": "Logout"}, timeout=15)
        assert r.status_code == 200
        token = r.json()["token"]

        r = s.post(f"{API}/auth/logout",
                   headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r.status_code == 401, "token should be revoked after logout"


# ---------- captures ----------
class TestCaptures:
    def test_create_capture_screenshot(self, primary_user):
        png = _make_png_bytes("CAP-1")
        files = {"file": ("test.png", png, "image/png")}
        data = {"title": "TEST_capture_1", "kind": "screenshot"}
        r = requests.post(f"{API}/captures", files=files, data=data,
                          headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "TEST_capture_1"
        assert body["kind"] == "screenshot"
        assert body["size"] == len(png) and body["size"] > 0
        assert body["share_token"] and len(body["share_token"]) >= 16
        assert "id" in body
        assert "_id" not in body
        primary_user["capture_id"] = body["id"]
        primary_user["share_token"] = body["share_token"]

    def test_create_invalid_kind(self, primary_user):
        files = {"file": ("a.png", _make_png_bytes(), "image/png")}
        r = requests.post(f"{API}/captures", files=files, data={"title": "x", "kind": "weird"},
                          headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=30)
        assert r.status_code == 400

    def test_create_unauthenticated(self):
        files = {"file": ("a.png", _make_png_bytes(), "image/png")}
        r = requests.post(f"{API}/captures", files=files, data={"title": "x", "kind": "screenshot"}, timeout=20)
        assert r.status_code == 401

    def test_list_captures_only_own(self, primary_user, secondary_user):
        r = requests.get(f"{API}/captures",
                         headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        # all rows belong to primary user
        assert all(row["user_id"] == primary_user["user"]["user_id"] for row in rows)
        assert all("_id" not in row for row in rows)
        # sorted desc by created_at
        cas = [row["created_at"] for row in rows]
        assert cas == sorted(cas, reverse=True)

        # secondary user should NOT see primary's capture
        r2 = requests.get(f"{API}/captures",
                          headers={"Authorization": f"Bearer {secondary_user['token']}"}, timeout=20)
        assert r2.status_code == 200
        rows2 = r2.json()
        assert all(row.get("id") != primary_user.get("capture_id") for row in rows2)

    def test_get_capture_by_id_self(self, primary_user):
        cid = primary_user["capture_id"]
        r = requests.get(f"{API}/captures/{cid}",
                         headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["id"] == cid
        assert "_id" not in r.json()

    def test_get_capture_other_user_404(self, primary_user, secondary_user):
        cid = primary_user["capture_id"]
        r = requests.get(f"{API}/captures/{cid}",
                         headers={"Authorization": f"Bearer {secondary_user['token']}"}, timeout=20)
        assert r.status_code == 404

    def test_patch_capture(self, primary_user):
        cid = primary_user["capture_id"]
        new_ann = [{"type": "rect", "x": 10, "y": 10, "w": 50, "h": 50}]
        r = requests.patch(f"{API}/captures/{cid}",
                           json={"title": "TEST_renamed", "annotations": new_ann},
                           headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "TEST_renamed"
        assert body["annotations"] == new_ann
        assert "_id" not in body
        # verify persisted
        r2 = requests.get(f"{API}/captures/{cid}",
                          headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=15)
        assert r2.json()["title"] == "TEST_renamed"
        assert r2.json()["annotations"] == new_ann

    def test_serve_capture_file_auth(self, primary_user):
        cid = primary_user["capture_id"]
        r = requests.get(f"{API}/captures/{cid}/file",
                         headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=60)
        assert r.status_code == 200
        assert len(r.content) > 0
        assert r.content[:8].startswith(b"\x89PNG"), "expected PNG bytes"

    def test_serve_capture_file_unauth(self, primary_user):
        cid = primary_user["capture_id"]
        r = requests.get(f"{API}/captures/{cid}/file", timeout=20)
        assert r.status_code == 401


# ---------- public share ----------
class TestShare:
    def test_share_meta_no_auth(self, primary_user):
        token = primary_user["share_token"]
        r = requests.get(f"{API}/share/{token}", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "owner" in body and body["owner"]
        assert body["owner"].get("name") == primary_user["name"]
        assert "user_id" not in body  # excluded in projection
        assert "_id" not in body

    def test_share_file_no_auth(self, primary_user):
        token = primary_user["share_token"]
        r = requests.get(f"{API}/share/{token}/file", timeout=60)
        assert r.status_code == 200
        assert r.content[:8].startswith(b"\x89PNG")

    def test_share_invalid_token(self):
        r = requests.get(f"{API}/share/non-existent-token-xxx", timeout=15)
        assert r.status_code == 404


# ---------- AI chat ----------
class TestAI:
    def test_chat_text_only(self, primary_user):
        r = requests.post(f"{API}/ai/chat",
                          json={"message": "In one short sentence, what is SnapBurst?"},
                          headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "reply" in body and isinstance(body["reply"], str) and len(body["reply"]) > 5
        assert "session_id" in body
        primary_user["chat_session_id"] = body["session_id"]

    def test_chat_with_image(self, primary_user):
        jpg = _make_jpeg_with_features()
        b64 = base64.b64encode(jpg).decode()
        r = requests.post(f"{API}/ai/chat",
                          json={
                              "message": "Describe the shapes and colors visible in this image. List each shape you see.",
                              "image_base64": b64,
                              "image_mime": "image/jpeg",
                          },
                          headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=180)
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        assert len(reply) > 10
        # must reference at least one visual feature actually in the image
        keywords = ["circle", "rectangle", "triangle", "square", "shape", "red", "blue", "green", "text", "hello"]
        assert any(k in reply for k in keywords), f"AI reply lacks image-grounded content: {reply[:300]}"

    def test_chat_history(self, primary_user):
        sid = primary_user.get("chat_session_id")
        if not sid:
            pytest.skip("no chat session id")
        r = requests.get(f"{API}/ai/history/{sid}",
                         headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 2
        assert all("_id" not in row for row in rows)


# ---------- delete (run last) ----------
class TestZDelete:
    def test_delete_capture(self, primary_user):
        cid = primary_user["capture_id"]
        r = requests.delete(f"{API}/captures/{cid}",
                            headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=20)
        assert r.status_code == 200
        # not in list
        r2 = requests.get(f"{API}/captures",
                          headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=20)
        assert all(row["id"] != cid for row in r2.json())
        # GET returns 404 (soft-deleted)
        r3 = requests.get(f"{API}/captures/{cid}",
                          headers={"Authorization": f"Bearer {primary_user['token']}"}, timeout=15)
        assert r3.status_code == 404
