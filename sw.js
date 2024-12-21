const CACHE_NAME = 'AkariOffline';
const urlsToCache = [
        './',
        'https://esm.run/@mlc-ai/web-llm'
];

// Install event - caching files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - cleaning up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});






// Recovery page HTML template
const RECOVERY_HTML = `
<!DOCTYPE html>
<html>
<head>
<title>Recovery</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;box-sizing:border-box}
body{background:black;font:14px sans-serif;padding:10px;min-height:100vh;display:flex;align-items:center;justify-content:center}
.w{border:2px solid #000;box-shadow:inset -1px -1px #000,inset 1px 1px #fff;max-width:500px;background:#c0c0c0;width:95%;word-break:break-all}
.t{background:#000080;color:#fff;padding:2px 4px}
.c{padding:10px}
.b{display:grid;gap:5px;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));margin-top:10px}
button{background:#c0c0c0;border:2px solid #000;padding:4px;min-height:30px}
button:active{box-shadow:inset 1px 1px #000}
#term{display:none;height:200px;background:#000;color:#0f0;font:12px monospace;padding:5px;margin-top:10px;overflow:auto;position:relative}
#output{white-space:pre-wrap;margin-bottom:20px}
#input{position:absolute;bottom:0;left:0;right:0;background:#000;border:0;color:#0f0;font:12px monospace;padding:5px;width:100%;outline:none}
.prompt{color:#0f0;margin-right:5px}
</style>
</head>
<body>
<div class="w">
<div class="t">sw.jw integrated recovery utility.</div>
<div class="c">
<p>Failed to load:</p>
<code id="url"></code>
<div class="b">
<button onclick="retry()">Retry</button>
<button onclick="skipCache()">Skip Cache</button>
<button onclick="forceCache()">Force Cache</button>
<button onclick="upgradeSW()">Upgrade SW</button>
<button onclick="toggleTerm()">Terminal</button>
<button onclick="location.reload()">Restart</button>
</div>
<div id="term">
<div id="output"></div>
<div style="display:flex">
<span class="prompt">&gt;</span>
<input id="input" type="text" autocomplete="off" spellcheck="false">
</div>
</div>
</div>
</div>
<script>
let term,output,input;
const url=new URLSearchParams(location.search).get('url');
document.getElementById('url').textContent=url;

function log(msg){
    if(!output)output=document.getElementById('output');
    output.textContent+=\`\${msg}\n\`;
    output.scrollIntoView(false);
}

async function retry(){
    location.href=url;
}

async function skipCache(){
    try{
        const cache=await caches.open('sw-cache');
        await cache.delete(url);
        log('Cache cleared');
        location.href=url;
    }catch(e){log('Skip cache failed: '+e)}
}

async function forceCache(){
    try{
        const cache=await caches.open('sw-cache');
        const res=await fetch(url);
        await cache.put(url,res.clone());
        log('Cached successfully');
        location.href=url;
    }catch(e){log('Force cache failed: '+e)}
}

async function upgradeSW(){
    try{
        const reg=await navigator.serviceWorker.getRegistration();
        await reg.update();
        log('SW updated');
        location.reload();
    }catch(e){log('SW update failed: '+e)}
}

function toggleTerm(){
    term.style.display=term.style.display?'':'block';
    if(term.style.display){
        input.focus();
    }
}

async function handleCommand(cmd){
    if(!cmd) return;
    log(\`> \${cmd}\`);
    
    switch(cmd.toLowerCase()){
        case 'help':
            log('Available commands:\nhelp - Show commands\nclear - Clear terminal\ncache - List cache\ndelete - Clear cache\ninfo - SW info\ncls - Clear screen\nversion - Show version');
            break;
        case 'clear':
        case 'cls':
            output.textContent='';
            break;
        case 'cache':
            const cache=await caches.open('sw-cache');
            const keys=await cache.keys();
            log('Cached URLs:\n'+keys.map(k=>k.url).join('\n'));
            break;
        case 'delete':
            await caches.delete('sw-cache');
            log('Cache cleared');
            break;
        case 'info':
            const reg=await navigator.serviceWorker.getRegistration();
            log(\`State: \${reg.active.state}\nScope: \${reg.scope}\nUpdate: \${reg.updateViaCache}\`);
            break;
        case 'version':
            log('Recovery Page v5\nService Worker Recovery System');
            break;
        default:
            try{
                log(await eval(cmd));
            }catch(e){log('Error: '+e)}
    }
}

// Initialize terminal
term=document.getElementById('term');
input=document.getElementById('input');
output=document.getElementById('output');

let history=[];
let historyIndex=-1;

input.addEventListener('keydown',async(e)=>{
    if(e.key==='Enter'){
        const cmd=input.value.trim();
        input.value='';
        historyIndex=-1;
        if(cmd){
            history.unshift(cmd);
            await handleCommand(cmd);
        }
    }else if(e.key==='ArrowUp'){
        e.preventDefault();
        if(historyIndex<history.length-1){
            historyIndex++;
            input.value=history[historyIndex];
        }
    }else if(e.key==='ArrowDown'){
        e.preventDefault();
        if(historyIndex>0){
            historyIndex--;
            input.value=history[historyIndex];
        }else{
            historyIndex=-1;
            input.value='';
        }
    }
});

log('Type "help" for available commands');
</script>
</body>
</html>
`;

