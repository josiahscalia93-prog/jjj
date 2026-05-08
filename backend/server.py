"""SnapBurst backend — slim composition root.

Routers live in /app/backend/routers/ and shared infra in /app/backend/core/.
"""
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

from core.config import ANALYTICS_TTL_DAYS, CORS_ORIGINS
from core.db import client, db, logger
from core.storage import init_storage
from routers import (
    ai as ai_router,
    analytics as analytics_router,
    auth as auth_router,
    billing as billing_router,
    captures as captures_router,
    extension as extension_router,
    integrations as integrations_router,
)


@asynccontextmanager
async def lifespan(app_: FastAPI):
    init_storage()
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.captures.create_index("share_token", unique=True)
    await db.analytics_events.create_index([("event", 1), ("hero_variant", 1)])
    try:
        await db.analytics_events.create_index(
            "created_at_dt", expireAfterSeconds=ANALYTICS_TTL_DAYS * 24 * 3600,
        )
    except Exception as e:
        logger.warning(f"TTL index create failed: {e}")
    await db.analytics_rl.create_index("ip")
    try:
        await db.analytics_rl.create_index("ts", expireAfterSeconds=70)
    except Exception as e:
        logger.warning(f"rl TTL index: {e}")
    logger.info("SnapBurst API ready")
    yield
    client.close()


app = FastAPI(title="SnapBurst API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router.router)
api_router.include_router(captures_router.router)
api_router.include_router(ai_router.router)
api_router.include_router(billing_router.router)
api_router.include_router(integrations_router.router)
api_router.include_router(extension_router.router)
api_router.include_router(analytics_router.router)


@api_router.get("/")
async def root():
    return {"app": "SnapBurst", "ok": True}


app.include_router(api_router)


# ---- Endpoints that need raw `Request` outside the api_router prefix ----
@app.post("/api/webhook/stripe")
async def _stripe_webhook(request: Request):
    return await billing_router.stripe_webhook_handler(request)


@app.post("/api/analytics/track")
async def _analytics_track(request: Request):
    return await analytics_router.analytics_track_handler(request)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
