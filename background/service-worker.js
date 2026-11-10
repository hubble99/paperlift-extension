// Paperlift background service worker.
// - Stores detection results per tab in chrome.storage.session.
// - Records application/pdf responses via webRequest (observe-only).
// - Keeps the PDF count badge up to date.
// - Runs downloads (3 steps) and slide → PDF merging.
// Note: Chrome can stop an MV3 service worker at any time while idle,
// so everything important lives in storage, not in variables.

import {
  tabKey, emptyTabState, stripHash, mergePdfs,
  filenameFromContentDisposition, sanitizeFilename, resolvePdfName,
} from '../lib/shared.js';

const BADGE_COLOR = '#24524F'; // Paperlift brand color

// ---------------- Per-tab state ----------------

// One queue per tab so read-modify-write updates never overwrite each other.
const queues = new Map();

function withTab(tabId, fn) {
  const prev = queues.get(tabId) || Promise.resolve();
  const next = prev.then(async () => {
    const key = tabKey(tabId);
    const st = (await chrome.storage.session.get(key))[key] || emptyTabState();
    if ((await fn(st)) === false) return st; // false = nothing changed
    await chrome.storage.session.set({ [key]: st });
    await updateBadge(tabId, st);
    return st;
  }).catch((e) => console.warn('[Paperlift]', e));
  queues.set(tabId, next);
  return next;
}

function resetTab(st, topUrl) {
  const running = st.job && st.job.state === 'running' ? st.job : null;
  Object.assign(st, emptyTabState(), { topUrl, job: running });
}

async function updateBadge(tabId, st) {
  const n = mergePdfs(st).length;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
    await chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' });
  } catch { /* tab already closed */ }
}

// After a reset (navigation, including SPAs), ask every frame to report again.
const rescanTimers = new Map();
function scheduleRescan(tabId) {
  clearTimeout(rescanTimers.get(tabId));
  rescanTimers.set(tabId, setTimeout(() => {
    rescanTimers.delete(tabId);
    chrome.tabs.sendMessage(tabId, { type: 'rescan' }).catch(() => {});
  }, 700));
}

function setStatus(tabId, url, state, text) {
  return withTab(tabId, (st) => { st.status[url] = { state, text }; });
}

function setJob(tabId, job) {
  return withTab(tabId, (st) => { st.job = job; });
}

// ---------------- Tab lifecycle ----------------

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (!info.url) return;
  const url = stripHash(info.url);
  withTab(tabId, (st) => {
    if (st.topUrl === url) return false;
    resetTab(st, url);
    scheduleRescan(tabId);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  queues.delete(tabId);
  chrome.storage.session.remove(tabKey(tabId));
});

chrome.tabs.onReplaced.addListener((_added, removed) => {
  chrome.storage.session.remove(tabKey(removed));
});

// ---------------- webRequest: observe PDF responses ----------------

function headerMap(headers = []) {
  const m = {};
  for (const h of headers) m[h.name.toLowerCase()] = h.value || '';
  return m;
}

chrome.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (d.tabId < 0) return;
    const url = stripHash(d.url);
    const h = headerMap(d.responseHeaders);
    const ct = (h['content-type'] || '').toLowerCase();
    const cdName = filenameFromContentDisposition(h['content-disposition']);
    const isPdf = ct.includes('application/pdf') ||
      (ct.includes('octet-stream') && (/\.pdf$/i.test(new URL(url).pathname) || /\.pdf$/i.test(cdName || '')));

    if (d.type === 'main_frame') {
      // The tab's main document changed → drop the previous page's results.
      withTab(d.tabId, (st) => {
        if (st.topUrl !== url) { resetTab(st, url); scheduleRescan(d.tabId); }
        else if (!isPdf) return false;
      });
    }
    if (!isPdf || d.statusCode >= 400) return;
    withTab(d.tabId, (st) => {
      const prev = st.network[url];
      st.network[url] = {
        url,
        filename: cdName || prev?.filename || null,
        frameId: d.frameId,
        parentFrameId: d.parentFrameId,
      };
    });
  },
  { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame', 'object', 'xmlhttprequest', 'other'] },
  ['responseHeaders'],
);

