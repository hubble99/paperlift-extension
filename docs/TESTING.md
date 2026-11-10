# Manual Test Checklist: Paperlift

The tester fills in the **Pass/Fail** and **Notes** columns. Leave them empty until the test is run.

Expected UI text is quoted in Indonesian because the popup is in Indonesian.
The README has [a translation table](../README.md#interface-language).

## Setup
1. Go to `chrome://extensions` and reload Paperlift (↻).
2. Start the test server with `python tests/server.py` and open http://127.0.0.1:8000/.
   (`localhost:8000` acts as "another domain".)
3. After reloading the extension, **reload** every tab you're going to test.
4. Logs are under `chrome://extensions` → Paperlift → *service worker* → Console.

Version tested: ______  Chrome: ______  Date: ______

## A. PDF detection and download

| No | Scenario | Steps | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| A1 | pdf.js iframe (local) | Open `pdfjs-iframe.html`, click the icon | Badge **1**. Popup: `Sesi 1 - Pengantar.pdf` · `127.0.0.1`. Download → file saved, status *Tersimpan* | | |
| A2 | pdf.js iframe (real course player, e.g. Thinkific) | Open a PDF lesson in the course player, click the icon | The PDF from `import.cdn.thinkific.com` appears **once**. Download succeeds and the file opens | | |
| A3 | Plain .pdf links | Open `pdf-link.html` | Badge **3**: `modul-1.pdf`, `modul-2.pdf`, `Latihan Soal.pdf` (duplicates and `#page=3` don't create extra items). "Download semua" is shown and saves all three | | |
| A4 | embed / object | Open `embed.html` | Badge **2**: `embed-doc.pdf`, `object-doc.pdf`. Both can be downloaded | | |
| A5 | PDF that returns 403 when opened directly | Open `protected.html`. Click the "URL langsung" link first to confirm the 403. Then click Download for `materi-rahasia.pdf` in the popup | Direct link = 403. Download through the extension ends with *Tersimpan* and the file is valid (not a "403 Forbidden" text). The status usually shows *Mencoba lewat halaman…* briefly; the server log shows a 403 followed by a 200 | | |
| A6 | Page without PDFs | Open `no-pdf.html` | No badge. Popup: **Tidak ada PDF terdeteksi**. No slide section | | |
| A7 | Odd file names (URL path) | Open `odd-names.html`, download each link | Saved without illegal characters: `Materi #1 AI final.pdf`, `_CON.pdf`, `材料 – übung.pdf`; `....pdf` falls back to the page title (`Nama file aneh.pdf`) | | |
| A8 | Odd file names (Content-Disposition) | In `odd-names.html`, download the item from the `/cd/download.pdf` iframe | Name comes from the header: `Laporan Q1 – Final revisi 2 ok.pdf` (no `"`, `:`, `*`, `<>`, `?`) | | |
| A9 | Navigating away | From `pdf-link.html`, open `no-pdf.html` in the same tab | Badge disappears, the old list doesn't come back | | |
| A10 | Closing a tab | Close a tab with PDFs, open the popup in another tab | Lists from different tabs don't mix | | |
| A11 | Popup closed during download | Click Download, close the popup immediately, reopen it | The download still finishes; status *Tersimpan* | | |

## B. Image slides → PDF

| No | Scenario | Steps | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| B1 | Plain `<img>` slides | Open `slides-img.html`, click the icon → **Gabung jadi PDF** | Popup: *Slide terdeteksi: 12 halaman* + thumbnails; the small logo isn't counted. Progress *Memproses n/12*. `Slide gambar biasa.pdf` has 12 pages **in order 1–12** (number of white boxes = page number), size 960×540 | | |
| B2 | Lazy-loaded slides | Open `slides-lazy.html` (don't scroll). Popup → **Muat semua slide**, wait, reopen the popup → Gabung | 6 pages at first. After loading: **30 pages**, scroll position returns to the top, done in ≤30 s. The PDF has 30 pages in order | | |
| B3 | Canvas slides | Open `slides-canvas.html`, wait 2 s → Gabung | *8 halaman*, note "2 canvas tidak bisa diambil". Result: 6-page PDF + message "Tidak bisa diambil: hal. 7, 8". No crash | | |
| B4 | Many non-slide images | Open `gallery.html` | The slide section does **not** appear (photos separated by paragraphs, small thumbnails, avatars and logos are ignored) | | |
| B5 | Deck with ≥50 pages | Open `slides-50.html` → Gabung | *60 halaman*. Progress runs to 60/60; the PDF has 60 pages at 1280×720, in order | | |
| B6 | Real slides (live site, optional) | A lesson page that shows slides as images | Page count matches, order is correct, images are sharp (largest resolution) | | |

## C. General

| No | Scenario | Steps | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| C1 | Popup look | Open the popup on several pages | Minimal and calm, no loud boxes, thin shadows, no overflowing text. Header shows the logo + "Paperlift" | | |
| C1a | Click feel | Click Download, Download semua, Gabung jadi PDF, Muat semua slide | The button visibly "presses" (shrinks slightly) and a spinner appears instantly. When finished, Download briefly shows a check mark "Tersimpan" and the row flashes soft green | | |
| C1b | Dark mode | Switch the system/Chrome theme to dark, open the popup | Comfortable dark colors, readable text, the primary button stays clear | | |
| C1c | Icon and badge | Look at the toolbar icon and the `chrome://extensions` page | The Paperlift logo is sharp at every size; the badge is dark teal | | |
| C2 | No errors | `chrome://extensions` → **Errors** button on the extension card | No red errors after all tests | | |
| C3 | Special pages | Open `chrome://extensions`, click the icon | Popup: "Halaman ini tidak bisa dipindai" | | |
| C4 | Release ZIP | Run `python tools/package.py`, extract `dist/paperlift-1.0.0.zip` to a new folder, Load unpacked that folder | Loads without errors and behaves the same (quick A1 check) | | |
