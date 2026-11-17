// @ts-check
// Warstwa aplikacji: łączy silnik treningu, bieżnię, zapis danych i stan widoków.
// Widoki wywołują tylko akcje z tego modułu i czytają stan ze store – nie rozmawiają z bieżnią bezpośrednio.

import { RESULT, STATUS } from "../ftms/protocol.js";
import { copyProgram, moveItem, newProgram, parseProgramsJson, programsToJson } from "../domain/program.js";
import { WorkoutEngine } from "../domain/workout-engine.js";
import { createEntry, historyToJson, mergeHistoryJson, upsertEntry } from "../domain/history.js";
import { normalizeSettings } from "../domain/settings.js";
import { inclineGrade } from "../domain/units.js";
import { fmtNum } from "../util/format.js";

/** @typedef {import("../domain/program.js").Program} Program */
/** @typedef {import("../domain/settings.js").Settings} Settings */
/** @typedef {import("../domain/history.js").HistoryEntry} HistoryEntry */
/** @typedef {import("../ftms/treadmill.js").Treadmill} Treadmill */

/**
 * @typedef {object} TreadmillView  Migawka stanu bieżni dla widoków.
 * @property {"disconnected"|"connecting"|"connected"} state
 * @property {boolean} available   czy przeglądarka ma Web Bluetooth
 * @property {boolean} known       czy wybrano już urządzenie (wtedy „Połącz ponownie”)
 * @property {string} name
 * @property {Record<string,string>} info
 * @property {import("../ftms/protocol.js").Range} speedRange
 * @property {import("../ftms/protocol.js").Range} inclineRange
 * @property {boolean} canSpeed
 * @property {boolean} canIncline
 * @property {boolean} canControl
 * @property {import("../ftms/protocol.js").TreadmillData} data
 * @property {{speed: number|null, incline: number|null}} target
 */

/**
 * @typedef {object} AppState
 * @property {Program[]} programs
 * @property {string} selectedId   program wybrany w zakładce Trening
 * @property {string} editId       program otwarty w edytorze
 * @property {Settings} settings
 * @property {HistoryEntry[]} history
 * @property {TreadmillView} treadmill
 * @property {WorkoutEngine|null} workout   bieżący albo ostatni trening
 * @property {number} workoutRev            zwiększany przy każdej zmianie treningu (silnik jest mutowalny)
 * @property {{title: string, time: number, dist: number, kcal: number|null, elev: number, saved: boolean}|null} summary
 * @property {string|null} runWarning
 * @property {string} notice                komunikat pod wykresem, gdy nie trwa trening
 * @property {string[]} log
 */

const TICK_MS = 250;
const LOG_LINES = 300;

/**
 * @param {{store: import("./store.js").Store<AppState>, repo: import("../storage/repository.js").Repository,
 *          treadmill: Treadmill, feedback: import("./feedback.js").Feedback}} deps
 */
