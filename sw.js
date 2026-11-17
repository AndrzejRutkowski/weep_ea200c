// Service worker: aplikacja działa offline z zapisanej wersji.
// Nowa wersja (zmiana VERSION) pobiera się w tle i czeka, aż użytkownik kliknie
// „Aktualizuj” na pasku w aplikacji. Przy każdej zmianie plików podbij VERSION.
const VERSION = "9";
const CACHE = "bieznia-v" + VERSION;
const FILES = ["./", "index.html", "manifest.webmanifest", "icons/icon.svg",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  // cache: "reload" – pomiń pamięć HTTP przeglądarki, żeby na pewno pobrać nowe pliki
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
  // bez skipWaiting(): nowa wersja czeka na zgodę użytkownika
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("bieznia-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response("Offline", { status: 503 });
    }
  }));
});
