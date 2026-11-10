// Popup Petik: menampilkan state tab aktif dan mengirim perintah ke service worker.
// Pekerjaan berat berjalan di service worker, jadi menutup popup tidak menghentikannya.
// Tombol langsung bereaksi saat diklik (spinner) tanpa menunggu balasan service worker.

import { tabKey, emptyTabState, mergePdfs, bestDeck, hostOf, resolvePdfName } from '../lib/shared.js';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

const ICON_DL = '<svg class="ico-dl" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7.5M4.5 7 8 10.5 11.5 7M3 13h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CHECK = '<svg class="ico-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_FILE = '<svg class="file-ico" viewBox="0 0 28 32" aria-hidden="true"><path d="M5 1.5h12l8 8V28a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 3 28V4A2.5 2.5 0 0 1 5 1.5z" style="fill:var(--ink-soft)" stroke="currentColor" stroke-width="1.3"/><path d="M17 1.5V7a2.5 2.5 0 0 0 2.5 2.5H25" style="fill:var(--accent)" stroke="currentColor" stroke-width="1.3"/><text x="14" y="23" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" font-family="system-ui,sans-serif">PDF</text></svg>';

let tab = null;
let currentDeck = null;
const rows = new Map(); // url → { li, name, host, status, btn, prev, optimistic, doneTimer }

/** Atur tampilan tombol: idle | busy | done | error. */
function setBtn(btn, state, label) {
  btn.dataset.state = state;
  if (label != null) btn.querySelector('.label').textContent = label;
  btn.setAttribute('aria-busy', state === 'busy' ? 'true' : 'false');
}

// ---------------- Daftar PDF ----------------

function createRow(p) {
  const li = document.createElement('li');
  li.className = 'item enter';
  li.innerHTML = `${ICON_FILE}
    <div class="item-body">
      <div class="item-name"></div>
      <div class="item-meta"><span class="host-name"></span><span class="status" aria-live="polite"></span></div>
    </div>
    <button class="btn btn-sm"><span class="spinner" aria-hidden="true"></span>${ICON_DL}${ICON_CHECK}<span class="label">Download</span></button>`;
  const row = {
    li,
    name: li.querySelector('.item-name'),
    host: li.querySelector('.host-name'),
    status: li.querySelector('.status'),
    btn: li.querySelector('button'),
    prev: null,
    optimistic: 0,
    doneTimer: null,
  };
  row.btn.addEventListener('click', () => {
    row.optimistic = Date.now();
    setBtn(row.btn, 'busy', 'Mengunduh');
    send({ type: 'download', tabId: tab.id, url: p.url });
    setTimeout(refresh, 1600); // kalau service worker tidak membalas, kembalikan tombol
  });
  li.addEventListener('animationend', () => li.classList.remove('enter', 'flash'));
  return row;
}

function updateRow(row, p, status) {
  const name = resolvePdfName(p, tab.title);
  row.name.textContent = name;
  row.name.title = `${name}\n${p.url}`;
  row.host.textContent = hostOf(p.url);

  // Status dari service worker menggantikan status optimis begitu tiba.
  if (status?.state === 'working') row.optimistic = 0;
  const optimistic = row.optimistic && Date.now() - row.optimistic < 1500;
  const state = optimistic ? 'working' : status?.state || null;

  row.status.className = 'status' + (state ? ` ${state}` : '');
  row.status.textContent = optimistic ? '· Mengunduh…' : status ? `· ${status.text}` : '';

  if (state === 'working') {
    clearTimeout(row.doneTimer);
    setBtn(row.btn, 'busy', 'Mengunduh');
  } else if (state === 'done' && row.prev === 'working') {
    // Baru saja selesai → beri tanda centang sebentar.
    setBtn(row.btn, 'done', 'Tersimpan');
    row.li.classList.add('flash');
    clearTimeout(row.doneTimer);
    row.doneTimer = setTimeout(() => setBtn(row.btn, 'idle', 'Download'), 1800);
  } else if (state === 'error') {
    setBtn(row.btn, 'error', 'Coba lagi');
  } else if (row.btn.dataset.state !== 'done') {
    setBtn(row.btn, 'idle', 'Download');
  }
  row.prev = state;
}

function renderPdfs(st, scannable) {
  const pdfs = scannable ? mergePdfs(st) : [];
  const list = $('pdf-list');
  const seen = new Set();

  pdfs.forEach((p, i) => {
    let row = rows.get(p.url);
    if (!row) { row = createRow(p); rows.set(p.url, row); }
    updateRow(row, p, st.status?.[p.url]);
    if (list.children[i] !== row.li) list.insertBefore(row.li, list.children[i] || null);
    seen.add(p.url);
  });
  for (const [url, row] of rows) {
    if (!seen.has(url)) { row.li.remove(); rows.delete(url); }
  }

  const count = $('pdf-count');
  count.hidden = !pdfs.length;
  count.textContent = pdfs.length;
  $('dl-all').hidden = pdfs.length < 2;
  $('pdf-empty').hidden = pdfs.length > 0;

  if (!scannable) {
    $('empty-title').textContent = 'Halaman ini tidak bisa dipindai';
    $('empty-sub').textContent = 'Halaman bawaan Chrome dan Web Store tidak bisa diakses extension.';
  } else {
    $('empty-title').textContent = 'Tidak ada PDF terdeteksi';
    $('empty-sub').textContent = 'Buka PDF di halaman ini dan Petik akan menampilkannya di sini. Baru memasang Petik? Muat ulang halaman dulu.';
  }
}

