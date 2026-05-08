"""Capture CRUD, file streaming, public share endpoints, GIF transcoding."""
import asyncio
import io
import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, UploadFile,
)
from fastapi.responses import StreamingResponse

from core.config import APP_NAME
from core.db import db
from core.security import current_user
from core.storage import get_object, put_object
from models import CaptureOut, CaptureUpdate

router = APIRouter()


@router.post("/captures", response_model=CaptureOut)
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
    doc.pop("_id", None)
    doc.pop("is_deleted", None)
    return CaptureOut(**doc)


@router.get("/captures", response_model=List[CaptureOut])
async def list_captures(user: dict = Depends(current_user)):
    rows = await db.captures.find(
        {"user_id": user["user_id"], "is_deleted": False},
        {"_id": 0, "is_deleted": 0},
    ).sort("created_at", -1).to_list(500)
    return [CaptureOut(**r) for r in rows]


@router.get("/captures/{capture_id}", response_model=CaptureOut)
async def get_capture(capture_id: str, user: dict = Depends(current_user)):
    row = await db.captures.find_one(
        {"id": capture_id, "user_id": user["user_id"], "is_deleted": False},
        {"_id": 0, "is_deleted": 0},
    )
    if not row:
        raise HTTPException(404, "Not found")
    return CaptureOut(**row)


@router.patch("/captures/{capture_id}", response_model=CaptureOut)
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


@router.delete("/captures/{capture_id}")
async def delete_capture(capture_id: str, user: dict = Depends(current_user)):
    res = await db.captures.update_one(
        {"id": capture_id, "user_id": user["user_id"]},
        {"$set": {"is_deleted": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@router.get("/captures/{capture_id}/file")
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
@router.get("/share/{share_token}")
async def share_meta(share_token: str):
    row = await db.captures.find_one(
        {"share_token": share_token, "is_deleted": False},
        {"_id": 0, "is_deleted": 0, "user_id": 0},
    )
    if not row:
        raise HTTPException(404, "Not found")
    owner_doc = await db.captures.find_one({"share_token": share_token}, {"user_id": 1, "_id": 0})
    user = await db.users.find_one(
        {"user_id": owner_doc["user_id"]}, {"_id": 0, "name": 1, "picture": 1},
    )
    return {**row, "owner": user}


@router.get("/share/{share_token}/file")
async def share_file(share_token: str):
    row = await db.captures.find_one(
        {"share_token": share_token, "is_deleted": False}, {"_id": 0},
    )
    if not row:
        raise HTTPException(404, "Not found")
    data, ct = get_object(row["storage_path"])
    return StreamingResponse(io.BytesIO(data), media_type=row.get("content_type", ct))


# ---------- GIF transcoding (server-side fallback) ----------
@router.post("/captures/{capture_id}/to-gif")
async def transcode_to_gif(capture_id: str, user: dict = Depends(current_user)):
    cap = await db.captures.find_one(
        {"id": capture_id, "user_id": user["user_id"], "is_deleted": False},
        {"_id": 0},
    )
    if not cap or cap["kind"] != "recording":
        raise HTTPException(404, "Recording not found")
    if not shutil.which("ffmpeg"):
        raise HTTPException(500, "ffmpeg not available")
    src_bytes, _ = get_object(cap["storage_path"])
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as src_f:
        src_f.write(src_bytes)
        src = src_f.name
    dst = src.replace(".webm", ".gif")
    palette = src.replace(".webm", "_palette.png")
    try:
        await asyncio.to_thread(subprocess.run, [
            "ffmpeg", "-y", "-i", src, "-vf",
            "fps=12,scale=720:-1:flags=lanczos,palettegen", palette,
        ], check=True, capture_output=True, timeout=60)
        await asyncio.to_thread(subprocess.run, [
            "ffmpeg", "-y", "-i", src, "-i", palette,
            "-lavfi", "fps=12,scale=720:-1:flags=lanczos [x]; [x][1:v] paletteuse",
            dst,
        ], check=True, capture_output=True, timeout=120)
        with open(dst, "rb") as f:
            gif_bytes = f.read()
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"ffmpeg failed: {e.stderr[:300] if e.stderr else 'unknown'}")
    finally:
        for p in (src, dst, palette):
            try:
                os.unlink(p)
            except OSError:
                pass
    new_id = str(uuid.uuid4())
    new_path = f"{APP_NAME}/captures/{user['user_id']}/{new_id}.gif"
    result = put_object(new_path, gif_bytes, "image/gif")
    share_token = uuid.uuid4().hex
    doc = {
        "id": new_id,
        "user_id": user["user_id"],
        "title": f"{cap['title']} — GIF",
        "kind": "screenshot",
        "content_type": "image/gif",
        "size": result["size"],
        "storage_path": result["path"],
        "share_token": share_token,
        "duration_sec": cap.get("duration_sec"),
        "annotations": [],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_recording_id": capture_id,
    }
    await db.captures.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("is_deleted", None)
    doc.pop("source_recording_id", None)
    return doc
