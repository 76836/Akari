const CACHE_NAME = 'AkariOffline';
const PREFS_CACHE = 'AkariPrefs';

// These extensions are managed by the app's own caching logic.
// The SW will never delete them and will never overwrite them via write-through.
const PRESERVE_EXTS = ['.gguf', '.vrm', '.mp3', '.mp4', '.onnx', '.tar.gz', '.tgz', '.zip', '.wasm', '.bin'];

// Cache names that belong to third-party / model loaders (vosk, transformers, web-llm, etc.).
// Never delete these on activate — wiping them forces multi‑MB re-downloads and causes SW errors.
const PRESERVE_CACHE_PREFIXES = ['vosk', 'transformers', 'onnx', 'webllm', 'web-llm', 'whisper', 'huggingface', 'hf-', 'model', 'mlc'];

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
  const href = typeof url === 'string' ? url : (url && url.href) || '';
  if (!href) return true;
  if (PRESERVE_EXTS.some(ext => href.includes(ext))) return true;
  // Vosk / model CDNs — never write-through or treat as shell assets
  if (/vosk|ccoreilly\.github\.io|huggingface\.co|cdn\.jsdelivr\.net\/npm\/vosk/i.test(href)) return true;
  return false;
}

function shouldWriteThrough(request, response) {
  if (!response || !response.ok || request.method !== 'GET') return false;
  if (isPreserved(request.url)) return false;
  try {
    const u = new URL(request.url);
    // Only cache same-origin app shell; never pin cross-origin model downloads in AkariOffline
    if (u.origin !== self.location.origin) return false;
  } catch {
    return false;
  }
  return true;
}

// Write a successful GET response to cache, skipping preserved large files / cross-origin models.
async function writeThrough(request, response) {
  if (!shouldWriteThrough(request, response)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    // Clone before put so the caller's response body is never locked
    await cache.put(request, response.clone());
  } catch (e) {
    // Quota or locked body — never let this reject respondWith
    console.warn('[SW] writeThrough skipped:', request.url, e && e.message);
  }
}

// Return a copy of a response with COEP/COOP headers injected.
// Always clone first so the original (or cache) body stream is not transferred/locked.
function withCorsHeaders(response) {
  try {
    const clone = response.clone();
    const headers = new Headers(clone.headers);
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy',   'same-origin');
    return new Response(clone.body, {
      status:     clone.status,
      statusText: clone.statusText,
      headers,
    });
  } catch (e) {
    console.warn('[SW] withCorsHeaders failed, returning original', e && e.message);
    return response;
  }
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
          .filter(k => {
            if (k === CACHE_NAME || k === PREFS_CACHE) return false;
            // Keep third-party model caches (vosk, transformers, onnx, web-llm, …)
            const lower = k.toLowerCase();
            if (PRESERVE_CACHE_PREFIXES.some(p => lower.includes(p))) return false;
            // Only delete prior Akari shell cache variants, not everything else
            if (k.startsWith('Akari') || k.startsWith('akari')) return true;
            return false;
          })
          .map(k => caches.delete(k))
      )),
      loadPrefs(),
    ]).then(() => self.clients.claim())
  );
});
