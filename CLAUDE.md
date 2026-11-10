# Paperlift — Chrome Extension (Manifest V3)

Name history: "PDF Grabber" → "Petik" → **Paperlift** (2026-11-10, chosen by the user; they
wanted an English name).

## Purpose
Download PDFs that are already loaded on a page but whose download button is hidden
(example: Thinkific/Hacktiv8 course players that show a PDF in a pdf.js iframe,
`viewer.html?file=<pdf-url>`). Also merge slides shown as one image per page into a single
PDF. Only for material the user can legitimately access, for personal use.

**Out of scope:** breaking DRM/encryption, or viewers that never send a complete PDF file
(Scribd, FlipHTML5, etc.).

Repo: https://github.com/hubble99/paperlift-extension (branch `main`).
Commit/push only when the user asks.

## Project structure
```
manifest.json                Extension configuration (MV3)
background/service-worker.js Per-tab state, webRequest, badge, 3-step download, slide→PDF orchestration
content/content.js           Every frame: PDF scan, slide detection, fetch from the original frame, load all slides
offscreen/offscreen.html/.js Hidden page: blob URLs, image conversion, pdf-lib
popup/popup.html/.css/.js    UI: PDF list, slide section, progress
lib/shared.js                Helpers shared by SW + popup (file names, list merging). ES module.
vendor/pdf-lib.min.js        pdf-lib 1.17.1 (MIT, license in vendor/pdf-lib.LICENSE.md). Do not modify.
icons/                       16/32/48/128 px icons — RENDERED from brand/*.svg, never edit by hand
brand/logo.svg               Paperlift logo source (lifted paper sheet + download arrow)
brand/logo-small.svg         Simplified version for 16/32 px icons
store/                       1280×800 screenshots + 440×280 promo (rendered) and store/src/ (sources)
tools/render-assets.mjs      Renders icons + store assets via headless Chrome (Node; not part of the extension)
tools/package.py             Builds dist/paperlift-<version>.zip (runtime files only) for GitHub releases
tests/server.py              Local test server (Python stdlib) + tests/pages/*.html
README.md                    Features, step-by-step install, usage, permissions, troubleshooting
PRIVACY.md                   Privacy policy
LICENSE                      MIT (c) 2026 hubble99; also included in the release zip
CHANGELOG.md                 Release notes per version
docs/TESTING.md              Manual test checklist (Pass/Fail filled in by the user)
docs/CHROME-WEB-STORE.md     Notes in case it's published to the Web Store later
```

## Loading the extension
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** → select this project folder (the one with `manifest.json`)
4. After code changes: click reload (↻) on the extension card, then reload the tab under test.

Test server: `python tests/server.py` → http://127.0.0.1:8000/ (`localhost:8000` = "another domain").

## Architecture
- The content script sends `frame-report {pdfs, deck}` per frame → the SW stores
  `tab:<tabId> = {topUrl, frames:{frameId:{pdfs,deck}}, network:{url:{...}}, status:{url:{state,text}}, job}`.
  Frame reports *replace* the previous one, so resending is safe.