export function createController({ store, repo, treadmill, feedback }) {
  const tm = treadmill;
  let startKcal = /** @type {number|null} */ (null);
  let lastTick = performance.now();

  // ---------------------------------------------------------------- pomocnicze
  const state = () => store.get();
  const engine = () => state().workout;
  const active = () => !!engine()?.active;
  const touchWorkout = () => store.set(s => ({ workoutRev: s.workoutRev + 1 }));

  function log(msg) {
    const line = `[${new Date().toLocaleTimeString("pl-PL")}] ${msg}`;
    store.set(s => ({ log: s.log.concat(line).slice(-LOG_LINES) }));
  }

  /** @returns {TreadmillView} */
  const snapshot = () => ({
    state: tm.state,
    available: tm.available,
    known: !!tm.device,
    name: tm.name,
    info: { ...tm.info },
    speedRange: { ...tm.speedRange },
    inclineRange: { ...tm.inclineRange },
    canSpeed: tm.canSpeed,
    canIncline: tm.canIncline,
    canControl: tm.canControl,
    data: { ...tm.data },
    target: { ...tm.target }
  });

  function workoutKcal() {
    const k = tm.data.kcal;
    if (k == null) return null;
    return startKcal != null && k >= startKcal ? k - startKcal : k;
  }

  // ---------------------------------------------------------------- zdarzenia z bieżni
  let wasConnected = false;
  tm.addEventListener("change", () => {
    const connected = tm.connected;
    if (wasConnected && !connected) engine()?.disconnected();
    if (!wasConnected && connected) engine()?.reconnected();
    if (wasConnected !== connected && engine()) {
      feedback.keepAwake(engine()?.phase === "running");
      touchWorkout();
    }
    wasConnected = connected;
    store.set({ treadmill: snapshot() });
  });
  tm.addEventListener("data", () => store.set({ treadmill: snapshot() }));
  tm.addEventListener("log", e => log(/** @type {CustomEvent} */ (e).detail));
  tm.addEventListener("status", e => {
    const w = engine();
    if (!w) return;
    const { op } = /** @type {CustomEvent} */ (e).detail;
    if (op === STATUS.STOPPED || op === STATUS.STOPPED_SAFETY) {
      w.remotePause();
      feedback.keepAwake(false);
    } else if (op === STATUS.STARTED) w.remoteStart();
    touchWorkout();
  });

  // ---------------------------------------------------------------- pętla treningu
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(2, (now - lastTick) / 1000);
    lastTick = now;
    const w = engine();
    if (!w?.active) return;
    const { settings } = state();
    const grade = inclineGrade(tm.data.incline, tm.inclineRange.max, settings.inclMaxDeg);
    runEffects(w.tick(dt, { speed: tm.data.speed || 0, grade }));
    touchWorkout();
  }, TICK_MS);

  /** Wykonuje efekty zwrócone przez silnik treningu. */
  async function runEffects(effects) {
    for (const fx of effects) {
      switch (fx.type) {
        case "belt":
          if (fx.action === "start") await tm.start();
          else if (fx.action === "pause") await tm.pause();
          else await tm.stop();
          break;
        case "incline":
          if (tm.canIncline && fx.level != null) tm.setIncline(fx.level);
          break;
        case "segment":
          applySegment(fx.index, fx.announce);
          break;
        case "beep":
          if (state().settings.beep) feedback.countBeep();
          break;
        case "persist":
          repo.saveCurrentRun(createEntry(/** @type {WorkoutEngine} */ (engine()), "przerwany", workoutKcal()));
          break;
        case "finished":
          finishWorkout(fx.status);
          break;
      }
    }
  }

  /** Ustawia prędkość i nachylenie odcinka; przy pierwszej odmowie bieżni ponawia po chwili. */
  async function applySegment(index, announce) {
    const w = engine();
    const seg = w?.segments[index];
    if (!w || !seg) return;
    const { settings } = state();
    if (announce) {
      if (settings.beep) feedback.changeBeep();
      if (settings.voice) {
        feedback.say(
          `${seg.name || "Odcinek " + (index + 1)}. ${fmtNum(seg.speed)} kilometrów na godzinę` +
            (tm.canIncline ? `, poziom nachylenia ${seg.incline}` : "")
        );
      }
    }
    if (!tm.connected) return;
    let r = await tm.setSpeed(seg.speed);
    if (r !== RESULT.SUCCESS && w.phase === "running") {
      await new Promise(res => setTimeout(res, 1500));
      r = await tm.setSpeed(seg.speed);
    }
    if (tm.canIncline && seg.incline != null) await tm.setIncline(seg.incline);
  }

  /** @param {"ukończony"|"zatrzymany"} status */
  function finishWorkout(status) {
    const w = /** @type {WorkoutEngine} */ (engine());
    const kcal = workoutKcal();
    const { list, saved } = upsertEntry(state().history, createEntry(w, status, kcal));
    if (saved) repo.saveHistory(list);
    repo.clearCurrentRun();
    feedback.keepAwake(false);
    store.set({
      history: list,
      summary: {
        title: `${status === "ukończony" ? "Program zakończony" : "Zatrzymano"} – ${w.program.name}`,
        time: w.t,
        dist: w.dist,
        kcal,
        elev: w.elev,
        saved
      }
    });
    if (status === "ukończony") {
      const { settings } = state();
      if (settings.beep) feedback.endBeep();
      if (settings.voice) feedback.say("Koniec programu. Dobra robota!");
      if (settings.endAction === "stop") tm.stop();
      else {
        tm.setSpeed(tm.speedRange.min);
        tm.setIncline(Math.max(0, tm.inclineRange.min));
      }
    }
    touchWorkout();
  }

  // ---------------------------------------------------------------- akcje: połączenie
  async function connect() {
    feedback.unlockAudio();
    try {
      if (tm.device && !tm.connected) await tm.reconnect();
      else await tm.connect();
    } catch (e) {
      log(`✖ połączenie: ${e?.message || e}`);
      store.set({ notice: "Nie udało się połączyć z bieżnią." });
    }
  }

  // ---------------------------------------------------------------- akcje: trening
  async function startProgram() {
    feedback.unlockAudio();
    const { programs, selectedId, settings } = state();
    const program = programs.find(p => p.id === selectedId);
    if (!program?.segments.length || active()) return;
    if (!tm.connected) {
      store.set({ notice: "Najpierw połącz się z bieżnią." });
      log("Najpierw połącz się z bieżnią.");
      return;
    }
    await tm.refreshSpeedRange();
    const max = tm.speedRange.max;
    const runWarning = program.segments.some(s => s.speed > max)
      ? `Uwaga: bieżnia przyjmuje teraz maks. ${fmtNum(max)} km/h (tryb chodzenia?). Szybsze odcinki zostaną ograniczone. Podnieś poręcz (tryb biegania), żeby odblokować 12 km/h.`
      : null;
    const w = new WorkoutEngine(program, { startDelay: settings.startDelay });
    startKcal = tm.data.kcal ?? null;
    store.set({ workout: w, summary: null, runWarning, notice: "" });
    feedback.keepAwake(true);
    lastTick = performance.now();
    await runEffects(w.start());
    touchWorkout();
  }

  function pause() {
    const w = engine();
    if (!w) return;
    feedback.keepAwake(false);
    runEffects(w.pause());
    touchWorkout();
  }

  function resume() {
    const w = engine();
    if (!w) return;
    feedback.unlockAudio();
    if (!tm.connected) {
      store.set({ notice: "Bieżnia jest rozłączona – połącz ponownie." });
      return;
    }
    feedback.keepAwake(true);
    runEffects(w.resume());
    touchWorkout();
  }

  /** Stop zawsze zatrzymuje taśmę – także bez trwającego programu. */
  async function stop() {
    const w = engine();
    if (w?.active) runEffects(w.stop());
    await tm.stop();
  }

  const previous = () => {
    const w = engine();
    if (w) {
      runEffects(w.previous());
      touchWorkout();
    }
  };
  const skip = () => {
    const w = engine();
    if (w) {
      runEffects(w.skip());
      touchWorkout();
    }
  };
  const addMinute = () => {
    const w = engine();
    if (w) {
      w.addMinute();
      touchWorkout();
    }
  };

  // ---------------------------------------------------------------- akcje: sterowanie ręczne
  const currentSpeed = () => tm.target.speed ?? tm.data.speed ?? tm.speedRange.min;
  const currentIncline = () => tm.target.incline ?? tm.data.incline ?? 0;
  const changeSpeed = dir => tm.setSpeed(currentSpeed() + dir * state().settings.spdStep);
  const changeIncline = dir => tm.setIncline(currentIncline() + dir * tm.inclineRange.inc);
  const beltStart = () => tm.start();
  const beltPause = () => tm.pause();

  // ---------------------------------------------------------------- akcje: programy
  /** @param {Program[]} programs */
  function setPrograms(programs, extra = {}) {
    repo.savePrograms(programs);
    store.set({ programs, ...extra });
  }

  function selectProgram(id) {
    if (active()) return;
    repo.saveSelectedId(id);
    store.set({ selectedId: id, editId: id, summary: null, workout: null, runWarning: null, notice: "" });
  }

  const openInEditor = id => store.set({ editId: id });

  /**
   * Zmienia program (na kopii) i zapisuje.
   * @param {string} id
   * @param {(p: Program) => void} change
   */
  function updateProgram(id, change) {
    setPrograms(
      state().programs.map(p => {
        if (p.id !== id) return p;
        const copy = structuredClone(p);
        change(copy);
        return copy;
      })
    );
  }

  function addProgram() {
    const p = newProgram();
    setPrograms(state().programs.concat(p), { editId: p.id });
    return p;
  }

  function duplicateProgram(id) {
    const src = state().programs.find(p => p.id === id);
    if (!src) return;
    const p = copyProgram(src, `${src.name} (kopia)`);
    setPrograms(state().programs.concat(p), { editId: p.id });
  }

  /** @returns {boolean} false, gdy to ostatni program (musi zostać co najmniej jeden) */
  function deleteProgram(id) {
    const { programs, selectedId } = state();
    if (programs.length <= 1) return false;
    const rest = programs.filter(p => p.id !== id);
    const sel = rest.some(p => p.id === selectedId) ? selectedId : rest[0].id;
    if (sel !== selectedId) repo.saveSelectedId(sel);
    setPrograms(rest, { editId: rest[0].id, selectedId: sel });
    return true;
  }

  /** Nowa kolejność programów według listy identyfikatorów. */
  function reorderPrograms(ids) {
    const byId = new Map(state().programs.map(p => [p.id, p]));
    const next = ids.map(id => byId.get(id)).filter(Boolean);
    if (next.length !== byId.size) return;
    setPrograms(/** @type {Program[]} */ (next));
  }

  function moveProgram(id, delta) {
    const { programs } = state();
    const i = programs.findIndex(p => p.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= programs.length) return;
    setPrograms(moveItem(programs, i, j));
  }

  /** @returns {number} liczba dodanych programów */
  function importPrograms(text) {
    const added = parseProgramsJson(text);
    setPrograms(state().programs.concat(added));
    return added.length;
  }

  const exportPrograms = () => programsToJson(state().programs);

  // ---------------------------------------------------------------- akcje: historia i ustawienia
  function deleteHistoryEntry(id) {
    const history = state().history.filter(h => h.id !== id);
    repo.saveHistory(history);
    store.set({ history });
  }

  function importHistory(text) {
    const { list, added } = mergeHistoryJson(text, state().history);
    repo.saveHistory(list);
    store.set({ history: list });
    return added;
  }

  const exportHistory = () => historyToJson(state().history);

  /** @param {Partial<Settings>} patch */
  function updateSettings(patch) {
    const settings = normalizeSettings({ ...state().settings, ...patch });
    repo.saveSettings(settings);
    store.set({ settings });
  }

  /** Trening przerwany zamknięciem strony trafia do historii przy następnym otwarciu. */
  function recoverInterruptedRun() {
    const cur = repo.loadCurrentRun();
    if (!cur) return;
    const { list, saved } = upsertEntry(state().history, cur);
    if (saved) {
      repo.saveHistory(list);
      store.set({ history: list });
    }
    repo.clearCurrentRun();
  }

  store.set({ treadmill: snapshot() });

  return {
    log,
    connect,
    disconnect: () => tm.disconnect(),
    startProgram,
    pause,
    resume,
    stop,
    previous,
    skip,
    addMinute,
    changeSpeed,
    changeIncline,
    beltStart,
    beltPause,
    selectProgram,
    openInEditor,
    updateProgram,
    addProgram,
    duplicateProgram,
    deleteProgram,
    reorderPrograms,
    moveProgram,
    importPrograms,
    exportPrograms,
    deleteHistoryEntry,
    importHistory,
    exportHistory,
    updateSettings,
    recoverInterruptedRun,
    markHelpSeen: () => repo.markHelpSeen(),
    isTrainingActive: active
  };
}

/** @typedef {ReturnType<typeof createController>} Controller */
