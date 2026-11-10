// Helpers shared by the service worker and the popup (ES module).
// Content scripts can't use import, so the few helpers needed there are duplicated.

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
 * Merge detection results (each frame's DOM + webRequest) into one list without duplicates.
 * `frames` = frame IDs that can be used for the fallback fetch, in priority order.
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

  // Network results first: the frame that actually requested the file is the best fallback.
  for (const n of Object.values(st.network || {})) {
    add(n.url, n.filename, [n.frameId, n.parentFrameId], 'network');
  }
  // A frame that is the pdf.js viewer itself ("pdfjs-self") wins over its parent.
  const reports = Object.entries(st.frames || {}).flatMap(([fid, fr]) =>
    (fr.pdfs || []).map((p) => ({ ...p, frameId: Number(fid) })));
  reports.sort((a, b) => (a.kind === 'pdfjs-self' ? -1 : 0) - (b.kind === 'pdfjs-self' ? -1 : 0));
  for (const p of reports) add(p.url, p.filename, [p.frameId], p.kind);

  return [...map.values()];
}

/** Return the largest slide deck across all frames. */
export function bestDeck(st) {
  let best = null;
  for (const [fid, fr] of Object.entries(st.frames || {})) {
    if (fr.deck && fr.deck.count > 0 && (!best || fr.deck.count > best.deck.count)) {
      best = { frameId: Number(fid), deck: fr.deck };
    }
  }
  return best;
}

// ---------- File names ----------

export function filenameFromContentDisposition(cd) {
  if (!cd) return null;
  // RFC 5987: filename*=UTF-8''file%20name.pdf
  let m = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(cd);
  if (m) {
    try { return decodeURIComponent(m[2].trim().replace(/^"|"$/g, '')); } catch { /* fall through */ }
  }
  m = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(cd) || /filename\s*=\s*([^;]+)/i.exec(cd);
  if (!m) return null;
  let v = m[1].trim().replace(/\\(.)/g, '$1');
  if (/%[0-9a-f]{2}/i.test(v)) {
    try { v = decodeURIComponent(v); } catch { /* keep as is */ }
  }
  return v || null;
}

/** File name from the URL path, only if it ends in .pdf (otherwise it's usually "download", "view", etc.). */
export function filenameFromUrl(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    let s = seg;
    try { s = decodeURIComponent(seg); } catch { /* keep as is */ }
    return /\.pdf$/i.test(s) ? s : null;
  } catch {
    return null;
  }
}

/** Base name without forbidden characters or .pdf; may be empty. */
function cleanBase(name) {
  let s = String(name || '').normalize('NFC');
  s = s.replace(/[\u0000-\u001f\u007f<>:"/\\|?*​-‏‪-‮⁦-⁩﻿]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\.pdf$/i, '');
  s = s.replace(/^[.\s~]+|[.\s]+$/g, '');
  if (!s) return '';
  // Reserved names on Windows (CON, NUL, COM1, ...), also when followed by a dot.
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(s)) s = '_' + s;
  if (s.length > 150) s = s.slice(0, 150).replace(/[.\s]+$/, '');
  return s;
}

/** Remove characters Windows/macOS/Chrome don't allow, and make sure it ends in .pdf. */
export function sanitizeFilename(name, fallback = 'document') {
  return (cleanBase(name) || fallback) + '.pdf';
}

/** Order: Content-Disposition / download attribute → URL path → page title. */
export function resolvePdfName(entry, pageTitle) {
  for (const raw of [entry.filename, filenameFromUrl(entry.url), pageTitle]) {
    const base = cleanBase(raw);
    if (base) return base + '.pdf';
  }
  return 'document.pdf';
}
