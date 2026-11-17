import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkoutEngine } from "../../js/domain/workout-engine.js";

const program = {
  id: "p",
  name: "Test",
  segments: [
    { id: "a", name: "A", dur: 10, speed: 6, incline: 2 },
    { id: "b", name: "B", dur: 10, speed: 9, incline: 5 }
  ]
};
const types = fx => fx.map(f => f.type);

/** Przewija czas krokami po 0,25 s i zbiera efekty. */
function advance(w, seconds, sample = { speed: 6 }) {
  const fx = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.25) fx.push(...w.tick(0.25, sample));
  return fx;
}

test("start: taśma rusza, nachylenie od razu, prędkość po opóźnieniu", () => {
  const w = new WorkoutEngine(program, { startDelay: 1 });
  assert.deepEqual(w.start(), [
    { type: "belt", action: "start" },
    { type: "incline", level: 2 }
  ]);
  assert.equal(w.phase, "starting");
  assert.deepEqual(advance(w, 0.75), []);
  assert.deepEqual(advance(w, 0.25), [{ type: "segment", index: 0, announce: true }]);
  assert.equal(w.phase, "running");
});

test("przejście odcinków z odliczaniem 3-2-1 i zakończenie programu", () => {
  const w = new WorkoutEngine(program, { startDelay: 0 });
  w.start();
  w.tick(0.25);
  const fx = advance(w, 20);
  assert.equal(fx.filter(f => f.type === "beep").length, 6, "3 sygnały przed każdym końcem odcinka");
  assert.deepEqual(
    fx.filter(f => f.type === "segment"),
    [{ type: "segment", index: 1, announce: true }]
  );
  assert.deepEqual(fx.at(-1), { type: "finished", status: "ukończony" });
  assert.equal(w.phase, "done");
  assert.equal(w.active, false);
});

test("czas, dystans, przewyższenie i prędkość maks.", () => {
  const w = new WorkoutEngine(program, { startDelay: 0 });
  w.start();
  w.tick(0);
  advance(w, 6, { speed: 6, grade: 0.1 }); // 6 s przy 6 km/h = 10 m, przy 10% → 1 m w górę
  assert.equal(Math.round(w.t), 6);
  assert.ok(Math.abs(w.dist - 0.01) < 1e-9);
  assert.ok(Math.abs(w.elev - 1) < 1e-9);
  assert.equal(w.maxSpeed, 6);
  assert.equal(Math.round(w.elapsedPlanned), 6);
  assert.equal(Math.round(w.remainingPlanned), 14);
});

test("pauza z aplikacji: komenda pauzy, czas stoi; wznowienie po opóźnieniu", () => {
  const w = new WorkoutEngine(program, { startDelay: 1 });
  w.start();
  advance(w, 2);
  assert.deepEqual(w.pause(), [{ type: "belt", action: "pause" }]);
  const t = w.t;
  advance(w, 5);
  assert.equal(w.t, t, "w pauzie czas nie leci");
  assert.deepEqual(w.resume(), [{ type: "belt", action: "start" }]);
  assert.equal(w.phase, "resuming");
  assert.deepEqual(types(advance(w, 1)), ["segment"]);
  assert.equal(w.phase, "running");
});

test("pilot: zatrzymanie i start z bieżni bez wysyłania komend", () => {
  const w = new WorkoutEngine(program, { startDelay: 1 });
  w.start();
  advance(w, 2);
  assert.deepEqual(w.remotePause(), []);
  assert.equal(w.phase, "paused");
  assert.equal(w.pausedBy, "z bieżni lub pilota");
  assert.deepEqual(w.remoteStart(), []);
  assert.equal(w.phase, "resuming");
});

test("rozłączenie wstrzymuje trening, ponowne połączenie zmienia komunikat", () => {
  const w = new WorkoutEngine(program, { startDelay: 0 });
  w.start();
  w.disconnected();
  assert.equal(w.phase, "paused");
  w.reconnected();
  assert.match(w.pausedBy, /kliknij Wznów/);
});

test("poprzedni / następny odcinek i +1 min", () => {
  const w = new WorkoutEngine(program, { startDelay: 0 });
  w.start();
  w.tick(0);
  assert.deepEqual(w.skip(), [{ type: "segment", index: 1, announce: true }]);
  advance(w, 6);
  w.previous(); // po 5 s – od nowa ten sam odcinek
  assert.equal(w.segIdx, 1);
  assert.equal(w.segT, 0);
  w.previous(); // na początku – poprzedni
  assert.equal(w.segIdx, 0);
  w.addMinute();
  assert.equal(w.current.dur, 70);
  assert.equal(program.segments[0].dur, 10, "zapisany program bez zmian");
  w.skip();
  assert.deepEqual(w.skip(), [{ type: "finished", status: "ukończony" }]);
});

test("stop z aplikacji kończy trening jako zatrzymany", () => {
  const w = new WorkoutEngine(program, { startDelay: 0 });
  w.start();
  assert.deepEqual(w.stop(), [{ type: "finished", status: "zatrzymany" }]);
  assert.deepEqual(w.stop(), [], "drugi stop nic nie robi");
});

test("zapis postępu co 10 s", () => {
  const long = { ...program, segments: [{ id: "x", name: "X", dur: 100, speed: 5, incline: 0 }] };
  const w = new WorkoutEngine(long, { startDelay: 0 });
  w.start();
  w.tick(0);
  assert.equal(advance(w, 25).filter(f => f.type === "persist").length, 2);
});