- Tab state is reset on: a new `main_frame` request, `tabs.onUpdated` with a new URL (ignoring #),
  or a frame-0 report with a new URL (SPA). After a reset the SW sends `rescan` to every frame.
- The popup reads `chrome.storage.session` directly + `storage.onChanged`; actions are sent to the SW
  (fire-and-forget). Work continues when the popup is closed.
- Download: step 1 `chrome.downloads.download(url)`; the result is tracked via `downloads.onChanged`
  (`dl:<id>` records in storage, because the SW can sleep). Failed/interrupted/HTML → step 2:
  the content script in the original frame fetches (credentials include) → 4 MB base64 chunks →
  offscreen builds a Blob → blob URL → download → revoke when done. Step 3: fetch from offscreen.
- Slides→PDF: SW asks `cs-slides-collect` (deck snapshot), then `cs-slide-bytes` per page →
  offscreen `pdf-add` (embedJpg/embedPng, converting via OffscreenCanvas when needed) → `pdf-end`.

## Technical rules
- Vanilla JS. No framework, no bundler/build step, no npm dependencies.
  Third-party libraries (only with approval) are copied as minified files into `vendor/`.
- Manifest V3. Background = service worker (`"type": "module"`).
  Content scripts can't use `import` → they must be self-contained.
- Minimal permissions. Every new permission needs a written reason under "Decisions" below
  and must be reported to the user.
- State lives in `chrome.storage.session`; never rely on global variables in the SW.

## UI & brand rules
- Minimal and calm. No loud boxes/banners, no overly bright colors.
- Thin shadows only (`0 1px 2px rgba(...,.06)`), subtle borders, plenty of whitespace.
- **All UI text is English** (popup, status messages, errors). Button labels: "Download",
  "Download all", "Merge into PDF", "Load all slides".
- Brand colors: ink `#24524F` (primary), terracotta accent `#E08A5F` (sparingly), paper `#F7F4EE`.
  Color tokens live in `:root` in popup.css, with dark-mode variants.
- Every action must feel responsive: `:active` scale(.95), instant spinner (optimistic, before
  the service worker answers), check mark + green flash when done. Respect `prefers-reduced-motion`.
- The `hidden` attribute is enforced with `[hidden]{display:none!important}` (this was a bug once).
- After changing the logo/popup: run `node tools/render-assets.mjs` and check the images.

## Working rules
- Repo language: English for code, comments, UI, docs and commit messages. The user chats
  in Indonesian; reply to them in Indonesian.
- Default: work **phase by phase** and stop at the end of each phase for review — unless the
  user asks otherwise (see Decisions, 2026-11-10).
- The **Pass/Fail** columns in test checklists are filled in **ONLY by the user**. Claude
  always leaves them empty.
- Explain technical terms in plain language.
- Every important decision → update the "Decisions" section of this file.
- The PPTX export option (PptxGenJS) is only built if the user asks for it.

## Phase status
- [x] Phase 1 — manifest, folder structure, CLAUDE.md, placeholder icons (reviewed by the user: loads OK)
- [x] Phase 2 — detection (content script + webRequest + per-tab storage + badge)
- [x] Phase 3 — popup + download with fallback
- [x] Phase 4 — README + manual test checklist
- [x] Phase 5 — image slides → PDF (pdf-lib)
- [ ] Optional — PPTX export (not requested)
- [x] Phase 6 (requested 2026-11-10) — Paperlift brand, polished popup, release prep (v1.0.0)
- [x] Phase 7 (requested 2026-11-10) — GitHub-only distribution, English UI and repo, MIT license

The user approved phases 2–5 ("sudah bagus").

## Decisions
- **`storage` permission** — `chrome.storage.session` (PDF list, status, progress per tab).
- **`webRequest` permission** (no `webRequestBlocking`, observe mode) — reads response headers
  to recognize `Content-Type: application/pdf` (also `octet-stream` when the name/path ends in
  .pdf). Never modifies or blocks requests.
- **`downloads` permission** — `chrome.downloads.download`, checking results, deleting fake HTML files.
- **`offscreen` permission** (added in phase 3) — the service worker has no
  `URL.createObjectURL`; the offscreen document (reason `BLOBS`) creates blob URLs for
  `chrome.downloads` and runs pdf-lib + image conversion.
- **`<all_urls>` host permission** — PDFs/images can come from any domain; needed for
  webRequest, content scripts in every frame, and the step-3 fetch.
- **No `tabs`, `scripting`, `webNavigation`** — not needed.
- **`minimum_chrome_version: 116`** — `chrome.runtime.getContexts` (checks whether offscreen exists).
- **2026-11-10: the user asked for phases 2–5 in one go** without stopping between phases.
- **Download step 3** (fetch from offscreen: no page Referer but no CORS limits) was added
  beyond the original spec as a last resort; it's also used for cross-origin slide images the
  content script can't fetch because of CORS.
- **File names**: Content-Disposition / `download` attribute → URL path segment *only if it
  ends in .pdf* → tab title. Sanitized in `lib/shared.js` (illegal, control and bidi
  characters, reserved Windows names, max 150 characters). Fallback name: `document.pdf`.
- **Content check**: a fetched file must contain `%PDF-` in its first 1 KB; a direct download
  that turns out to be `text/html` is deleted and retried through the fallback.
- **Badge** = number of PDFs only (not slides), per the spec.
- **"Download all"** is only shown when there are ≥2 PDFs.
- **Slide detection**: `<img>/<canvas>` candidates rendered ≥300 px wide (or hidden but with a
  natural size ≥300), not logos/icons/avatars; grouped by parent pattern (3 levels, numeric/state
  classes ignored); split when >40 characters of text sit between two images; aspect ratio
  within ±5% of the median; at least 3. pdf.js frames are excluded (their canvases are a PDF).
  Order: `data-page` and similar → alt/aria "Slide N" (also Indonesian "halaman"/"hal.") →
  number in the file name; only used when complete, unique and roughly sequential; otherwise DOM order.
- **Several decks in one tab**: the popup shows the largest one only.
- **Image conversion**: JPEG/PNG embedded directly; GIF/BMP/SVG → PNG; WebP/AVIF/other →
  JPEG quality 0.92 (white background). Page size = image size (1 px = 1 pt).
- **The popup triggers `rescan`** every time it opens, so canvas/lazy-load status is current.
- **2026-11-10: Paperlift brand** (name, logo, colors). The earlier name "Petik" was rejected
  by the user, who wanted a cool English name; "Paperlift" was picked from 4 options.
  Manifest name "Paperlift — Save PDFs & Slides", short_name "Paperlift", version 1.0.0.
- **Screenshots use fictional `example.com` domains**, not real site brands, to avoid
  trademark issues.
- **The package** contains only background, content, offscreen, popup, lib, vendor, icons,
  manifest and LICENSE.
- **128 px icon** has ~10 px padding (~100 px artwork) per Web Store guidelines;
  16/32 px have no padding and use logo-small.svg so they stay sharp in the toolbar.
- **Paperlift logo**: front sheet tilted 7° (lifted) with a terracotta folded corner and a
  download arrow; a 28% transparent back sheet is the "page" left behind.
- **2026-11-10: GitHub-only distribution** (not the Chrome Web Store; the user didn't want
  to pay USD 5). Users download the zip from GitHub Releases (`dist/paperlift-<version>.zip`)
  and use Load unpacked. Repo renamed to `paperlift-extension` (from `pptx-downloader-extension`).
- **2026-11-10: MIT license** (requested by the user), copyright holder "hubble99".
- **2026-11-10: English everywhere.** The user asked for the app in English with no
  Indonesian: popup text, status/error messages, code comments, test pages, screenshots and
  docs were all translated. Still 1.0.0, because no release had been published yet.
