// Zakładka „Ustawienia”: formularz ustawień, informacje o bieżni i log Bluetooth.

import { $, setHtml } from "./dom.js";
import { escapeHtml } from "../util/format.js";

/**
 * @param {import("../app/store.js").Store<import("../app/controller.js").AppState>} store
 * @param {import("../app/controller.js").Controller} app
 */
export function initSettingsView(store, app) {
  const fields = {
    setDelay: ["startDelay", "value"],
    setEnd: ["endAction", "value"],
    setInclDeg: ["inclMaxDeg", "value"],
    setSpdStep: ["spdStep", "value"],
    setBeep: ["beep", "checked"],
    setVoice: ["voice", "checked"]
  };

  function fillForm() {
    const s = store.get().settings;
    for (const [id, [key, prop]] of Object.entries(fields)) $(id)[prop] = s[key];
  }

  for (const [id, [key, prop]] of Object.entries(fields)) {
    $(id).addEventListener("change", () => {
      app.updateSettings({ [key]: $(id)[prop] });
      fillForm(); // pokaż wartość po walidacji (np. przyciętą do zakresu)
    });
  }

  function renderDevice() {
    const t = store.get().treadmill;
    const connected = t.state === "connected";
    const rows = [["Status", connected ? "połączona" : t.state === "connecting" ? "łączenie…" : "niepołączona"]];
    if (t.name) rows.push(["Nazwa", t.name]);
    for (const k of ["Producent", "Model", "Firmware", "Hardware", "Nr seryjny"])
      if (t.info[k]) rows.push([k, t.info[k]]);
    if (connected) {
      const sr = t.speedRange;
      const ir = t.inclineRange;
      rows.push(["Prędkość", `${sr.min}–${sr.max} km/h, krok ${sr.inc}${sr.known ? "" : " (domyślnie)"}`]);
      rows.push(["Nachylenie", `${ir.min}–${ir.max}, krok ${ir.inc}${ir.known ? "" : " (domyślnie)"}`]);
      rows.push([
        "Sterowanie",
        t.canControl
          ? `prędkość: ${t.canSpeed ? "tak" : "nie"}, nachylenie: ${t.canIncline ? "tak" : "nie"}`
          : "brak (tylko odczyt)"
      ]);
    }
    setHtml($("devInfo"), rows.map(([a, b]) => `<div>${a}</div><div>${escapeHtml(b)}</div>`).join(""));
  }

  function renderLog() {
    const el = $("log");
    el.textContent = store.get().log.join("\n");
    el.scrollTop = el.scrollHeight;
  }

  $("btnCopyLog").onclick = async () => {
    try {
      await navigator.clipboard.writeText(store.get().log.join("\n"));
      $("btnCopyLog").textContent = "Skopiowano";
    } catch {
      /* brak dostępu */
    }
  };

  store.subscribe((st, prev) => {
    if (st.treadmill !== prev.treadmill) renderDevice();
    if (st.log !== prev.log) renderLog();
    if (st.settings !== prev.settings) fillForm();
  });
  fillForm();
  renderDevice();
  renderLog();
}
