# SnapBurst — Chrome Extension

A versatile browser extension to capture screenshots, record screen + webcam + mic, annotate, and instantly share via shareable links.

## Features
- Screenshots: visible area, full-page (scrolling)
- Recording: screen / window / tab + webcam + mic (1080p / 2K / 4K, GIF export)
- Annotation editor: draw, text, shapes, arrows, blur
- Cloud upload + shareable link
- Integrations: Slack, Trello, Jira, Gmail
- AI Assistant for help and screenshot analysis

## Local development
1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this `/app/extension` folder
4. Open `https://capture-annotate.preview.emergentagent.com` and sign in to connect

## Submitting to the Chrome Web Store
1. Replace `icons/icon16.png`, `icon48.png`, `icon128.png` with your branded assets (≥128px PNG, transparent).
2. Pack folder as ZIP (exclude `README.md` if desired).
3. Upload at https://chrome.google.com/webstore/devconsole — fill listing, screenshots, privacy policy URL.
4. Submit for review.

## Files
- `manifest.json` — Manifest V3 declaration
- `popup.html / popup.js / popup.css` — toolbar popup UI
- `recorder.html / recorder.js` — full-tab recorder using `getDisplayMedia`
- `background.js` — service worker (commands + auth bridge)
- `icons/` — extension icons
