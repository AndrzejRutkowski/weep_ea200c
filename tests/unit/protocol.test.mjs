import { test } from "node:test";
import assert from "node:assert/strict";
import {
  command,
  parseControlResponse,
  parseFeatures,
  parseInclineRange,
  parseSpeedRange,
  parseStatus,
  parseTreadmillData,
  snapToRange,
  toHex
} from "../../js/ftms/protocol.js";

const dv = bytes => new DataView(new Uint8Array(bytes).buffer);

test("Treadmill Data: prędkość, nachylenie, kalorie (flagi 0x0088)", () => {
  // prędkość 8,5 km/h, nachylenie 5,0, kalorie 42
  const d = parseTreadmillData(dv([0x88, 0x00, 0x52, 0x03, 0x32, 0x00, 0, 0, 0x2a, 0, 0, 0, 0]));
  assert.deepEqual(d, { speed: 8.5, incline: 5, kcal: 42 });
});

test("Treadmill Data: dystans, tętno, czas; „More Data” pomija prędkość", () => {
  const flags = 0x0001 | 0x0004 | 0x0100 | 0x0400;
  const d = parseTreadmillData(dv([flags & 255, flags >> 8, 0x10, 0x27, 0x00, 0x8c, 0x3c, 0x00]));
  assert.deepEqual(d, { dist: 10000, hr: 140, elapsed: 60 });
});

test("Treadmill Data: ucięty pakiet nie rzuca wyjątku", () => {
  assert.deepEqual(parseTreadmillData(dv([0x88, 0x00, 0x52])), {});
  assert.deepEqual(parseTreadmillData(dv([0x01])), {});
});

test("Treadmill Data: kalorie 0xFFFF i tętno 0 oznaczają brak danych", () => {
  const flags = 0x0001 | 0x0080 | 0x0100;
  assert.deepEqual(parseTreadmillData(dv([flags & 255, flags >> 8, 0xff, 0xff, 0, 0, 0, 0])), {});
});

test("Cechy bieżni WEEP: prędkość i nachylenie sterowalne", () => {
  const f = parseFeatures(dv([0xdc, 0x56, 0, 0, 0x0f, 0, 0, 0]));
  assert.equal(f.features, 0x56dc);
  assert.equal(f.canSpeed, true);
  assert.equal(f.canIncline, true);
  assert.equal(f.declared, true);
});

test("Cechy: brak deklarowanych celów → zakładamy, że można sterować", () => {
  const f = parseFeatures(dv([0, 0, 0, 0, 0, 0, 0, 0]));
  assert.equal(f.declared, false);
  assert.equal(f.canSpeed, true);
});

test("Zakresy z logu bieżni WEEP", () => {
  assert.deepEqual(parseSpeedRange(dv([0x64, 0x00, 0x58, 0x02, 0x0a, 0x00])), {
    min: 1,
    max: 6,
    inc: 0.1,
    known: true
  });
  assert.deepEqual(parseInclineRange(dv([0x00, 0x00, 0x96, 0x00, 0x0a, 0x00])), {
    min: 0,
    max: 15,
    inc: 1,
    known: true
  });
});

test("Komendy Control Point zgodne z logiem bieżni", () => {
  assert.equal(toHex(command.setSpeed(3)), "02 2c 01");
  assert.equal(toHex(command.setIncline(15)), "03 96 00");
  assert.equal(toHex(command.setIncline(2)), "03 14 00");
  assert.equal(toHex(command.setIncline(-1)), "03 f6 ff");
  assert.equal(toHex(command.start()), "07");
  assert.equal(toHex(command.pause()), "08 02");
  assert.equal(toHex(command.stop()), "08 01");
  assert.equal(toHex(command.requestControl()), "00");
});

test("Odpowiedź i status", () => {
  assert.deepEqual(parseControlResponse(dv([0x80, 0x02, 0x01])), { op: 2, result: 1 });
  assert.equal(parseControlResponse(dv([0x02, 0x01])), null);
  assert.deepEqual(parseStatus(dv([0x02, 0x01])), { op: 2, param: 1, name: "zatrzymana/pauza" });
  assert.equal(parseStatus(dv([])), null);
});

test("snapToRange zaokrągla do kroku i przycina", () => {
  const r = { min: 1, max: 6, inc: 0.1, known: true };
  assert.equal(snapToRange(9, r), 6);
  assert.equal(snapToRange(0.2, r), 1);
  assert.equal(snapToRange(5.55, r), 5.6);
  assert.equal(snapToRange(7.4, { min: 0, max: 15, inc: 1, known: true }), 7);
});
