<p align="center"><img src="brand/logo.svg" width="88" alt="Logo Paperlift"></p>

<h1 align="center">Paperlift</h1>
<p align="center">Simpan PDF &amp; slide dari halaman web dengan satu klik.</p>

Paperlift adalah Chrome extension (Manifest V3) untuk mengunduh PDF yang **sudah dimuat** di
halaman tetapi tombol download-nya disembunyikan. Contohnya course player yang menampilkan
PDF lewat iframe pdf.js. Paperlift juga bisa menggabungkan slide yang ditampilkan sebagai
gambar menjadi satu PDF.

![Tampilan Paperlift](store/screenshot-1.png)

> Hanya untuk materi yang memang bisa Anda akses, untuk pemakaian pribadi.
> Paperlift tidak membongkar DRM atau enkripsi.

## Instalasi

**Dari Chrome Web Store:** cari "Paperlift", lalu klik *Add to Chrome*. Tautan akan
ditambahkan setelah lolos review.

**Manual (developer mode):**
1. Unduh atau clone repo ini.
2. Buka `chrome://extensions`.
3. Aktifkan **Developer mode** (pojok kanan atas).
4. Klik **Load unpacked**, lalu pilih folder yang berisi `manifest.json`.
5. (Opsional) Sematkan ikon lewat ikon puzzle 🧩 di toolbar.

Butuh Chrome 116 atau lebih baru. Tab yang sudah terbuka **sebelum** extension dipasang
atau di-reload harus dimuat ulang dulu.

## Cara pakai

### PDF
1. Buka halaman yang menampilkan PDF.
2. Angka di ikon extension (badge) menunjukkan jumlah PDF yang terdeteksi.
3. Klik ikon. Popup menampilkan nama file dan domain tiap PDF.
4. Klik **Download** pada satu item, atau **Download semua** (muncul jika ada ≥2 PDF).
   Status muncul di bawah nama: *Mengunduh…*, *Tersimpan*, atau *Gagal: …*.

Yang dideteksi:
- iframe/embed viewer pdf.js dengan parameter `?file=` (URL-nya otomatis di-decode),
- `<embed>` / `<object>` bertipe `application/pdf` atau berakhiran `.pdf`,
- link `<a href>` yang berakhiran `.pdf`,
- semua respons jaringan dengan `Content-Type: application/pdf` di tab tersebut.

Hasil yang sama dari beberapa sumber hanya ditampilkan sekali. Daftar dihapus saat tab
ditutup atau pindah halaman.

### Slide berbentuk gambar
Jika halaman menampilkan ≥3 gambar/canvas besar berurutan dengan rasio yang sama,
popup menampilkan **Slide terdeteksi: N halaman** beserta thumbnail kecil.

- **Muat semua slide**: halaman di-scroll otomatis sampai jumlah slide berhenti bertambah
  (maksimal 30 detik), lalu posisi scroll dikembalikan. Pakai ini untuk halaman yang
  memuat slide sambil di-scroll (lazy-load).
- **Gabung jadi PDF**: tiap gambar diambil dalam resolusi terbesar yang tersedia, lalu
  disusun menjadi satu PDF (satu gambar per halaman, ukuran halaman = ukuran gambar).
  Nama file = judul halaman + `.pdf`. Progres tampil sebagai *Memproses 12/40*.
  Popup boleh ditutup; prosesnya tetap berjalan.

## Cara kerja download

1. **Langsung**: `chrome.downloads.download`. Browser mengirim cookie Anda.
2. **Lewat halaman**: jika cara 1 gagal (mis. 403) atau server membalas halaman HTML,
   file di-fetch dari dalam frame tempat PDF itu dimuat, sehingga cookie dan *Referer*
   sama seperti saat halaman membukanya. Data diteruskan ke extension dan disimpan.
3. **Lewat extension**: upaya terakhir. Fetch dari konteks extension, yang tidak terkena
   aturan CORS tetapi juga tidak membawa Referer halaman.

Nama file diambil dari header `Content-Disposition`, lalu dari path URL (jika berakhiran
`.pdf`), lalu dari judul halaman. Karakter yang tidak boleh dipakai di nama file dibuang.

## Istilah singkat

| Istilah | Arti sederhana |
|---|---|
| **pdf.js** | Penampil PDF berbasis JavaScript yang dipakai banyak situs |
| **iframe** | Halaman kecil di dalam halaman |
| **Referer** | Header berisi alamat halaman asal permintaan; sebagian server menolak permintaan tanpa Referer yang "benar" |
| **403 Forbidden** | Server menolak memberikan file |
| **CORS** | Aturan browser yang membatasi halaman membaca file dari domain lain |
| **Canvas tainted** | Canvas yang pernah digambari gambar dari domain lain tanpa izin, sehingga isinya tidak boleh dibaca |
| **Lazy-load** | Gambar baru dimuat saat di-scroll mendekatinya |
| **Service worker** | Bagian extension yang berjalan di latar belakang |
| **Offscreen document** | Halaman tersembunyi milik extension untuk membuat file sebelum disimpan |

## Permission

