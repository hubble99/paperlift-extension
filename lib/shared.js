// Fungsi bersama untuk service worker dan popup (ES module).
// Content script tidak bisa import, jadi fungsi kecil yang dibutuhkan di sana diduplikasi.

export const tabKey = (tabId) => `tab:${tabId}`;

export function emptyTabState() {
  return { topUrl: null, frames: {}, network: {}, status: {}, job: null };
}

export function stripHash(url) {
  const i = url.indexOf('#');
  return i < 0 ? url : url.slice(0, i);
}

export function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

/**
 * Gabungkan hasil deteksi (DOM tiap frame + webRequest) jadi satu daftar tanpa duplikat.
 * `frames` = daftar frameId yang bisa dipakai untuk fetch fallback, urutan prioritas.
 */
export function mergePdfs(st) {
  const map = new Map();
  const add = (url, filename, frames, source) => {
    let e = map.get(url);
    if (!e) {
      e = { url, filename: null, frames: [], sources: [] };
      map.set(url, e);
    }
    if (filename && !e.filename) e.filename = filename;
    for (const f of frames) {
      if (Number.isInteger(f) && f >= 0 && !e.frames.includes(f)) e.frames.push(f);
    }
    if (!e.sources.includes(source)) e.sources.push(source);
  };

  // Hasil jaringan duluan: frame yang benar-benar meminta file paling cocok untuk fallback.
  for (const n of Object.values(st.network || {})) {
    add(n.url, n.filename, [n.frameId, n.parentFrameId], 'network');
  }
  // Frame yang memuat viewer pdf.js sendiri ("pdfjs-self") lebih diutamakan daripada induknya.
  const reports = Object.entries(st.frames || {}).flatMap(([fid, fr]) =>
    (fr.pdfs || []).map((p) => ({ ...p, frameId: Number(fid) })));
  reports.sort((a, b) => (a.kind === 'pdfjs-self' ? -1 : 0) - (b.kind === 'pdfjs-self' ? -1 : 0));
  for (const p of reports) add(p.url, p.filename, [p.frameId], p.kind);

  return [...map.values()];
}

/** Ambil deck slide terbesar di antara semua frame. */
export function bestDeck(st) {
  let best = null;
  for (const [fid, fr] of Object.entries(st.frames || {})) {
    if (fr.deck && fr.deck.count > 0 && (!best || fr.deck.count > best.deck.count)) {
      best = { frameId: Number(fid), deck: fr.deck };
    }
  }
  return best;
}

// ---------- Nama file ----------

export function filenameFromContentDisposition(cd) {
  if (!cd) return null;
  // RFC 5987: filename*=UTF-8''nama%20file.pdf
  let m = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(cd);
  if (m) {
    try { return decodeURIComponent(m[2].trim().replace(/^"|"$/g, '')); } catch { /* lanjut */ }
  }
  m = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(cd) || /filename\s*=\s*([^;]+)/i.exec(cd);
  if (!m) return null;
  let v = m[1].trim().replace(/\\(.)/g, '$1');
  if (/%[0-9a-f]{2}/i.test(v)) {
    try { v = decodeURIComponent(v); } catch { /* biarkan apa adanya */ }
  }
  return v || null;
}

/** Nama file dari path URL, hanya jika berakhiran .pdf (selain itu biasanya "download", "view", dst.). */
export function filenameFromUrl(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    let s = seg;
    try { s = decodeURIComponent(seg); } catch { /* biarkan */ }
    return /\.pdf$/i.test(s) ? s : null;
  } catch {
    return null;
  }
}

/** Nama dasar tanpa karakter terlarang dan tanpa .pdf; bisa kosong. */
function cleanBase(name) {
  let s = String(name || '').normalize('NFC');
  s = s.replace(/[\u0000-\u001f\u007f<>:"/\\|?*​-‏‪-‮⁦-⁩﻿]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\.pdf$/i, '');
  s = s.replace(/^[.\s~]+|[.\s]+$/g, '');
  if (!s) return '';
  // Nama terlarang di Windows (CON, NUL, COM1, ...), juga jika diikuti titik.
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(s)) s = '_' + s;
  if (s.length > 150) s = s.slice(0, 150).replace(/[.\s]+$/, '');
  return s;
}

/** Buang karakter yang dilarang Windows/macOS/Chrome, lalu pastikan berakhiran .pdf. */
export function sanitizeFilename(name, fallback = 'dokumen') {
  return (cleanBase(name) || fallback) + '.pdf';
}

/** Urutan: Content-Disposition / atribut download → path URL → judul halaman. */
export function resolvePdfName(entry, pageTitle) {
  for (const raw of [entry.filename, filenameFromUrl(entry.url), pageTitle]) {
    const base = cleanBase(raw);
    if (base) return base + '.pdf';
  }
  return 'dokumen.pdf';
}
