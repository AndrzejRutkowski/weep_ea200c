// Zakładka „Trening”: odczyty z bieżni, wybór programu, wykres z podpowiedzią,
// przebieg treningu, przyciski sterowania i sterowanie ręczne.

import { $, setHtml, setText, showIf } from "./dom.js";
import { positionTooltip, renderProgramChart, segmentAtX, segmentTooltipHtml } from "./chart.js";
import { escapeHtml, fmtLevel, fmtNum, fmtTime } from "../util/format.js";
import { programDistance, programDuration } from "../domain/program.js";
import { describeIncline } from "../domain/units.js";

/**
 * @param {import("../app/store.js").Store<import("../app/controller.js").AppState>} store
 * @param {import("../app/controller.js").Controller} app
 */
export function initTrainView(store, app) {
  const svg = $("profileTrain");
  const tip = $("segTip");
  let tipIdx = null;
  let tipX = 0;

  const s = () => store.get();
  const describe = level => describeIncline(level, s().treadmill.inclineRange.max, s().settings.inclMaxDeg);
  const activeWorkout = () => (s().workout?.active ? s().workout : null);
  const shownProgram = () => activeWorkout()?.program ?? s().programs.find(p => p.id === s().selectedId);

  // ---------------------------------------------------------------- przyciski
  $("btnStart").onclick = () => app.startProgram();
  $("btnPause").onclick = () => app.pause();
  $("btnResume").onclick = () => app.resume();
  $("btnStop").onclick = () => app.stop();
  $("btnPrev").onclick = () => app.previous();
  $("btnNext").onclick = () => app.skip();
  $("btnPlus").onclick = () => app.addMinute();
  $("spdUp").onclick = () => app.changeSpeed(1);
  $("spdDown").onclick = () => app.changeSpeed(-1);
  $("incUp").onclick = () => app.changeIncline(1);
  $("incDown").onclick = () => app.changeIncline(-1);
  $("btnBeltStart").onclick = () => app.beltStart();
  $("btnBeltPause").onclick = () => app.beltPause();
  $("selProgram").onchange = e => {
    hideTip();
    app.selectProgram(e.target.value);
  };

  // ---------------------------------------------------------------- wykres i podpowiedź
  function drawChart() {
    const p = shownProgram();
    if (!p) return;
    const w = activeWorkout();
    const { inclineMax } = renderProgramChart(svg, p, {
      speedMax: s().treadmill.speedRange.max,
      inclineMax: s().treadmill.inclineRange.max,
      progress: w ? w.elapsedPlanned : null,
      activeIndex: w ? w.segIdx : null,
      hoverIndex: tipIdx
    });
    setText($("inclScale"), `poz. 0–${fmtLevel(inclineMax)}`);
    if (tipIdx != null) updateTip();
  }

  function updateTip() {
    const p = shownProgram();
    if (!p || tipIdx == null || !p.segments[tipIdx]) {
      hideTip();
      return;
    }
    const w = activeWorkout();
    tip.innerHTML = segmentTooltipHtml(p, tipIdx, {
      speedRange: s().treadmill.speedRange,
      describeIncline: describe,
      workout: w ? { segIdx: w.segIdx, elapsed: w.elapsedPlanned } : null
    });
    showIf(tip, true);
    positionTooltip(tip, $("profWrap"), tipX);
  }

  function showTipAt(clientX) {
    const p = shownProgram();
    const i = p ? segmentAtX(svg, p, clientX) : null;
    if (i == null) return;
    tipX = clientX;
    if (i !== tipIdx) {
      tipIdx = i;
      drawChart();
    } else updateTip();
  }

  function hideTip() {
    if (tipIdx == null && tip.classList.contains("hidden")) return;
    tipIdx = null;
    showIf(tip, false);
    drawChart();
  }

  svg.addEventListener("pointermove", e => showTipAt(e.clientX));
  svg.addEventListener("pointerdown", e => showTipAt(e.clientX));
  svg.addEventListener("pointerleave", e => {
    if (e.pointerType === "mouse") hideTip();
  });
  document.addEventListener("pointerdown", e => {
    if (tipIdx != null && !(/** @type {Element} */ (e.target).closest("#profileTrain"))) hideTip();
  });
  if (window.ResizeObserver) new ResizeObserver(() => drawChart()).observe(svg);

  // ---------------------------------------------------------------- renderowanie
  function renderStats(st) {
    const d = st.treadmill.data;
    const w = st.workout;
    setText($("sSpeed"), fmtNum(d.speed));
    setText($("sIncl"), fmtLevel(d.incline));
    setText($("sInclX"), d.incline == null ? " " : describe(d.incline));
    setText($("sKcal"), d.kcal == null ? "–" : String(d.kcal));
    setText($("sHr"), d.hr == null ? "–" : String(d.hr));
    setText($("sTime"), fmtTime(w ? w.t : 0));
    setText($("sDist"), w ? fmtNum(w.dist, 2) : d.dist == null ? "0,00" : fmtNum(d.dist / 1000, 2));
    const sp = st.treadmill.target.speed ?? d.speed;
    const inc = st.treadmill.target.incline ?? d.incline;
    setText($("mSpeed"), fmtNum(sp));
    setText($("mIncl"), fmtLevel(inc));
    setText($("mInclX"), inc == null ? " " : describe(inc));
  }

  function renderProgramSelect(st) {
    setHtml(
      $("selProgram"),
      st.programs
        .map(p => `<option value="${p.id}" ${p.id === st.selectedId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
        .join("")
    );
    $("selProgram").value = st.selectedId;
    const p = st.programs.find(x => x.id === st.selectedId);
    setText(
      $("progInfo"),
      p ? `${p.segments.length} odc. · ${fmtTime(programDuration(p))} · ~${fmtNum(programDistance(p), 2)} km` : ""
    );
  }

  function segmentLabel(seg) {
    const incl = s().treadmill.canIncline ? `, poz. ${fmtLevel(seg.incline)} (${describe(seg.incline)})` : "";
    return `${fmtNum(seg.speed)} km/h${incl}`;
  }

  function renderRun(st) {
    const w = st.workout;
    const active = !!w?.active;
    $("selProgram").disabled = active;
    showIf($("segBox"), active);
    showIf($("btnStart"), !active);
    showIf($("btnPause"), active && w.phase !== "paused");
    showIf($("btnResume"), active && w.phase === "paused");
    // Stop jest zawsze dostępny, ale wyróżniony tylko wtedy, gdy jest co zatrzymać
    $("btnStop").classList.toggle("danger", active || (st.treadmill.data.speed || 0) > 0);
    for (const id of ["btnPrev", "btnNext", "btnPlus"]) $(id).disabled = !active;
    $("btnStart").disabled = st.treadmill.state !== "connected";
    showIf($("runWarn"), !!st.runWarning);
    setText($("runWarn"), st.runWarning || "");

    if (active) {
      const seg = w.current;
      const nx = w.next;
      setText($("segName"), `${w.segIdx + 1}/${w.segments.length} · ${seg.name || "Odcinek"}`);
      setText($("segRemain"), fmtTime(w.segmentRemaining));
      setText($("segTarget"), `Cel: ${segmentLabel(seg)}`);
      $("segBar").style.width = `${((w.segT / seg.dur) * 100).toFixed(1)}%`;
      setText(
        $("segNext"),
        nx ? `${nx.name || "Odcinek"} – ${segmentLabel(nx)} przez ${fmtTime(nx.dur)}` : "koniec programu"
      );
      setText($("progRemain"), fmtTime(w.remainingPlanned));
      const wait = Math.max(0, Math.ceil(w.wait));
      setText(
        $("phaseMsg"),
        {
          starting: `Start taśmy… prędkość odcinka za ${wait} s`,
          resuming: `Wznawianie… ${wait} s`,
          paused: `Pauza${w.pausedBy ? ` (${w.pausedBy})` : ""}`,
          running: ""
        }[w.phase] ?? ""
      );
    } else {
      setText($("phaseMsg"), st.notice || "");
    }

    const sum = st.summary;
    showIf($("summary"), !!sum);
    if (sum) {
      setHtml(
        $("summary"),
        `<b>${escapeHtml(sum.title)}</b><br>
        Czas: <b>${fmtTime(sum.time)}</b> · Dystans: <b>${fmtNum(sum.dist, 2)} km</b>` +
          (sum.kcal != null ? ` · Kalorie: <b>${sum.kcal} kcal</b>` : "") +
          (sum.elev >= 1 ? ` · Przewyższenie: <b>${Math.round(sum.elev)} m</b>` : "") +
          `<br><span class="hint">${sum.saved ? "Zapisano w historii." : "Za krótki trening (poniżej minuty) – nie zapisano w historii."}</span>`
      );
    }
  }

  store.subscribe((st, prev) => {
    if (st.treadmill !== prev.treadmill || st.workoutRev !== prev.workoutRev || st.settings !== prev.settings)
      renderStats(st);
    if (st.programs !== prev.programs || st.selectedId !== prev.selectedId) {
      renderProgramSelect(st);
      if (!st.workout?.active) hideTip();
    }
    if (
      st.workoutRev !== prev.workoutRev ||
      st.treadmill !== prev.treadmill ||
      st.summary !== prev.summary ||
      st.runWarning !== prev.runWarning ||
      st.notice !== prev.notice ||
      st.selectedId !== prev.selectedId
    )
      renderRun(st);
    if (
      st.workoutRev !== prev.workoutRev ||
      st.programs !== prev.programs ||
      st.selectedId !== prev.selectedId ||
      st.settings !== prev.settings ||
      st.treadmill.speedRange.max !== prev.treadmill.speedRange.max ||
      st.treadmill.inclineRange.max !== prev.treadmill.inclineRange.max
    )
      drawChart();
  });

  const st = s();
  renderStats(st);
  renderProgramSelect(st);
  renderRun(st);
  drawChart();
}
