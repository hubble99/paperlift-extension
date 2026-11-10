"""Membuat ikon placeholder PDF Grabber (16/32/48/128 px).

Hanya memakai pustaka standar Python. Jalankan dari root proyek:
    python tools/make_icons.py
Gambar: kotak bersudut bulat warna slate, halaman putih, panah unduh.
"""
import os
import struct
import zlib

BG = (91, 107, 122)      # slate tenang
PAGE = (250, 250, 248)
ARROW = (91, 107, 122)
SS = 4                   # supersampling agar tepi halus


def inside_rounded_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def inside_page(x, y):
    x0, y0, x1, y1, fold = 0.28, 0.17, 0.72, 0.83, 0.14
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    # potong sudut kanan atas (lipatan kertas)
    return (x1 - x) + (y - y0) >= fold


def inside_arrow(x, y):
    if 0.455 <= x <= 0.545 and 0.33 <= y <= 0.56:
        return True
    # kepala panah: segitiga dengan alas y=0.50, puncak y=0.71
    if 0.50 <= y <= 0.71:
        half = 0.15 * (0.71 - y) / 0.21
        return abs(x - 0.5) <= half
    return False


def pixel(x, y):
    """Warna RGBA untuk titik (x, y) dalam koordinat 0..1."""
    if not inside_rounded_rect(x, y, 0.04, 0.04, 0.96, 0.96, 0.22):
        return (0, 0, 0, 0)
    if inside_page(x, y):
        return (*ARROW, 255) if inside_arrow(x, y) else (*PAGE, 255)
    return (*BG, 255)


def render(size):
    rows = []
    for py in range(size):
        row = bytearray([0])  # filter byte PNG
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size
                    y = (py + (sy + 0.5) / SS) / size
                    r, g, b, a = pixel(x, y)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            n = SS * SS
            a = acc[3]
            if a:
                row += bytes([acc[0] // a, acc[1] // a, acc[2] // a, a // n])
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = os.path.join(out, f"icon{size}.png")
        with open(path, "wb") as f:
            f.write(png(size, render(size)))
        print("dibuat", os.path.normpath(path))


if __name__ == "__main__":
    main()
