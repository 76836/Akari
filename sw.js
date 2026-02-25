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
var PRESERVE = ['.gguf','.vrm','.mp3','.mp4','.onnx'];
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

function setStatus(msg, cls) {
  elStatus.textContent = msg;
  elStatus.className   = 'status' + (cls ? ' ' + cls : '');
}
function setBadge(msg, color) {
  elBadge.textContent = msg;
  elBadge.style.color = color || '#adf';
}
function setCorsDisplay(cors) {
  if (!cors) return;
  var d = document.getElementById('cors-digita');
  var n = document.getElementById('cors-net');
  d.textContent = cors.digita   ? 'ON' : 'OFF';
  d.className   = 'cors-val ' + (cors.digita   ? 'on' : 'off');
  n.textContent = cors.akariNet ? 'ON' : 'OFF';
  n.className   = 'cors-val ' + (cors.akariNet ? 'on' : 'off');
}
function swMsg(msg) {
  return new Promise(function(resolve, reject) {
    var ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctrl) { reject(new Error('SW not controlling this page')); return; }
    var ch = new MessageChannel();
    var t  = setTimeout(function(){ reject(new Error('SW timed out')); }, 4000);
    ch.port1.onmessage = function(e){ clearTimeout(t); resolve(e.data); };
    ctrl.postMessage(msg, [ch.port2]);
  });
}

// Init
elUrl.textContent = failedUrl || '(direct access)';
(async function(){
  if (!('serviceWorker' in navigator)) {
    setBadge('SW: unsupported', '#f88');
    setStatus('Service workers not supported.', 'err'); return;
  }
  if (!navigator.serviceWorker.controller) {
    setBadge('SW: not active', '#fa0');
    setStatus('SW not in control. CORS panel unavailable.', 'err'); return;
  }
  setBadge('SW: active', '#6f6');
  try { setCorsDisplay(await swMsg({action:'getCors'})); }
  catch(e){ setStatus('Could not read CORS state: '+e.message,'err'); }
})();

// Actions
window.doRetry = function(){ if(failedUrl) location.href=failedUrl; else location.reload(); };
window.doSkipCache = async function(){
  setStatus('Removing from cache\u2026');
  try {
    var url=failedUrl||location.href;
    var ok=await (await caches.open(CN)).delete(url);
    if(ok){ setStatus('Removed. Retrying\u2026','ok'); setTimeout(doRetry,700); }
    else setStatus('URL was not cached.');
  } catch(e){ setStatus('Skip cache failed: '+e.message,'err'); }
};
window.doForceCache = async function(){
  setStatus('Fetching and caching\u2026');
  try {
    var url=failedUrl||location.href;
    var res=await fetch(url);
    await (await caches.open(CN)).put(url,res.clone());
    setStatus('Cached. Retrying\u2026','ok'); setTimeout(doRetry,700);
  } catch(e){ setStatus('Force cache failed: '+e.message,'err'); }
};
window.doUpgradeSW = async function(){
  setStatus('Upgrading service worker\u2026');
  try {
    var reg=await navigator.serviceWorker.getRegistration();
    if(!reg){ setStatus('No SW registration.','err'); return; }
    await reg.update(); setStatus('Updated. Reloading\u2026','ok');
    setTimeout(function(){ location.reload(); }, 900);
  } catch(e){ setStatus('Update failed: '+e.message,'err'); }
};
window.doClearCache = async function(){
  setStatus('Clearing cache\u2026');
  try {
    var cache=await caches.open(CN);
    var keys=await cache.keys();
    var del=keys.filter(function(r){ return !PRESERVE.some(function(x){ return r.url.includes(x); }); });
    await Promise.all(del.map(function(r){ return cache.delete(r); }));
    setStatus('Cleared '+del.length+' entries ('+(keys.length-del.length)+' preserved).','ok');
  } catch(e){ setStatus('Clear failed: '+e.message,'err'); }
};
window.setCors = async function(target, enabled){
  setStatus('Saving\u2026');
  try {
    var res=await swMsg({action:'setCors',target:target,enabled:enabled});
    setCorsDisplay(res);
    setStatus('CORS '+target+' = '+(enabled?'ON':'OFF')+'. Reload to apply.','ok');
  } catch(e){ setStatus('CORS failed: '+e.message,'err'); }
};

// Terminal
window.toggleTerm = function(){
  termOpen = !termOpen;
  document.getElementById('term').style.display = termOpen ? 'block' : 'none';
  document.getElementById('term-label').textContent = (termOpen ? '\u25BC' : '\u25BA') + ' Terminal';
  document.getElementById('term-arrow').textContent = termOpen ? '\u25B2' : '\u25BC';
  if(termOpen){ elIn.focus(); if(!elOut.children.length) tDim('Akari Recovery Terminal  \u2014  type help'); }
};

