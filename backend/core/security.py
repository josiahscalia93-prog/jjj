"""Auth helpers + the FastAPI dependency that resolves the current user."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
from fastapi import Cookie, Depends, Header, HTTPException, Request

from core.db import db


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_session_token() -> str:
    return f"st_{uuid.uuid4().hex}{uuid.uuid4().hex}"


async def create_session(user_id: str) -> str:
    token = make_session_token()
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return token


async def get_user_from_token(token: str) -> Optional[dict]:
    if not token:
        return None
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    return await db.users.find_one(
        {"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0},
    )


async def current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
) -> dict:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        token = session_token
    user = await get_user_from_token(token)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user
