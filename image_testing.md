# Image Integration Testing Rules

- Always use base64-encoded images.
- Accepted formats: JPEG, PNG, WEBP only.
- Don't use SVG, BMP, HEIC.
- Avoid blank/uniform images — must contain real visual features.
- Re-detect MIME after transformations.
- Animated GIF/APNG/WEBP -> extract first frame.
- Resize oversized payloads.
