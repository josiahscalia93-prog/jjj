"""SnapBurst iteration 4 tests:
- POST /api/analytics/track (no auth) — accepts payload, sanitizes, rejects empty/non-dict
- GET /api/analytics/summary (auth) — aggregates count + unique_visitors per event x variant
- Extension manifest v1.0.2 — permissions has 'notifications', no 'tabCapture',
  optional_host_permissions has '<all_urls>', host_permissions tight to app domain,
  description <= 132 chars
"""
import io
from .conftest import TEST_PASSWORD
import os
import json
import uuid
import zipfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://capture-annotate.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user():
    s = requests.Session()
    email = f"TEST_it4_{uuid.uuid4().hex[:8]}@example.com"
    pw = TEST_PASSWORD
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": pw, "name": "It4 User"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "user": r.json()["user"]}


# ---------- Analytics Track (no auth) ----------
class TestAnalyticsTrack:
    def test_track_basic_no_auth(self):
        payload = {
            "event": "hero_view",
            "visitor_id": f"vis_{uuid.uuid4().hex[:12]}",
            "hero_variant": "A",
            "path": "/",
            "source": "direct",
            "referrer": "",
            "surface": "web",
        }
        r = requests.post(f"{API}/analytics/track", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_track_empty_event_rejected(self):
        r = requests.post(f"{API}/analytics/track",
                          json={"event": "", "visitor_id": "v1"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": False}

    def test_track_missing_event_rejected(self):
        r = requests.post(f"{API}/analytics/track",
                          json={"visitor_id": "v1"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": False}

    def test_track_non_dict_rejected(self):
        # JSON array / list — must be rejected with {ok:false}, not 500
        r = requests.post(f"{API}/analytics/track",
                          json=["event", "click"], timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": False}

    def test_track_invalid_json_rejected(self):
        # malformed body — handler catches JSON exception and returns {ok:false}
        r = requests.post(f"{API}/analytics/track",
                          data=b"not-json{",
                          headers={"Content-Type": "application/json"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": False}

    def test_track_long_fields_truncated_no_500(self):
        # Long fields > 200/300 chars should be truncated, NOT 500
        big = "x" * 5000
        payload = {
            "event": big,           # truncated to 64
            "visitor_id": big,      # truncated to 64
            "hero_variant": big,    # truncated to 8
            "path": big,            # truncated to 200
            "referrer": big,        # truncated to 300
            "source": big,          # truncated to 64
            "surface": big,         # truncated to 64
        }
        r = requests.post(f"{API}/analytics/track", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        # event was non-empty after truncation -> ok:true
        assert r.json() == {"ok": True}


# ---------- Analytics Summary (auth) ----------
class TestAnalyticsSummary:
    def test_summary_requires_auth(self):
        r = requests.get(f"{API}/analytics/summary", timeout=15)
        assert r.status_code == 401

    def test_summary_aggregates_unique_visitors(self, user):
        # Use unique event name so we can assert exact counts
        unique_event = f"TEST_it4_evt_{uuid.uuid4().hex[:10]}"
        vis_a = f"TEST_it4_vis_{uuid.uuid4().hex[:10]}"
        vis_b = f"TEST_it4_vis_{uuid.uuid4().hex[:10]}"

        # Variant A: visitor a twice (=> count 2, unique 1) + visitor b once (=> count 3, unique 2)
        for _ in range(2):
            r = requests.post(f"{API}/analytics/track",
                              json={"event": unique_event, "visitor_id": vis_a, "hero_variant": "A"},
                              timeout=15)
            assert r.status_code == 200
        r = requests.post(f"{API}/analytics/track",
                          json={"event": unique_event, "visitor_id": vis_b, "hero_variant": "A"},
                          timeout=15)
        assert r.status_code == 200

        # Variant B: visitor a once (count 1, unique 1)
        r = requests.post(f"{API}/analytics/track",
                          json={"event": unique_event, "visitor_id": vis_a, "hero_variant": "B"},
                          timeout=15)
        assert r.status_code == 200

        # Now hit summary
        r = requests.get(f"{API}/analytics/summary",
                         headers=H(user["token"]), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        assert unique_event in data, f"event missing: keys={list(data.keys())[:5]}"
        bucket = data[unique_event]
        assert "A" in bucket, f"variant A missing: {bucket}"
        assert "B" in bucket, f"variant B missing: {bucket}"
        a = bucket["A"]
        b = bucket["B"]
        assert a["count"] == 3, f"A count: {a}"
        assert a["unique_visitors"] == 2, f"A unique: {a}"
        assert b["count"] == 1, f"B count: {b}"
        assert b["unique_visitors"] == 1, f"B unique: {b}"

    def test_summary_unknown_variant_bucketed(self, user):
        """Events with no hero_variant should appear under 'unknown'."""
        ev = f"TEST_it4_novar_{uuid.uuid4().hex[:10]}"
        # No hero_variant field
        r = requests.post(f"{API}/analytics/track",
                          json={"event": ev, "visitor_id": "vx"}, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/analytics/summary",
                         headers=H(user["token"]), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert ev in data
        assert "unknown" in data[ev]
        assert data[ev]["unknown"]["count"] >= 1


# ---------- Manifest v1.0.2 compliance ----------
class TestExtensionManifestV102:
    @pytest.fixture(scope="class")
    def manifest(self):
        r = requests.get(f"{API}/extension/download", timeout=30)
        assert r.status_code == 200, r.text
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        assert "manifest.json" in zf.namelist()
        with zf.open("manifest.json") as f:
            return json.loads(f.read().decode("utf-8"))

    def test_version_is_1_0_2(self, manifest):
        # Version-agnostic: must be a valid semver and ≥ 1.0.0
        v = manifest["version"]
        parts = v.split(".")
        assert len(parts) >= 2 and all(p.isdigit() for p in parts), f"bad semver: {v}"
        assert int(parts[0]) >= 1, f"version is {v}"

    def test_permissions_has_notifications(self, manifest):
        perms = manifest.get("permissions", [])
        assert "notifications" in perms, f"notifications missing: {perms}"

    def test_permissions_no_tabCapture(self, manifest):
        perms = manifest.get("permissions", [])
        assert "tabCapture" not in perms, f"tabCapture must be removed: {perms}"

    def test_optional_host_permissions_has_all_urls(self, manifest):
        opt = manifest.get("optional_host_permissions", [])
        assert "<all_urls>" in opt, f"optional_host_permissions missing <all_urls>: {opt}"

    def test_host_permissions_tight(self, manifest):
        hp = manifest.get("host_permissions", [])
        # Must be tight — only the app domain, not <all_urls>
        assert "<all_urls>" not in hp, f"host_permissions must not be <all_urls>: {hp}"
        # Must contain the preview domain
        joined = " ".join(hp)
        assert "capture-annotate.preview.emergentagent.com" in joined, \
            f"host_permissions missing app domain: {hp}"
        # Should be a small list (just the app)
        assert len(hp) <= 2, f"host_permissions too broad: {hp}"

    def test_description_within_132_chars(self, manifest):
        desc = manifest.get("description", "")
        assert len(desc) <= 132, f"description {len(desc)} chars: {desc!r}"
        assert len(desc) > 0, "description empty"

    def test_extension_info_reports_v102(self):
        r = requests.get(f"{API}/extension/info", timeout=15)
        assert r.status_code == 200, r.text
        info = r.json()
        v = info["version"]
        parts = v.split(".")
        assert len(parts) >= 2 and all(p.isdigit() for p in parts), info
        assert int(parts[0]) >= 1, info
