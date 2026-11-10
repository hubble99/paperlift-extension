# Publishing to the Chrome Web Store (optional)

Paperlift is currently distributed through
[GitHub Releases](https://github.com/hubble99/paperlift-extension/releases) only.
These notes are kept in case it's published to the Chrome Web Store later.

## 1. Developer account
1. Go to https://chrome.google.com/webstore/devconsole and sign in with a Google account.
2. Pay the one-time registration fee (USD 5) and complete the developer profile (name,
   verified contact email).

## 2. Build the package
```
python tools/package.py
```
Output: `dist/paperlift-<version>.zip`, containing only the extension files (no tests, tools
or docs). For every update, bump `version` in `manifest.json`, rebuild, and upload it to the
same item.

Graphics can be re-rendered after changing the logo or popup:
```
node tools/render-assets.mjs        (Node 20: add --experimental-websocket)
```

## 3. Upload
Developer Dashboard → **New item** → choose the ZIP → fill in the tabs below.

### "Store listing" tab
| Field | Value |
|---|---|
| Name | (from manifest) **Paperlift — Save PDFs & Slides** |
| Summary | (from manifest) Find and save PDFs already loaded on a page, and merge image-based slides into a single PDF. |
| Category | Productivity → Tools |
| Language | English |
| Icon | `icons/icon128.png` |
| Screenshots (1280×800) | `store/screenshot-1.png`, `store/screenshot-2.png`, `store/screenshot-3.png` |
| Small promo tile (440×280) | `store/promo-440x280.png` |
| Homepage / Support URL | https://github.com/hubble99/paperlift-extension |

**Description** (copy):

```
Paperlift saves PDFs that are already shown on a page but have their download button hidden, such as course notes displayed in an embedded pdf.js viewer.

FEATURES
• Automatic detection: pdf.js viewers (?file=), <embed>/<object>, .pdf links, and PDF files loaded by the page.
• One click to download, or "Download all".
• Fallback when the server refuses a direct download (403): the file is fetched through the page that loaded it, with your login session.
• Slides shown as images? Paperlift recognizes the deck, can load every slide (lazy-loading), and merges them into one PDF at the largest available resolution.
• Clean file names that work on Windows, macOS and Linux.
• Minimal interface with dark mode.

PRIVACY
No account, no ads, no tracking. Everything runs locally in your browser; no data is sent to the developer.

LIMITATIONS
• Only for material you already have access to. Paperlift does not break DRM or encryption.
• Viewers that never send a complete PDF file (e.g. Scribd, FlipHTML5) aren't supported.
• PDFs merged from slides contain images; their text can't be selected.

Open source: https://github.com/hubble99/paperlift-extension
```

### "Privacy practices" tab
**Single purpose:**
> Finds PDFs and image-based slides already loaded on the page the user is viewing, and saves them as PDF files on the user's computer.

**Permission justifications** (one per field):

| Permission | Justification |
|---|---|
| `storage` | Stores the per-tab list of detected PDFs and slides in chrome.storage.session so the popup can show it. Cleared when the tab or browser closes. |
| `webRequest` | Observes response headers (Content-Type, Content-Disposition) to recognize PDF files loaded by the page, e.g. by a pdf.js viewer. Observe-only; never blocks or modifies requests. |
| `downloads` | Saves the PDFs the user selects to the Downloads folder and checks whether the download succeeded, so a fallback method can be tried if it failed. |
| `offscreen` | The service worker cannot create blob URLs. An offscreen document assembles files (merged slide PDFs, or PDFs fetched through the page) before handing them to chrome.downloads. |
| Host permission `<all_urls>` | PDFs and slide images can live on any domain (often a CDN separate from the main site). Needed so the content script can scan all frames, including cross-origin viewer iframes, and so webRequest can recognize PDF responses. |

**Remote code:** *No, I am not using remote code.* (pdf-lib is bundled in the package.)

**Data usage:** don't tick any data category (Paperlift collects no data). Tick all three
certification statements.

**Privacy policy URL:**
https://github.com/hubble99/paperlift-extension/blob/main/PRIVACY.md

### "Distribution" tab
- Visibility: **Public**, or *Unlisted* for a limited test via link.
- Regions: all.

## 4. Submit for review
Click **Submit for review**. Notes:
- All-sites access plus `webRequest` usually means a longer review (days to weeks).
- Reviewers look for copyright-infringement risk. The description deliberately says the
  extension is only for material the user can access and does not break DRM. Don't name
  specific target sites, and don't use other sites' logos or brands in screenshots.
- If rejected, the email states the reason and the policy section. Fix it, bump the
  version, and resubmit.
