// Zakładka „Historia”: podsumowania, wykres 8 tygodni, lista treningów, kopia JSON.

import { $, downloadText, readFileText, setHtml, setText, today } from "./dom.js";
import { escapeHtml, fmtDuration, fmtNum, fmtTime, plural } from "../util/format.js";
import { monthStart, summarize, weekStart, weeklyDistance } from "../domain/history.js";

const BADGE = { ukończony: "ok", zatrzymany: "stop", przerwany: "int" };

/**
 * @param {import("../app/store.js").Store<import("../app/controller.js").AppState>} store
 * @param {import("../app/controller.js").Controller} app
 */
export function initHistoryView(store, app) {
  function tile(label, list) {
    const x = summarize(list);
    return `<div class="stat"><div class="l">${label}</div><div class="v">${fmtNum(x.dist, 1)}<span class="u">km</span></div>
      <div class="l">${x.count} ${plural(x.count, ["trening", "treningi", "treningów"])} · ${fmtDuration(x.time)}${x.kcal ? ` · ${x.kcal} kcal` : ""}</div></div>`;
  }

  function entryHtml(h) {
    const d = new Date(h.start);
    const when =
      d.toLocaleDateString("pl-PL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
      }) +
      ", " +
      d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    const avg = h.duration ? h.dist / (h.duration / 3600) : 0;
    const details = [
      fmtTime(h.duration),
      `${fmtNum(h.dist, 2)} km`,
      `śr. ${fmtNum(avg)} km/h`,
      h.maxSpeed ? `maks. ${fmtNum(h.maxSpeed)} km/h` : "",
      h.kcal != null ? `${h.kcal} kcal` : "",
      h.elev ? `↗ ${h.elev} m` : "",
      h.status !== "ukończony" ? `odcinki ${h.segDone}/${h.segTotal}` : ""
    ]
      .filter(Boolean)
      .join(" · ");
    return `<div class="hitem" data-id="${h.id}">
      <div><span class="t">${escapeHtml(h.program)}</span><span class="badge ${BADGE[h.status] || "stop"}">${h.status}</span><div class="d">${when}</div></div>
      <div><button class="sm ghost" data-del="${h.id}" title="Usuń z historii">✕</button></div>
      <div class="m">${details}</div>
    </div>`;
  }

  function render() {
    const list = store.get().history;
    const now = Date.now();
    setHtml(
      $("hStats"),
      tile(
        "Ten tydzień",
        list.filter(h => h.start >= weekStart(now))
      ) +
        tile(
          "Ten miesiąc",
          list.filter(h => h.start >= monthStart(now))
        ) +
        tile("Łącznie", list)
    );

    const weeks = weeklyDistance(list, now, 8);
    const maxD = Math.max(1, ...weeks.map(w => w.dist));
    setHtml(
      $("hWeeks"),
      weeks
        .map((w, i) => {
          const label = new Date(w.start).toLocaleDateString("pl-PL", { day: "numeric", month: "numeric" });
          return (
            `<div class="col${i === weeks.length - 1 ? " cur" : ""}" title="Tydzień od ${label}"><div class="val">${w.dist ? fmtNum(w.dist, 1) : ""}</div>` +
            `<div class="bar" style="height:${((w.dist / maxD) * 100).toFixed(1)}px"></div><div class="lab">${label}</div></div>`
          );
        })
        .join("")
    );

    setHtml(
      $("hList"),
      list.length
        ? list.map(entryHtml).join("")
        : `<p class="hint">Brak treningów. Pojawią się tu po pierwszym programie.</p>`
    );
  }

  // usuwanie: pierwsze kliknięcie pyta „Usuń?”, drugie usuwa
  let armed = null;
  $("hList").addEventListener("click", e => {
    const b = e.target.closest("button[data-del]");
    if (!b) return;
    const id = b.dataset.del;
    if (armed !== id) {
      armed = id;
      b.textContent = "Usuń?";
      setTimeout(() => {
        if (armed === id) {
          armed = null;
          b.textContent = "✕";
        }
      }, 3000);
      return;
    }
    armed = null;
    app.deleteHistoryEntry(id);
  });

  const msg = t => setText($("hMsg"), t);
  $("btnHistExport").onclick = () =>
    msg(
      downloadText(app.exportHistory(), `historia-bieznia-${today()}.json`)
        ? "Pobrano kopię historii."
        : "Pobieranie nie powiodło się."
    );
  $("histImport").onchange = async e => {
    const f = e.target.files[0];
    if (f) {
      try {
        msg(`Dodano treningów: ${app.importHistory(await readFileText(f))}.`);
      } catch (err) {
        msg(`Błąd importu: ${err.message}`);
      }
    }
    e.target.value = "";
  };

  store.subscribe((st, prev) => {
    if (st.history !== prev.history) render();
  });
  render();
}
