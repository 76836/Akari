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

// ── HTML templates ────────────────────────────────────────────────────────────

const RECOVERY_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Akari Recovery</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;box-sizing:border-box}
body{background:#000;font:13px/1.4 Arial,sans-serif;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:10px}
.win{background:#c0c0c0;border:2px solid;border-color:#fff #000 #000 #fff;box-shadow:1px 1px 0 #000;max-width:520px;width:100%}
.titlebar{background:#000080;color:#fff;padding:3px 6px;display:flex;justify-content:space-between;align-items:center;user-select:none;gap:8px}
.titlebar-title{font-weight:bold;font-size:12px;white-space:nowrap}
.titlebar-status{font-size:10px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.body{padding:8px}
.url-box{background:#fff;border:2px solid;border-color:#808080 #fff #fff #808080;padding:4px 6px;margin:6px 0;word-break:break-all;font-size:11px;color:#000;min-height:20px}
.label{font-size:11px;font-weight:bold;margin-bottom:4px;margin-top:8px}
.btn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:4px}
button{background:#c0c0c0;border:2px solid;border-color:#fff #808080 #808080 #fff;padding:5px 8px;font:12px Arial,sans-serif;min-height:32px;cursor:pointer;text-align:center;line-height:1.2}
button:active{border-color:#808080 #fff #fff #808080;padding:6px 7px 4px 9px}
.hr{border:none;border-top:1px solid #808080;border-bottom:1px solid #fff;margin:8px 0}
.cors-row{display:flex;align-items:center;gap:6px;margin:3px 0;flex-wrap:wrap}
.cors-lbl{font-size:12px;min-width:72px}
.cors-val{font-size:11px;padding:1px 6px;border:1px inset #808080;background:#fff;min-width:34px;text-align:center;font-weight:bold}
.on{color:green}.off{color:#c00}
.status{font-size:11px;min-height:16px;padding:2px 0;color:#000080}
.status.err{color:#c00}.status.ok{color:green}
.note{font-size:10px;color:#606060;margin-top:3px}
.term-hdr{background:#404040;color:#ccc;padding:3px 8px;font:12px monospace;display:flex;justify-content:space-between;cursor:pointer;user-select:none;margin-top:8px;border-top:2px solid #808080}
.term-hdr:hover{background:#505050}
#term{display:none;background:#000}
#term-out{height:210px;overflow-y:auto;padding:4px 6px 2px;color:#0f0;font:12px/1.45 monospace;white-space:pre-wrap;word-break:break-all}
#term-out .e{color:#f66}#term-out .k{color:#6f6}#term-out .d{color:#888}
.term-in-row{display:flex;align-items:center;background:#000;padding:3px 6px;border-top:1px solid #1a3a1a}
.prompt{color:#0f0;font:12px monospace;flex-shrink:0}
#term-in{flex:1;background:transparent;border:none;outline:none;color:#0f0;font:12px monospace;caret-color:#0f0;padding:0 4px}
</style>
</head>
<body>
<div class="win">
<div class="titlebar">
  <span class="titlebar-title">&#9881; Akari Recovery Utility</span>
  <span class="titlebar-status" id="sw-badge">checking&#8230;</span>
</div>
<div class="body">
  <div class="label">Failed resource</div>
  <div class="url-box" id="url-display">&#8212;</div>
  <div class="status" id="status"></div>
  <hr class="hr">
  <div class="label">Actions</div>
  <div class="btn-grid">
    <button onclick="doRetry()">&#8629; Retry</button>
    <button onclick="doSkipCache()">&#8856; Skip Cache</button>
    <button onclick="doForceCache()">&#8853; Force Cache</button>
    <button onclick="doUpgradeSW()">&#8593; Upgrade SW</button>
    <button onclick="doClearCache()">&#128465; Clear Cache</button>
    <button onclick="location.reload()">&#10227; Restart</button>
    <button onclick="location.href='/Akari/settings'">&#9881; Settings</button>
  </div>
  <hr class="hr">
  <div class="label">CORS Settings</div>
  <div class="cors-row">
    <span class="cors-lbl">Digita:</span>
    <span class="cors-val" id="cors-digita">&#8230;</span>
    <button onclick="setCors('digita',true)"  style="min-height:26px;padding:2px 10px">ON</button>
    <button onclick="setCors('digita',false)" style="min-height:26px;padding:2px 10px">OFF</button>
  </div>
  <div class="cors-row">
    <span class="cors-lbl">AkariNet:</span>
    <span class="cors-val" id="cors-net">&#8230;</span>
    <button onclick="setCors('akariNet',true)"  style="min-height:26px;padding:2px 10px">ON</button>
    <button onclick="setCors('akariNet',false)" style="min-height:26px;padding:2px 10px">OFF</button>
  </div>
  <div class="note">Changes take effect after reload.</div>
</div>
<div class="term-hdr" id="term-hdr" onclick="toggleTerm()">
  <span id="term-label">&#9654; Terminal</span>
  <span id="term-arrow">&#9660;</span>
</div>
<div id="term">
  <div id="term-out"></div>
  <div class="term-in-row">
    <span class="prompt">$&nbsp;</span>
    <input id="term-in" type="text" autocomplete="off" autocorrect="off"
           autocapitalize="off" spellcheck="false" placeholder="help">
  </div>
</div>
</div>
<script>
(function(){
'use strict';
var CN       = 'AkariOffline';
var PRESERVE = ['.gguf','.vrm','.mp3','.mp4','.onnx','.tar.gz','.tgz','.zip','.wasm','.bin'];
var params   = new URLSearchParams(location.search);
var failedUrl= params.get('url') || '';
var termOpen = false;
var hist     = [];
var histIdx  = -1;

var elUrl    = document.getElementById('url-display');
var elStatus = document.getElementById('status');
var elBadge  = document.getElementById('sw-badge');
var elOut    = document.getElementById('term-out');
var elIn     = document.getElementById('term-in');