function tLine(txt, cls){
  var d=document.createElement('div');
  if(cls) d.className=cls;
  d.textContent=txt;
  elOut.appendChild(d);
  elOut.scrollTop=elOut.scrollHeight;
}
function tOk(t) { tLine(t,'k'); }
function tErr(t){ tLine(t,'e'); }
function tDim(t){ tLine(t,'d'); }
function tTxt(t){ tLine(t); }
function tCmd(t){ tLine('$ '+t); }

var cmds = {
  help: async function(){
    var lines=[
      'Cache:',
      '  cache                  List all cached entries',
      '  cache count            Count entries',
      '  cache del <url>        Remove one entry',
      '  cache clear            Clear all (preserve large files)',
      '  cache nuke             Clear everything (keep prefs)',
      'CORS:',
      '  cors                   Show CORS state',
      '  cors digita on|off     Set Digita CORS',
      '  cors net on|off        Set AkariNet CORS',
      'SW:',
      '  sw info                Registration details',
      '  sw update              Update SW and reload',
      'Navigation:',
      '  retry                  Retry failed URL',
      '  reload                 Reload page',
      '  goto <url>             Navigate to URL',
      'Terminal:',
      '  clear / cls            Clear output',
      '  version                Version info',
      '  <anything else>        Evaluated as JavaScript'
    ];
    lines.forEach(function(l){ tLine(l, l.match(/^\s/) ? '' : 'k'); });
  },
  clear: async function(){ elOut.innerHTML=''; },
  cls:   async function(){ elOut.innerHTML=''; },
  cache: async function(args){
    var cache=await caches.open(CN), sub=args[0];
    if(!sub||sub==='list'){
      var keys=await cache.keys();
      tDim(keys.length+' entries in '+CN+':');
      keys.forEach(function(r){ tTxt('  '+r.url); });
    } else if(sub==='count'){
      tOk((await cache.keys()).length+' entries');
    } else if(sub==='del'){
      if(!args[1]){ tErr('Usage: cache del <url>'); return; }
      (await cache.delete(args[1])) ? tOk('Deleted: '+args[1]) : tErr('Not found: '+args[1]);
    } else if(sub==='clear'){
      var all=await cache.keys();
      var keep=all.filter(function(r){ return PRESERVE.some(function(x){ return r.url.includes(x); }); });
      var del=all.filter(function(r){ return keep.indexOf(r)===-1; });
      await Promise.all(del.map(function(r){ return cache.delete(r); }));
      tOk('Cleared '+del.length+', preserved '+keep.length+'.');
    } else if(sub==='nuke'){
      var ck=await caches.keys();
      await Promise.all(ck.filter(function(k){ return k!=='AkariPrefs'; }).map(function(k){ return caches.delete(k); }));
      tOk('Nuked (prefs preserved).');
    } else { tErr('Unknown: '+sub+'. Try: cache | count | del <url> | clear | nuke'); }
  },
  cors: async function(args){
    if(!args.length){
      try { var s=await swMsg({action:'getCors'}); tOk('Digita: '+(s.digita?'ON':'OFF')+'  |  AkariNet: '+(s.akariNet?'ON':'OFF')); }
      catch(e){ tErr(e.message); } return;
    }
    var t=args[0]==='net'?'akariNet':args[0], on=args[1]==='on';
    if(!args[0]||!args[1]){ tErr('Usage: cors digita|net on|off'); return; }
    try {
      var res=await swMsg({action:'setCors',target:t,enabled:on});
      setCorsDisplay(res); tOk('CORS '+args[0]+' = '+(on?'ON':'OFF')+'. Reload to apply.');
    } catch(e){ tErr(e.message); }
  },
  sw: async function(args){
    var sub=args[0];
    if(sub==='info'){
      var reg=await navigator.serviceWorker.getRegistration();
      if(!reg){ tErr('No SW registration.'); return; }
      tTxt('Scope : '+reg.scope);
      tTxt('State : '+(reg.active?reg.active.state:'none'));
      tTxt('Cache : '+reg.updateViaCache);
      tTxt('Ctrl  : '+!!navigator.serviceWorker.controller);
    } else if(sub==='update'){
      var reg2=await navigator.serviceWorker.getRegistration();
      if(!reg2){ tErr('No registration.'); return; }
      await reg2.update(); tOk('Updated. Reloading\u2026');
      setTimeout(function(){ location.reload(); }, 900);
    } else { tErr('Usage: sw info | sw update'); }
  },
  retry:   async function()     { doRetry(); },
  reload:  async function()     { location.reload(); },
  goto:    async function(args) { if(!args[0]){ tErr('Usage: goto <url>'); return; } location.href=args[0]; },
  version: async function()     { tOk('Akari Recovery Utility v6  |  Cache: '+CN); }
};

