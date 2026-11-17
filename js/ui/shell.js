// Elementy wspólne dla całej strony: nagłówek z połączeniem, zakładki, pasek pierwszego uruchomienia.

import { $, setText, showIf } from "./dom.js";

const TABS = ["train", "programs", "history", "settings", "help"];

/**
 * @param {import("../app/store.js").Store<import("../app/controller.js").AppState>} store
 * @param {import("../app/controller.js").Controller} app
 * @param {{helpSeen: boolean}} options
 */
export function initShell(store, app, { helpSeen }) {
  // ---- połączenie
  $("btnConnect").onclick = () => app.connect();
  $("btnDisconnect").onclick = () => app.disconnect();

  function renderConnection() {
    const t = store.get().treadmill;
    const connected = t.state === "connected";
    $("connDot").className = "dot" + (connected ? " ok" : t.state === "connecting" ? " mid" : "");
    setText(
      $("connText"),
      connected
        ? t.name || "Połączona"
        : t.state === "connecting"
          ? "Łączenie…"
          : t.known
            ? "Rozłączona"
            : "Niepołączona"
    );
    showIf($("btnConnect"), !connected);
    setText($("btnConnect"), t.known ? "Połącz ponownie" : "Połącz z bieżnią");
    showIf($("btnDisconnect"), connected);
    showIf($("noBt"), !t.available);
    $("btnConnect").disabled = !t.available;
  }
  store.subscribe((st, prev) => {
    if (st.treadmill !== prev.treadmill) renderConnection();
  });
  renderConnection();

  // ---- zakładki
  const buttons = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll(".tabs button")]);
  const openTab = name => {
    for (const b of buttons) b.classList.toggle("active", b.dataset.tab === name);
    for (const t of TABS) showIf($(`tab-${t}`), t === name);
  };
  for (const b of buttons) b.addEventListener("click", () => openTab(b.dataset.tab));

  // ---- pasek „Pierwszy raz tutaj?”
  const hideFirstRun = () => {
    showIf($("firstRun"), false);
    app.markHelpSeen();
  };
  showIf($("firstRun"), !helpSeen);
  $("btnFirstHelp").onclick = () => {
    hideFirstRun();
    openTab("help");
    window.scrollTo(0, 0);
  };
  $("btnFirstClose").onclick = hideFirstRun;
  buttons.find(b => b.dataset.tab === "help")?.addEventListener("click", hideFirstRun);

  return { openTab };
}
