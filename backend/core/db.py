"""Mongo client + shared logger."""
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from core.config import MONGO_URL, DB_NAME

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("snapburst")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
