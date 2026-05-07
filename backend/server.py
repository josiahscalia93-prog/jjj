"""SnapBurst backend — auth, captures (object storage), AI assistant."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header, Cookie, Response, Request, Query
from fastapi.responses import StreamingResponse, Response as FastAPIResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import uuid
import logging
import bcrypt
import jwt as pyjwt
import requests
import io
import base64
import json
import asyncio

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)
import zipfile
import tempfile


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- env ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
APP_NAME = os.environ.get('APP_NAME', 'snapburst')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')

PRICING = {
    "pro":  {"name": "Pro",  "amount": 8.0,  "currency": "usd"},
    "team": {"name": "Team", "amount": 14.0, "currency": "usd"},
}
EXTENSION_DIR = Path("/app/extension")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

# ---------- mongo ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------- logging ----------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("snapburst")

# ---------- storage ----------
storage_key = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        logger.warning("EMERGENT_LLM_KEY not set; storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------- models ----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SessionExchange(BaseModel):
    session_id: str

class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    auth_provider: str

class CaptureOut(BaseModel):
    id: str
    user_id: str
    title: str
    kind: str  # "screenshot" | "recording"
    content_type: str
    size: int
    storage_path: str
    share_token: str
    duration_sec: Optional[float] = None
    annotations: Optional[list] = None
    created_at: str

class CaptureUpdate(BaseModel):
    title: Optional[str] = None
    annotations: Optional[list] = None

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    image_base64: Optional[str] = None
    image_mime: Optional[str] = "image/png"

# ---------- helpers ----------
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
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    return user

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

# ---------- app ----------
app = FastAPI(title="SnapBurst API")
api_router = APIRouter(prefix="/api")

@app.on_event("startup")
async def startup():
    init_storage()
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.captures.create_index("share_token", unique=True)
    logger.info("SnapBurst API ready")

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---------- auth ----------
@api_router.post("/auth/register")
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
    response.set_cookie("session_token", token, max_age=7*24*3600, httponly=True, secure=True, samesite="none", path="/")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"token": token, "user": user}

@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = await create_session(user["user_id"])
    response.set_cookie("session_token", token, max_age=7*24*3600, httponly=True, secure=True, samesite="none", path="/")
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

@api_router.post("/auth/session")
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
    # use Google's session_token if provided, fallback to our own
    token = data.get("session_token") or make_session_token()
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie("session_token", token, max_age=7*24*3600, httponly=True, secure=True, samesite="none", path="/")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"token": token, "user": user}

@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(current_user)):
    return UserPublic(**user)

@api_router.post("/auth/logout")
async def logout(response: Response, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        token = session_token
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ---------- captures ----------
@api_router.post("/captures", response_model=CaptureOut)
async def create_capture(
    file: UploadFile = File(...),
    title: str = Form("Untitled"),
    kind: str = Form("screenshot"),
    duration_sec: Optional[float] = Form(None),
    user: dict = Depends(current_user),
):
    if kind not in ("screenshot", "recording"):
        raise HTTPException(400, "kind must be screenshot or recording")
    data = await file.read()
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 200MB)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    capture_id = str(uuid.uuid4())
    path = f"{APP_NAME}/captures/{user['user_id']}/{capture_id}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, data, content_type)
    share_token = uuid.uuid4().hex
    doc = {
        "id": capture_id,
        "user_id": user["user_id"],
        "title": title or "Untitled",
        "kind": kind,
        "content_type": content_type,
        "size": result["size"],
        "storage_path": result["path"],
        "share_token": share_token,
        "duration_sec": duration_sec,
        "annotations": [],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.captures.insert_one(doc)
    doc.pop("is_deleted", None)
    return CaptureOut(**doc)

@api_router.get("/captures", response_model=List[CaptureOut])
async def list_captures(user: dict = Depends(current_user)):
    rows = await db.captures.find(
        {"user_id": user["user_id"], "is_deleted": False},
        {"_id": 0, "is_deleted": 0},
    ).sort("created_at", -1).to_list(500)
    return [CaptureOut(**r) for r in rows]

@api_router.get("/captures/{capture_id}", response_model=CaptureOut)
async def get_capture(capture_id: str, user: dict = Depends(current_user)):
    row = await db.captures.find_one(
        {"id": capture_id, "user_id": user["user_id"], "is_deleted": False},
        {"_id": 0, "is_deleted": 0},
    )
    if not row:
        raise HTTPException(404, "Not found")
    return CaptureOut(**row)

@api_router.patch("/captures/{capture_id}", response_model=CaptureOut)
async def update_capture(capture_id: str, upd: CaptureUpdate, user: dict = Depends(current_user)):
    set_doc = {k: v for k, v in upd.model_dump().items() if v is not None}
    if not set_doc:
        raise HTTPException(400, "Nothing to update")
    res = await db.captures.update_one(
        {"id": capture_id, "user_id": user["user_id"], "is_deleted": False},
        {"$set": set_doc},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    row = await db.captures.find_one({"id": capture_id}, {"_id": 0, "is_deleted": 0})
    return CaptureOut(**row)

@api_router.delete("/captures/{capture_id}")
async def delete_capture(capture_id: str, user: dict = Depends(current_user)):
    res = await db.captures.update_one(
        {"id": capture_id, "user_id": user["user_id"]},
        {"$set": {"is_deleted": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

@api_router.get("/captures/{capture_id}/file")
async def serve_capture_file(capture_id: str, user: dict = Depends(current_user)):
    row = await db.captures.find_one(
        {"id": capture_id, "user_id": user["user_id"], "is_deleted": False},
        {"_id": 0},
    )
    if not row:
        raise HTTPException(404, "Not found")
    data, ct = get_object(row["storage_path"])
    return StreamingResponse(io.BytesIO(data), media_type=row.get("content_type", ct))

# ---------- public share ----------
@api_router.get("/share/{share_token}")
async def share_meta(share_token: str):
    row = await db.captures.find_one(
        {"share_token": share_token, "is_deleted": False},
        {"_id": 0, "is_deleted": 0, "user_id": 0},
    )
    if not row:
        raise HTTPException(404, "Not found")
    user = await db.users.find_one(
        {"user_id": (await db.captures.find_one({"share_token": share_token}, {"user_id": 1, "_id": 0}))["user_id"]},
        {"_id": 0, "name": 1, "picture": 1},
    )
    return {**row, "owner": user}

@api_router.get("/share/{share_token}/file")
async def share_file(share_token: str):
    row = await db.captures.find_one(
        {"share_token": share_token, "is_deleted": False},
        {"_id": 0},
    )
    if not row:
        raise HTTPException(404, "Not found")
    data, ct = get_object(row["storage_path"])
    return StreamingResponse(io.BytesIO(data), media_type=row.get("content_type", ct))

# ---------- AI assistant ----------
SYSTEM_PROMPT = (
    "You are SnapBurst Assistant, a friendly product expert for a screen capture & "
    "recording Chrome extension. Help users with: taking screenshots (visible, area, "
    "full-page scrolling), recording screen/webcam/mic in 4K/2K/1080p/GIF, annotating "
    "(draw, text, shapes, arrows, blur), sharing via link, and integrations with Slack, "
    "Trello, Jira, Gmail. When the user attaches a screenshot, analyze it and suggest "
    "annotations or improvements. Keep responses concise, joyful, and practical."
)

@api_router.post("/ai/chat")
async def ai_chat(body: ChatRequest, user: dict = Depends(current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI assistant not configured")
    sid = body.session_id or f"chat_{uuid.uuid4().hex[:10]}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=sid,
        system_message=SYSTEM_PROMPT,
    ).with_model("openai", "gpt-5.2")

    msg_kwargs = {"text": body.message}
    if body.image_base64:
        # strip data url prefix if any
        b64 = body.image_base64
        if "," in b64 and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]
        msg_kwargs["file_contents"] = [ImageContent(image_base64=b64)]
    try:
        reply = await chat.send_message(UserMessage(**msg_kwargs))
    except Exception as e:
        logger.exception("AI chat failed")
        raise HTTPException(500, f"AI error: {e}")

    # persist
    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_many([
        {"user_id": user["user_id"], "session_id": sid, "role": "user",
         "text": body.message, "has_image": bool(body.image_base64), "created_at": now},
        {"user_id": user["user_id"], "session_id": sid, "role": "assistant",
         "text": reply, "created_at": now},
    ])
    return {"session_id": sid, "reply": reply}

@api_router.get("/ai/history/{session_id}")
async def ai_history(session_id: str, user: dict = Depends(current_user)):
    rows = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": session_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)
    return rows

# ---------- Stripe billing ----------
class CheckoutBody(BaseModel):
    tier: str
    origin_url: str

@api_router.post("/billing/checkout")
async def billing_checkout(body: CheckoutBody, request: Request, user: dict = Depends(current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe not configured")
    if body.tier not in PRICING:
        raise HTTPException(400, "Unknown tier")
    pkg = PRICING[body.tier]
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    success_url = f"{body.origin_url}/dashboard?checkout=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{body.origin_url}/?checkout=cancel"
    req = CheckoutSessionRequest(
        amount=pkg["amount"],
        currency=pkg["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user["user_id"], "tier": body.tier, "source": "snapburst_pricing"},
    )
    sess = await sc.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "session_id": sess.session_id,
        "user_id": user["user_id"],
        "tier": body.tier,
        "amount": pkg["amount"],
        "currency": pkg["currency"],
        "payment_status": "initiated",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": sess.url, "session_id": sess.session_id}

@api_router.get("/billing/checkout-status/{session_id}")
async def billing_status(session_id: str, request: Request, user: dict = Depends(current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe not configured")
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Unknown session")
    # Try live retrieval; fall back to DB on proxy failure (test-mode proxy limitation).
    host_url = str(request.base_url).rstrip("/")
    StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
    import stripe as stripe_sdk
    payment_status = txn.get("payment_status", "initiated")
    status_str = txn.get("status", "open")
    amount_total = int((txn.get("amount") or 0) * 100)
    currency = txn.get("currency", "usd")
    try:
        session = await asyncio.to_thread(stripe_sdk.checkout.Session.retrieve, session_id)
        payment_status = session.get("payment_status") or payment_status
        status_str = session.get("status") or status_str
        amount_total = session.get("amount_total") or amount_total
        currency = session.get("currency") or currency
    except Exception as e:
        logger.info(f"checkout-status live retrieval unavailable, using DB: {e}")
    if txn.get("payment_status") != "paid" and payment_status == "paid":
        await db.users.update_one(
            {"user_id": txn["user_id"]},
            {"$set": {"plan": txn.get("tier"), "plan_updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "status": status_str, "paid_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {
        "status": status_str,
        "payment_status": payment_status,
        "amount_total": amount_total,
        "currency": currency,
    }

@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    if not STRIPE_API_KEY:
        return {"ok": False}
    host_url = str(request.base_url).rstrip("/")
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        ev = await sc.handle_webhook(body, sig)
    except Exception as e:
        logger.warning(f"webhook error: {e}")
        return {"ok": False}
    if ev and ev.session_id and ev.payment_status == "paid":
        txn = await db.payment_transactions.find_one({"session_id": ev.session_id}, {"_id": 0})
        if txn and txn.get("payment_status") != "paid":
            tier = txn.get("tier") or (ev.metadata or {}).get("tier")
            await db.users.update_one({"user_id": txn["user_id"]},
                {"$set": {"plan": tier, "plan_updated_at": datetime.now(timezone.utc).isoformat()}})
            await db.payment_transactions.update_one({"session_id": ev.session_id},
                {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}

# ---------- integrations: Slack & Jira ----------
class SlackConfig(BaseModel):
    webhook_url: str

class JiraConfig(BaseModel):
    base_url: str   # https://yoursite.atlassian.net
    email: str
    api_token: str
    project_key: str

@api_router.get("/integrations")
async def get_integrations(user: dict = Depends(current_user)):
    row = await db.user_integrations.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    # never echo back secrets
    return {
        "slack_connected": bool(row.get("slack_webhook_url")),
        "jira_connected": bool(row.get("jira_api_token")),
        "jira_base_url": row.get("jira_base_url"),
        "jira_project_key": row.get("jira_project_key"),
        "jira_email": row.get("jira_email"),
    }

@api_router.put("/integrations/slack")
async def set_slack(cfg: SlackConfig, user: dict = Depends(current_user)):
    if not cfg.webhook_url.startswith("https://hooks.slack.com/"):
        raise HTTPException(400, "Must be a Slack incoming webhook URL")
    await db.user_integrations.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"slack_webhook_url": cfg.webhook_url, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}

@api_router.delete("/integrations/slack")
async def remove_slack(user: dict = Depends(current_user)):
    await db.user_integrations.update_one({"user_id": user["user_id"]}, {"$unset": {"slack_webhook_url": ""}})
    return {"ok": True}

@api_router.put("/integrations/jira")
async def set_jira(cfg: JiraConfig, user: dict = Depends(current_user)):
    base = cfg.base_url.rstrip("/")
    if not base.startswith("http"):
        raise HTTPException(400, "Invalid Jira base URL")
    await db.user_integrations.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "jira_base_url": base, "jira_email": cfg.email,
            "jira_api_token": cfg.api_token, "jira_project_key": cfg.project_key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}

@api_router.delete("/integrations/jira")
async def remove_jira(user: dict = Depends(current_user)):
    await db.user_integrations.update_one(
        {"user_id": user["user_id"]},
        {"$unset": {"jira_base_url": "", "jira_email": "", "jira_api_token": "", "jira_project_key": ""}},
    )
    return {"ok": True}

class PostNoteBody(BaseModel):
    note: Optional[str] = None

@api_router.post("/captures/{capture_id}/post-slack")
async def post_to_slack(capture_id: str, body: PostNoteBody, user: dict = Depends(current_user)):
    cap = await db.captures.find_one({"id": capture_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0})
    if not cap:
        raise HTTPException(404, "Capture not found")
    integ = await db.user_integrations.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    hook = integ.get("slack_webhook_url")
    if not hook:
        raise HTTPException(400, "Slack not connected")
    share_url = f"https://capture-annotate.preview.emergentagent.com/share/{cap['share_token']}"
    text = body.note or f"📷 *{cap['title']}* — shared via SnapBurst\n{share_url}"
    try:
        r = requests.post(hook, json={"text": text}, timeout=15)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"Slack post failed: {e}")
    return {"ok": True}

@api_router.post("/captures/{capture_id}/post-jira")
async def post_to_jira(capture_id: str, body: PostNoteBody, user: dict = Depends(current_user)):
    cap = await db.captures.find_one({"id": capture_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0})
    if not cap:
        raise HTTPException(404, "Capture not found")
    integ = await db.user_integrations.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    if not (integ.get("jira_api_token") and integ.get("jira_base_url") and integ.get("jira_project_key")):
        raise HTTPException(400, "Jira not connected")
    share_url = f"https://capture-annotate.preview.emergentagent.com/share/{cap['share_token']}"
    summary = body.note or f"SnapBurst: {cap['title']}"
    payload = {
        "fields": {
            "project": {"key": integ["jira_project_key"]},
            "summary": summary[:240],
            "description": {
                "type": "doc", "version": 1,
                "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": "Captured with SnapBurst — "},
                    {"type": "text", "text": "view capture", "marks": [{"type": "link", "attrs": {"href": share_url}}]},
                ]}],
            },
            "issuetype": {"name": "Task"},
        }
    }
    try:
        r = requests.post(
            f"{integ['jira_base_url']}/rest/api/3/issue",
            auth=(integ["jira_email"], integ["jira_api_token"]),
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=20,
        )
        if r.status_code >= 300:
            raise HTTPException(502, f"Jira error {r.status_code}: {r.text[:300]}")
        data = r.json()
        return {"ok": True, "key": data.get("key"), "url": f"{integ['jira_base_url']}/browse/{data.get('key')}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Jira post failed: {e}")

# ---------- extension ZIP download (no auth — public) ----------
def build_extension_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(EXTENSION_DIR):
            for f in files:
                if f in {".DS_Store"} or f.endswith((".md",)):
                    continue
                full = Path(root) / f
                arc = full.relative_to(EXTENSION_DIR).as_posix()
                zf.write(full, arc)
    return buf.getvalue()

@api_router.get("/extension/download")
async def extension_download():
    data = build_extension_zip()
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="snapburst-extension.zip"'},
    )

@api_router.get("/extension/info")
async def extension_info():
    manifest = json.loads((EXTENSION_DIR / "manifest.json").read_text())
    data = build_extension_zip()
    return {
        "name": manifest["name"],
        "version": manifest["version"],
        "size_bytes": len(data),
        "files": sorted([str(p.relative_to(EXTENSION_DIR)) for p in EXTENSION_DIR.rglob("*") if p.is_file()]),
    }


@api_router.get("/")
async def root():
    return {"app": "SnapBurst", "ok": True}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
