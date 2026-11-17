// @ts-check
// Model programu treningowego: odcinki, wyliczenia, programy przykładowe, import i eksport.

import { uid } from "../util/format.js";

/**
 * @typedef {object} Segment
 * @property {string} id
 * @property {string} name
 * @property {number} dur      czas w sekundach
 * @property {number} speed    km/h
 * @property {number} incline  poziom nachylenia (0–15)
 */
/** @typedef {{id: string, name: string, segments: Segment[]}} Program */

/**
 * @param {string} name
 * @param {number} dur
 * @param {number} speed
 * @param {number} incline
 * @returns {Segment}
 */
export const createSegment = (name, dur, speed, incline) => ({ id: uid(), name, dur, speed, incline });

/** Łączny czas programu (s). @param {Program} p */
export const programDuration = p => p.segments.reduce((a, s) => a + s.dur, 0);

/** Szacowany dystans programu (km). @param {Program} p */
export const programDistance = p => p.segments.reduce((a, s) => a + (s.speed * s.dur) / 3600, 0);

/** Moment rozpoczęcia odcinka od startu programu (s). @param {Program} p @param {number} index */
export const segmentStart = (p, index) => p.segments.slice(0, index).reduce((a, s) => a + s.dur, 0);

/**
 * Indeks odcinka trwającego w chwili t (s od startu programu).
 * @param {Program} p
 * @param {number} t
 */
export function segmentIndexAt(p, t) {
  let acc = 0;
  for (let i = 0; i < p.segments.length; i++) {
    acc += p.segments[i].dur;
    if (t < acc) return i;
  }
  return p.segments.length - 1;
}

/** Głęboka kopia programu z nowymi identyfikatorami. @param {Program} p @param {string} [name] @returns {Program} */
export function copyProgram(p, name) {
  return { id: uid(), name: name ?? p.name, segments: p.segments.map(s => ({ ...s, id: uid() })) };
}

/** @returns {Program} */
export function newProgram() {
  return {
    id: uid(),
    name: "Nowy program",
    segments: [
      createSegment("Rozgrzewka", 300, 5, 0),
      createSegment("Główna część", 1200, 7, 0),
      createSegment("Schłodzenie", 180, 4, 0)
    ]
  };
}

/**
 * Odcinki interwałowe: count × (szybko + wolno).
 * @param {{count: number, workDur: number, workSpeed: number, restDur: number, restSpeed: number, incline: number}} o
 * @returns {Segment[]} pusta lista, gdy parametry są błędne
 */
export function generateIntervals({ count, workDur, workSpeed, restDur, restSpeed, incline }) {
  if (!(workDur > 0) || !(workSpeed > 0)) return [];
  const n = Math.max(1, Math.min(50, Math.floor(count) || 1));
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push(createSegment(`Szybko ${i}`, workDur, workSpeed, incline || 0));
    if (restDur > 0 && restSpeed > 0) out.push(createSegment(`Wolno ${i}`, restDur, restSpeed, incline || 0));
  }
  return out;
}

/** Programy na pierwsze uruchomienie. @returns {Program[]} */
export function defaultPrograms() {
  const s = createSegment;
  const intervals = [s("Rozgrzewka", 300, 5, 0)];
  for (let i = 1; i <= 6; i++) intervals.push(s(`Szybko ${i}`, 60, 9, 0), s(`Wolno ${i}`, 120, 5.5, 0));
  intervals.push(s("Schłodzenie", 120, 4, 0));
  return [
    { id: uid(), name: "Interwały 25 min", segments: intervals },
    {
      id: uid(),
      name: "Marsz pod górę 26 min",
      segments: [
        s("Rozgrzewka", 180, 4, 0),
        s("Pod górę", 600, 5, 4),
        s("Stromo", 300, 5, 8),
        s("Pod górę", 300, 5, 4),
        s("Schłodzenie", 180, 4, 0)
      ]
    },
    {
      id: uid(),
      name: "Test nachylenia (6 min)",
      segments: [
        s("Płasko", 60, 3, 0),
        s("Nachyl. 2", 60, 3, 2),
        s("Nachyl. 5", 60, 3, 5),
        s("Nachyl. 10", 60, 3, 10),
        s("Nachyl. 15", 60, 3, 15),
        s("Płasko", 60, 3, 0)
      ]
    }
  ];
}

/** Eksport programów do JSON. @param {Program[]} programs */
export const programsToJson = programs => JSON.stringify({ app: "bieznia-ftms", version: 1, programs }, null, 2);

/**
 * Odczyt programów z JSON (eksport tej aplikacji albo sama tablica). Zwraca poprawione kopie z nowymi id;
 * odcinki bez prędkości są pomijane, programy bez odcinków też.
 * @param {string} text
 * @returns {Program[]}
 * @throws {Error} gdy tekst nie jest poprawnym plikiem programów
 */
export function parseProgramsJson(text) {
  const obj = JSON.parse(text);
  const list = Array.isArray(obj) ? obj : obj?.programs;
  if (!Array.isArray(list)) throw new Error("brak listy programów");
  return list
    .filter(p => p && Array.isArray(p.segments))
    .map(p => ({
      id: uid(),
      name: String(p.name || "Zaimportowany"),
      segments: p.segments
        .map(x =>
          createSegment(String(x.name || ""), Math.max(1, +x.dur || 60), Math.max(0, +x.speed || 0), +x.incline || 0)
        )
        .filter(x => x.speed > 0)
    }))
    .filter(p => p.segments.length);
}

/**
 * Przenosi element tablicy (zwraca nową tablicę).
 * @template T
 * @param {T[]} arr
 * @param {number} from
 * @param {number} to
 */
export function moveItem(arr, from, to) {
  const out = arr.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
