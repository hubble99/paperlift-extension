// Popup PDF Grabber: menampilkan isi state tab aktif dan mengirim perintah ke service worker.
// Semua pekerjaan berat berjalan di service worker, jadi menutup popup tidak menghentikannya.

import { tabKey, emptyTabState, mergePdfs, bestDeck, hostOf, resolvePdfName } from '../lib/shared.js';

const $ = (id) => document.getElementById(id);
let tab = null;
let currentDeck = null;

const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

function renderPdfs(st) {
  const pdfs = mergePdfs(st);
  const list = $('pdf-list');
  list.replaceChildren();
  $('pdf-count').textContent = pdfs.length ? `(${pdfs.length})` : '';
  $('pdf-empty').hidden = pdfs.length > 0;
  $('dl-all').hidden = pdfs.length < 2;

  for (const p of pdfs) {
    const name = resolvePdfName(p, tab.title);
    const status = st.status?.[p.url];

    const li = el('li', { class: 'item' });
    const body = el('div', { class: 'item-body' });
    body.append(el('div', { class: 'item-name', title: p.url }, name));
    const meta = el('div', { class: 'item-meta' });
    meta.append(document.createTextNode(hostOf(p.url)));
    if (status) {
      meta.append(document.createTextNode(' · '));
      meta.append(el('span', { class: status.state }, status.text));
    }
    body.append(meta);

    const btn = el('button', { class: 'btn' }, 'Download');
    btn.disabled = status?.state === 'working';
    btn.addEventListener('click', () => send({ type: 'download', tabId: tab.id, url: p.url }));

    li.append(body, btn);
    list.append(li);
  }
}

function renderSlides(st) {
  const best = bestDeck(st);
  currentDeck = best;
  const job = st.job;
  $('slide-section').hidden = !best && !job;
  if (!best && !job) return;

  const deck = best?.deck;
  $('slide-count').textContent = deck ? deck.count : 0;

  const thumbs = $('thumbs');
  thumbs.replaceChildren();
  for (const t of deck?.thumbs || []) {
    const src = t.dataUrl || t.url;
    if (src) {
      const img = el('img', { class: 'thumb', alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.src = src;
      img.addEventListener('error', () => img.replaceWith(el('div', { class: 'thumb thumb-blank' }, '—')));
      thumbs.append(img);
    } else {
      thumbs.append(el('div', { class: 'thumb thumb-blank' }, t.tainted ? 'tidak bisa diambil' : '—'));
    }
  }
  if (deck && deck.count > (deck.thumbs || []).length) {
    thumbs.append(el('span', { class: 'more' }, `+${deck.count - deck.thumbs.length}`));
  }

  const notes = [];
  if (deck?.tainted) notes.push(`${deck.tainted} canvas tidak bisa diambil (dilewati).`);
  if (deck?.pending) notes.push(`${deck.pending} gambar belum dimuat — URL aslinya tetap akan diambil.`);
  $('slide-note').textContent = notes.join(' ');
  $('slide-note').hidden = !notes.length;

  const running = job?.state === 'running';
  $('merge').disabled = !deck || running;
  $('load-all').disabled = !deck || running;

  const prog = $('slide-progress');
  prog.hidden = !job;
  if (job) {
    prog.textContent = job.text || '';
    prog.className = 'small' + (job.state === 'error' ? ' error' : '');
  }
}

async function refresh() {
  const key = tabKey(tab.id);
  const st = (await chrome.storage.session.get(key))[key] || emptyTabState();
  try { tab = await chrome.tabs.get(tab.id); } catch { /* tab ditutup */ }
  renderPdfs(st);
  renderSlides(st);

  const scannable = /^(https?|file):/i.test(tab.url || '');
  const hint = $('hint');
  if (!scannable) {
    hint.textContent = 'Halaman ini tidak bisa dipindai oleh extension.';
    hint.hidden = false;
  } else if (!mergePdfs(st).length && !bestDeck(st)) {
    hint.textContent = 'Baru memasang atau memuat ulang extension? Muat ulang halaman ini dulu.';
    hint.hidden = false;
  } else {
    hint.hidden = true;
  }
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  $('host').textContent = hostOf(tab.url || '');

  $('dl-all').addEventListener('click', () => send({ type: 'download-all', tabId: tab.id }));
  $('merge').addEventListener('click', () => {
    if (currentDeck) send({ type: 'slides-merge', tabId: tab.id, frameId: currentDeck.frameId });
  });
  $('load-all').addEventListener('click', () => {
    if (currentDeck) send({ type: 'slides-load-all', tabId: tab.id, frameId: currentDeck.frameId });
  });

  let pending = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes[tabKey(tab.id)]) return;
    clearTimeout(pending);
    pending = setTimeout(refresh, 80);
  });

  await refresh();
  // Minta semua frame memindai ulang (mis. canvas yang baru selesai digambar).
  chrome.tabs.sendMessage(tab.id, { type: 'rescan' }).catch(() => {});
}

init();
