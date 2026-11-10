# Kebijakan Privasi Paperlift

*Berlaku sejak 10 November 2026*

Paperlift adalah extension Chrome untuk menemukan dan menyimpan PDF yang sudah dimuat di
halaman, serta menggabungkan slide berbentuk gambar menjadi PDF.

## Ringkasnya
**Paperlift tidak mengumpulkan, menyimpan di server, menjual, atau membagikan data Anda.**
Semua proses berjalan di dalam browser Anda sendiri.

## Data yang diproses
- **Alamat (URL) PDF dan gambar slide di halaman yang Anda buka.** Dipakai untuk menampilkan
  daftar di popup. Disimpan sementara di memori sesi browser (`chrome.storage.session`) dan
  otomatis terhapus saat tab ditutup, pindah halaman, atau browser ditutup.
- **Header respons jaringan** (jenis file dan nama file) dibaca untuk mengenali file PDF.
  Paperlift hanya mengamati; tidak mengubah, memblokir, atau mengirim ulang request.
- **Isi file PDF/gambar** yang Anda pilih untuk diunduh atau digabung. Isi ini diambil dari
  server situs tersebut (dengan cookie browser Anda, seperti saat halaman memuatnya), lalu
  langsung disimpan ke folder Downloads Anda.

## Yang tidak dilakukan
- Tidak ada analytics, pelacakan, iklan, atau akun.
- Tidak ada data yang dikirim ke server pengembang atau pihak ketiga.
- Tidak membaca kata sandi, isi formulir, atau riwayat penelusuran.
- Tidak memuat kode dari luar extension.

## Permission
| Permission | Kegunaan |
|---|---|
| `storage` | Menyimpan daftar PDF/slide per tab di memori sesi |
| `webRequest` | Mengenali respons berjenis PDF (hanya mengamati) |
| `downloads` | Menyimpan file ke folder Downloads |
| `offscreen` | Menyusun file sebelum disimpan (misalnya PDF dari slide) |
| Akses ke semua situs | PDF dan gambar bisa berasal dari domain mana saja |

## Kontak
Pertanyaan atau laporan: buka *issue* di
https://github.com/hubble99/pptx-downloader-extension/issues

---

# Paperlift Privacy Policy (English)

Paperlift does **not** collect, transmit, sell, or share any personal data. All processing
happens locally in your browser. URLs of PDFs and slide images on pages you visit are kept
temporarily in session memory to show them in the popup and are cleared when the tab closes
or navigates. Response headers are observed (never modified) to recognize PDF files. File
contents you choose to download are fetched from the original site and saved directly to your
Downloads folder. No analytics, tracking, ads, accounts, remote code, or third-party servers.
Contact: https://github.com/hubble99/pptx-downloader-extension/issues
