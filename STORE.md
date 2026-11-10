# Panduan Upload ke Chrome Web Store

## 1. Siapkan akun developer
1. Buka https://chrome.google.com/webstore/devconsole dan login dengan akun Google.
2. Bayar biaya pendaftaran sekali (USD 5) dan lengkapi profil developer (nama, email kontak terverifikasi).

## 2. Buat paket
```
python tools/package.py
```
Hasil: `dist/paperlift-<versi>.zip`. Hanya berisi file extension (tanpa tests, tools, dokumen).
Setiap update: naikkan `version` di `manifest.json`, buat paket lagi, unggah di item yang sama.

Aset grafis bisa dibuat ulang setelah mengubah logo atau popup:
```
node tools/render-assets.mjs        (Node 20: tambah --experimental-websocket)
```

## 3. Unggah
Devconsole → **New item** → pilih zip → isi tab-tab berikut.

### Tab "Store listing"
| Kolom | Isi |
|---|---|
| Nama | (otomatis dari manifest) **Paperlift — Save PDFs & Slides** |
| Ringkasan | (otomatis dari manifest) Temukan dan simpan PDF yang sudah dimuat di halaman, juga gabungkan slide berbentuk gambar menjadi satu PDF. |
| Kategori | Productivity → Tools |
| Bahasa | Indonesia |
| Ikon | `icons/icon128.png` |
| Screenshot (1280×800) | `store/screenshot-1.png`, `store/screenshot-2.png`, `store/screenshot-3.png` |
| Small promo tile (440×280) | `store/promo-440x280.png` |
| Homepage / Support URL | https://github.com/hubble99/pptx-downloader-extension |

**Deskripsi** (salin):

```
Paperlift membantu Anda menyimpan PDF yang sudah tampil di halaman, tetapi tombol unduhnya disembunyikan. Misalnya materi kursus yang ditampilkan lewat viewer pdf.js.

FITUR
• Deteksi otomatis: iframe viewer pdf.js (?file=), <embed>/<object>, link .pdf, dan file PDF yang dimuat halaman.
• Satu klik untuk mengunduh, atau "Download semua".
• Cara cadangan saat server menolak unduhan langsung (403): file diambil lewat halaman asalnya, dengan sesi login Anda.
• Slide berbentuk gambar? Paperlift mengenali deretan slide, bisa memuat semuanya (lazy-load), lalu menggabungkannya menjadi satu PDF dalam resolusi terbesar yang tersedia.
• Nama file rapi dan aman untuk Windows, macOS, dan Linux.
• Tampilan minimal, mendukung mode gelap.

PRIVASI
Tanpa akun, tanpa iklan, tanpa pelacakan. Semua proses berjalan lokal di browser; tidak ada data yang dikirim ke server pengembang.

BATASAN
• Hanya untuk materi yang memang bisa Anda akses. Paperlift tidak membongkar DRM atau enkripsi.
• Tidak mendukung viewer yang tidak pernah mengirim file PDF utuh (mis. Scribd, FlipHTML5).
• PDF hasil gabungan slide berisi gambar; teksnya tidak bisa disalin.

Open source: https://github.com/hubble99/pptx-downloader-extension
```

### Tab "Privacy practices"
**Single purpose** (salin):
> Menemukan PDF dan slide berbentuk gambar yang sudah dimuat di halaman yang sedang dibuka pengguna, lalu menyimpannya sebagai file PDF di komputer pengguna.

**Alasan permission** (salin per kolom):

| Permission | Justifikasi |
|---|---|
| `storage` | Menyimpan daftar PDF dan slide yang terdeteksi per tab di chrome.storage.session agar popup bisa menampilkannya. Data hilang saat tab/browser ditutup. |
| `webRequest` | Mengamati header respons (Content-Type, Content-Disposition) untuk mengenali file PDF yang dimuat halaman, misalnya oleh viewer pdf.js. Hanya mengamati; tidak memblokir atau mengubah request. |
| `downloads` | Menyimpan PDF yang dipilih pengguna ke folder Downloads dan memeriksa apakah unduhan berhasil, agar bisa mencoba cara cadangan bila gagal. |
| `offscreen` | Service worker tidak bisa membuat blob URL. Offscreen document dipakai untuk menyusun file (PDF hasil gabungan slide, atau PDF yang diambil lewat halaman) sebelum diserahkan ke chrome.downloads. |
| Host permission `<all_urls>` | PDF dan gambar slide bisa berada di domain mana saja (sering di CDN terpisah dari situs utama). Dibutuhkan agar content script bisa memindai semua frame (termasuk iframe viewer lintas domain) dan agar webRequest bisa mengenali respons PDF. |

**Remote code**: *No, I am not using remote code.* (pdf-lib disertakan di dalam paket.)

**Data usage**: jangan centang kategori data apa pun (Paperlift tidak mengumpulkan data).
Centang ketiga pernyataan sertifikasi (tidak menjual data, tidak dipakai untuk tujuan lain,
tidak untuk menilai kelayakan kredit).

**Privacy policy URL**:
https://github.com/hubble99/pptx-downloader-extension/blob/main/PRIVACY.md

### Tab "Distribution"
- Visibility: **Public** (atau *Unlisted* dulu bila ingin uji terbatas lewat tautan).
- Regions: semua wilayah.

## 4. Kirim untuk review
Klik **Submit for review**. Catatan:
- Permission akses ke semua situs + `webRequest` biasanya membuat review lebih lama
  (beberapa hari sampai beberapa minggu).
- Reviewer menilai risiko pelanggaran hak cipta. Deskripsi di atas sengaja menegaskan:
  hanya untuk materi yang bisa diakses pengguna, dan tidak membongkar DRM. Jangan
  menyebut situs tertentu sebagai target, dan jangan memakai logo/merek situs lain di screenshot.
- Jika ditolak, email penolakan menyebut alasan dan pasal kebijakannya. Perbaiki, naikkan versi, kirim ulang.
