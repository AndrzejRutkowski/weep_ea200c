import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtNum,
  fmtTime,
  fmtDuration,
  parseTime,
  parseNum,
  plural,
  escapeHtml,
  fmtLevel
} from "../../js/util/format.js";
import {
  defaultPrograms,
  generateIntervals,
  moveItem,
  parseProgramsJson,
  programDistance,
  programDuration,
  programsToJson,
  segmentIndexAt,
  segmentStart,
  copyProgram
} from "../../js/domain/program.js";
import { describeIncline, inclineGrade, inclinePct } from "../../js/domain/units.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../js/domain/settings.js";
import {
  mergeHistoryJson,
  summarize,
  upsertEntry,
  weekStart,
  periodTotals,
  shiftPeriod,
  PERIOD_COUNT,
  historyToJson
} from "../../js/domain/history.js";
import { Repository, KEYS, SCHEMA_VERSION } from "../../js/storage/repository.js";
import { createStore } from "../../js/app/store.js";

test("formatowanie", () => {
  assert.equal(fmtNum(8.5), "8,5");
  assert.equal(fmtNum(null), "–");
  assert.equal(fmtLevel(5), "5");
  assert.equal(fmtLevel(2.5), "2,5");
  assert.equal(fmtTime(90), "1:30");
  assert.equal(fmtTime(3725), "1:02:05");
  assert.equal(fmtDuration(3900), "1 h 5 min");
  assert.equal(parseTime("1:30"), 90);
  assert.equal(parseTime("2,5"), 150);
  assert.equal(parseTime("1:00:05"), 3605);
  assert.ok(isNaN(parseTime("abc")));
  assert.equal(parseNum("7,5"), 7.5);
  assert.deepEqual(
    [1, 2, 5, 12, 22, 25].map(n => plural(n, ["trening", "treningi", "treningów"])),
    ["trening", "treningi", "treningów", "treningów", "treningi", "treningów"]
  );
  assert.equal(escapeHtml(`<a href="x">`), "&lt;a href=&quot;x&quot;&gt;");
});

test("program: czas, dystans, odcinek w danej chwili", () => {
  const p = defaultPrograms()[0];
  assert.equal(programDuration(p), 25 * 60);
  assert.ok(Math.abs(programDistance(p) - 2.55) < 0.01);
  assert.equal(segmentStart(p, 1), 300);
  assert.equal(segmentIndexAt(p, 0), 0);
  assert.equal(segmentIndexAt(p, 300), 1);
  assert.equal(segmentIndexAt(p, 1e9), p.segments.length - 1);
});

test("generator interwałów", () => {
  const segs = generateIntervals({ count: 3, workDur: 60, workSpeed: 9, restDur: 120, restSpeed: 5, incline: 2 });
  assert.equal(segs.length, 6);
  assert.deepEqual(
    segs.slice(0, 2).map(s => [s.name, s.dur, s.speed, s.incline]),
    [
      ["Szybko 1", 60, 9, 2],
      ["Wolno 1", 120, 5, 2]
    ]
  );
  assert.deepEqual(
    generateIntervals({ count: 3, workDur: NaN, workSpeed: 9, restDur: 0, restSpeed: 0, incline: 0 }),
    []
  );
});

test("import/eksport programów, kopia, przenoszenie", () => {
  const progs = defaultPrograms();
  const back = parseProgramsJson(programsToJson(progs));
  assert.deepEqual(
    back.map(p => p.name),
    progs.map(p => p.name)
  );
  assert.notEqual(back[0].id, progs[0].id, "nowe identyfikatory");
  assert.deepEqual(
    parseProgramsJson(JSON.stringify([{ name: "X", segments: [{ dur: 10, speed: 0 }] }])),
    [],
    "pomija odcinki bez prędkości"
  );
  assert.throws(() => parseProgramsJson("{}"), /brak listy/);
  const c = copyProgram(progs[0], "Kopia");
  assert.equal(c.name, "Kopia");
  assert.notEqual(c.segments[0].id, progs[0].segments[0].id);
  assert.deepEqual(moveItem([1, 2, 3], 2, 0), [3, 1, 2]);
  assert.deepEqual(moveItem([1, 2, 3], 0, 5), [1, 2, 3]);
});

test("nachylenie: poziom → % i spadek", () => {
  assert.ok(Math.abs(inclinePct(15, 15, 6) - 10.51) < 0.01);
  assert.equal(inclinePct(0, 15, 6), 0);
  assert.equal(inclineGrade(null, 15, 6), 0);
  assert.equal(describeIncline(15, 15, 6), "≈10,5%");
  assert.equal(describeIncline(null, 15, 6), "");
});

test("ustawienia: domyślne i walidacja", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  const s = normalizeSettings({ startDelay: "99", endAction: "x", inclMaxDeg: "", spdStep: 0, beep: 0 });
  assert.equal(s.startDelay, 15);
  assert.equal(s.endAction, "stop");
  assert.equal(s.inclMaxDeg, 6);
  assert.equal(s.spdStep, 0.5);
  assert.equal(s.beep, false);
  assert.equal(normalizeSettings({ startDelay: 0 }).startDelay, 0, "0 s jest dozwolone");
});

const entry = (id, start, duration = 600, dist = 1) => ({
  id,
  start,
  end: start,
  program: "P",
  duration,
  dist,
  kcal: 10,
  elev: 0,
  maxSpeed: 6,
  segDone: 1,
  segTotal: 1,
  status: "ukończony"
});

