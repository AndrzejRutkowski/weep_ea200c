// Zakładka „Programy”: lista programów (z przeciąganiem), edytor odcinków,
// generator interwałów oraz eksport i import JSON.

import { $, confirmButton, downloadText, readFileText, setHtml, setText, today } from "./dom.js";
import { renderProgramChart } from "./chart.js";
import { escapeHtml, fmtNum, fmtTime, parseNum, parseTime } from "../util/format.js";
import { createSegment, generateIntervals, programDistance, programDuration } from "../domain/program.js";
import { describeIncline } from "../domain/units.js";

/**
 * @param {import("../app/store.js").Store<import("../app/controller.js").AppState>} store
 * @param {import("../app/controller.js").Controller} app
 */
export function initProgramsView(store, app) {
  const s = () => store.get();
  const editing = () => s().programs.find(p => p.id === s().editId);
  const plist = $("plist");
  let rowsKey = ""; // przerysowujemy wiersze tylko przy zmianie struktury, żeby nie gubić fokusu

  // ---------------------------------------------------------------- lista programów
  function renderList() {
    if (drag.item) return; // nie przerysowuj w trakcie przeciągania
    setHtml(
      plist,
      s()
        .programs.map(
          p =>
            `<div class="pitem" data-pid="${p.id}"><span class="handle" tabindex="0" role="button" aria-label="Zmień kolejność: ${escapeHtml(p.name)}" title="Przeciągnij, żeby zmienić kolejność (lub strzałki ↑↓)">⠿</span>` +
            `<button data-id="${p.id}" class="${p.id === s().editId ? "sel" : ""}">${escapeHtml(p.name)}<br><span class="hint">${fmtTime(programDuration(p))} · ${p.segments.length} odc.</span></button></div>`
        )
        .join("")
    );
  }

  plist.addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (b) app.openInEditor(b.dataset.id);
  });

  // przeciąganie (mysz i dotyk) – element przesuwa się na żywo, kolejność zapisuje się po puszczeniu
  const drag = { item: null, pointer: null, timer: null, y: 0 };
  function dragMove(y) {
    drag.y = y;
    const items = [...plist.querySelectorAll(".pitem")].filter(el => el !== drag.item);
    const after = items.find(el => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (after) {
      if (drag.item.nextElementSibling !== after) plist.insertBefore(drag.item, after);
    } else if (plist.lastElementChild !== drag.item) plist.appendChild(drag.item);
  }
  function autoScroll() {
    const edge = 70;
    if (drag.y < edge) window.scrollBy(0, -12);
    else if (drag.y > window.innerHeight - edge) window.scrollBy(0, 12);
    else return;
    dragMove(drag.y);
  }
  function endDrag() {
    if (!drag.item) return;
    drag.item.classList.remove("dragging");
    document.body.classList.remove("reordering");
    clearInterval(drag.timer);
    drag.item = null;
    drag.pointer = null;
    plist._html = null; // DOM zmieniony ręcznie – wymuś przerysowanie
    app.reorderPrograms([...plist.querySelectorAll(".pitem")].map(el => el.dataset.pid));
    renderList();
  }
  plist.addEventListener("pointerdown", e => {
    const h = e.target.closest(".handle");
    if (!h || drag.item) return;
    e.preventDefault();
    drag.item = h.closest(".pitem");
    drag.pointer = e.pointerId;
    drag.y = e.clientY;
    try {
      h.setPointerCapture(e.pointerId);
    } catch {
      /* starsze przeglądarki */
    }
    drag.item.classList.add("dragging");
    document.body.classList.add("reordering");
    drag.timer = setInterval(autoScroll, 16);
  });
  plist.addEventListener("pointermove", e => {
    if (drag.item && e.pointerId === drag.pointer) {
      e.preventDefault();
      dragMove(e.clientY);
    }
  });
  plist.addEventListener("pointerup", e => {
    if (e.pointerId === drag.pointer) endDrag();
  });
  plist.addEventListener("pointercancel", e => {
    if (e.pointerId === drag.pointer) endDrag();
  });
  plist.addEventListener("keydown", e => {
    const h = e.target.closest(".handle");
    if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const id = h.closest(".pitem").dataset.pid;
    app.moveProgram(id, e.key === "ArrowUp" ? -1 : 1);
    plist.querySelector(`.pitem[data-pid="${id}"] .handle`)?.focus();
  });

  $("btnNewProg").onclick = () => {
    app.addProgram();
    $("edName").focus();
    $("edName").select();
  };
  $("btnDupProg").onclick = () => app.duplicateProgram(s().editId);
  confirmButton(
    $("btnDelProg"),
    "Na pewno?",
    () => {
      if (!app.deleteProgram(s().editId)) {
        $("btnDelProg").textContent = "Musi zostać 1";
        setTimeout(() => ($("btnDelProg").textContent = "Usuń"), 1500);
      }
    },
    () => (s().programs.length <= 1 ? "" : s().editId)
  );

  // ---------------------------------------------------------------- edytor odcinków
  function renderRows() {
    const p = editing();
    if (!p) return;
    rowsKey = p.id + ":" + p.segments.map(x => x.id).join(",");
    $("segList").innerHTML = p.segments
      .map(
        (seg, i) => `
      <div class="segrow" data-i="${i}">
        <div class="idx">${i + 1}</div>
        <input class="nm" data-f="name" value="${escapeHtml(seg.name || "")}" placeholder="Odcinek ${i + 1}">
        <input data-f="dur" value="${fmtTime(seg.dur)}" inputmode="numeric" title="czas m:ss">
        <input data-f="speed" type="number" step="0.1" min="0" value="${seg.speed}" inputmode="decimal" title="km/h">
        <input data-f="incline" type="number" step="1" value="${seg.incline ?? 0}" inputmode="decimal" title="nachylenie">
        <div class="acts">
          <button class="sm ghost" data-a="up" title="w górę">↑</button>
          <button class="sm ghost" data-a="down" title="w dół">↓</button>
          <button class="sm ghost" data-a="dup" title="duplikuj">⧉</button>
          <button class="sm ghost" data-a="del" title="usuń">✕</button>
        </div>
      </div>`
      )
      .join("");
  }

  function renderInfo() {
    const p = editing();
    if (!p) return;
    const { speedRange: sr, inclineRange: ir } = s().treadmill;
    renderProgramChart($("profileEdit"), p, { speedMax: sr.max, inclineMax: ir.max });
    const warn = [];
    if (p.segments.some(x => x.speed > sr.max || x.speed < sr.min))
      warn.push(`prędkość poza zakresem ${sr.min}–${sr.max} km/h zostanie przycięta`);
    if (p.segments.some(x => (x.incline || 0) > ir.max || (x.incline || 0) < ir.min))
      warn.push(`nachylenie poza zakresem ${ir.min}–${ir.max} zostanie przycięte`);
    setHtml(
      $("edInfo"),
      `Łącznie <b>${fmtTime(programDuration(p))}</b> · ~${fmtNum(programDistance(p), 2)} km · nachylenie: poz. 0–${ir.max} ` +
        `(poz. ${ir.max} ${describeIncline(ir.max, ir.max, s().settings.inclMaxDeg)})` +
        (warn.length ? ` · <span style="color:var(--warn)">${warn.join("; ")}</span>` : "")
    );
    if (document.activeElement !== $("edName")) $("edName").value = p.name;
  }

  $("segList").addEventListener("change", e => {
    const row = e.target.closest(".segrow");
    if (!row) return;
    const i = +row.dataset.i;
    const f = e.target.dataset.f;
    const seg = editing().segments[i];
    let v;
    if (f === "name") v = e.target.value;
    if (f === "dur") {
      const t = parseTime(e.target.value);
      v = t > 0 ? t : seg.dur;
      e.target.value = fmtTime(v);
    }
    if (f === "speed") {
      const n = parseNum(e.target.value);
      v = n >= 0 ? Math.round(n * 10) / 10 : seg.speed;
      e.target.value = v;
    }
    if (f === "incline") {
      const n = parseNum(e.target.value);
      v = isNaN(n) ? seg.incline : Math.round(n * 10) / 10;
      e.target.value = v;
    }
    app.updateProgram(s().editId, p => {
      p.segments[i][f] = v;
    });
  });

  $("segList").addEventListener("click", e => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const i = +b.closest(".segrow").dataset.i;
    app.updateProgram(s().editId, p => {
      const a = p.segments;
      if (b.dataset.a === "up" && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
      if (b.dataset.a === "down" && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
      if (b.dataset.a === "dup") a.splice(i + 1, 0, createSegment(a[i].name, a[i].dur, a[i].speed, a[i].incline));
      if (b.dataset.a === "del") a.splice(i, 1);
    });
  });

  $("btnAddSeg").onclick = () =>
    app.updateProgram(s().editId, p => {
      const last = p.segments[p.segments.length - 1];
      p.segments.push(createSegment("", 60, last ? last.speed : 5, last ? last.incline : 0));
    });

  $("btnGen").onclick = () => {
    const segs = generateIntervals({
      count: parseInt($("gN").value),
      workDur: parseTime($("gW").value),
      workSpeed: parseNum($("gWs").value),
      restDur: parseTime($("gR").value),
      restSpeed: parseNum($("gRs").value),
      incline: parseNum($("gI").value) || 0
    });
    if (segs.length)
      app.updateProgram(s().editId, p => {
        p.segments.push(...segs);
      });
  };

  $("edName").addEventListener("input", e =>
    app.updateProgram(s().editId, p => {
      p.name = e.target.value || "Bez nazwy";
    })
  );

  // ---------------------------------------------------------------- eksport / import
  const msg = text => setText($("ioMsg"), text);
  $("btnExportFile").onclick = () => {
    const json = app.exportPrograms();
    if (downloadText(json, `programy-bieznia-${today()}.json`)) msg("Pobrano plik.");
    else {
      $("jsonBox").value = json;
      msg("Pobieranie niedostępne – JSON jest w polu poniżej.");
    }
  };
  $("btnExportCopy").onclick = async () => {
    $("jsonBox").value = app.exportPrograms();
    try {
      await navigator.clipboard.writeText($("jsonBox").value);
      msg("Skopiowano do schowka.");
    } catch {
      $("jsonBox").select();
      msg("Zaznaczono – skopiuj ręcznie.");
    }
  };
  const doImport = text => {
    try {
      msg(`Dodano programów: ${app.importPrograms(text)}.`);
    } catch (e) {
      msg(`Błąd importu: ${e.message}`);
    }
  };
  $("btnImportText").onclick = () => doImport($("jsonBox").value);
  $("fileImport").onchange = async e => {
    const f = e.target.files[0];
    if (f) doImport(await readFileText(f));
    e.target.value = "";
  };

  // ---------------------------------------------------------------- odświeżanie
  const rangesKey = st => {
    const { speedRange: sr, inclineRange: ir } = st.treadmill;
    return `${sr.min}/${sr.max}/${ir.min}/${ir.max}`;
  };
  if (window.ResizeObserver)
    new ResizeObserver(() => {
      if ($("profileEdit").clientWidth) renderInfo();
    }).observe($("profileEdit"));

  store.subscribe((st, prev) => {
    if (st.programs !== prev.programs || st.editId !== prev.editId) {
      renderList();
      const p = editing();
      if (p && rowsKey !== p.id + ":" + p.segments.map(x => x.id).join(",")) renderRows();
    }
    if (
      st.programs !== prev.programs ||
      st.editId !== prev.editId ||
      st.settings !== prev.settings ||
      rangesKey(st) !== rangesKey(prev)
    )
      renderInfo();
  });

  renderList();
  renderRows();
  renderInfo();
}
