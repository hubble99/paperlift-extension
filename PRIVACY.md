# Paperlift Privacy Policy

*Effective: November 10, 2026*

Paperlift is a browser extension that finds PDFs already loaded on the page you are viewing,
saves them, and can merge image-based slides into a single PDF.

## In short

**Paperlift does not collect, upload, sell or share your data.** Everything happens inside
your own browser.

## What Paperlift processes

- **URLs of PDFs and slide images on pages you open.** They're used to build the list in
  the popup. They're kept temporarily in the browser's session memory
  (`chrome.storage.session`) and cleared automatically when you close the tab, navigate
  away, or close the browser.
- **Network response headers** (content type and file name), read to recognize PDF files.
  Paperlift only observes them. It never modifies, blocks or resends requests.
- **The contents of PDFs and images you choose to download or merge.** They're fetched from
  the original website with your browser's existing session, just as the page itself loads
  them, and saved directly to your Downloads folder.

## What Paperlift does not do

- No analytics, tracking, advertising or accounts.
- No data is sent to the developer or to any third party.
- It does not read passwords, form contents or your browsing history.
- It does not load or run code from outside the extension.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Keeps the per-tab list of detected PDFs and slides in session memory |
| `webRequest` | Recognizes PDF responses (observe-only) |
| `downloads` | Saves files to your Downloads folder |
| `offscreen` | Builds files before saving them (for example a PDF made from slides) |
| Access to all sites | PDFs and images can come from any domain |

## Changes

If this policy changes, the updated version will be published in this file with a new
effective date.

## Contact

Questions or reports: open an issue at
https://github.com/hubble99/pptx-downloader-extension/issues