// ---------------- Slide ----------------

let lastThumbs = '';

function renderThumbs(deck) {
  const key = JSON.stringify([deck?.count, deck?.thumbs]);
  if (key === lastThumbs) return;
  lastThumbs = key;
  const thumbs = $('thumbs');
  thumbs.replaceChildren();
  for (const t of deck?.thumbs || []) {
    const src = t.dataUrl || t.url;
    if (src) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = src;
      img.addEventListener('error', () => {
        const blank = document.createElement('div');
        blank.className = 'thumb thumb-blank';
        blank.textContent = '—';
        img.replaceWith(blank);
      });
      thumbs.append(img);
    } else {
      const blank = document.createElement('div');
      blank.className = 'thumb thumb-blank';
      blank.textContent = t.tainted ? 'tidak bisa diambil' : '—';
      thumbs.append(blank);
    }
  }
  if (deck && deck.count > (deck.thumbs || []).length) {
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = `+${deck.count - deck.thumbs.length}`;
    thumbs.append(more);
  }
}

function renderSlides(st, scannable) {
  const best = scannable ? bestDeck(st) : null;
  currentDeck = best;
  const job = st.job;
  $('slide-section').hidden = !best && !job;
  if (!best && !job) return;

  const deck = best?.deck;
  $('slide-count').textContent = deck ? deck.count : 0;
  renderThumbs(deck);

  const notes = [];
  if (deck?.tainted) notes.push(`${deck.tainted} canvas tidak bisa diambil dan akan dilewati.`);
  if (deck?.pending) notes.push(`${deck.pending} gambar belum dimuat, tetapi tetap ikut diambil.`);
  $('slide-note').textContent = notes.join(' ');
  $('slide-note').hidden = !notes.length;

  const running = job?.state === 'running';
  const merge = $('merge');
  const loadAll = $('load-all');
  const mergeBusy = running && job.kind === 'merge';
  const loadBusy = running && job.kind === 'load';
  setBtn(merge, mergeBusy ? 'busy' : 'idle', mergeBusy ? 'Memproses' : 'Gabung jadi PDF');
  setBtn(loadAll, loadBusy ? 'busy' : 'idle', loadBusy ? 'Memuat' : 'Muat semua slide');
  merge.disabled = !deck || (running && !mergeBusy);
  loadAll.disabled = !deck || (running && !loadBusy);

  const prog = $('progress');
  prog.hidden = !job;
  if (job) {
    const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
    prog.className = 'progress' +
      (running && (job.kind === 'load' || !job.total) ? ' indeterminate' : '') +
      (job.state === 'done' ? ' done' : '') +
      (job.state === 'error' ? ' error' : '');
    $('bar-fill').style.width = job.state === 'running' ? `${pct}%` : '100%';
    $('slide-progress').textContent = job.text || '';
  }
}

// ---------------- Siklus ----------------

async function refresh() {
  if (!tab) return;
  const key = tabKey(tab.id);
  const st = (await chrome.storage.session.get(key))[key] || emptyTabState();
  try { tab = await chrome.tabs.get(tab.id); } catch { /* tab ditutup */ }
  const scannable = /^(https?|file):/i.test(tab.url || '');
  $('host').textContent = scannable ? hostOf(tab.url) : '';
  renderPdfs(st, scannable);
  renderSlides(st, scannable);
}

/** Klik tombol aksi besar: langsung tampak sibuk, status sebenarnya menyusul dari storage. */
function pressAction(btn, label, msg) {
  if (btn.dataset.state === 'busy') return;
  setBtn(btn, 'busy', label);
  send(msg);
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  $('dl-all').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    pressAction(btn, 'Memulai', { type: 'download-all', tabId: tab.id });
    for (const row of rows.values()) { row.optimistic = Date.now(); setBtn(row.btn, 'busy', 'Mengunduh'); }
    setTimeout(() => { setBtn(btn, 'idle', 'Download semua'); refresh(); }, 1200);
  });
  $('merge').addEventListener('click', (e) => {
    if (currentDeck) pressAction(e.currentTarget, 'Memproses', { type: 'slides-merge', tabId: tab.id, frameId: currentDeck.frameId });
  });
  $('load-all').addEventListener('click', (e) => {
    if (currentDeck) pressAction(e.currentTarget, 'Memuat', { type: 'slides-load-all', tabId: tab.id, frameId: currentDeck.frameId });
  });

  let pending = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes[tabKey(tab.id)]) return;
    clearTimeout(pending);
    pending = setTimeout(refresh, 60);
  });

  await refresh();
  // Minta semua frame memindai ulang (mis. canvas yang baru selesai digambar).
  chrome.tabs.sendMessage(tab.id, { type: 'rescan' }).catch(() => {});
}

init();
