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
  weeklyDistance,
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

test("historia: tygodnie od poniedziałku i wykres 8 tygodni", () => {
  const wed = new Date(2026, 10, 18, 12).getTime(); // środa 18.11.2026
  assert.equal(new Date(weekStart(wed)).getDate(), 16);
  const list = [entry("a", wed, 600, 2), entry("b", wed - 7 * 864e5, 600, 3), entry("c", wed - 70 * 864e5, 600, 9)];
  const weeks = weeklyDistance(list, wed, 8);
  assert.equal(weeks.length, 8);
  assert.deepEqual(
    weeks.slice(-2).map(w => w.dist),
    [3, 2]
  );
  assert.equal(
    weeks.reduce((a, w) => a + w.dist, 0),
    5,
    "trening sprzed 10 tygodni poza wykresem"
  );
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
