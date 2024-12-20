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

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    try {
      const url = new URL(event.request.url);

      // Apply custom headers only for Akari Digita to enable multi threading on WASM 
      if (url.origin === self.location.origin && (url.pathname.startsWith('/Akari/Digita'))) {
        const response = await fetch(event.request);

        // Create a new Headers object and add the custom headers
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      // For all other requests, fetch as usual
      return await fetch(event.request);
    } catch (error) {
      console.error('Fetch failed:', error);

      // Fallback to cache or show an error response
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      return new Response('Akari sw.js v3, internal error, your device was unable to emulate the requested response after the server connection failed. Please connect to the Internet to allow the service worker to cache the response content, if the content is also missing on the server, create a GitHub issue report explaining the problem. The system cannot recover from this error without a stable internet connection, the system may also encounter problems caching responses if your device is low on storage. In the future this message is planned to be replaced by an automatic recovery utility.', {
        status: 500,
        statusText: 'Internal Server Error',
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
