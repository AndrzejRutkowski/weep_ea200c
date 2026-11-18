// @ts-check
// Historia treningów: wpisy, podsumowania, statystyki tygodniowe, import i eksport.

/**
 * @typedef {object} HistoryEntry
 * @property {string} id
 * @property {number} start     znacznik czasu startu (ms)
 * @property {number} end
 * @property {string} program   nazwa programu
 * @property {number} duration  aktywny czas (s), bez pauz
 * @property {number} dist      km
 * @property {number|null} kcal
 * @property {number} elev      przewyższenie (m)
 * @property {number} maxSpeed  km/h
 * @property {number} segDone
 * @property {number} segTotal
 * @property {"ukończony"|"zatrzymany"|"przerwany"} status
 */

/** Krótsze treningi nie trafiają do historii. */
export const MIN_DURATION_S = 60;

/**
 * Wpis historii na podstawie stanu silnika treningu.
 * @param {import("./workout-engine.js").WorkoutEngine} w
 * @param {HistoryEntry["status"]} status
 * @param {number|null} kcal
 * @param {number} [now]
 * @returns {HistoryEntry}
 */
export function createEntry(w, status, kcal, now = Date.now()) {
  return {
    id: w.id,
    start: w.startedAt,
    end: now,
    program: w.program.name,
    duration: Math.round(w.t),
    dist: Math.round(w.dist * 1000) / 1000,
    kcal,
    elev: Math.round(w.elev),
    maxSpeed: Math.round(w.maxSpeed * 10) / 10,
    segDone: Math.min(w.segIdx, w.segments.length),
    segTotal: w.segments.length,
    status
  };
}

/**
 * Dodaje albo zastępuje wpis (po id). Zbyt krótkie treningi są pomijane.
 * @param {HistoryEntry[]} list
 * @param {HistoryEntry} entry
 * @returns {{list: HistoryEntry[], saved: boolean}}
 */
export function upsertEntry(list, entry) {
  if (!entry || !(entry.duration >= MIN_DURATION_S)) return { list, saved: false };
  const next = list
    .filter(h => h.id !== entry.id)
    .concat(entry)
    .sort((a, b) => b.start - a.start);
  return { list: next, saved: true };
}

/** Początek tygodnia (poniedziałek 00:00) dla znacznika czasu. @param {number} ts */
export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Początek bieżącego miesiąca. @param {number} ts */
export function monthStart(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/**
 * Suma treningów: liczba, czas (s), dystans (km), kalorie, przewyższenie.
 * @param {HistoryEntry[]} list
 */
export const summarize = list =>
  list.reduce(
    (a, h) => ({
      count: a.count + 1,
      time: a.time + h.duration,
      dist: a.dist + h.dist,
      kcal: a.kcal + (h.kcal || 0),
      elev: a.elev + (h.elev || 0)
    }),
    { count: 0, time: 0, dist: 0, kcal: 0, elev: 0 }
  );

/** @typedef {"day"|"week"|"month"} PeriodUnit */

/** Domyślna liczba okresów na wykresie dla każdej jednostki. */
export const PERIOD_COUNT = Object.freeze({ day: 14, week: 8, month: 12 });

/** Początek dnia (00:00). @param {number} ts */
export function dayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Początek okresu, w którym leży znacznik czasu.
 * @param {number} ts
 * @param {PeriodUnit} unit
 */
export const periodStart = (ts, unit) =>
  unit === "day" ? dayStart(ts) : unit === "week" ? weekStart(ts) : monthStart(ts);

/**
 * Początek okresu przesuniętego o `offset` okresów od tego, w którym leży `ts` (ujemny = wcześniej).
 * Liczone na dacie kalendarzowej, więc poprawne także przy zmianie czasu letniego.
 * @param {number} ts
 * @param {PeriodUnit} unit
 * @param {number} offset
 */
export function shiftPeriod(ts, unit, offset) {
  const d = new Date(periodStart(ts, unit));
  if (unit === "month") d.setMonth(d.getMonth() + offset);
  else d.setDate(d.getDate() + offset * (unit === "week" ? 7 : 1));
  return d.getTime();
}

/**
 * Sumy w kolejnych okresach (od najstarszego do bieżącego).
 * @param {HistoryEntry[]} list
 * @param {number} now
 * @param {PeriodUnit} unit
 * @param {number} [count] liczba okresów (domyślnie PERIOD_COUNT[unit])
 * @returns {{start: number, count: number, time: number, dist: number, kcal: number, elev: number}[]}
 */
export function periodTotals(list, now, unit, count = PERIOD_COUNT[unit]) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftPeriod(now, unit, -i);
    out.push({ start, ...summarize(list.filter(h => periodStart(h.start, unit) === start)) });
  }
  return out;
}

/** Eksport historii do JSON. @param {HistoryEntry[]} list */
export const historyToJson = list =>
  JSON.stringify({ app: "bieznia-ftms", type: "history", version: 1, history: list }, null, 2);

/**
 * Import historii: dodaje tylko wpisy, których jeszcze nie ma (po id).
 * @param {string} text
 * @param {HistoryEntry[]} existing
 * @returns {{list: HistoryEntry[], added: number}}
 * @throws {Error} gdy to nie jest plik historii
 */
export function mergeHistoryJson(text, existing) {
  const obj = JSON.parse(text);
  const raw = Array.isArray(obj) ? obj : obj?.history || obj?.workouts;
  if (!Array.isArray(raw)) throw new Error("to nie jest plik historii");
  const ids = new Set(existing.map(h => h.id));
  const added = [];
  for (const h of raw) {
    if (!h || !h.id || ids.has(String(h.id)) || !(h.start > 0) || !(h.duration >= 0)) continue;
    ids.add(String(h.id));
    added.push({
      id: String(h.id),
      start: +h.start,
      end: +h.end || +h.start,
      program: String(h.program || "Trening"),
      duration: +h.duration,
      dist: +h.dist || 0,
      kcal: h.kcal == null ? null : +h.kcal,
      elev: +h.elev || 0,
      maxSpeed: +h.maxSpeed || 0,
      segDone: +h.segDone || 0,
      segTotal: +h.segTotal || 0,
      status: ["ukończony", "zatrzymany", "przerwany"].includes(h.status) ? h.status : "ukończony"
    });
  }
  return { list: existing.concat(added).sort((a, b) => b.start - a.start), added: added.length };
}
