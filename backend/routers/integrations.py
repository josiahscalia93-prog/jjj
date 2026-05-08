"""Slack + Jira webhook config and capture-share posting."""
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException

from core.config import PUBLIC_APP_URL
from core.db import db
from core.security import current_user
from models import JiraConfig, PostNoteBody, SlackConfig

router = APIRouter()


@router.get("/integrations")
async def get_integrations(user: dict = Depends(current_user)):
    row = await db.user_integrations.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    return {
        "slack_connected": bool(row.get("slack_webhook_url")),
        "jira_connected": bool(row.get("jira_api_token")),
        "jira_base_url": row.get("jira_base_url"),
        "jira_project_key": row.get("jira_project_key"),
        "jira_email": row.get("jira_email"),
    }


@router.put("/integrations/slack")
async def set_slack(cfg: SlackConfig, user: dict = Depends(current_user)):
    if not cfg.webhook_url.startswith("https://hooks.slack.com/"):
        raise HTTPException(400, "Must be a Slack incoming webhook URL")
    await db.user_integrations.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"slack_webhook_url": cfg.webhook_url, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/integrations/slack")
async def remove_slack(user: dict = Depends(current_user)):
    await db.user_integrations.update_one({"user_id": user["user_id"]}, {"$unset": {"slack_webhook_url": ""}})
    return {"ok": True}


@router.put("/integrations/jira")
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


@router.delete("/integrations/jira")
async def remove_jira(user: dict = Depends(current_user)):
    await db.user_integrations.update_one(
        {"user_id": user["user_id"]},
        {"$unset": {"jira_base_url": "", "jira_email": "", "jira_api_token": "", "jira_project_key": ""}},
    )
    return {"ok": True}


@router.post("/captures/{capture_id}/post-slack")
async def post_to_slack(capture_id: str, body: PostNoteBody, user: dict = Depends(current_user)):
    cap = await db.captures.find_one({"id": capture_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0})
    if not cap:
        raise HTTPException(404, "Capture not found")
    integ = await db.user_integrations.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    hook = integ.get("slack_webhook_url")
    if not hook:
        raise HTTPException(400, "Slack not connected")
    share_url = f"{PUBLIC_APP_URL}/share/{cap['share_token']}"
    text = body.note or f"📷 *{cap['title']}* — shared via SnapBurst\n{share_url}"
    try:
        r = requests.post(hook, json={"text": text}, timeout=15)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"Slack post failed: {e}")
    return {"ok": True}


@router.post("/captures/{capture_id}/post-jira")
async def post_to_jira(capture_id: str, body: PostNoteBody, user: dict = Depends(current_user)):
    cap = await db.captures.find_one({"id": capture_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0})
    if not cap:
        raise HTTPException(404, "Capture not found")
    integ = await db.user_integrations.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    if not (integ.get("jira_api_token") and integ.get("jira_base_url") and integ.get("jira_project_key")):
        raise HTTPException(400, "Jira not connected")
    share_url = f"{PUBLIC_APP_URL}/share/{cap['share_token']}"
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