test("historia: zapis, minimum 1 minuta, podsumowanie", () => {
  let { list, saved } = upsertEntry([], entry("a", 1000, 30));
  assert.equal(saved, false);
  ({ list, saved } = upsertEntry(list, entry("a", 1000)));
  ({ list } = upsertEntry(list, entry("b", 2000)));
  ({ list } = upsertEntry(list, { ...entry("a", 1000), dist: 3 }));
  assert.deepEqual(
    list.map(h => h.id),
    ["b", "a"],
    "najnowsze pierwsze, bez duplikatów"
  );
  assert.deepEqual(summarize(list), { count: 2, time: 1200, dist: 4, kcal: 20, elev: 0 });
});

test("historia: sumy w dniach, tygodniach i miesiącach", () => {
  const wed = new Date(2026, 10, 18, 12).getTime(); // środa 18.11.2026
  assert.equal(new Date(weekStart(wed)).getDate(), 16, "tydzień od poniedziałku");
  const at = (m, d, h = 12) => new Date(2026, m, d, h).getTime();
  const list = [
    entry("a", at(10, 18, 7), 600, 2), // dziś rano
    entry("b", at(10, 18, 19), 600, 1), // dziś wieczorem
    entry("c", at(10, 17), 600, 3), // wczoraj
    entry("d", at(10, 10), 600, 4), // poprzedni tydzień
    entry("e", at(9, 5), 600, 5), // październik
    entry("f", at(0, 2), 600, 6) // styczeń – poza 8 tygodniami, ale w 12 miesiącach
  ];

  const days = periodTotals(list, wed, "day");
  assert.equal(days.length, PERIOD_COUNT.day);
  assert.deepEqual(
    days.slice(-2).map(p => [new Date(p.start).getDate(), p.dist, p.count]),
    [
      [17, 3, 1],
      [18, 3, 2]
    ]
  );

  const weeks = periodTotals(list, wed, "week");
  assert.equal(weeks.length, 8);
  assert.deepEqual(
    weeks.slice(-2).map(p => p.dist),
    [4, 6]
  );
  assert.equal(
    weeks.reduce((a, p) => a + p.dist, 0),
    15,
    "styczeń poza 8 tygodniami"
  );

  const months = periodTotals(list, wed, "month");
  assert.equal(months.length, 12);
  assert.deepEqual(
    months.map(p => new Date(p.start).getMonth()),
    [11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  assert.deepEqual(
    months.slice(-2).map(p => p.dist),
    [5, 10]
  );
  assert.equal(months[1].dist, 6, "styczeń 2026");
  assert.equal(new Date(months[0].start).getFullYear(), 2025, "przełom roku");
});

test("historia: przesuwanie okresów przez zmianę czasu i koniec miesiąca", () => {
  const sun = new Date(2026, 2, 29, 12).getTime(); // 29.03.2026 – zmiana na czas letni w Polsce
  const prev = new Date(shiftPeriod(sun, "day", -1));
  assert.deepEqual([prev.getDate(), prev.getHours()], [28, 0]);
  const mar31 = new Date(2026, 2, 31, 12).getTime();
  assert.equal(new Date(shiftPeriod(mar31, "month", -1)).getMonth(), 1, "z 31 marca do lutego, bez przeskoku");
  assert.equal(new Date(shiftPeriod(mar31, "week", -1)).getDate(), 23, "poniedziałek tydzień wcześniej");
});

test("historia: import dodaje tylko brakujące wpisy", () => {
  const mine = [entry("a", 1000)];
  const { list, added } = mergeHistoryJson(historyToJson([entry("a", 1000), entry("b", 2000), { id: "x" }]), mine);
  assert.equal(added, 1);
  assert.deepEqual(
    list.map(h => h.id),
    ["b", "a"]
  );
  assert.throws(() => mergeHistoryJson("{}", mine), /nie jest plik historii/);
});

class MemoryStorage {
  constructor(data = {}) {
    this.m = new Map(Object.entries(data));
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
}

test("repozytorium: domyślne programy, zgodne klucze, migracja", () => {
  const storage = new MemoryStorage({ "bieznia.filesaved.ts.v1": "1" });
  const repo = new Repository(storage);
  repo.migrate();
  assert.equal(storage.getItem(KEYS.SCHEMA), String(SCHEMA_VERSION));
  assert.equal(storage.getItem("bieznia.filesaved.ts.v1"), null, "stary klucz usunięty");
  const programs = repo.loadPrograms();
  assert.equal(programs.length, 3);
  assert.ok(storage.getItem("bieznia.programs.v1"), "domyślne programy zapisane");
  assert.equal(repo.loadSelectedId(programs), programs[0].id);
  repo.saveSelectedId("nie-ma");
  assert.equal(repo.loadSelectedId(programs), programs[0].id, "nieistniejący wybór → pierwszy program");
  assert.deepEqual(repo.loadSettings(), DEFAULT_SETTINGS);
  storage.setItem(KEYS.HISTORY, "zepsute{");
  assert.deepEqual(repo.loadHistory(), [], "uszkodzone dane → pusta lista");
});

test("store: powiadamia z poprzednim stanem", () => {
  const store = createStore({ a: 1, b: 2 });
  const calls = [];
  const off = store.subscribe((s, prev) => calls.push([prev.a, s.a]));
  store.set({ a: 2 });
  store.set(s => ({ a: s.a + 1 }));
  off();
  store.set({ a: 9 });
  assert.deepEqual(calls, [
    [1, 2],
    [2, 3]
  ]);
  assert.equal(store.get().b, 2);
});
