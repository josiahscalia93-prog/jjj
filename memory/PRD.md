# SnapBurst — Product Requirements Document

## Original problem statement
Build a Chrome extension (for submission to the Chrome Web Store) + companion web platform for capturing, recording, editing and sharing screen content. Features: screen recording (4K/2K/1080p/GIF), screenshot (visible / selected / full-page scrolling), annotation (draw, text, shapes, arrows, blur), shareable links, integrations with Slack/Trello/Jira/Gmail, cloud storage, and an AI assistant that helps users with extension features and analyses uploaded screenshots.

## User choices (Feb 2026)
- Build BOTH the Chrome extension and the companion web dashboard.
- Auth: JWT email/password AND Emergent Google Auth (both supported simultaneously).
- Cloud storage: Emergent object storage with public shareable links.
- AI assistant: GPT-5.2 with vision (Emergent LLM key).
- Design: Playful, joyful, modern color — chose Neo-Brutalist Soft Play (yellow/pink/mint/tangerine/blue + black borders).

## Architecture
**Backend** — FastAPI + MongoDB (motor)
- Auth via unified session_token (Bearer or httpOnly cookie); supports both email/password and Google OAuth via /auth/session exchange.
- Captures (recording / screenshot) stored to Emergent object storage; metadata in MongoDB; public share via uuid-hex tokens.
- AI: emergentintegrations.LlmChat (openai/gpt-5.2) with optional ImageContent for vision.

**Frontend** — React + Tailwind + sonner + lucide-react
- Pages: Landing (marketing), Login, Register, AuthCallback, Dashboard, CaptureDetail (with AnnotationEditor canvas), SharePage (public).
- Floating AI chat widget (vision-capable).

**Chrome Extension** — Manifest V3 (/app/extension)
- popup with screenshot (visible + full-page scrolling stitch), screen + webcam recording.
- Recorder page using getDisplayMedia + getUserMedia, uploads via Bearer token to /api/captures.
- Keyboard shortcuts: Ctrl+Shift+S (screenshot), Ctrl+Shift+R (record).

## What's been implemented (2026-02)
- ✅ Marketing landing page (hero, features bento, integrations marquee, pricing, testimonials, FAQ, CTA, footer)
- ✅ Email/password register + login + JWT-style session tokens with httpOnly cookie
- ✅ Emergent Google Auth flow (sign-in button → callback → session exchange)
- ✅ Dashboard with capture grid, filtering (all/screenshot/recording), upload modal, copy share, soft delete
- ✅ Screen recording in-browser via getDisplayMedia + mic merge; webcam snapshot
- ✅ Annotation editor (canvas): pen, arrow, rectangle, circle, text, blur (pixelate); save annotations to DB
- ✅ Public share page with download
- ✅ AI chat widget powered by GPT-5.2 with optional image upload
- ✅ Object storage (Emergent) for all uploads
- ✅ Chrome extension (Manifest V3) with popup, recorder page, full-page scrolling stitch screenshot
- ✅ Backend tested 24/24 (100%)

## Backlog
**P1**
- Add presigned/temporary download URLs (currently routed via backend).
- Annotation undo/redo stack improvements; export annotated PNG to storage.
- AI chat history persistence across page reloads.
- Brand the extension with branded icons (replace placeholder icons).

**P2**
- Pricing → Stripe integration (Stripe test keys are already provisioned in env).
- Team workspaces / shared library.
- Direct-to-Slack/Trello/Jira app posting (currently uses share URL intents).
- Analytics dashboard (views per share link).

## Personas
- Creator / educator producing tutorials.
- Designer giving feedback on UI mocks.
- Engineer reporting bugs with annotated screenshots.
- Customer-success replying with quick walkthroughs.

## Success metrics
- Time-to-share (capture → public link) < 60s.
- AI assistant helpfulness (positive feedback rate).
- Free → Pro conversion via watermark-free quality and 4K recording.
