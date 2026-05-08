"""Stripe checkout + webhook for plan upgrades."""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from core.config import PRICING, STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET
from core.db import db, logger
from core.security import current_user
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest, StripeCheckout,
)
from models import CheckoutBody

router = APIRouter()


@router.post("/billing/checkout")
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


@router.get("/billing/checkout-status/{session_id}")
async def billing_status(session_id: str, request: Request, user: dict = Depends(current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe not configured")
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Unknown session")
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


async def stripe_webhook_handler(request: Request):
    """Mounted directly on the FastAPI app at /api/webhook/stripe."""
    if not STRIPE_API_KEY:
        return {"ok": False}
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    event_session_id = None
    event_payment_status = None
    event_metadata = {}
    if STRIPE_WEBHOOK_SECRET:
        try:
            import stripe as stripe_sdk
            event = stripe_sdk.Webhook.construct_event(body, sig, STRIPE_WEBHOOK_SECRET)
            obj = event["data"]["object"]
            event_session_id = obj.get("id")
            event_payment_status = obj.get("payment_status")
            event_metadata = dict(obj.get("metadata") or {})
        except Exception as e:
            logger.warning(f"stripe webhook signature failed: {e}")
            return Response(content="bad signature", status_code=400)
    else:
        host_url = str(request.base_url).rstrip("/")
        sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{host_url}/api/webhook/stripe")
        try:
            ev = await sc.handle_webhook(body, sig)
            event_session_id = getattr(ev, "session_id", None)
            event_payment_status = getattr(ev, "payment_status", None)
            event_metadata = getattr(ev, "metadata", None) or {}
        except Exception as e:
            logger.warning(f"webhook error: {e}")
            return {"ok": False}
    if event_session_id and event_payment_status == "paid":
        txn = await db.payment_transactions.find_one({"session_id": event_session_id}, {"_id": 0})
        if txn and txn.get("payment_status") != "paid":
            tier = txn.get("tier") or event_metadata.get("tier")
            await db.users.update_one({"user_id": txn["user_id"]},
                {"$set": {"plan": tier, "plan_updated_at": datetime.now(timezone.utc).isoformat()}})
            await db.payment_transactions.update_one({"session_id": event_session_id},
                {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}
