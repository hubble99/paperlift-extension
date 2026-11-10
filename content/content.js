// Content script Petik. Berjalan di SETIAP frame (all_frames: true).
// Tugas:
//  1. Memindai DOM untuk PDF (iframe pdf.js ?file=, <embed>/<object>, link .pdf).
//  2. Mendeteksi "mode slide" (kumpulan gambar/canvas besar berurutan).
//  3. Melaporkan hasil ke service worker (frame-report).
//  4. Atas permintaan service worker: fetch file dari frame ini (supaya cookie/Referer
//     sama seperti halaman), mengambil gambar slide, dan memuat semua slide via scroll.
// File ini tidak bisa memakai `import`, jadi harus berdiri sendiri.

(() => {
  if (globalThis.__petikLoaded) return;
  globalThis.__petikLoaded = true;

  // ---------------- Utilitas ----------------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isHttp = (u) => /^https?:/i.test(u || '');
  const stripHash = (u) => { const i = u.indexOf('#'); return i < 0 ? u : u.slice(0, i); };

  function toAbs(u, base = document.baseURI) {
    if (!u) return null;
    try { return new URL(u.trim(), base).href; } catch { return null; }
  }

  function pathIsPdf(u) {
    try { return /\.pdf$/i.test(new URL(u).pathname); } catch { return false; }
  }

  function safeSend(msg) {
    try {
      // Setelah extension di-reload, content script lama kehilangan koneksi → abaikan.
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch { /* konteks extension sudah tidak valid */ }
  }

  /** URL viewer pdf.js (…/viewer.html?file=<url>) → URL PDF aslinya (sudah di-decode). */
  function pdfFromViewerUrl(src) {
    let url;
    try { url = new URL(src, document.baseURI); } catch { return null; }
    let file = url.searchParams.get('file'); // searchParams sudah men-decode satu kali
    if (!file) return null;
    if (/^https?%3A/i.test(file)) {
      try { file = decodeURIComponent(file); } catch { /* biarkan */ }
    }
    const abs = toAbs(file, url.href);
    if (!abs || !isHttp(abs)) return null;
    const looksViewer = /pdf\.?js|\/web\/viewer|viewer\.html/i.test(url.pathname);
    return looksViewer || pathIsPdf(abs) ? abs : null;
  }

  const selfViewerPdf = pdfFromViewerUrl(location.href);
  const isPdfJsFrame = () => !!selfViewerPdf || !!document.querySelector('#viewerContainer .pdfViewer');

  // ---------------- 1. Deteksi PDF ----------------

  function scanPdfs() {
    const found = new Map();
    const add = (url, kind, filename) => {
      if (!url || !isHttp(url)) return;
      url = stripHash(url);
      if (!found.has(url)) found.set(url, { url, kind, filename: filename || null });
    };

    if (document.contentType === 'application/pdf') add(location.href, 'self');
    if (selfViewerPdf) add(selfViewerPdf, 'pdfjs-self');

    for (const f of document.querySelectorAll('iframe[src], frame[src]')) {
      const src = f.getAttribute('src');
      const viaViewer = pdfFromViewerUrl(src);
      if (viaViewer) add(viaViewer, 'pdfjs');
      else { const abs = toAbs(src); if (abs && pathIsPdf(abs)) add(abs, 'iframe'); }
    }

    for (const e of document.querySelectorAll('embed, object')) {
      const src = e.getAttribute(e.tagName === 'OBJECT' ? 'data' : 'src');
      const abs = toAbs(src);
      if (!abs) continue;
      const type = (e.getAttribute('type') || '').toLowerCase();
      const viaViewer = pdfFromViewerUrl(abs);
      if (viaViewer) add(viaViewer, 'pdfjs');
      else if (type === 'application/pdf' || pathIsPdf(abs)) add(abs, 'embed');
    }

    for (const a of document.querySelectorAll('a[href]')) {
      const abs = toAbs(a.getAttribute('href'));
      if (abs && pathIsPdf(abs)) add(abs, 'link', a.getAttribute('download'));
    }

    return [...found.values()];
  }

  // ---------------- 2. Deteksi slide ----------------

  const SKIP_RE = /(logo|avatar|icon|emoji|sprite|badge|gravatar|profile-pic|userpic)/i;
  const LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-url',
    'data-hi-res-src', 'data-full', 'data-full-src', 'data-zoom-src'];
  const STATE_CLASS_RE = /active|current|selected|visible|show|hidden|loaded|loading|lazy|fade|in-view/i;

  /** Parser srcset sederhana (sesuai spesifikasi HTML): kembalikan [{url, score}]. */
  function parseSrcset(s, base) {
    const out = [];
    if (!s) return out;
    let i = 0;
    const n = s.length;
    while (i < n) {
      while (i < n && /[\s,]/.test(s[i])) i++;
      if (i >= n) break;
      let j = i;
      while (j < n && !/\s/.test(s[j])) j++;
      let url = s.slice(i, j);
      let desc = '';
      if (url.endsWith(',')) {
        url = url.replace(/,+$/, '');
        i = j;
      } else {
        let k = j;
        while (k < n && s[k] !== ',') k++;
        desc = s.slice(j, k).trim();
        i = k + 1;
      }
      let score = 1;
      const m = /^([\d.]+)([wx])$/i.exec(desc);
      if (m) score = m[2].toLowerCase() === 'w' ? Number(m[1]) : Number(m[1]) * 1e6;
      const abs = toAbs(url, base);
      if (abs) out.push({ url: abs, score });
    }
    return out;
  }

  const isDataPlaceholder = (u) => /^data:/i.test(u || '') && u.length < 2000;

  /** Resolusi terbesar: srcset terbesar > data-src/data-original > src. */
  function bestImageUrl(img) {
    const cands = [];
    for (const attr of ['srcset', 'data-srcset']) cands.push(...parseSrcset(img.getAttribute(attr)));
    if (img.parentElement?.tagName === 'PICTURE') {
      for (const s of img.parentElement.querySelectorAll('source')) {
        for (const attr of ['srcset', 'data-srcset']) cands.push(...parseSrcset(s.getAttribute(attr)));
      }
    }
    const real = cands.filter((c) => !isDataPlaceholder(c.url)).sort((a, b) => b.score - a.score);
    if (real.length) return real[0].url;
    for (const attr of LAZY_ATTRS) {
      const v = img.getAttribute(attr);
      if (v && !isDataPlaceholder(v)) return toAbs(v);
    }
    const cur = img.currentSrc || toAbs(img.getAttribute('src'));
    return cur || null;
  }

  function imgLoaded(img) {
    return img.complete && img.naturalWidth > 1 && !isDataPlaceholder(img.currentSrc || img.src);
  }

  /** Info ukuran sebuah kandidat. ratio = null kalau belum diketahui (gambar lazy belum dimuat). */
  function measure(el) {
    const rect = el.getBoundingClientRect();
    const attrW = Number(el.getAttribute('width')) || 0;
    const attrH = Number(el.getAttribute('height')) || 0;
    let w = 0, h = 0, pending = false;
    if (el.tagName === 'CANVAS') {
      w = el.width; h = el.height;
    } else if (imgLoaded(el)) {
      w = el.naturalWidth; h = el.naturalHeight;
    } else {
      pending = true;
      if (attrW && attrH) { w = attrW; h = attrH; }
    }
    return { rect, w, h, ratio: w && h ? w / h : null, pending };
  }

  function isCandidate(el, m) {
    const hint = [el.id, el.className && String(el.className), el.getAttribute('alt'),
      el.getAttribute('src')].join(' ');
    if (SKIP_RE.test(hint)) return false;
    // Ditampilkan kecil (thumbnail/ikon) → bukan slide utama.
    if (m.rect.width > 0 && m.rect.width < 300) return false;
    // Tersembunyi (mis. slide carousel lain): pakai ukuran asli/atribut.
    if (m.rect.width === 0) {
      const w = m.w || Number(el.getAttribute('width')) || 0;
      if (w && w < 300) return false;
      if (!w && !m.pending) return false;
    }
    if (m.pending && el.tagName === 'IMG') {
      const u = bestImageUrl(el);
      if (!u || isDataPlaceholder(u)) return false;
    }
    return true;
  }

  /** Tanda struktur: elemen dalam satu daftar slide punya pola induk yang sama. */
  function signature(el) {
    const parts = [el.tagName];
    let p = el.parentElement;
    for (let d = 0; d < 3 && p && p !== document.body; d++, p = p.parentElement) {
      const cls = [...p.classList].filter((c) => !/\d/.test(c) && !STATE_CLASS_RE.test(c)).sort();
      parts.push(p.tagName + (cls.length ? '.' + cls.join('.') : ''));
    }
    return parts.join('<');
  }

  /** Ada teks berarti (>40 karakter) di antara dua elemen? Berarti bukan slide berurutan. */
  function textBetween(a, b) {
    try {
      const r = document.createRange();
      r.setStartAfter(a);
      r.setEndBefore(b);
      return r.toString().replace(/\s+/g, ' ').trim().length > 40;
    } catch {
      return true;
    }
  }

  function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  }

  /** Cari nomor halaman: atribut data-*, lalu teks alt/aria/title, lalu nama file. */
  const PAGE_ATTRS = ['data-page', 'data-page-number', 'data-page-index', 'data-slide',
    'data-slide-number', 'data-slide-index', 'data-index'];
  function numberBySource(el, url, source) {
    if (source === 'attr') {
      for (let e = el, d = 0; e && d < 4; e = e.parentElement, d++) {
        for (const a of PAGE_ATTRS) {
          const v = e.getAttribute?.(a);
          if (v != null && /^\s*\d+\s*$/.test(v)) return Number(v);
        }
      }
      return null;
    }
    if (source === 'text') {
      const t = [el.getAttribute('alt'), el.getAttribute('aria-label'), el.getAttribute('title')].join(' ');
      const m = /(?:slide|page|halaman|hal\.?|p\.)\s*#?\s*(\d+)/i.exec(t);
      return m ? Number(m[1]) : null;
    }
    if (source === 'file' && url && !/^data:/i.test(url)) {
      try {
        const name = new URL(url).pathname.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
        const nums = name.match(/\d+/g);
        return nums ? Number(nums[nums.length - 1]) : null;
      } catch { return null; }
    }
    return null;
  }

  /** Urutkan pakai nomor halaman jika konsisten (semua ada, unik, kira-kira berurutan). */
  function orderMembers(members) {
    for (const source of ['attr', 'text', 'file']) {
      const nums = members.map((m) => numberBySource(m.el, m.url, source));
      if (nums.some((n) => n == null)) continue;
      const uniq = new Set(nums);
      if (uniq.size !== nums.length) continue;
      const min = Math.min(...nums), max = Math.max(...nums);
      if (max - min >= nums.length * 2) continue; // terlalu acak → kemungkinan hash, bukan nomor
      const sorted = members.map((m, i) => ({ m, n: nums[i] })).sort((a, b) => a.n - b.n).map((x) => x.m);
      return { members: sorted, ordering: source };
    }
    return { members, ordering: 'dom' };
  }

  /** Deteksi deck slide terbaik di frame ini. Kembalikan null jika tidak ada. */
  function detectDeck() {
    if (isPdfJsFrame()) return null; // halaman pdf.js dirender ke canvas; itu PDF, bukan slide
    const groups = new Map();
    for (const el of document.querySelectorAll('img, canvas')) {
      const m = measure(el);
      if (!isCandidate(el, m)) continue;
      const url = el.tagName === 'IMG' ? bestImageUrl(el) : null;
      const sig = signature(el);
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push({ el, url, ...m });
    }

    let best = null;
    for (const list of groups.values()) {
      // Pecah menjadi "run" yang tidak dipisahkan teks.
      const runs = [];
      let cur = [];
      for (const item of list) {
        if (cur.length && textBetween(cur[cur.length - 1].el, item.el)) { runs.push(cur); cur = []; }
        cur.push(item);
      }
      if (cur.length) runs.push(cur);

      for (const run of runs) {
        const med = median(run.filter((x) => x.ratio).map((x) => x.ratio));
        const members = run.filter((x) => !x.ratio || Math.abs(x.ratio - med) / med <= 0.05);
        const known = members.filter((x) => x.ratio).length;
        const ok = known >= 3 || (known >= 1 && members.length >= 3);
        if (!ok) continue;
        const width = Math.max(...members.map((x) => x.rect.width || x.w || 0));
        if (!best || members.length > best.members.length ||
            (members.length === best.members.length && width > best.width)) {
          best = { members, width };
        }
      }
    }
    if (!best) return null;
    return orderMembers(best.members);
  }

  // Canvas "tainted" = pernah digambari gambar lintas domain tanpa izin CORS, sehingga
  // isinya tidak boleh dibaca. Status ini permanen, jadi hanya hasil tainted yang di-cache.
  const taintedCanvases = new WeakSet();
  function canvasThumb(canvas) {
    if (taintedCanvases.has(canvas)) return { tainted: true };
    try {
      const t = document.createElement('canvas');
      t.width = 96;
      t.height = Math.max(1, Math.round(96 * (canvas.height / canvas.width || 0.5625)));
      t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
      return { dataUrl: t.toDataURL('image/jpeg', 0.7) };
    } catch {
      taintedCanvases.add(canvas);
      return { tainted: true };
    }
  }

  function deckSummary(deck) {
    if (!deck) return null;
    const { members, ordering } = deck;
    let tainted = 0;
    const thumbs = [];
    members.forEach((m, i) => {
      if (m.el.tagName === 'CANVAS') {
        const t = canvasThumb(m.el);
        if (t.tainted) tainted++;
        if (i < 6) thumbs.push(t);
      } else if (i < 6) {
        const src = imgLoaded(m.el) ? m.el.currentSrc || m.el.src : m.url;
        thumbs.push(src && src.length < 200000 ? { url: src } : {});
      }
    });
    return {
      count: members.length,
      canvas: members.filter((m) => m.el.tagName === 'CANVAS').length,
      pending: members.filter((m) => m.pending).length,
      tainted,
      ordering,
      thumbs,
    };
  }

  // ---------------- 3. Laporan ke service worker ----------------

  const EMPTY = JSON.stringify({ pdfs: [], deck: null });
  let lastSent = EMPTY;

  function report(force = false) {
    let payload;
    try {
      payload = { pdfs: scanPdfs(), deck: deckSummary(detectDeck()) };
    } catch (e) {
      console.warn('[Petik] gagal memindai', e);
      return;
    }
    const s = JSON.stringify(payload);
    // Paksa kirim (setelah state tab di-reset) hanya kalau ada isinya.
    if (force ? s === EMPTY : s === lastSent) return;
    lastSent = s;
    safeSend({ type: 'frame-report', url: location.href, ...payload });
  }

  // Debounce: tunggu DOM tenang 800 ms, tapi paling lama 3 detik.
  let timer = null, firstPending = 0;
  function schedule() {
    const now = Date.now();
    if (!firstPending) firstPending = now;
    clearTimeout(timer);
    const wait = now - firstPending > 3000 ? 0 : 800;
    timer = setTimeout(() => { firstPending = 0; report(); }, wait);
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset', 'href', 'data', 'type'],
  });
  // Gambar selesai dimuat → ukuran aslinya baru diketahui.
  document.addEventListener('load', (e) => { if (e.target?.tagName === 'IMG') schedule(); }, true);
  report();

  // ---------------- 4. Fetch dari frame asal ----------------

  const fetched = new Map(); // id → Blob
  const CHUNK = 4 * 1024 * 1024;

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).slice(String(fr.result).indexOf(',') + 1));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  async function looksLikePdf(blob) {
    const head = await blob.slice(0, 1024).text();
    return head.includes('%PDF-');
  }

  async function fetchStart(url) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
      const blob = await res.blob();
      if (!(await looksLikePdf(blob))) {
        return { ok: false, reason: 'Isi respons bukan PDF (mungkin halaman login).' };
      }
      const id = Math.random().toString(36).slice(2);
      fetched.set(id, blob);
      return {
        ok: true, id, size: blob.size,
        contentDisposition: res.headers.get('content-disposition'),
      };
    } catch (e) {
      // Biasanya CORS: server tidak mengizinkan domain frame ini membaca file.
      return { ok: false, reason: String(e && e.message || e) };
    }
  }

  async function fetchChunk(id, offset) {
    const blob = fetched.get(id);
    if (!blob) return { ok: false, reason: 'Data sudah dibuang.' };
    const b64 = await blobToBase64(blob.slice(offset, offset + CHUNK));
    return { ok: true, b64, next: Math.min(offset + CHUNK, blob.size) };
  }

  // ---------------- 5. Ambil gambar slide ----------------

  let mergeDeck = null; // snapshot deck saat "Gabung jadi PDF" dimulai

  function collectDeck() {
    const deck = detectDeck();
    mergeDeck = deck ? deck.members : [];
    return {
      count: mergeDeck.length,
      title: document.title,
      pages: mergeDeck.map((m) => ({ kind: m.el.tagName === 'CANVAS' ? 'canvas' : 'img', url: m.url })),
    };
  }

  async function slideBytes(index) {
    const m = mergeDeck?.[index];
    if (!m) return { ok: false, reason: 'Halaman tidak ditemukan.' };
    if (m.el.tagName === 'CANVAS') {
      try {
        const d = m.el.toDataURL('image/png');
        return { ok: true, b64: d.slice(d.indexOf(',') + 1), mime: 'image/png' };
      } catch {
        return { ok: false, tainted: true, reason: 'tidak bisa diambil (canvas tainted)' };
      }
    }
    try {
      const res = await fetch(m.url, { credentials: 'include' });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const blob = await res.blob();
      return { ok: true, b64: await blobToBase64(blob), mime: blob.type };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }

  // ---------------- 6. Muat semua slide (scroll otomatis) ----------------

  let loadingAll = false;

  function isScrollable(el) {
    if (!el || el === document.body) return false;
    if (el === document.scrollingElement) return true;
    const oy = getComputedStyle(el).overflowY;
    return /(auto|scroll|overlay)/.test(oy) && el.scrollHeight > el.clientHeight + 4;
  }

  function scrollContainerOf(el) {
    for (let p = el?.parentElement; p; p = p.parentElement) if (isScrollable(p)) return p;
    return document.scrollingElement || document.documentElement;
  }

  async function stepScroll(el, deadline) {
    const root = el === document.scrollingElement;
    const view = root ? innerHeight : el.clientHeight;
    while (Date.now() < deadline) {
      const max = el.scrollHeight - view;
      if (el.scrollTop >= max - 2) break;
      el.scrollTop = Math.min(max, el.scrollTop + view * 0.8);
      await sleep(150);
    }
  }

  async function loadAll() {
    if (loadingAll) return;
    loadingAll = true;
    const deadline = Date.now() + 30000;
    const saved = new Map();
    const remember = (el) => { if (el && !saved.has(el)) saved.set(el, [el.scrollTop, el.scrollLeft]); };
    const root = document.scrollingElement || document.documentElement;
    remember(root);
    let lastSig = '';
    try {
      while (Date.now() < deadline) {
        const deck = detectDeck();
        const members = deck ? deck.members : [];
        for (const m of members) {
          if (Date.now() >= deadline) break;
          if (m.el.tagName === 'IMG' && imgLoaded(m.el)) continue;
          for (let p = m.el.parentElement; p; p = p.parentElement) if (isScrollable(p)) remember(p);
          m.el.scrollIntoView({ block: 'center', inline: 'nearest' });
          await sleep(150);
        }
        const container = scrollContainerOf(members[0]?.el);
        remember(container);
        await stepScroll(container, deadline);
        if (container !== root) await stepScroll(root, deadline);
        await sleep(700);
        const after = detectDeck();
        const list = after ? after.members : [];
        const sig = `${list.length}:${list.filter((m) => !m.pending).length}`;
        if (sig === lastSig) break; // jumlah tidak bertambah lagi
        lastSig = sig;
      }
    } finally {
      for (const [el, [top, left]] of saved) { el.scrollTop = top; el.scrollLeft = left; }
      loadingAll = false;
      lastSent = '';
      report();
      const d = detectDeck();
      safeSend({ type: 'load-all-done', count: d ? d.members.length : 0 });
    }
  }

  // ---------------- Pesan dari service worker ----------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'rescan':
        report(true);
        return false;
      case 'cs-fetch-start':
        fetchStart(msg.url).then(sendResponse);
        return true;
      case 'cs-fetch-chunk':
        fetchChunk(msg.id, msg.offset).then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) }));
        return true;
      case 'cs-fetch-release':
        fetched.delete(msg.id);
        sendResponse({ ok: true });
        return false;
      case 'cs-slides-collect':
        sendResponse(collectDeck());
        return false;
      case 'cs-slide-bytes':
        slideBytes(msg.index).then(sendResponse);
        return true;
      case 'cs-slides-load-all':
        loadAll();
        sendResponse({ started: true });
        return false;
      default:
        return false;
    }
  });
})();
