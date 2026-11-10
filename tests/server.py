"""Server uji lokal Paperlift (hanya pustaka standar Python).

Jalankan dari root proyek:
    python tests/server.py
lalu buka http://127.0.0.1:8000/

Rute penting:
  /pages/*.html                 halaman uji
  /files/<nama>.pdf             PDF contoh (nama bebas)
  /cd/<nama>.pdf                PDF dengan Content-Disposition bernama aneh
  /protected/<nama>.pdf         403 kecuali ada Referer dari situs uji (dibuka langsung = 403)
  /viewer/web/viewer.html?file= tiruan viewer pdf.js (memuat file via fetch)
  /slide/<n>.png?w=960&h=540    gambar slide bernomor (dibuat otomatis)
Host kedua http://localhost:8000 dipakai sebagai "domain lain" (uji lintas domain).
"""
import colorsys
import os
import struct
import zlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8000


def make_pdf(label):
    """PDF satu halaman yang valid (offset xref dihitung)."""
    text = label.replace("\\", "").replace("(", "").replace(")", "")[:80]
    stream = f"BT /F1 24 Tf 72 720 Td (Paperlift - {text}) Tj ET".encode("latin-1", "replace")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def make_slide_png(n, w, h):
    """Slide polos berwarna; nomor slide ditandai dengan n kotak putih di kiri atas."""
    r, g, b = (int(c * 255) for c in colorsys.hsv_to_rgb((n * 0.13) % 1, 0.35, 0.75))
    bg = bytes([r, g, b])
    white = b"\xff\xff\xff"
    box, gap, pad = max(8, w // 40), max(4, w // 120), max(10, w // 30)
    per_row = max(1, (w - 2 * pad) // (box + gap))
    rows_of_boxes = (n + per_row - 1) // per_row
    rows = []
    for y in range(h):
        line = bytearray(bg * w)
        rel = y - pad
        if rel >= 0:
            br, within = divmod(rel, box + gap)
            if br < rows_of_boxes and within < box:
                count = min(per_row, n - br * per_row)
                for i in range(count):
                    x0 = pad + i * (box + gap)
                    line[x0 * 3:(x0 + box) * 3] = white * box
        # garis bawah sebagai penanda kemajuan
        if y > h - pad and y < h - pad // 2:
            line[pad * 3:(pad + (w - 2 * pad) * min(n, 60) // 60) * 3] = white * ((w - 2 * pad) * min(n, 60) // 60)
        rows.append(b"\x00" + bytes(line))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 6)) + chunk(b"IEND", b""))


VIEWER_HTML = """<!doctype html><meta charset="utf-8"><title>viewer (tiruan pdf.js)</title>
<style>body{font:14px system-ui;margin:16px;color:#333}</style>
<p>Tiruan viewer pdf.js. File: <code id="f"></code></p><p id="s">Memuat…</p>
<script>
const file = new URLSearchParams(location.search).get('file');
document.getElementById('f').textContent = file;
fetch(new URL(file, location.href), {credentials: 'include'})
  .then(r => r.ok ? r.arrayBuffer().then(b => 'Termuat: ' + b.byteLength + ' byte') : 'HTTP ' + r.status)
  .catch(e => 'Gagal: ' + e)
  .then(t => document.getElementById('s').textContent = t);
</script>"""


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        ref = self.headers.get("Referer", "-")
        print(f"{self.command} {self.path} -> {args[1] if len(args) > 1 else ''}  (Referer: {ref})")

    def send_bytes(self, body, ctype, extra=None, status=200):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin")
        if origin:  # CORS untuk viewer di domain lain (seperti cdn.thinkific.com)
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Expose-Headers", "Content-Disposition")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        name = os.path.basename(p)
        if p == "/":
            return self.redirect("/pages/index.html")
        if p.startswith("/files/") and p.lower().endswith(".pdf"):
            return self.send_bytes(make_pdf(name), "application/pdf")
        if p.startswith("/cd/"):
            weird = "Laporan Q1 – \"Final\": revisi*2 <ok>?.pdf"
            from urllib.parse import quote
            # inline (bukan attachment) supaya iframe tidak langsung memicu download
            cd = f"inline; filename=\"laporan.pdf\"; filename*=UTF-8''{quote(weird)}"
            return self.send_bytes(make_pdf("Content-Disposition"), "application/pdf",
                                   {"Content-Disposition": cd})
        if p.startswith("/protected/"):
            # Seperti CDN yang memeriksa hotlink: wajib ada Referer dari situs uji.
            # (Iframe lintas domain hanya mengirim origin, mis. "http://localhost:8000/".)
            ref = self.headers.get("Referer", "")
            if ref.startswith(("http://localhost:8000/", "http://127.0.0.1:8000/")):
                return self.send_bytes(make_pdf("terlindungi " + name), "application/pdf")
            return self.send_bytes(b"403 Forbidden: Referer tidak valid", "text/plain", status=403)
        if p == "/viewer/web/viewer.html":
            return self.send_bytes(VIEWER_HTML.encode(), "text/html; charset=utf-8")
        if p.startswith("/slide/") and p.endswith(".png"):
            q = parse_qs(u.query)
            try:
                n = int(name[:-4])
                w = min(2000, int(q.get("w", ["960"])[0]))
                h = min(2000, int(q.get("h", ["540"])[0]))
            except ValueError:
                return self.send_error(400)
            return self.send_bytes(make_slide_png(n, w, h), "image/png",
                                   {"Cache-Control": "max-age=3600"})
        return super().do_GET()

    def redirect(self, to):
        self.send_response(302)
        self.send_header("Location", to)
        self.end_headers()


if __name__ == "__main__":
    print(f"Server uji: http://127.0.0.1:{PORT}/   (domain kedua: http://localhost:{PORT}/)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
