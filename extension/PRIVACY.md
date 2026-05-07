# SnapBurst — Privacy Policy

_Last updated: February 2026_

This privacy policy describes how the SnapBurst Chrome Extension and snapburst.com web service ("SnapBurst", "we", "us") handle your information.

## 1. What we collect
- **Account data:** email, name, profile picture (when signing in with Google).
- **Captured content:** screenshots and screen recordings that you choose to upload. Files are stored encrypted at rest.
- **Usage data:** basic logs (IP, user agent, request paths) for security and debugging — purged within 30 days.
- **Integrations:** Slack incoming webhook URLs and Jira credentials are stored only if you explicitly add them in Settings.
- **AI assistant prompts:** when you chat with the AI assistant, your message and any image you attach are sent to the AI provider (OpenAI via Emergent) to generate a reply. Conversations are stored in your account.

## 2. What we do NOT collect
- We do **not** silently capture screen content.
- We do **not** read or transmit page contents from any tab unless you explicitly request a screenshot or recording.
- We do **not** sell your data.
- We do **not** show third-party advertising.

## 3. Permissions used by the Chrome Extension
- `activeTab`, `tabs`, `scripting` — required for taking screenshots of the current tab and stitching full-page captures.
- `tabCapture` — required for recording the current tab.
- `downloads` — required to let you save captures locally.
- `storage` — stores your auth token and recent capture list locally.
- `<all_urls>` host permission — required because the user may capture / record any page they choose.

## 4. Sharing
Public share links contain a long unguessable token. Anyone with the link can view the capture until you delete it. There is no public listing.

## 5. Third-party services
- **Emergent Object Storage** — encrypted file storage.
- **Emergent Auth (Google OAuth)** — used only when you sign in with Google.
- **OpenAI (via Emergent LLM key)** — used only for AI assistant responses.
- **Stripe** — used only when you check out for a paid plan.
- **Slack / Jira** — only if you explicitly connect them with your own webhook / API token.

## 6. Your rights
You can delete your account or any individual capture at any time from the dashboard. Account deletion permanently removes captures from storage within 30 days.

## 7. Contact
Questions or requests: privacy@snapburst.example.com
