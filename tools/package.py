"""Build the release .zip (attached to GitHub releases; also valid for the Chrome Web Store).

Only runtime files are included (no tests/, tools/, store/ or docs).
Run from the project root:
    python tools/package.py
Output: dist/paperlift-<version>.zip
"""
import json
import os
import sys
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INCLUDE_DIRS = ["background", "content", "offscreen", "popup", "lib", "vendor", "icons"]
INCLUDE_FILES = ["manifest.json", "LICENSE"]
SKIP_EXT = {".md"}  # the pdf-lib license is still included, see KEEP
KEEP = {"vendor/pdf-lib.LICENSE.md"}


def referenced_files(manifest):
    """Every file the manifest refers to must be in the package."""
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
        sys.exit("Files referenced by the manifest are missing: " + ", ".join(missing))
    if len(manifest.get("description", "")) > 132:
        sys.exit("Manifest description is longer than 132 characters (Web Store limit).")

    out_dir = os.path.join(ROOT, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"paperlift-{version}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in sorted(files):
            z.write(os.path.join(ROOT, rel), rel)
    size = os.path.getsize(out) / 1024
    print(f"wrote dist/paperlift-{version}.zip  ({len(files)} files, {size:.0f} KB)")


if __name__ == "__main__":
    main()
