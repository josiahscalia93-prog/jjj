"""Centralised env + constants for SnapBurst backend."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "snapburst")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET") or None
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")
CHROME_EXTENSION_ID = (os.environ.get("CHROME_EXTENSION_ID") or "").strip()
ANALYTICS_RATE_LIMIT = int(os.environ.get("ANALYTICS_RATE_LIMIT_PER_MIN", "60"))
ANALYTICS_TTL_DAYS = int(os.environ.get("ANALYTICS_TTL_DAYS", "90"))
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

PRICING = {
    "pro":  {"name": "Pro",  "amount": 8.0,  "currency": "usd"},
    "team": {"name": "Team", "amount": 14.0, "currency": "usd"},
}
EXTENSION_DIR = Path("/app/extension")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
