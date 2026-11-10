# Paperlift — Chrome Extension (Manifest V3)

(Riwayat nama: "PDF Grabber" → "Petik" → **Paperlift** (2026-11-10, pilihan pengguna: nama bahasa Inggris).)

## Tujuan
Mengunduh PDF yang sudah dimuat di halaman tetapi tombol download-nya disembunyikan
(contoh: course player Thinkific/Hacktiv8 yang menampilkan PDF lewat iframe pdf.js
`viewer.html?file=<url-pdf>`). Juga menggabungkan slide yang ditampilkan sebagai gambar
per halaman menjadi satu PDF. Hanya untuk materi yang memang bisa diakses pengguna,
untuk pemakaian pribadi.

**Bukan tujuan:** membongkar DRM/enkripsi, atau viewer yang tidak pernah mengirim file
PDF utuh (Scribd, FlipHTML5, dsb.).

Repo: https://github.com/hubble99/pptx-downloader-extension (branch `main`).
Commit/push hanya jika pengguna meminta.

## Struktur folder
```
manifest.json                Konfigurasi extension (MV3)
background/service-worker.js State per tab, webRequest, badge, download 3 tahap, orkestrasi slide→PDF
content/content.js           Semua frame: pindai PDF, deteksi slide, fetch dari frame asal, muat semua slide
offscreen/offscreen.html/.js Halaman tersembunyi: blob URL, konversi gambar, pdf-lib
popup/popup.html/.css/.js    UI daftar PDF, bagian slide, progres
lib/shared.js                Fungsi bersama SW + popup (nama file, gabung daftar). ES module.
vendor/pdf-lib.min.js        pdf-lib 1.17.1 (MIT, lisensi di vendor/pdf-lib.LICENSE.md). Jangan diubah.
icons/                       Ikon 16/32/48/128 px — DIRENDER dari brand/*.svg, jangan diedit manual
brand/logo.svg               Sumber logo Paperlift (lembar kertas terangkat + panah unduh)
brand/logo-small.svg         Versi sederhana untuk ikon 16/32 px
store/                       Screenshot 1280×800 + promo 440×280 (dirender) dan store/src/ (sumbernya)
tools/render-assets.mjs      Render ikon + aset store via Chrome headless (Node; bukan bagian extension)
tools/package.py             Buat dist/paperlift-<versi>.zip untuk Web Store (hanya file runtime)
tests/server.py              Server uji lokal (Python stdlib) + tests/pages/*.html
README.md                    (English) fitur, instalasi step by step, cara pakai, terjemahan label UI, troubleshooting
PRIVACY.md                   (English) kebijakan privasi
docs/TESTING.md              (English) checklist uji manual (Pass/Fail diisi pengguna)
docs/CHROME-WEB-STORE.md     (English) catatan jika kelak dipublikasikan ke Web Store
```

## Cara load extension
1. Buka `chrome://extensions`
2. Aktifkan **Developer mode** (pojok kanan atas)
3. Klik **Load unpacked** → pilih folder proyek ini (yang berisi `manifest.json`)
4. Setelah mengubah kode: klik ikon reload (↻) di kartu extension, lalu muat ulang tab yang diuji.

Server uji: `python tests/server.py` → http://127.0.0.1:8000/ (`localhost:8000` = "domain lain").

## Arsitektur singkat
- Content script melapor `frame-report {pdfs, deck}` per frame → SW menyimpan
  `tab:<tabId> = {topUrl, frames:{frameId:{pdfs,deck}}, network:{url:{...}}, status:{url:{state,text}}, job}`.
  Laporan per frame bersifat *mengganti*, jadi aman dikirim berulang.