async function runCmd(line){
  var parts=line.trim().split(/\s+/), name=parts[0].toLowerCase(), args=parts.slice(1);
  tCmd(line);
  if(cmds[name]){
    try { await cmds[name](args); }
    catch(e){ tErr('Error: '+e.message); }
  } else {
    try {
      // eslint-disable-next-line no-eval
      var r=await Promise.resolve(eval(line));
      if(r!==undefined) tTxt(String(r));
    } catch(e){ tErr('JS: '+e.message); }
  }
}

elIn.addEventListener('keydown', async function(e){
  if(e.key==='Enter'){
    var line=this.value.trim(); this.value=''; histIdx=-1;
    if(line){ hist.unshift(line); await runCmd(line); }
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    if(histIdx<hist.length-1){ histIdx++; this.value=hist[histIdx]; }
  } else if(e.key==='ArrowDown'){
    e.preventDefault();
    if(histIdx>0){ histIdx--; this.value=hist[histIdx]; } else { histIdx=-1; this.value=''; }
  }
});
})();
</script>
</body>
</html>`;

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>404 - Not Found</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;box-sizing:border-box}
body{background:#000;font:14px Arial,sans-serif;padding:10px;min-height:100vh;display:flex;align-items:center;justify-content:center}
.w{border:2px solid;border-color:#fff #000 #000 #fff;max-width:500px;width:95%;background:#c00}
.t{background:#000080;color:#fff;padding:2px 4px}
.c{padding:10px;text-align:center}
code{word-break:break-all;display:block;margin:8px 0;font-size:12px}
.b{margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
button{background:#c0c0c0;border:2px solid;border-color:#fff #000 #000 #fff;padding:4px 14px;min-height:30px;cursor:pointer}
button:active{border-color:#000 #fff #fff #000}
</style>
</head>
<body>
<div class="w">
<div class="t">404 - Not Found</div>
<div class="c">
  <p>Resource not found:</p>
  <code id="url"></code>
  <div class="b">
    <button onclick="location.href='/'">Home</button>
    <button onclick="location.href='/Akari/recovery?url='+encodeURIComponent(location.pathname)">Recovery</button>
  </div>
</div>
</div>
<script>document.getElementById('url').textContent=location.pathname;</script>
</body>
</html>`;

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    const url = new URL(event.request.url);

    // Recovery page — always synthesised, never goes to network or cache
    if (url.origin === self.location.origin && url.pathname.startsWith('/Akari/recovery')) {
      return new Response(RECOVERY_HTML, { headers: { 'Content-Type': 'text/html' } });
    }

    // /Akari/Digita — own CORS toggle, own error handling
    if (url.origin === self.location.origin && url.pathname.startsWith('/Akari/Digita')) {
      try {
        const response = await fetch(event.request);
        const final    = digitaCors ? withCorsHeaders(response) : response;
        await writeThrough(event.request, final);
        return final;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response(RECOVERY_HTML, { headers: { 'Content-Type': 'text/html' } });
      }
    }

    // Everything else — AkariNet CORS toggle, network-first, cache fallback
    try {
      const response = await fetch(event.request);
      if (response.status === 404) {
        return new Response(NOT_FOUND_HTML, { status: 404, headers: { 'Content-Type': 'text/html' } });
      }
      const final = (akariNetCors && url.origin === self.location.origin)
        ? withCorsHeaders(response)
        : response;
      await writeThrough(event.request, final);
      return final;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return new Response(RECOVERY_HTML, { headers: { 'Content-Type': 'text/html' } });
    }
  })());
});

// ── Messages ──────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const { action } = event.data ?? {};
  const port = event.ports[0];

  // Re-fetch all cached app-shell files; never touch preserved large files
  if (action === 'updateCache') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const keys  = await cache.keys();
      await Promise.all(keys.map(async (request) => {
        if (isPreserved(request.url)) return;           // leave large files untouched
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response);
        } catch (e) {
          console.error('[SW] Failed to update:', request.url, e);
        }
      }));
      port?.postMessage({ action: 'updateCacheDone' });
    })());
  }

  // Set one CORS target ('digita' or 'akariNet')
  if (action === 'setCors') {
    event.waitUntil((async () => {
      const { target, enabled } = event.data;
      if (target === 'digita') {
        digitaCors = !!enabled;
        await savePref('cors-digita', digitaCors);
      } else if (target === 'akariNet') {
        akariNetCors = !!enabled;
        await savePref('cors-akariNet', akariNetCors);
      }
      port?.postMessage({ action: 'corsSet', ...corsState() });
    })());
  }

  // Report current CORS state to caller
  if (action === 'getCors') {
    port?.postMessage({ action: 'corsState', ...corsState() });
  }
});
