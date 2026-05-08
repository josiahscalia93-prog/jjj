"""A/B analytics + IP-prefix sliding-window rate-limit."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response

from core.config import ANALYTICS_RATE_LIMIT
from core.db import db
from core.security import current_user

router = APIRouter()


async def _rate_check(ip: str) -> bool:
    """Mongo-backed sliding-window rate limit, /24-bucketed."""
    if not ip:
        return True
    parts = ip.split(".")
    bucket = ".".join(parts[:3]) if len(parts) >= 3 else ip
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=60)
    await db.analytics_rl.delete_many({"ip": bucket, "ts": {"$lt": cutoff}})
    n = await db.analytics_rl.count_documents({"ip": bucket})
    if n >= ANALYTICS_RATE_LIMIT:
        return False
    await db.analytics_rl.insert_one({"ip": bucket, "ts": now})
    return True


async def analytics_track_handler(request: Request):
    """Mounted directly on /api/analytics/track (kept off api_router for raw access)."""
    fwd = request.headers.get("x-forwarded-for", "")
    ip = (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else ""))
    if not await _rate_check(ip):
        return Response(content='{"ok":false,"reason":"rate_limit"}', media_type="application/json", status_code=429)
    try:
        raw = await request.json()
    except Exception:
        return {"ok": False}
    if not isinstance(raw, dict):
        return {"ok": False}
    now = datetime.now(timezone.utc)
    doc = {
        "event": str(raw.get("event") or "")[:64],
        "visitor_id": str(raw.get("visitor_id") or "")[:64] or None,
        "hero_variant": str(raw.get("hero_variant") or "")[:8] or None,
        "path": str(raw.get("path") or "")[:200] or None,
        "referrer": str(raw.get("referrer") or "")[:300] or None,
        "source": str(raw.get("source") or "")[:64] or None,
        "surface": str(raw.get("surface") or "")[:64] or None,
        "ua": (request.headers.get("user-agent") or "")[:200],
        "ip_prefix": ip.rsplit(".", 1)[0] if ip else None,
        "created_at": now.isoformat(),
        "created_at_dt": now,
    }
    if not doc["event"]:
        return {"ok": False}
    await db.analytics_events.insert_one(doc)
    return {"ok": True}


@router.get("/analytics/summary")
async def analytics_summary(user: dict = Depends(current_user)):
    pipeline = [
        {"$group": {
            "_id": {"event": "$event", "variant": "$hero_variant"},
            "count": {"$sum": 1},
            "visitors": {"$addToSet": "$visitor_id"},
        }},
    ]
    rows = await db.analytics_events.aggregate(pipeline).to_list(500)
    out = {}
    for r in rows:
        ev = r["_id"]["event"]
        var = r["_id"]["variant"] or "unknown"
        out.setdefault(ev, {})[var] = {"count": r["count"], "unique_visitors": len(r["visitors"])}
    return out


@router.get("/analytics/winner")
async def analytics_winner(user: dict = Depends(current_user)):
    pipeline = [
        {"$match": {"event": {"$in": ["page_view", "install_click", "download_zip"]}}},
        {"$group": {
            "_id": {"event": "$event", "variant": "$hero_variant"},
            "visitors": {"$addToSet": "$visitor_id"},
        }},
    ]
    rows = await db.analytics_events.aggregate(pipeline).to_list(500)
    by_variant = {}
    for r in rows:
        ev = r["_id"]["event"]
        var = r["_id"]["variant"] or "unknown"
        by_variant.setdefault(var, {})[ev] = len(r["visitors"])
    variants_out = []
    for var, stats in by_variant.items():
        pv = stats.get("page_view", 0)
        ic = stats.get("install_click", 0)
        dz = stats.get("download_zip", 0)
        cvr = (ic / pv) if pv > 0 else 0.0
        variants_out.append({
            "variant": var,
            "page_views": pv,
            "install_clicks": ic,
            "download_zips": dz,
            "install_cvr": round(cvr, 4),
        })
    variants_out.sort(key=lambda v: v["install_cvr"], reverse=True)
    winner = None
    if len(variants_out) >= 2:
        a, b = variants_out[0], variants_out[1]
        if a["page_views"] >= 50 and (a["install_cvr"] - b["install_cvr"]) >= 0.02:
            winner = a["variant"]
    elif variants_out and variants_out[0]["page_views"] >= 50:
        winner = variants_out[0]["variant"]
    return {
        "variants": variants_out,
        "winner": winner,
        "min_traffic_required": 50,
        "min_cvr_lift_pp": 0.02,
    }
