// Mock data for rendering the popup in screenshots (used by tools/render-assets.mjs).
// Injected into every frame before page scripts run; only active in popup.html.
(() => {
  if (!location.pathname.endsWith('/popup/popup.html')) return;
  const mock = new URLSearchParams(location.search).get('mock') || 'pdf';

  const thumb = (n) => {
    const hue = (n * 47) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">
      <rect width="160" height="90" fill="hsl(${hue},30%,92%)"/>
      <rect x="12" y="14" width="70" height="8" rx="2" fill="hsl(${hue},35%,40%)"/>
      <rect x="12" y="32" width="110" height="5" rx="2" fill="hsl(${hue},15%,70%)"/>
      <rect x="12" y="44" width="96" height="5" rx="2" fill="hsl(${hue},15%,70%)"/>
      <rect x="12" y="56" width="104" height="5" rx="2" fill="hsl(${hue},15%,70%)"/>
      <circle cx="136" cy="68" r="12" fill="hsl(${hue},40%,65%)"/></svg>`;
    return { url: 'data:image/svg+xml,' + encodeURIComponent(svg) };
  };

  const cdn = 'https://cdn.example.com/files/';
  const data = {
    pdf: {
      tab: { id: 1, title: 'Lesson 3 · Python Basics', url: 'https://learn.example.com/python/lesson-3' },
      state: {
        frames: { 0: { pdfs: [{ url: cdn + 'Lesson%203%20-%20Python%20Basics.pdf', kind: 'pdfjs' }] } },
        network: {
          [cdn + 'Week%203%20Exercises.pdf']: { url: cdn + 'Week%203%20Exercises.pdf', frameId: 2 },
          [cdn + 'Python%20Cheatsheet.pdf']: { url: cdn + 'Python%20Cheatsheet.pdf', frameId: 2 },
        },
        status: {
          [cdn + 'Lesson%203%20-%20Python%20Basics.pdf']: { state: 'done', text: 'Saved' },
          [cdn + 'Week%203%20Exercises.pdf']: { state: 'working', text: 'Downloading…' },
        },
        job: null,
      },
    },
    slides: {
      tab: { id: 1, title: 'Introduction to Machine Learning', url: 'https://learn.example.com/ml/slides-1' },
      state: {
        frames: {
          0: {
            pdfs: [{ url: cdn + 'Module%201%20Summary.pdf', kind: 'link' }],
            deck: { count: 40, canvas: 0, pending: 0, tainted: 0, ordering: 'attr', thumbs: [1, 2, 3, 4, 5, 6].map(thumb) },
          },
        },
        network: {},
        status: {},
        job: { kind: 'merge', state: 'running', done: 12, total: 40, text: 'Processing 13/40' },
      },
    },
  };
  data.dark = data.pdf;
  const st = data[mock] || data.pdf;

  const noop = () => {};
  Object.defineProperty(window, 'chrome', {
    configurable: true,
    writable: true,
    value: {
      tabs: { query: async () => [st.tab], get: async () => st.tab, sendMessage: async () => {} },
      runtime: { sendMessage: async () => {} },
      storage: { session: { get: async (k) => ({ [k]: st.state }) }, onChanged: { addListener: noop } },
    },
  });
  // Disable entry animations so screenshots are stable.
  document.documentElement.dataset.shot = '1';
  const style = document.createElement('style');
  style.textContent = '*{animation:none!important;transition:none!important}';
  document.documentElement.append(style);
})();
