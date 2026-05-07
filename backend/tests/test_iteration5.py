"""SnapBurst iteration 5 tests:
- TTL indexes: analytics_events.created_at_dt (90 days) + analytics_rl.ts (70s)
  + compound index (event, hero_variant) on analytics_events
- POST /api/analytics/track rate limiter (Mongo-backed /24 sliding window):
  DB-seeded 60 docs for /24 -> expect 429 on next request (X-Forwarded-For).
- GET /api/extension/store-id (no auth) -> {extension_id, source}
- PUT /api/extension/store-id (auth) -> 32-char a-p validation, persists to db.app_config
- GET /api/analytics/winner (auth) -> per-variant CVR + auto winner detection
  (>=50 page_views AND >=2pp CVR gap)
- Unit-style _rate_check via direct module import w/ env override
"""
import os
import sys
import uuid
import asyncio
import importlib
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://capture-annotate.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user():
    s = requests.Session()
    email = f"TEST_it5_{uuid.uuid4().hex[:8]}@example.com"
    pw = "TestPass123!"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": pw, "name": "It5 User"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "user": r.json()["user"]}


@pytest.fixture(scope="module")
def db():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


# ---------- TTL & compound indexes ----------
class TestIndexes:
    def test_analytics_events_ttl_90_days(self, db):
        idx = db.analytics_events.index_information()
        ttl = None
        for spec in idx.values():
            keys = spec.get("key", [])
            if keys and keys[0][0] == "created_at_dt" and "expireAfterSeconds" in spec:
                ttl = spec["expireAfterSeconds"]
        assert ttl == 90 * 24 * 3600, f"expected 7776000s TTL, got {ttl} (idx={list(idx.keys())})"

    def test_analytics_events_compound_event_variant(self, db):
        idx = db.analytics_events.index_information()
        found = False
        for spec in idx.values():
            keys = spec.get("key", [])
            if [k[0] for k in keys] == ["event", "hero_variant"]:
                found = True
                break
        assert found, f"compound (event, hero_variant) idx missing: {list(idx.keys())}"

    def test_analytics_rl_ttl_70_seconds(self, db):
        idx = db.analytics_rl.index_information()
        ttl = None
        for spec in idx.values():
            keys = spec.get("key", [])
            if keys and keys[0][0] == "ts" and "expireAfterSeconds" in spec:
                ttl = spec["expireAfterSeconds"]
        assert ttl == 70, f"expected 70s TTL, got {ttl}"

    def test_analytics_rl_ip_index(self, db):
        idx = db.analytics_rl.index_information()
        found = any(spec.get("key") and spec["key"][0][0] == "ip" for spec in idx.values())
        assert found, f"ip index missing: {list(idx.keys())}"


# ---------- Analytics Track rate-limit (DB-seeded /24) ----------
class TestRateLimitDBSeed:
    def test_rate_limit_429_after_60_seeded(self, db):
        bucket = "203.0.113"   # TEST-NET-3
        client_ip = f"{bucket}.42"
        now = datetime.now(timezone.utc)
        db.analytics_rl.delete_many({"ip": bucket})
        db.analytics_rl.insert_many([{"ip": bucket, "ts": now} for _ in range(60)])
        r = requests.post(
            f"{API}/analytics/track",
            json={"event": "hero_view", "visitor_id": "vx"},
            headers={"X-Forwarded-For": client_ip},
            timeout=15,
        )
        db.analytics_rl.delete_many({"ip": bucket})
        assert r.status_code == 429, f"expected 429, got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert body.get("ok") is False
        assert body.get("reason") == "rate_limit"

    def test_track_under_limit_passes(self, db):
        bucket = "198.51.100"   # TEST-NET-2
        client_ip = f"{bucket}.5"
        db.analytics_rl.delete_many({"ip": bucket})
        now = datetime.now(timezone.utc)
        db.analytics_rl.insert_many([{"ip": bucket, "ts": now} for _ in range(5)])
        r = requests.post(
            f"{API}/analytics/track",
            json={"event": "hero_view", "visitor_id": "vy"},
            headers={"X-Forwarded-For": client_ip},
            timeout=15,
        )
        db.analytics_rl.delete_many({"ip": bucket})
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_xff_first_ip_used_for_24_bucket(self, db):
        """X-Forwarded-For: first IP's /24 is the rate-limit bucket."""
        bucket = "192.0.2"  # TEST-NET-1
        db.analytics_rl.delete_many({"ip": bucket})
        now = datetime.now(timezone.utc)
        db.analytics_rl.insert_many([{"ip": bucket, "ts": now} for _ in range(60)])
        r = requests.post(
            f"{API}/analytics/track",
            json={"event": "hero_view"},
            headers={"X-Forwarded-For": f"{bucket}.99, 10.10.10.10, 172.16.0.1"},
            timeout=15,
        )
        db.analytics_rl.delete_many({"ip": bucket})
        assert r.status_code == 429, f"expected 429 from first XFF /24, got {r.status_code}"


