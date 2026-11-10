# Changelog

All notable changes to Paperlift are listed here.
Versions follow `version` in `manifest.json`.

## 1.0.0 — 2026-11-10

First public release.

- Detects PDFs in pdf.js viewers (`?file=`), `<embed>`/`<object>`, `.pdf` links and network
  responses, in every frame. A badge on the toolbar icon shows the count.
- One-click **Download** and **Download all**, with an automatic fallback (fetch through the
  original frame, then through the extension) when the server refuses a direct download.
- Validates that saved files are real PDFs and gives them clean, cross-platform file names.
- Detects image-based slide decks, can **Load all slides** (auto-scroll for lazy-loading), and
  **Merge into PDF** at the largest available resolution, with live progress.
- Minimal popup with light and dark mode.
- No tracking, no remote code, MIT licensed.
