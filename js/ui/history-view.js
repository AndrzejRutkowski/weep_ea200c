// Zakładka „Historia”: podsumowania, wykres dystansu (dni / tygodnie / miesiące), lista treningów, kopia JSON.

import { $, downloadText, readFileText, setHtml, setText, today } from "./dom.js";
import { escapeHtml, fmtDuration, fmtNum, fmtTime, plural } from "../util/format.js";
import { PERIOD_COUNT, monthStart, periodTotals, summarize, weekStart } from "../domain/history.js";

const BADGE = { ukończony: "ok", zatrzymany: "stop", przerwany: "int" };

/** Opisy okresów: tytuł wykresu, krótka etykieta pod słupkiem i pełna nazwa w podpowiedzi. */
const PERIODS = {
  day: {
    title: n => `Dystans – ostatnie ${n} dni`,
    label: d => String(d.getDate()),
    full: d => d.toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "numeric" })
  },
  week: {
    title: n => `Dystans – ostatnie ${n} tygodni`,
    label: d => d.toLocaleDateString("pl-PL", { day: "numeric", month: "numeric" }),
    full: d => `Tydzień od ${d.toLocaleDateString("pl-PL", { day: "numeric", month: "numeric" })}`
  },
  month: {
    title: n => `Dystans – ostatnie ${n} miesięcy`,
    // rok w drugiej linii przy styczniu i na pierwszym słupku, żeby było widać przełom roku
    label: (d, i) =>
      `${d.toLocaleDateString("pl-PL", { month: "short" })}<br>${i === 0 || d.getMonth() === 0 ? `'${String(d.getFullYear()).slice(2)}` : "&nbsp;"}`,
    full: d => d.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })
  }
};

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

    renderChart(list, now);

    setHtml(
      $("hList"),
      list.length
        ? list.map(entryHtml).join("")
        : `<p class="hint">Brak treningów. Pojawią się tu po pierwszym programie.</p>`
    );
  }

  function renderChart(list, now) {
    const unit = store.get().settings.historyGroup;
    const n = PERIOD_COUNT[unit];
    const fmt = PERIODS[unit];
    const periods = periodTotals(list, now, unit, n);
    const maxD = Math.max(1, ...periods.map(p => p.dist));
    setText($("hChartTitle"), fmt.title(n));
    for (const b of $("hGroup").querySelectorAll("button")) b.classList.toggle("active", b.dataset.g === unit);
    const chart = $("hWeeks");
    chart.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    chart.classList.toggle("dense", n > 8);
    setHtml(
      chart,
      periods
        .map((p, i) => {
          const d = new Date(p.start);
          const tip =
            `${fmt.full(d)}: ${fmtNum(p.dist, 2)} km, ${p.count} ${plural(p.count, ["trening", "treningi", "treningów"])}` +
            (p.count ? `, ${fmtDuration(p.time)}` : "");
          return (
            `<div class="col${i === periods.length - 1 ? " cur" : ""}" title="${escapeHtml(tip)}"><div class="val">${p.dist ? fmtNum(p.dist, 1) : ""}</div>` +
            `<div class="bar" style="height:${((p.dist / maxD) * 100).toFixed(1)}px"></div><div class="lab">${fmt.label(d, i)}</div></div>`
          );
        })
        .join("")
    );
  }

  $("hGroup").addEventListener("click", e => {
    const b = e.target.closest("button[data-g]");
    if (b) app.updateSettings({ historyGroup: b.dataset.g });
  });

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
    if (st.history !== prev.history || st.settings.historyGroup !== prev.settings.historyGroup) render();
  });
  render();
}
