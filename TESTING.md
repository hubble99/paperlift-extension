# Checklist Uji Manual — Petik

Kolom **Pass/Fail** dan **Catatan** diisi oleh penguji (pengguna), bukan oleh Claude.

## Persiapan
1. `chrome://extensions` → reload Petik (↻).
2. Jalankan server uji: `python tests/server.py` → buka http://127.0.0.1:8000/
   (`localhost:8000` dipakai sebagai "domain lain").
3. Setelah reload extension, **muat ulang** tab yang akan diuji.
4. Untuk melihat log: `chrome://extensions` → Petik → *service worker* → Console.

Versi diuji: ______  Chrome: ______  Tanggal: ______

## A. Deteksi & download PDF

| No | Skenario | Langkah | Hasil yang diharapkan | Pass/Fail | Catatan |
|---|---|---|---|---|---|
| A1 | iframe pdf.js (lokal) | Buka `pdfjs-iframe.html`, klik ikon | Badge **1**. Popup: `Sesi 1 - Pengantar.pdf` · `127.0.0.1`. Download → file tersimpan, status *Tersimpan* | | |
| A2 | iframe pdf.js (Thinkific/Hacktiv8 asli) | Buka materi PDF di course player, klik ikon | PDF dari `import.cdn.thinkific.com` muncul **sekali**. Download berhasil dan file bisa dibuka | | |
| A3 | Link .pdf biasa | Buka `pdf-link.html` | Badge **3**: `modul-1.pdf`, `modul-2.pdf`, `Latihan Soal.pdf` (duplikat & `#page=3` tidak membuat item ganda). "Download semua" tampil dan mengunduh ketiganya | | |
| A4 | embed / object | Buka `embed.html` | Badge **2**: `embed-doc.pdf`, `object-doc.pdf`. Keduanya bisa diunduh | | |
| A5 | PDF yang memberi 403 kalau dibuka langsung | Buka `protected.html`. Klik tautan "URL langsung" dulu untuk memastikan 403. Lalu di popup klik Download `materi-rahasia.pdf` | Tautan langsung = 403. Download lewat extension berakhir *Tersimpan* dan file valid (bukan teks "403 Forbidden"). Biasanya status sempat menampilkan *Mencoba lewat halaman…*; log terminal server menunjukkan request pertama 403 lalu 200 | | |
| A6 | Halaman tanpa PDF | Buka `no-pdf.html` | Tidak ada badge. Popup: **Tidak ada PDF terdeteksi**. Bagian slide tidak muncul | | |
| A7 | Nama file aneh (path) | Buka `odd-names.html`, unduh tiap link | Nama tersimpan tanpa karakter ilegal: `Materi #1 AI final.pdf`, `_CON.pdf`, `材料 – übung.pdf`; `....pdf` memakai judul halaman (`Nama file aneh.pdf`) | | |
| A8 | Nama file aneh (Content-Disposition) | Di `odd-names.html`, unduh item dari iframe `/cd/download.pdf` | Nama diambil dari header: `Laporan Q1 – Final revisi 2 ok.pdf` (tanpa `"`, `:`, `*`, `<>`, `?`) | | |
| A9 | Pindah halaman | Dari `pdf-link.html` buka `no-pdf.html` di tab yang sama | Badge hilang, daftar lama tidak muncul lagi | | |
| A10 | Tutup tab | Tutup tab berisi PDF, buka popup di tab lain | Daftar tab lain tidak tercampur | | |
| A11 | Popup ditutup saat mengunduh | Klik Download lalu langsung tutup popup, buka lagi | Download tetap selesai; status *Tersimpan* | | |

## B. Slide gambar → PDF

| No | Skenario | Langkah | Hasil yang diharapkan | Pass/Fail | Catatan |
|---|---|---|---|---|---|
| B1 | Slide `<img>` biasa | Buka `slides-img.html`, klik ikon → **Gabung jadi PDF** | Popup: *Slide terdeteksi: 12 halaman* + thumbnail; logo kecil tidak terhitung. Progres *Memproses n/12*. File `Slide gambar biasa.pdf` berisi 12 halaman **urut 1–12** (jumlah kotak putih = nomor), ukuran 960×540 | | |
| B2 | Slide lazy-load | Buka `slides-lazy.html` (jangan scroll). Popup → **Muat semua slide**, tunggu, buka popup lagi → Gabung | Awalnya 6 halaman. Setelah memuat: **30 halaman**, posisi scroll kembali ke atas, selesai ≤30 detik. PDF berisi 30 halaman urut | | |
| B3 | Slide canvas | Buka `slides-canvas.html`, tunggu 2 detik → Gabung | *8 halaman*, catatan "2 canvas tidak bisa diambil". Hasil: PDF 6 halaman + pesan "Tidak bisa diambil: hal. 7, 8". Tidak crash | | |
| B4 | Banyak gambar non-slide | Buka `gallery.html` | Bagian slide **tidak** muncul (foto dipisah paragraf, thumbnail kecil, avatar, logo diabaikan) | | |
| B5 | Deck ≥50 halaman | Buka `slides-50.html` → Gabung | *60 halaman*. Progres berjalan sampai 60/60; PDF 60 halaman 1280×720, urut | | |
| B6 | Slide asli (situs nyata, opsional) | Halaman materi PPT berbentuk gambar | Jumlah halaman sesuai, urutan benar, gambar tajam (resolusi terbesar) | | |

## C. Umum

| No | Skenario | Langkah | Hasil yang diharapkan | Pass/Fail | Catatan |
|---|---|---|---|---|---|
| C1 | Tampilan popup | Lihat popup di beberapa halaman | Minimal dan tenang, tanpa kotak mencolok, shadow tipis, teks tidak meluber. Header berisi logo + "Petik" | | |
| C1a | Rasa klik | Klik Download, Download semua, Gabung jadi PDF, Muat semua slide | Tombol langsung "tertekan" (mengecil sedikit) dan spinner muncul seketika. Setelah selesai, tombol Download sempat menampilkan centang "Tersimpan" dan baris berkedip hijau lembut | | |
| C1b | Mode gelap | Ubah tema sistem/Chrome ke gelap, buka popup | Warna gelap yang nyaman, teks terbaca, tombol utama tetap jelas | | |
| C1c | Ikon & badge | Lihat ikon di toolbar dan halaman `chrome://extensions` | Logo Petik tajam di semua ukuran; warna badge hijau-teal | | |
| C2 | Tidak ada error | `chrome://extensions` → tombol **Errors** di kartu extension | Tidak ada error merah setelah semua uji | | |
| C3 | Halaman khusus | Buka `chrome://extensions`, klik ikon | Popup: "Halaman ini tidak bisa dipindai" | | |
| C4 | Paket Web Store | `python tools/package.py`, ekstrak `dist/petik-1.0.0.zip` ke folder baru, Load unpacked folder itu | Extension termuat tanpa error dan berfungsi sama (uji A1 cepat) | | |
