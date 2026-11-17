// Service worker: aplikacja działa offline z zapisanej wersji.
// Nowa wersja pobiera się w tle i czeka, aż użytkownik kliknie „Aktualizuj” na pasku w aplikacji.

// --- generowane przez `npm run version` (tools/update-sw.mjs) – nie edytuj ręcznie ---
const VERSION = "11";
const BUILD = "b1982e187026"; // eslint-disable-line no-unused-vars -- odcisk plików, czytany przez tools/update-sw.mjs
const FILES = [
  "./",
  "css/app.css",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "index.html",
  "js/app/controller.js",
  "js/app/feedback.js",
  "js/app/store.js",
  "js/domain/history.js",
  "js/domain/program.js",
  "js/domain/settings.js",
  "js/domain/units.js",
  "js/domain/workout-engine.js",
  "js/ftms/protocol.js",
  "js/ftms/treadmill.js",
  "js/main.js",
  "js/storage/repository.js",
  "js/ui/chart.js",
  "js/ui/dom.js",
  "js/ui/history-view.js",
  "js/ui/programs-view.js",
  "js/ui/settings-view.js",
  "js/ui/shell.js",
  "js/ui/train-view.js",
  "js/ui/update-bar.js",
  "js/util/format.js",
  "manifest.webmanifest"
];
// --- koniec ---

const CACHE = "bieznia-v" + VERSION;

self.addEventListener("install", e => {
  // cache: "reload" – pomiń pamięć HTTP przeglądarki, żeby na pewno pobrać nowe pliki
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
  // bez skipWaiting(): nowa wersja czeka na zgodę użytkownika
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("bieznia-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response("Offline", { status: 503 });
      }
    })
  );
});
