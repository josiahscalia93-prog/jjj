"""Authentication: register, login, Google OAuth session exchange, me, logout."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response

from core.db import db, logger
from core.security import (
    create_session, current_user, hash_password,
    make_session_token, verify_password,
)
from models import LoginRequest, RegisterRequest, SessionExchange, UserPublic

router = APIRouter()


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        "session_token", token,
        max_age=7 * 24 * 3600,
        httponly=True, secure=True, samesite="none", path="/",
    )


@router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id,
        "email": req.email.lower(),
        "name": req.name,
        "password_hash": hash_password(req.password),
        "auth_provider": "password",
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    token = await create_session(user_id)
    _set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"token": token, "user": user}


@router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = await create_session(user["user_id"])
    _set_session_cookie(response, token)
    return {
        "token": token,
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "name": user["name"],
            "picture": user.get("picture"),
            "auth_provider": user.get("auth_provider", "password"),
        },
    }


@router.post("/auth/session")
async def google_session_exchange(body: SessionExchange, response: Response):
    """Exchange Emergent Google session_id for our session_token."""
    try:
        r = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id}, timeout=20,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.error(f"google session exchange failed: {e}")
        raise HTTPException(401, "Invalid session")
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": data.get("name", existing["name"]),
            "picture": data.get("picture"),
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email),
            "picture": data.get("picture"),
            "password_hash": None,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    token = data.get("session_token") or make_session_token()
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    _set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"token": token, "user": user}


@router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(current_user)):
    return UserPublic(**user)


@router.post("/auth/logout")
async def logout(
    response: Response,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        token = session_token
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