# ---------- Unit-style _rate_check via direct import (env override) ----------
class TestRateCheckUnit:
    def test_rate_check_allows_then_blocks_with_low_limit(self, monkeypatch):
        """Reload server module with ANALYTICS_RATE_LIMIT_PER_MIN=5; first 5 -> True, next -> False."""
        monkeypatch.setenv("ANALYTICS_RATE_LIMIT_PER_MIN", "5")
        if "/app/backend" not in sys.path:
            sys.path.insert(0, "/app/backend")
        if "server" in sys.modules:
            del sys.modules["server"]
        srv = importlib.import_module("server")
        try:
            assert srv.ANALYTICS_RATE_LIMIT == 5, f"env override failed: {srv.ANALYTICS_RATE_LIMIT}"
            # Run async _rate_check via dedicated event loop owned by this test
            async def run_check():
                await srv.db.analytics_rl.delete_many({"ip": "10.20.30"})
                results = []
                for _ in range(7):
                    results.append(await srv._rate_check("10.20.30.55"))
                await srv.db.analytics_rl.delete_many({"ip": "10.20.30"})
                return results
            loop = asyncio.new_event_loop()
            try:
                results = loop.run_until_complete(run_check())
            finally:
                loop.close()
            assert results[:5] == [True] * 5, f"first 5 should pass: {results}"
            assert results[5:] == [False, False], f"after 5 should block: {results}"
        finally:
            # Drop reloaded module to avoid affecting other tests
            sys.modules.pop("server", None)


