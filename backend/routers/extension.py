"""Chrome Extension ZIP builder, listing assets, store-id config."""
import io
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response

from core.config import CHROME_EXTENSION_ID, EXTENSION_DIR
from core.db import db
from core.security import current_user
from models import StoreIdBody

router = APIRouter()

LISTING_DIR = EXTENSION_DIR / "store-assets"


def build_extension_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(EXTENSION_DIR):
            dirs[:] = [d for d in dirs if d != "store-assets"]
            for f in files:
                if f in {".DS_Store"} or f.endswith((".md",)):
                    continue
                full = Path(root) / f
                arc = full.relative_to(EXTENSION_DIR).as_posix()
                if arc.startswith("store-assets/"):
                    continue
                zf.write(full, arc)
    return buf.getvalue()


@router.get("/extension/download")
async def extension_download():
    data = build_extension_zip()
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="snapburst-extension.zip"'},
    )


@router.get("/extension/info")
async def extension_info():
    manifest = json.loads((EXTENSION_DIR / "manifest.json").read_text())
    data = build_extension_zip()
    return {
        "name": manifest["name"],
        "version": manifest["version"],
        "size_bytes": len(data),
        "files": sorted([str(p.relative_to(EXTENSION_DIR)) for p in EXTENSION_DIR.rglob("*") if p.is_file()]),
    }


@router.get("/extension/listing-assets")
async def listing_assets():
    if not LISTING_DIR.exists():
        return {"items": []}
    items = []
    for p in sorted(LISTING_DIR.glob("*.png")):
        items.append({
            "name": p.name,
            "url": f"/api/extension/listing-asset/{p.name}",
            "size_bytes": p.stat().st_size,
        })
    return {"items": items}


@router.get("/extension/listing-asset/{filename}")
async def listing_asset(filename: str):
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    p = LISTING_DIR / filename
    if not p.exists():
        raise HTTPException(404, "Not found")
    return Response(
        content=p.read_bytes(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=600"},
    )


@router.get("/extension/store-id")
async def get_store_id():
    if CHROME_EXTENSION_ID:
        return {"extension_id": CHROME_EXTENSION_ID, "source": "env"}
    cfg = await db.app_config.find_one({"key": "chrome_extension_id"}, {"_id": 0})
    return {"extension_id": (cfg or {}).get("value", "") or None, "source": "db" if cfg else "unset"}


@router.put("/extension/store-id")
async def set_store_id(body: StoreIdBody, user: dict = Depends(current_user)):
    eid = (body.extension_id or "").strip()
    if eid and not (len(eid) == 32 and all(c in "abcdefghijklmnop" for c in eid)):
        raise HTTPException(400, "Invalid Chrome extension ID (must be 32 chars a–p)")
    await db.app_config.update_one(
        {"key": "chrome_extension_id"},
        {"$set": {"value": eid, "updated_by": user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "extension_id": eid}
