"""Pydantic request/response models shared across routers."""
from typing import Optional
from pydantic import BaseModel, EmailStr


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


class CheckoutBody(BaseModel):
    tier: str
    origin_url: str


class SlackConfig(BaseModel):
    webhook_url: str


class JiraConfig(BaseModel):
    base_url: str
    email: str
    api_token: str
    project_key: str


class PostNoteBody(BaseModel):
    note: Optional[str] = None


class StoreIdBody(BaseModel):
    extension_id: Optional[str] = None