// 404 page HTML template
const NOT_FOUND_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>404 - Not Found</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
        * { margin: 0; box-sizing: border-box }
        body {
            background: black;
            font: 14px sans-serif;
            padding: 10px;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center
        }
        .w {
            border: 2px solid #000;
            box-shadow: inset -1px -1px #000, inset 1px 1px #fff;
            max-width: 500px;
            width: 95%;
            background: red;
        }
        .t {
            background: #000080;
            color: #fff;
            padding: 2px 4px
        }
        .c {
            padding: 10px;
            text-align: center
        }
        .b { margin-top: 20px }
        button {
            background: #c0c0c0;
            border: 2px solid #000;
            padding: 4px 15px;
            margin: 0 5px
        }
    </style>
</head>
<body>
    <div class="w">
        <div class="t">404 - Not Found</div>
        <div class="c">
            <p>The requested resource could not be found on the server:</p>
            <code id="url" style="word-break:break-all"></code>
            <div class="b">
                <button onclick="location.href='/'">76836 Home</button>
                <button onclick="location.href='Akari/recovery?url='+encodeURIComponent(document.getElementById('url').textContent)">Akari Recovery</button>
            </div>
        </div>
    </div>
    <script>
        document.getElementById('url').textContent = location.pathname;
    </script>
</body>
</html>
`;

// Service Worker fetch event handler
self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    try {
      const url = new URL(event.request.url);

      // Handle recovery page requests
      if (url.origin === self.location.origin && url.pathname.startsWith('/Akari/recovery')) {
        return new Response(RECOVERY_HTML, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
            
// Handle Akari Digita requests with special headers
if (url.origin === self.location.origin && url.pathname.startsWith('/Akari/Digita')) {
  // First normalize the path to handle directory requests
  let pathToTry = url.pathname;
  
  // Handle relative paths from within Digita directory
  if (pathToTry.includes('./')) {
    // Get the base directory path
    const basePath = pathToTry.substring(0, pathToTry.lastIndexOf('/'));
    // Resolve the relative path
    pathToTry = basePath + pathToTry.substring(pathToTry.lastIndexOf('./') + 1);
  }

  // Handle directory requests
  if (pathToTry.endsWith('/') || !pathToTry.includes('.')) {
    pathToTry = pathToTry.replace(/\/?$/, '/index.html');
  }

  try {
    const modifiedRequest = new Request(new URL(pathToTry, url.origin), {
      ...event.request,
      url: new URL(pathToTry, url.origin).href
    });

    const response = await fetch(modifiedRequest);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    throw error;
  }
}

      // For all other requests, try network first
      const response = await fetch(event.request);
      
      if (response.status === 404) {
        return new Response(NOT_FOUND_HTML, {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      return response;

    } catch (error) {
      console.error('Fetch failed:', error);
      
      // Try cache
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Always fall back to recovery page as last resort
      return new Response(RECOVERY_HTML, {
          headers: { 
          'Content-Type': 'text/html',
          'Location': 'recovery?url=${encodeURIComponent(event.request.url)'
         }
        });
    }
  })());
});







// Update event - refresh every file
self.addEventListener('message', (event) => {
  if (event.data.action === 'updateCache') {
          
  const dingus = './';
  // Remove the directory from the cache
  caches.open(CACHE_NAME).then((cache) => {
    cache.keys().then((keys) => {
      keys.forEach((request) => {
        if (request.url.includes(dingus)) {
          cache.delete(request);
        }
      });
      // Re-cache the directory
      fetch(dingus).then((response) => {
        if (response.ok) {
          cache.put(dingus, response);
        }
      }).catch((error) => {
        console.error('Failed to re-cache the goofy little dingus:', error);
      });
    });
  });
          
  }
});
