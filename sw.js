const CACHE = 'ledger-v13'
const ASSETS = ['./', './index.html', './styles.css', './app.js', './icon.svg', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit
          if (req.mode === 'navigate') return caches.match('./index.html')
          return new Response('', { status: 504 })
        })
      )
  )
})
