const CACHE_NAME = 'AkariOffline';
const PREFS_CACHE = 'AkariPrefs';

// These extensions are managed by the app's own caching logic.
// The SW will never delete them and will never overwrite them via write-through.
const PRESERVE_EXTS = ['.gguf', '.vrm', '.mp3', '.mp4', '.onnx'];

// CORS state — loaded from persistent storage during activate
let digitaCors   = false;
let akariNetCors = false;

// ── Preference helpers ────────────────────────────────────────────────────────

async function loadPrefs() {
  try {
    const cache = await caches.open(PREFS_CACHE);
    const [dRes, nRes] = await Promise.all([
      cache.match('cors-digita'),
      cache.match('cors-akariNet'),
    ]);
    digitaCors   = dRes ? (await dRes.text()) === 'true' : false;
    akariNetCors = nRes ? (await nRes.text()) === 'true' : false;
  } catch {
    digitaCors = akariNetCors = false;
  }
}

async function savePref(key, val) {
  const cache = await caches.open(PREFS_CACHE);
  await cache.put(key, new Response(val ? 'true' : 'false'));
}

function corsState() {
  return { digita: digitaCors, akariNet: akariNetCors };
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function isPreserved(url) {
  const href = typeof url === 'string' ? url : url.href;
  return PRESERVE_EXTS.some(ext => href.includes(ext));
}

// Write a successful GET response to cache, skipping preserved large files.
async function writeThrough(request, response) {
  if (!response.ok || request.method !== 'GET' || isPreserved(request.url)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  } catch { /* non-fatal */ }
}

// Return a copy of a response with COEP/COOP headers injected.
function withCorsHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy',   'same-origin');
  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['./', 'https://esm.run/@mlc-ai/web-llm']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== PREFS_CACHE)
          .map(k => caches.delete(k))
      )),
      loadPrefs(),
    ]).then(() => self.clients.claim())
  );
});
