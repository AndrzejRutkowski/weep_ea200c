// Aktualizacje aplikacji (service worker) i pasek „Dostępna jest nowa wersja”.
// Nowa wersja pobiera się w tle i czeka na kliknięcie „Aktualizuj”. W trakcie treningu pasek
// się nie pokazuje, bo przeładowanie zerwałoby połączenie z bieżnią.

import { $, setText, showIf } from "./dom.js";

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * @param {import("../app/store.js").Store<import("../app/controller.js").AppState>} store
 * @param {import("../app/controller.js").Controller} app
 */
export function initUpdates(store, app) {
  let registration = null;
  let waiting = null;
  let dismissed = false;
  let requested = false;
  let reloading = false;
  const msg = t => setText($("updMsg"), t);

  const showBar = () => showIf($("updBar"), !!waiting && !dismissed && !app.isTrainingActive());

  async function showVersion() {
    try {
      const v = (await caches.keys())
        .filter(k => /^bieznia-v\d+$/.test(k))
        .map(k => +k.slice(9))
        .sort((a, b) => a - b);
      setText(
        $("appVersion"),
        !v.length ? "wersja deweloperska" : v.length > 1 ? `v${v[0]} (czeka v${v[v.length - 1]})` : `v${v[0]}`
      );
    } catch {
      setText($("appVersion"), "wersja deweloperska");
    }
  }

  function setWaiting(worker) {
    waiting = worker;
    showBar();
    showVersion();
    msg("Nowa wersja czeka na instalację.");
  }

  const track = worker =>
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
    });

  async function check(manual) {
    if (!registration) {
      if (manual) msg("Aktualizacje działają tylko w wersji otwartej z internetu.");
      return;
    }
    try {
      if (manual) msg("Sprawdzam…");
      await registration.update();
      if (registration.installing) {
        track(registration.installing);
        if (manual) msg("Pobieram nową wersję…");
      } else if (registration.waiting) setWaiting(registration.waiting);
      else if (manual) msg("Masz najnowszą wersję.");
    } catch {
      if (manual) msg("Nie udało się sprawdzić (brak internetu?).");
    }
  }

  $("btnCheckUpd").onclick = () => {
    dismissed = false;
    check(true);
  };
  $("btnUpdLater").onclick = () => {
    dismissed = true;
    showBar();
  };
  $("btnUpdate").onclick = () => {
    if (app.isTrainingActive()) {
      showIf($("updBar"), false);
      return;
    }
    if (!waiting) {
      location.reload();
      return;
    }
    $("btnUpdate").disabled = true;
    setText($("btnUpdate"), "Aktualizuję…");
    requested = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => {
      if (!reloading) location.reload();
    }, 4000); // zapas, gdyby zdarzenie nie przyszło
  };

  // po zakończeniu treningu pokaż odłożony pasek
  store.subscribe((st, prev) => {
    if (st.workoutRev !== prev.workoutRev && waiting) showBar();
  });

  showVersion();
  const swAllowed =
    "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost");
  if (!swAllowed) return;
  // przeładuj tylko po kliknięciu „Aktualizuj” (nie przy pierwszej instalacji)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!requested || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register("sw.js")
    .then(reg => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      track(reg.installing);
      reg.addEventListener("updatefound", () => track(reg.installing));
      setInterval(() => check(false), CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check(false);
      });
      showVersion();
    })
    .catch(e => app.log(`Service worker: ${e.message}`));
}