- Reset state tab: request `main_frame` baru, `tabs.onUpdated` dengan URL baru (tanpa #),
  atau laporan frame 0 dengan URL baru (SPA). Setelah reset, SW mengirim `rescan` ke semua frame.
- Popup membaca `chrome.storage.session` langsung + `storage.onChanged`; aksi dikirim ke SW
  (fire-and-forget). Pekerjaan tetap jalan walau popup ditutup.
- Download: tahap 1 `chrome.downloads.download(url)`; hasil dipantau via `downloads.onChanged`
  (rekaman `dl:<id>` di storage, karena SW bisa tidur). Gagal/interrupted/HTML → tahap 2:
  content script di frame asal fetch (credentials include) → potongan base64 4 MB → offscreen
  menyusun Blob → blob URL → download → revoke saat selesai. Tahap 3: fetch dari offscreen.
- Slide→PDF: SW minta `cs-slides-collect` (snapshot deck) lalu `cs-slide-bytes` per halaman →
  offscreen `pdf-add` (embedJpg/embedPng, konversi lewat OffscreenCanvas bila perlu) → `pdf-end`.

## Aturan teknis
- Vanilla JS. Tanpa framework, tanpa bundler/build step, tanpa npm dependency.
  Library pihak ketiga (hanya jika disetujui) disalin sebagai file minified ke `vendor/`.
- Manifest V3. Background = service worker (`"type": "module"`).
  Content script tidak bisa memakai `import` → harus berdiri sendiri.
- Izin seminimal mungkin. Setiap permission baru harus punya alasan tertulis di bagian
  "Keputusan" di bawah dan dilaporkan ke pengguna.
- State disimpan di `chrome.storage.session`; jangan andalkan variabel global di SW.

## Aturan UI & merek
- Minimal dan tenang. Tanpa kotak/banner mencolok, tanpa warna terang berlebihan.
- Shadow tipis saja (`0 1px 2px rgba(...,.06)`), border halus, banyak ruang kosong.
- Teks UI berbahasa Indonesia. Label tombol: "Download", "Download semua",
  "Gabung jadi PDF", "Muat semua slide" (sesuai spesifikasi awal).
- Warna merek: ink `#24524F` (utama), aksen terakota `#E08A5F` (hemat), kertas `#F7F4EE`.
  Token warna ada di `:root` popup.css, dengan versi mode gelap.
- Setiap aksi harus terasa: `:active` scale(.95), spinner seketika (optimistis, sebelum
  service worker membalas), centang + kilasan hijau saat selesai. Hormati `prefers-reduced-motion`.
- Atribut `hidden` dipaksa lewat `[hidden]{display:none!important}` (pernah jadi bug).
- Setelah mengubah logo/popup: jalankan `node tools/render-assets.mjs` lalu cek gambarnya.

## Aturan kerja
- Default: kerjakan **per fase**, berhenti di akhir fase untuk audit — kecuali pengguna
  meminta lain (lihat Keputusan 2026-11-10).
- Kolom **Pass/Fail** di checklist uji **HANYA diisi pengguna**. Claude selalu
  membiarkannya kosong.
- Jelaskan istilah teknis dengan bahasa sederhana.
- Setiap keputusan penting → perbarui bagian "Keputusan" di file ini.
- Opsi ekspor PPTX (PptxGenJS) hanya dikerjakan jika pengguna memintanya.

## Status fase
- [x] Fase 1 — manifest, struktur folder, CLAUDE.md, ikon placeholder (diaudit pengguna: load OK)
- [x] Fase 2 — deteksi (content script + webRequest + penyimpanan per tab + badge)
- [x] Fase 3 — popup + download dengan fallback
- [x] Fase 4 — README + checklist uji manual
- [x] Fase 5 — slide gambar → PDF (pdf-lib)
- [ ] Opsional — ekspor PPTX (belum diminta)
- [x] Fase 6 (permintaan 2026-11-10) — merek Paperlift, popup dipoles, persiapan Chrome Web Store (v1.0.0)
Pengguna menyetujui Fase 2–5 ("sudah bagus") dan meminta push + rilis ke Web Store.

## Keputusan
- **Permission `storage`** — `chrome.storage.session` (daftar PDF, status, progres per tab).
- **Permission `webRequest`** (tanpa `webRequestBlocking`, mode observe) — membaca header
  respons untuk mengenali `Content-Type: application/pdf` (juga `octet-stream` jika nama/path
  berakhiran .pdf). Tidak mengubah/memblokir request.
- **Permission `downloads`** — `chrome.downloads.download`, cek hasil, hapus file HTML palsu.
- **Permission `offscreen`** (ditambah Fase 3) — service worker tidak punya
  `URL.createObjectURL`; offscreen document (reason `BLOBS`) membuat blob URL untuk
  `chrome.downloads`, dan menjalankan pdf-lib + konversi gambar.
- **Host permission `<all_urls>`** — PDF/gambar bisa dari domain mana saja; dibutuhkan
  webRequest, content script di semua frame, dan fetch tahap 3.
- **Tidak memakai `tabs`, `scripting`, `webNavigation`** — tidak diperlukan.
- **`minimum_chrome_version: 116`** — `chrome.runtime.getContexts` (cek offscreen sudah ada).
- **2026-11-10: pengguna meminta Fase 2–5 dikerjakan sekaligus** tanpa berhenti per fase.
- **Tahap 3 download** (fetch dari offscreen, tanpa Referer halaman tetapi bebas CORS)
  ditambahkan di luar spesifikasi awal sebagai upaya terakhir; juga dipakai untuk gambar slide
  lintas domain yang tidak bisa di-fetch content script karena CORS.
- **Nama file**: Content-Disposition / atribut `download` → segmen path URL *hanya jika
  berakhiran .pdf* → judul tab. Disanitasi di `lib/shared.js` (karakter ilegal, kontrol,
  bidi, nama terlarang Windows, maks 150 karakter).
- **Validasi isi**: hasil fetch harus mengandung `%PDF-` di 1 KB pertama; download langsung
  yang ternyata `text/html` dihapus lalu diulang lewat fallback.
- **Badge** = jumlah PDF saja (bukan slide), sesuai spesifikasi.
- **"Download semua"** hanya tampil jika ada ≥2 PDF.
- **Deteksi slide**: kandidat `<img>/<canvas>` lebar render ≥300 px (atau tersembunyi tapi
  ukuran asli ≥300), bukan logo/ikon/avatar; dikelompokkan per pola induk (3 level, kelas
  berangka/state diabaikan); dipecah bila ada teks >40 karakter di antara dua gambar; rasio
  ±5% dari median; minimal 3. Frame pdf.js dikecualikan (canvas-nya adalah PDF).
  Urutan: `data-page`/sejenis → alt/aria "Slide N" → angka di nama file; dipakai hanya jika
  lengkap, unik, dan kira-kira berurutan; selain itu urutan DOM.
- **Beberapa deck dalam satu tab**: popup menampilkan deck terbesar saja.
- **Konversi gambar**: JPEG/PNG langsung di-embed; GIF/BMP/SVG → PNG; WebP/AVIF/lainnya →
  JPEG kualitas 0.92 (latar putih). Ukuran halaman = ukuran gambar (1 px = 1 pt).
- **Popup memicu `rescan`** setiap dibuka agar status canvas/lazy-load terbaru.
- **2026-11-10: merek Paperlift** (nama, logo, warna). Nama sebelumnya "Petik" ditolak pengguna:
  ingin nama bahasa Inggris yang keren; dipilih "Paperlift" dari 4 opsi. Teks UI tetap bahasa
  Indonesia. Nama manifest "Paperlift — Save PDFs & Slides", short_name "Paperlift", versi 1.0.0.
- **Screenshot store memakai domain fiktif** (`kelas-contoh.id`), bukan merek situs nyata,
  untuk menghindari masalah merek dagang saat review.
- **Paket store** hanya berisi background, content, offscreen, popup, lib, vendor, icons, manifest.
- **Ikon 128 px** memakai padding ±10 px (area gambar ±100 px) mengikuti panduan Web Store;
  16/32 px tanpa padding dan memakai logo-small.svg agar tajam di toolbar.
- **2026-11-10: distribusi lewat GitHub saja** (bukan Chrome Web Store; pengguna tidak ingin
  bayar USD 5). Pengguna mengunduh zip dari GitHub Releases (`dist/paperlift-<versi>.zip`)
  lalu Load unpacked. Dokumen repo (README, PRIVACY, docs/) berbahasa Inggris; teks UI popup
  tetap bahasa Indonesia (README memuat tabel terjemahan label). CLAUDE.md tetap bahasa Indonesia.
- **Logo Paperlift**: lembar depan miring 7° (terangkat) dengan lipatan terakota dan panah
  unduh, lembar belakang transparan 28% sebagai "halaman" yang ditinggalkan.
