// Lightweight analytics for SnapBurst CTAs / install funnel.
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const HERO_VARIANTS = ["A", "B"];
const VARIANT_KEY = "sb_hero_variant";
const VID_KEY = "sb_visitor_id";
const STORE_ID_KEY = "sb_store_id";
const STORE_ID_FETCHED_KEY = "sb_store_id_at";
const STORE_ID_TTL_MS = 5 * 60 * 1000;

export function getVisitorId() {
  let id = localStorage.getItem(VID_KEY);
  if (!id) {
    id = "v_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    localStorage.setItem(VID_KEY, id);
  }
  return id;
}

export function getHeroVariant() {
  let v = localStorage.getItem(VARIANT_KEY);
  if (!v || !HERO_VARIANTS.includes(v)) {
    v = HERO_VARIANTS[Math.floor(Math.random() * HERO_VARIANTS.length)];
    localStorage.setItem(VARIANT_KEY, v);
  }
  return v;
}

export function setHeroVariant(v) {
  if (!HERO_VARIANTS.includes(v)) return;
  localStorage.setItem(VARIANT_KEY, v);
}

// Cached fetch of the published Chrome Web Store extension id.
async function getStoreExtensionId() {
  const cached = localStorage.getItem(STORE_ID_KEY);
  const at = parseInt(localStorage.getItem(STORE_ID_FETCHED_KEY) || "0", 10);
  if (cached && Date.now() - at < STORE_ID_TTL_MS) return cached || null;
  try {
    const r = await fetch(`${BACKEND}/api/extension/store-id`);
    const d = await r.json();
    const eid = (d.extension_id || "").trim();
    localStorage.setItem(STORE_ID_KEY, eid);
    localStorage.setItem(STORE_ID_FETCHED_KEY, String(Date.now()));
    return eid || null;
  } catch {
    return cached || null;
  }
}

export function track(event, props = {}) {
  try {
    const payload = JSON.stringify({
      event,
      visitor_id: getVisitorId(),
      hero_variant: getHeroVariant(),
      path: window.location.pathname,
      referrer: document.referrer || null,
      ...props,
    });
    const url = `${BACKEND}/api/analytics/track`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    }
  } catch (e) { /* no-op */ }
}

// Sync version — uses cached store ID. Refresh runs in background.
export function buildInstallUrl(_unused, source) {
  const cached = localStorage.getItem(STORE_ID_KEY) || "";
  const base = cached
    ? `https://chrome.google.com/webstore/detail/${cached}`
    : `${BACKEND}/api/extension/download`;
  const params = new URLSearchParams({
    utm_source: "snapburst_site",
    utm_medium: "cta",
    utm_campaign: "install_v1",
    utm_content: source,
    sb_variant: getHeroVariant(),
    sb_vid: getVisitorId(),
  });
  // background refresh — next pageview will use newest value
  getStoreExtensionId();
  return `${base}?${params.toString()}`;
}

export { getStoreExtensionId };
