// Lightweight analytics for SnapBurst CTAs / install funnel.
// Uses navigator.sendBeacon for fire-and-forget POSTs.
const BACKEND = process.env.REACT_APP_BACKEND_URL;

const HERO_VARIANTS = ["A", "B"];
const VARIANT_KEY = "sb_hero_variant";
const VID_KEY = "sb_visitor_id";

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

export function buildInstallUrl(extensionId, source) {
  // Web Store URL with UTM tags so we can measure which screenshot/CTA drove the install.
  const base = extensionId
    ? `https://chrome.google.com/webstore/detail/${extensionId}`
    : `${BACKEND}/api/extension/download`;
  const params = new URLSearchParams({
    utm_source: "snapburst_site",
    utm_medium: "cta",
    utm_campaign: "install_v1",
    utm_content: source,
    sb_variant: getHeroVariant(),
    sb_vid: getVisitorId(),
  });
  return `${base}?${params.toString()}`;
}
