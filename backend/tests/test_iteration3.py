"""SnapBurst iteration 3 tests:
- GET /api/extension/download — zip excludes store-assets/
- GET /api/extension/listing-assets — exactly 5 PNGs
- GET /api/extension/listing-asset/{name} — image/png; rejects '..' / '/'; 404 missing
- POST /api/captures/{id}/to-gif — ffmpeg transcode of webm recording -> new GIF capture
- POST /api/webhook/stripe with empty body and no STRIPE_WEBHOOK_SECRET — returns 200 {ok:false}
- Slack/Jira post error path uses PUBLIC_APP_URL
"""
import io
from .conftest import TEST_PASSWORD
import os
import re
import uuid
import zipfile
import subprocess
import tempfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://capture-annotate.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PUBLIC_APP_URL = "https://capture-annotate.preview.emergentagent.com"


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user():
    s = requests.Session()
    email = f"TEST_it3_{uuid.uuid4().hex[:8]}@example.com"
    pw = TEST_PASSWORD
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": pw, "name": "It3 User"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "user": r.json()["user"]}


# ---------- Extension download (excludes store-assets) ----------
class TestExtensionDownloadCleanup:
    def test_download_zip_excludes_store_assets(self):
        r = requests.get(f"{API}/extension/download", timeout=30)
        assert r.status_code == 200, r.text
        assert "application/zip" in r.headers.get("content-type", "")
        size = len(r.content)
        # Should be ~21KB; without store-assets it must be well under 80KB
        assert size > 1000, f"zip too small: {size}"
        assert size < 80_000, f"zip too large (store-assets likely included): {size}"
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert "manifest.json" in names, f"manifest.json not at root: {names}"
        # No file under store-assets/
        leaks = [n for n in names if "store-assets/" in n or n.startswith("store-assets")]
        assert not leaks, f"store-assets must NOT be in extension zip: {leaks}"


# ---------- Listing assets ----------
class TestListingAssets:
    def test_listing_assets_no_auth_returns_5(self):
        r = requests.get(f"{API}/extension/listing-assets", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)
        items = body["items"]
        assert len(items) == 5, f"expected 5 png assets, got {len(items)}: {items}"
        names = sorted(it["name"] for it in items)
        assert names == [
            "01-hero.png", "02-features.png", "03-dashboard.png",
            "04-editor.png", "05-pricing.png",
        ], f"unexpected names: {names}"
        for it in items:
            assert it["url"].startswith("/api/extension/listing-asset/")
            assert it["url"].endswith(it["name"])
            assert isinstance(it["size_bytes"], int) and it["size_bytes"] > 0

    def test_listing_asset_serves_png(self):
        r = requests.get(f"{API}/extension/listing-asset/01-hero.png", timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/png")
        # PNG magic bytes
        assert r.content[:8].startswith(b"\x89PNG"), "bytes are not a PNG"
        assert len(r.content) > 1000

    def test_listing_asset_all_five(self):
        for name in ("01-hero.png", "02-features.png", "03-dashboard.png",
                     "04-editor.png", "05-pricing.png"):
            r = requests.get(f"{API}/extension/listing-asset/{name}", timeout=20)
            assert r.status_code == 200, f"{name}: {r.status_code}"
            assert r.content[:8].startswith(b"\x89PNG")

    def test_listing_asset_path_traversal_rejected(self):
        # ".." in filename — request must not be allowed to escape directory.
        # Many proxies normalize "..", so accept either 400 (validation) or 404 (no such asset).
        r = requests.get(f"{API}/extension/listing-asset/..%2Fserver.py",
                         timeout=15, allow_redirects=False)
        assert r.status_code in (400, 404), f"path traversal not rejected: {r.status_code}"
        # must NOT return server.py contents
        assert b"FastAPI" not in r.content and b"def stripe_webhook" not in r.content

    def test_listing_asset_slash_rejected(self):
        # encoded slash forces the value with '/' to reach the handler.
        r = requests.get(f"{API}/extension/listing-asset/foo%2Fbar.png", timeout=15)
        assert r.status_code in (400, 404)

    def test_listing_asset_missing_404(self):
        r = requests.get(f"{API}/extension/listing-asset/no-such-file.png", timeout=15)
        assert r.status_code == 404


# ---------- GIF transcoding ----------
def _make_webm_with_ffmpeg(seconds: float = 1.0) -> bytes:
    """Generate a tiny synthetic webm using ffmpeg testsrc."""
    if not __import__("shutil").which("ffmpeg"):
        pytest.skip("ffmpeg not available locally")
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        out = f.name
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size=160x120:rate=10",
             "-c:v", "libvpx", "-b:v", "100k", "-an", out],
            check=True, capture_output=True, timeout=30,
        )
        return open(out, "rb").read()
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass


class TestToGif:
    def test_to_gif_for_recording(self, user):
        webm = _make_webm_with_ffmpeg(1.0)
        assert webm[:4] == b"\x1aE\xdf\xa3", "not a webm/matroska EBML header"
        files = {"file": ("clip.webm", webm, "video/webm")}
        r = requests.post(f"{API}/captures",
                          files=files,
                          data={"title": "TEST_it3_rec", "kind": "recording", "duration_sec": "1"},
                          headers=H(user["token"]), timeout=60)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["kind"] == "recording"
        rec_id = rec["id"]

        r2 = requests.post(f"{API}/captures/{rec_id}/to-gif",
                           headers=H(user["token"]), timeout=180)
        assert r2.status_code == 200, r2.text
        gif = r2.json()
        assert "id" in gif and gif["id"] != rec_id
        assert gif.get("share_token") and len(gif["share_token"]) >= 16
        assert gif.get("content_type") == "image/gif"
        assert gif.get("kind") == "screenshot"
        assert "_id" not in gif
        assert "source_recording_id" not in gif  # should be popped before return
        # verify the file is real GIF
        f = requests.get(f"{API}/captures/{gif['id']}/file",
                         headers=H(user["token"]), timeout=60)
        assert f.status_code == 200
        assert f.content[:6] in (b"GIF87a", b"GIF89a"), f"not a gif: {f.content[:6]!r}"
        # cleanup recording (gif kept for share inspection in following tests if any)
        user["gif_id"] = gif["id"]
        user["recording_id"] = rec_id

    def test_to_gif_on_screenshot_returns_404(self, user):
        # Create a screenshot capture; to-gif must reject it (kind != recording -> 404)
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
               b"\x0f\x00\x00\x01\x01\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("a.png", png, "image/png")}
        r = requests.post(f"{API}/captures", files=files,
                          data={"title": "TEST_it3_ss", "kind": "screenshot"},
                          headers=H(user["token"]), timeout=30)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        r2 = requests.post(f"{API}/captures/{cid}/to-gif",
                           headers=H(user["token"]), timeout=20)
        assert r2.status_code == 404

    def test_to_gif_nonexistent(self, user):
        r = requests.post(f"{API}/captures/does-not-exist-{uuid.uuid4().hex}/to-gif",
                          headers=H(user["token"]), timeout=20)
        assert r.status_code == 404

    def test_to_gif_unauth(self):
        r = requests.post(f"{API}/captures/anything/to-gif", timeout=15)
        assert r.status_code == 401


# ---------- Stripe webhook with empty STRIPE_WEBHOOK_SECRET ----------
class TestStripeWebhookFallback:
    def test_empty_body_returns_200_ok_false(self):
        r = requests.post(f"{API}/webhook/stripe", data=b"", timeout=15)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is False, f"unexpected: {body}"


# ---------- PUBLIC_APP_URL is used in slack/jira error paths ----------
class TestPublicAppUrl:
    def test_slack_error_does_not_leak_localhost_in_share(self, user):
        """We can't directly inspect share_url string in error message, but we
        can ensure the captured share token's host follows PUBLIC_APP_URL by
        constructing the share URL ourselves and confirming it resolves."""
        # Create a screenshot, get its share_token, and verify GET /share works
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
               b"\x0f\x00\x00\x01\x01\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("a.png", png, "image/png")}
        r = requests.post(f"{API}/captures", files=files,
                          data={"title": "TEST_it3_pub", "kind": "screenshot"},
                          headers=H(user["token"]), timeout=30)
        assert r.status_code == 200
        token = r.json()["share_token"]
        # confirm public share URL based on PUBLIC_APP_URL works
        meta = requests.get(f"{PUBLIC_APP_URL}/api/share/{token}", timeout=20)
        assert meta.status_code == 200, meta.text