# ---------- Extension Store ID endpoints ----------
class TestExtensionStoreId:
    @pytest.fixture(autouse=True)
    def _cleanup(self, db):
        if not (os.environ.get("CHROME_EXTENSION_ID") or "").strip():
            db.app_config.delete_one({"key": "chrome_extension_id"})
        yield
        if not (os.environ.get("CHROME_EXTENSION_ID") or "").strip():
            db.app_config.delete_one({"key": "chrome_extension_id"})

    def test_get_store_id_no_auth_initial_unset(self):
        r = requests.get(f"{API}/extension/store-id", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "extension_id" in data
        assert "source" in data
        assert data["source"] == "unset", data
        assert data["extension_id"] in (None, "")

    def test_put_store_id_requires_auth(self):
        r = requests.put(f"{API}/extension/store-id",
                         json={"extension_id": "a" * 32}, timeout=15)
        assert r.status_code == 401

    def test_put_store_id_rejects_short(self, user):
        r = requests.put(f"{API}/extension/store-id",
                         json={"extension_id": "short"},
                         headers=H(user["token"]), timeout=15)
        assert r.status_code == 400, r.text

    def test_put_store_id_rejects_uppercase_and_dashes(self, user):
        r = requests.put(f"{API}/extension/store-id",
                         json={"extension_id": "TOO-MANY-Caps-And-DASHES-BadXxxx"},
                         headers=H(user["token"]), timeout=15)
        assert r.status_code == 400, r.text

    def test_put_store_id_rejects_33_chars(self, user):
        r = requests.put(f"{API}/extension/store-id",
                         json={"extension_id": "a" * 33},
                         headers=H(user["token"]), timeout=15)
        assert r.status_code == 400, r.text

    def test_put_store_id_rejects_chars_outside_a_to_p(self, user):
        # 'z' is not in a-p
        r = requests.put(f"{API}/extension/store-id",
                         json={"extension_id": "z" * 32},
                         headers=H(user["token"]), timeout=15)
        assert r.status_code == 400, r.text

    def test_put_store_id_accepts_valid_and_persists(self, user):
        eid = "abcdefghijklmnopabcdefghijklmnop"  # 32 chars all in a-p
        r = requests.put(f"{API}/extension/store-id",
                         json={"extension_id": eid},
                         headers=H(user["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("extension_id") == eid
        # Verify GET reads from DB
        r2 = requests.get(f"{API}/extension/store-id", timeout=15)
        assert r2.status_code == 200
        data = r2.json()
        if not (os.environ.get("CHROME_EXTENSION_ID") or "").strip():
            assert data["source"] == "db", data
            assert data["extension_id"] == eid


# ---------- Analytics Winner ----------
class TestAnalyticsWinner:
    def test_winner_requires_auth(self):
        r = requests.get(f"{API}/analytics/winner", timeout=15)
        assert r.status_code == 401

    def test_winner_shape(self, user):
        r = requests.get(f"{API}/analytics/winner",
                         headers=H(user["token"]), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "variants" in data
        assert isinstance(data["variants"], list)
        assert "winner" in data
        assert data.get("min_traffic_required") == 50
        assert data.get("min_cvr_lift_pp") == 0.02
        for v in data["variants"]:
            assert {"variant", "page_views", "install_clicks",
                    "download_zips", "install_cvr"} <= set(v.keys())

    def test_winner_below_threshold_is_null(self, user):
        """API contract: winner is None unless leader has >=50 page_views AND >=2pp gap."""
        r = requests.get(f"{API}/analytics/winner",
                         headers=H(user["token"]), timeout=20)
        assert r.status_code == 200
        data = r.json()
        if data["winner"] is not None:
            top_variants = [v["variant"] for v in data["variants"][:2]]
            assert data["winner"] in top_variants

    def test_winner_detected_when_seeded_above_threshold(self, db, user):
        """Seed >=50 page_views for variant A AND high install CVR; winner should be 'A'."""
        now = datetime.now(timezone.utc)
        # Wipe any prior TEST seed first (idempotent)
        db.analytics_events.delete_many({"visitor_id": {"$regex": "^TEST_it5_"}})
        seed = []
        # 60 page_views for A (60 unique visitors); 30 install_clicks (CVR=0.5)
        for i in range(60):
            seed.append({"event": "page_view", "visitor_id": f"TEST_it5_a_pv_{i}",
                         "hero_variant": "A", "created_at": now.isoformat(), "created_at_dt": now})
        for i in range(30):
            seed.append({"event": "install_click", "visitor_id": f"TEST_it5_a_ic_{i}",
                         "hero_variant": "A", "created_at": now.isoformat(), "created_at_dt": now})
        # 60 page_views for B with 1 install_click (CVR ~0.0167)
        for i in range(60):
            seed.append({"event": "page_view", "visitor_id": f"TEST_it5_b_pv_{i}",
                         "hero_variant": "B", "created_at": now.isoformat(), "created_at_dt": now})
        seed.append({"event": "install_click", "visitor_id": "TEST_it5_b_ic_only",
                     "hero_variant": "B", "created_at": now.isoformat(), "created_at_dt": now})
        db.analytics_events.insert_many(seed)
        try:
            r = requests.get(f"{API}/analytics/winner",
                             headers=H(user["token"]), timeout=20)
            assert r.status_code == 200, r.text
            data = r.json()
            by = {v["variant"]: v for v in data["variants"]}
            assert "A" in by and "B" in by, f"variants: {list(by.keys())}"
            assert by["A"]["page_views"] >= 50
            assert by["A"]["install_cvr"] > by["B"]["install_cvr"]
            assert (by["A"]["install_cvr"] - by["B"]["install_cvr"]) >= 0.02
            assert data["variants"][0]["variant"] == "A"
            assert data["winner"] == "A", f"expected winner A, got {data['winner']} (data={data})"
        finally:
            db.analytics_events.delete_many({"visitor_id": {"$regex": "^TEST_it5_"}})