// ---------------- Offscreen document ----------------
// The service worker has no URL.createObjectURL. The offscreen document is a hidden
// extension page that can create blob URLs and run pdf-lib.

const OFFSCREEN_URL = 'offscreen/offscreen.html';
let creatingOffscreen = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Create blob URLs for downloaded files and build PDFs from slide images.',
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

// Release a blob URL. If the offscreen document is already closed, the blob is gone too.
async function revokeBlob(url) {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) chrome.runtime.sendMessage({ target: 'offscreen', op: 'revoke', url }).catch(() => {});
}

async function off(msg) {
  await ensureOffscreen();
  try {
    return (await chrome.runtime.sendMessage({ target: 'offscreen', ...msg })) || { ok: false, error: 'No response.' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// ---------------- Download PDF ----------------
// Step 1: chrome.downloads.download directly (browser cookies are sent).
// Step 2: fetch from the content script in the original frame (same cookies + Referer as the page).
// Step 3: fetch from the offscreen document (extension origin, no CORS limits, no page Referer).

const dlKey = (id) => `dl:${id}`;

async function tabTitle(tabId) {
  try { return (await chrome.tabs.get(tabId)).title || ''; } catch { return ''; }
}

async function findEntry(tabId, url) {
  const key = tabKey(tabId);
  const st = (await chrome.storage.session.get(key))[key] || emptyTabState();
  return mergePdfs(st).find((p) => p.url === url) || { url, filename: null, frames: [], sources: [] };
}

async function downloadPdf(tabId, url) {
  const entry = await findEntry(tabId, url);
  const filename = resolvePdfName(entry, await tabTitle(tabId));
  await setStatus(tabId, url, 'working', 'Downloading…');
  try {
    const id = await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false });
    await chrome.storage.session.set({ [dlKey(id)]: { tabId, url, filename, stage: 'direct' } });
  } catch (e) {
    await fallbackDownload(tabId, url, filename, String(e && e.message || e));
  }
}

async function fallbackDownload(tabId, url, filename, why) {
  console.info('[Paperlift] direct download failed, trying fallback:', why);
  await setStatus(tabId, url, 'working', 'Trying via the page…');
  const entry = await findEntry(tabId, url);
  const frames = [...entry.frames];
  if (!frames.includes(0)) frames.push(0);

  let lastReason = why;
  for (const frameId of frames) {
    const r = await viaFrame(tabId, frameId, url);
    if (r.ok) return startBlobDownload(tabId, url, r.blobUrl, pickName(filename, entry, r.contentDisposition));
    lastReason = r.reason || lastReason;
  }

  await setStatus(tabId, url, 'working', 'Trying via the extension…');
  const r = await off({ op: 'fetch-pdf', url });
  if (r.ok) return startBlobDownload(tabId, url, r.blobUrl, pickName(filename, entry, r.contentDisposition));
  lastReason = r.error || lastReason;

  await setStatus(tabId, url, 'error', `Failed: ${friendly(lastReason)}`);
}

// If the first name only came from the page title, a Content-Disposition name is better.
function pickName(current, entry, cd) {
  const cdName = filenameFromContentDisposition(cd);
  return !entry.filename && cdName ? sanitizeFilename(cdName) : current;
}

function friendly(reason) {
  const s = String(reason || '');
  if (/403|FORBIDDEN/i.test(s)) return 'access denied by the server (403). See Troubleshooting in the README.';
  if (/401|UNAUTHORIZED/i.test(s)) return 'login required (401).';
  if (/Failed to fetch|NetworkError|CORS/i.test(s)) return 'blocked by the server (CORS/network).';
  if (/Could not establish connection|Receiving end/i.test(s)) return 'reload the page and try again.';
  return s.slice(0, 140);
}

async function viaFrame(tabId, frameId, url) {
  const send = (msg) => chrome.tabs.sendMessage(tabId, msg, { frameId });
  let start;
  try {
    start = await send({ type: 'cs-fetch-start', url });
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
  if (!start?.ok) return { ok: false, reason: start?.reason || 'fetch failed' };

  const key = crypto.randomUUID();
  try {
    let r = await off({ op: 'blob-begin', key });
    if (!r.ok) throw new Error(r.error);
    let offset = 0;
    do {
      const chunk = await send({ type: 'cs-fetch-chunk', id: start.id, offset });
      if (!chunk?.ok) throw new Error(chunk?.reason || 'could not read the data');
      r = await off({ op: 'blob-append', key, b64: chunk.b64 });
      if (!r.ok) throw new Error(r.error);
      offset = chunk.next;
    } while (offset < start.size);
    r = await off({ op: 'blob-end', key, type: 'application/pdf' });
    if (!r.ok) throw new Error(r.error);
    return { ok: true, blobUrl: r.blobUrl, contentDisposition: start.contentDisposition };
  } catch (e) {
    off({ op: 'blob-abort', key });
    return { ok: false, reason: String(e && e.message || e) };
  } finally {
    send({ type: 'cs-fetch-release', id: start.id }).catch(() => {});
  }
}

async function startBlobDownload(tabId, url, blobUrl, filename) {
  try {
    const id = await chrome.downloads.download({ url: blobUrl, filename, conflictAction: 'uniquify', saveAs: false });
    await chrome.storage.session.set({ [dlKey(id)]: { tabId, url, filename, stage: 'blob', blobUrl, slides: !url } });
  } catch (e) {
    revokeBlob(blobUrl);
    if (url) await setStatus(tabId, url, 'error', `Failed: ${friendly(e && e.message)}`);
    else throw e;
  }
}

// Download results are tracked through events, because the service worker may sleep meanwhile.
chrome.downloads.onChanged.addListener(async (delta) => {
  const state = delta.state?.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  const key = dlKey(delta.id);
  const rec = (await chrome.storage.session.get(key))[key];
  if (!rec) return;
  await chrome.storage.session.remove(key);

  if (rec.stage === 'blob') revokeBlob(rec.blobUrl);

  if (state === 'complete') {
    if (rec.stage === 'direct') {
      // Servers sometimes answer with an HTML page (login/error) and status 200.
      const [item] = await chrome.downloads.search({ id: delta.id });
      if (item && /html|text\/plain/i.test(item.mime || '')) {
        await chrome.downloads.removeFile(delta.id).catch(() => {});
        await chrome.downloads.erase({ id: delta.id }).catch(() => {});
        return fallbackDownload(rec.tabId, rec.url, rec.filename, `response was ${item.mime}, not a PDF`);
      }
    }
    if (rec.url) await setStatus(rec.tabId, rec.url, 'done', 'Saved');
    return;
  }

  const err = delta.error?.current || 'INTERRUPTED';
  if (rec.slides) {
    await setJob(rec.tabId, { kind: 'merge', state: 'error', text: `Couldn't save the PDF: ${friendly(err)}` });
  } else if (err === 'USER_CANCELED') {
    if (rec.url) await setStatus(rec.tabId, rec.url, 'error', 'Canceled');
  } else if (rec.stage === 'direct') {
    await fallbackDownload(rec.tabId, rec.url, rec.filename, err);
  } else if (rec.url) {
    await setStatus(rec.tabId, rec.url, 'error', `Failed: ${friendly(err)}`);
  }
});

async function downloadAll(tabId) {
  const key = tabKey(tabId);
  const st = (await chrome.storage.session.get(key))[key] || emptyTabState();
  for (const p of mergePdfs(st)) {
    await downloadPdf(tabId, p.url);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ---------------- Slides → PDF ----------------

async function mergeSlides(tabId, frameId) {
  const key = tabKey(tabId);
  const st0 = (await chrome.storage.session.get(key))[key];
  if (st0?.job?.state === 'running') return;

  const job = { kind: 'merge', state: 'running', done: 0, total: 0, text: 'Preparing…' };
  await setJob(tabId, job);
  const jobId = crypto.randomUUID();
  try {
    const info = await chrome.tabs.sendMessage(tabId, { type: 'cs-slides-collect' }, { frameId });
    if (!info?.count) throw new Error('The slides are no longer on the page.');
    const title = (await tabTitle(tabId)) || info.title || 'slides';
    const filename = sanitizeFilename(title, 'slides');

    let r = await off({ op: 'pdf-begin', jobId, title });
    if (!r.ok) throw new Error(r.error);

    const skipped = [];
    for (let i = 0; i < info.count; i++) {
      await setJob(tabId, { ...job, done: i, total: info.count, text: `Processing ${i + 1}/${info.count}` });
      const page = info.pages[i];
      let got = await chrome.tabs.sendMessage(tabId, { type: 'cs-slide-bytes', index: i }, { frameId })
        .catch((e) => ({ ok: false, reason: String(e) }));
      let res = { ok: false };
      if (got?.ok) {
        res = await off({ op: 'pdf-add', jobId, b64: got.b64, mime: got.mime });
      }
      // Cross-origin image without CORS → try fetching it from the extension context.
      if (!res.ok && page.kind === 'img' && page.url && !got?.tainted) {
        res = await off({ op: 'pdf-add', jobId, url: page.url });
      }
      if (!res.ok) skipped.push(i + 1);
    }
    if (skipped.length === info.count) throw new Error('None of the pages could be captured.');

    await setJob(tabId, { ...job, done: info.count, total: info.count, text: 'Building the PDF…' });
    r = await off({ op: 'pdf-end', jobId });
    if (!r.ok) throw new Error(r.error);
    await startBlobDownload(tabId, null, r.blobUrl, filename);

    const added = info.count - skipped.length;
    let text = `Done: ${added} ${added === 1 ? 'page' : 'pages'} → ${filename}`;
    if (skipped.length) text += `. Skipped (unreadable): page ${skipped.join(', ')}`;
    await setJob(tabId, { ...job, state: 'done', done: info.count, total: info.count, text });
  } catch (e) {
    off({ op: 'pdf-abort', jobId });
    await setJob(tabId, { ...job, state: 'error', text: `Failed: ${friendly(e && e.message || e)}` });
  }
}

async function loadAllSlides(tabId, frameId) {
  await setJob(tabId, { kind: 'load', state: 'running', text: 'Loading all slides (up to 30 seconds)…' });
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'cs-slides-load-all' }, { frameId });
  } catch (e) {
    await setJob(tabId, { kind: 'load', state: 'error', text: `Failed: ${friendly(e && e.message)}` });
  }
}

// ---------------- Messages ----------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;

  if (msg.type === 'frame-report') {
    const tabId = sender.tab?.id;
    if (tabId == null || tabId < 0) return false;
    const frameId = sender.frameId ?? 0;
    withTab(tabId, (st) => {
      const url = stripHash(msg.url || '');
      // Top frame reports a new URL (e.g. an SPA) → the page has changed.
      if (frameId === 0 && url && st.topUrl && st.topUrl !== url) {
        resetTab(st, url);
        scheduleRescan(tabId);
      }
      if (!st.topUrl && frameId === 0) st.topUrl = url;
      st.frames[frameId] = { pdfs: msg.pdfs || [], deck: msg.deck || null };
    });
    return false;
  }

  if (msg.type === 'load-all-done') {
    const tabId = sender.tab?.id;
    if (tabId != null) setJob(tabId, { kind: 'load', state: 'done', text: `Finished loading: ${msg.count} pages.` });
    return false;
  }

  // From the popup
  const handlers = {
    'download': () => downloadPdf(msg.tabId, msg.url),
    'download-all': () => downloadAll(msg.tabId),
    'slides-merge': () => mergeSlides(msg.tabId, msg.frameId),
    'slides-load-all': () => loadAllSlides(msg.tabId, msg.frameId),
  };
  const h = handlers[msg.type];
  if (!h) return false;
  h().catch((e) => console.warn('[Paperlift]', e));
  sendResponse({ ok: true }); // the popup doesn't wait; progress is read from storage
  return false;
});