| Permission | Alasan |
|---|---|
| `storage` | Menyimpan daftar PDF/slide per tab di memori sesi (hilang saat browser ditutup) |
| `webRequest` | Hanya **mengamati** header respons untuk mengenali file PDF; tidak mengubah atau memblokir apa pun |
| `downloads` | Menyimpan file ke folder Downloads dan mengecek hasilnya |
| `offscreen` | Membuat file (blob) untuk disimpan dan menyusun PDF dari slide; service worker tidak bisa melakukannya sendiri |
| `<all_urls>` | PDF dan gambar bisa berasal dari domain mana saja (mis. CDN terpisah dari situs kursus) |

## Batasan

- **Tidak mendukung viewer yang tidak pernah mengirim file PDF utuh**, misalnya Scribd,
  FlipHTML5, Issuu, atau slide yang dirender sebagai potongan gambar/canvas dengan cara
  khusus. Fitur "slide gambar" hanya bekerja jika tiap halaman adalah satu gambar/canvas utuh.
- **Tidak membongkar DRM atau enkripsi.** PDF terenkripsi diunduh apa adanya.
- **Hasil "Gabung jadi PDF" berupa gambar.** Teks di dalamnya tidak bisa di-copy, dicari,
  atau diedit.
- Canvas yang *tainted* tidak bisa diambil dan dilewati (nomor halamannya ditampilkan).
  Canvas WebGL bisa menghasilkan halaman kosong.
- Carousel yang hanya memuat slide berikutnya saat tombol "Next" diklik tidak ikut termuat
  oleh **Muat semua slide**. Klik sampai slide terakhir dulu secara manual.
- URL `blob:` / `data:` di parameter `?file=` tidak dideteksi sebagai PDF.
- Halaman `chrome://`, Chrome Web Store, dan file lokal (tanpa izin "Allow access to file URLs")
  tidak bisa dipindai.

## Troubleshooting

### Gagal: server menolak akses (403)
1. Pastikan Anda masih login dan PDF tampil normal di halaman. Muat ulang halaman, lalu coba lagi.
2. Extension otomatis mencoba cara 2 (fetch dari frame asal). Jika tetap 403, kemungkinan:
   - URL-nya bertanda tangan dan sudah kedaluwarsa (umum di CDN). Muat ulang halaman supaya
     viewer meminta URL baru, lalu langsung klik Download.
   - Server memeriksa hal lain selain cookie/Referer (token di header khusus). Situs seperti
     ini tidak didukung.
3. Buka `chrome://extensions` → Paperlift → **service worker** (tautan "Inspect views")
   → tab Console. Pesan `download langsung gagal, mencoba fallback` menunjukkan alasan cara 1 gagal.

### PDF tidak muncul di daftar
- Muat ulang halaman (wajib setelah memasang/me-reload extension).
- Buka PDF-nya dulu di halaman (beberapa player baru memuat file saat materi dibuka).
- Jika PDF dimuat sebelum extension aktif, deteksi jaringan tidak sempat mencatatnya.
  Muat ulang halaman.

### Gagal: diblokir server (CORS/jaringan)
Frame asal tidak diizinkan membaca file, dan fetch dari extension juga ditolak. Coba
buka halaman viewer-nya langsung di tab baru (klik kanan iframe → buka frame), lalu ulangi.

### Slide tidak terdeteksi
- Slide harus tampil cukup besar (lebar ≥300 px) dan minimal 3 buah. Perbesar jendela.
- Gambar yang dipisahkan paragraf teks dianggap galeri/artikel, bukan slide.
- Klik **Muat semua slide**, lalu buka popup lagi.

## Privasi

Tanpa akun, tanpa iklan, tanpa pelacakan. Semua proses berjalan lokal di browser.
Lihat [PRIVACY.md](PRIVACY.md).

## Pengembangan

| Perintah | Fungsi |
|---|---|
| `python tests/server.py` | Server uji lokal di http://127.0.0.1:8000/ (lihat [TESTING.md](TESTING.md)) |
| `python tools/package.py` | Membuat `dist/paperlift-<versi>.zip` untuk Chrome Web Store |
| `node tools/render-assets.mjs` | Merender ikon, screenshot, dan promo tile dari `brand/logo.svg` (butuh Chrome; Node 20 tambah `--experimental-websocket`) |

Panduan upload ke Web Store, termasuk teks listing dan alasan tiap permission, ada di [STORE.md](STORE.md).

## Merek

| | |
|---|---|
| Nama | **Paperlift**: "mengangkat" lembar kertas (PDF dan slide) dari halaman web |
| Logo | `brand/logo.svg`: lembar kertas yang terangkat dari halaman, dengan sudut terlipat dan panah unduh (`brand/logo-small.svg` untuk ikon kecil) |
| Warna utama | Hijau-teal tua `#24524F` |
| Aksen | Terakota `#E08A5F` (dipakai hemat) |
| Kertas | `#F7F4EE` |

## Lisensi pihak ketiga
- [pdf-lib](https://pdf-lib.js.org/) 1.17.1 — MIT, lihat `vendor/pdf-lib.LICENSE.md`.
