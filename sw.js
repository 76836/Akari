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
      // First, try fetching with custom headers
      const response = await fetchWithCustomHeaders(event.request);
      await cacheResponse(event.request, response.clone());
      return response;
    } catch (error) {
      console.warn('Custom headers fetch failed, retrying without custom headers:', error);
      try {
        // Retry with normal headers
        const response = await fetch(event.request);
        await cacheResponse(event.request, response.clone());
        return response;
      } catch (finalError) {
        console.warn('Fetch failed completely, attempting cache fallback:', finalError);
        // Fallback to cached response
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        return new Response('Offline and no cached data available.', {
          status: 404,
          statusText: 'Not Found',
        });
      }
    }
  })());
});

// Fetch with custom headers
async function fetchWithCustomHeaders(request) {
  const response = await fetch(request);

  // Clone response headers and add custom ones
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  // Return a new Response object with the modified headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// Cache the response for future offline use
async function cacheResponse(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
}



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
