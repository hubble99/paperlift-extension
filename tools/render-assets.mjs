// Merender aset merek Petik lewat Chrome headless (bukan bagian extension).
//   - icons/icon{16,32,48,128}.png  dari brand/logo.svg (latar transparan)
//   - store/screenshot-{1,2,3}.png  1280×800 untuk Chrome Web Store
//   - store/promo-440x280.png       small promo tile
//
// Jalankan dari root proyek:
//   node tools/render-assets.mjs                         (Node 22+)
//   node --experimental-websocket tools/render-assets.mjs (Node 20/21)
// Lokasi Chrome bisa diatur lewat env CHROME_PATH.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

if (typeof WebSocket === 'undefined') {
  console.error('Butuh Node 22+, atau jalankan dengan: node --experimental-websocket tools/render-assets.mjs');
  process.exit(1);
}

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);
if (!CHROME) { console.error('Chrome tidak ditemukan. Set CHROME_PATH.'); process.exit(1); }

// ---- Server statis kecil untuk root proyek ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- Chrome + DevTools Protocol ----
const profile = await mkdtemp(join(tmpdir(), 'petik-render-'));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 75 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!target) await sleep(200);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const waiting = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const cmd = (method, params = {}) => new Promise((r, j) => {
  const id = ++seq;
  waiting.set(id, (m) => (m.error ? j(new Error(method + ': ' + m.error.message)) : r(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});

await cmd('Page.enable');
await cmd('Runtime.enable');
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: await readFile(join(ROOT, 'store/src/mock.js'), 'utf8') });

async function shoot(url, width, height, out, { transparent = false, dark = false, scale = 1 } = {}) {
  await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  await cmd('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await cmd('Page.navigate', { url });
  for (let i = 0; i < 50; i++) {
    const r = await cmd('Runtime.evaluate', { expression: 'document.readyState === "complete" && document.body && document.body.dataset.ready === "1"', returnByValue: true });
    if (r.result.value) break;
    await sleep(100);
  }
  await sleep(150);
  const { data } = await cmd('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
  await writeFile(join(ROOT, out), Buffer.from(data, 'base64'));
  console.log('dibuat', out);
}

// Ikon: logo di tengah dengan padding per ukuran (128 px: area gambar ±96 px sesuai panduan Web Store).
const svg = await readFile(join(ROOT, 'brand/logo.svg'), 'utf8');
const iconPage = (size, pad) => 'data:text/html;base64,' + Buffer.from(
  `<html><body data-ready="1" style="margin:0;width:${size}px;height:${size}px">` +
  `<div style="padding:${pad}px;width:${size}px;height:${size}px;box-sizing:border-box">` +
  svg.replace('width="128" height="128"', 'width="100%" height="100%"') + '</div></body></html>').toString('base64');

for (const [size, pad] of [[16, 0], [32, 0], [48, 1], [128, 10]]) {
  await shoot(iconPage(size, pad), size, size, `icons/icon${size}.png`, { transparent: true });
}

await shoot(`${BASE}/store/src/shot.html?mock=pdf`, 1280, 800, 'store/screenshot-1.png');
await shoot(`${BASE}/store/src/shot.html?mock=slides`, 1280, 800, 'store/screenshot-2.png');
await shoot(`${BASE}/store/src/shot.html?mock=dark`, 1280, 800, 'store/screenshot-3.png', { dark: true });
await shoot(`${BASE}/store/src/promo.html`, 440, 280, 'store/promo-440x280.png');

ws.close();
chrome.kill();
server.close();
await sleep(300);
await rm(profile, { recursive: true, force: true }).catch(() => {});
