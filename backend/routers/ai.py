"""Vision-enabled AI assistant via Emergent LLM key."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.config import EMERGENT_LLM_KEY
from core.db import db, logger
from core.security import current_user
from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
from models import ChatRequest

router = APIRouter()

SYSTEM_PROMPT = (
    "You are SnapBurst Assistant, a friendly product expert for a screen capture & "
    "recording Chrome extension. Help users with: taking screenshots (visible, area, "
    "full-page scrolling), recording screen/webcam/mic in 4K/2K/1080p/GIF, annotating "
    "(draw, text, shapes, arrows, blur), sharing via link, and integrations with Slack, "
    "Trello, Jira, Gmail. When the user attaches a screenshot, analyze it and suggest "
    "annotations or improvements. Keep responses concise, joyful, and practical."
)


@router.post("/ai/chat")
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
        b64 = body.image_base64
        if "," in b64 and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]
        msg_kwargs["file_contents"] = [ImageContent(image_base64=b64)]
    try:
        reply = await chat.send_message(UserMessage(**msg_kwargs))
    except Exception as e:
        logger.exception("AI chat failed")
        raise HTTPException(500, f"AI error: {e}")

    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_many([
        {"user_id": user["user_id"], "session_id": sid, "role": "user",
         "text": body.message, "has_image": bool(body.image_base64), "created_at": now},
        {"user_id": user["user_id"], "session_id": sid, "role": "assistant",
         "text": reply, "created_at": now},
    ])
    return {"session_id": sid, "reply": reply}


@router.get("/ai/history/{session_id}")
async def ai_history(session_id: str, user: dict = Depends(current_user)):
    rows = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": session_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)
    return rows
