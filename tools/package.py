"""Membuat paket .zip untuk diunggah ke Chrome Web Store.

Hanya file yang dibutuhkan extension yang dimasukkan (tanpa tests/, tools/, store/, dokumen).
Jalankan dari root proyek:
    python tools/package.py
Hasil: dist/paperlift-<versi>.zip
"""
import json
import os
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INCLUDE_DIRS = ["background", "content", "offscreen", "popup", "lib", "vendor", "icons"]
INCLUDE_FILES = ["manifest.json", "LICENSE"]
SKIP_EXT = {".md"}  # lisensi pdf-lib tetap disertakan, lihat di bawah
KEEP = {"vendor/pdf-lib.LICENSE.md"}


def referenced_files(manifest):
    """Semua file yang disebut manifest harus ada di paket."""
    refs = {manifest["background"]["service_worker"], manifest["action"]["default_popup"]}
    refs |= set(manifest["icons"].values()) | set(manifest["action"]["default_icon"].values())
    for cs in manifest.get("content_scripts", []):
        refs |= set(cs.get("js", [])) | set(cs.get("css", []))
    return refs


def main():
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    version = manifest["version"]

    files = list(INCLUDE_FILES)
    for d in INCLUDE_DIRS:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            for n in sorted(names):
                rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, "/")
                if os.path.splitext(n)[1].lower() in SKIP_EXT and rel not in KEEP:
                    continue
                files.append(rel)

    missing = sorted(r for r in referenced_files(manifest) if r not in files)
    if missing:
        sys.exit("File yang disebut manifest tidak ada: " + ", ".join(missing))
    if len(manifest.get("description", "")) > 132:
        sys.exit("Deskripsi manifest lebih dari 132 karakter (batas Web Store).")

    out_dir = os.path.join(ROOT, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"paperlift-{version}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in sorted(files):
            z.write(os.path.join(ROOT, rel), rel)
    size = os.path.getsize(out) / 1024
    print(f"dibuat dist/paperlift-{version}.zip  ({len(files)} file, {size:.0f} KB)")


if __name__ == "__main__":
    main()
