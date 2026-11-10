// Offscreen document: a hidden page owned by the extension.
// Needed because the service worker can't create blob URLs (URL.createObjectURL).
// Jobs: collect file data → blob URL, fetch from the extension context,
// convert images (WebP etc.) and build PDFs with pdf-lib (global `PDFLib`).

const blobParts = new Map(); // key → Uint8Array[]
const pdfJobs = new Map();   // jobId → PDFDocument

async function b64ToBytes(b64) {
  const res = await fetch('data:application/octet-stream;base64,' + b64);
  return new Uint8Array(await res.arrayBuffer());
}

function looksLikePdf(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  return 'other';
}

/** Convert any image format Chrome can decode into JPEG/PNG via OffscreenCanvas. */
async function convertImage(bytes, mime, kind) {
  const blob = new Blob([bytes], { type: mime || '' });
  let source;
  try {
    source = await createImageBitmap(blob);
  } catch {
    // createImageBitmap doesn't support SVG → use an <img> element.
    const url = URL.createObjectURL(blob);
    try {
      source = new Image();
      source.src = url;
      await source.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  if (!w || !h) throw new Error('Could not read the image size.');
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  // GIF/PNG are usually sharp graphics → PNG. Everything else (WebP, AVIF, ...) → high-quality JPEG.
  const asPng = kind === 'gif' || kind === 'png' || /gif|bmp|svg/i.test(mime || '');
  if (!asPng) {
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(source, 0, 0, w, h);
  if (source.close) source.close();
  const out = await canvas.convertToBlob(asPng ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.92 });
  return { bytes: new Uint8Array(await out.arrayBuffer()), kind: asPng ? 'png' : 'jpg' };
}

async function embed(doc, bytes, mime) {
  const kind = sniffImage(bytes);
  try {
    if (kind === 'jpg') return await doc.embedJpg(bytes);
    if (kind === 'png') return await doc.embedPng(bytes);
  } catch {
    // JPEG/PNG variants pdf-lib can't embed → convert first.
  }
  const conv = await convertImage(bytes, mime, kind);
  return conv.kind === 'jpg' ? doc.embedJpg(conv.bytes) : doc.embedPng(conv.bytes);
}

const ops = {
  // ---- Collect a file piece by piece, then turn it into a blob URL ----
  'blob-begin': ({ key }) => { blobParts.set(key, []); return { ok: true }; },
  'blob-append': async ({ key, b64 }) => {
    const parts = blobParts.get(key);
    if (!parts) return { ok: false, error: 'Blob session not found.' };
    parts.push(await b64ToBytes(b64));
    return { ok: true };
  },
  'blob-end': ({ key, type }) => {
    const parts = blobParts.get(key);
    blobParts.delete(key);
    if (!parts) return { ok: false, error: 'Blob session not found.' };
    return { ok: true, blobUrl: URL.createObjectURL(new Blob(parts, { type })) };
  },
  'blob-abort': ({ key }) => { blobParts.delete(key); return { ok: true }; },
  'revoke': ({ url }) => { if (url) URL.revokeObjectURL(url); return { ok: true }; },

  // ---- Download step 3: fetch from the extension context ----
  'fetch-pdf': async ({ url }) => {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!looksLikePdf(bytes)) return { ok: false, error: 'The response is not a PDF (maybe a login page).' };
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      return { ok: true, blobUrl, contentDisposition: res.headers.get('content-disposition') };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  },

  // ---- Slides → PDF ----
  'pdf-begin': async ({ jobId, title }) => {
    const doc = await PDFLib.PDFDocument.create();
    if (title) doc.setTitle(title);
    doc.setCreator('Paperlift');
    pdfJobs.set(jobId, doc);
    return { ok: true };
  },
  'pdf-add': async ({ jobId, b64, url, mime }) => {
    const doc = pdfJobs.get(jobId);
    if (!doc) return { ok: false, error: 'Job not found.' };
    try {
      let bytes;
      if (b64) {
        bytes = await b64ToBytes(b64);
      } else {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        mime = res.headers.get('content-type') || '';
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      const img = await embed(doc, bytes, mime);
      const { width, height } = img.scale(1);
      // Page size = image size (1 pixel = 1 point), one image per page.
      const page = doc.addPage([width, height]);
      page.drawImage(img, { x: 0, y: 0, width, height });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  },
  'pdf-end': async ({ jobId }) => {
    const doc = pdfJobs.get(jobId);
    pdfJobs.delete(jobId);
    if (!doc) return { ok: false, error: 'Job not found.' };
    const bytes = await doc.save();
    return { ok: true, blobUrl: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) };
  },
  'pdf-abort': ({ jobId }) => { pdfJobs.delete(jobId); return { ok: true }; },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  const fn = ops[msg.op];
  if (!fn) return false;
  Promise.resolve()
    .then(() => fn(msg))
    .then(sendResponse, (e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true;
});
