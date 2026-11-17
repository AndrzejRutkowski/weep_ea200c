// Punkt startowy aplikacji: tworzy usługi, stan i widoki, a potem je ze sobą łączy.

import { Repository } from "./storage/repository.js";
import { Treadmill } from "./ftms/treadmill.js";
import { createStore } from "./app/store.js";
import { createController } from "./app/controller.js";
import { Feedback } from "./app/feedback.js";
import { initShell } from "./ui/shell.js";
import { initTrainView } from "./ui/train-view.js";
import { initProgramsView } from "./ui/programs-view.js";
import { initHistoryView } from "./ui/history-view.js";
import { initSettingsView } from "./ui/settings-view.js";
import { initUpdates } from "./ui/update-bar.js";

const repo = new Repository();
repo.migrate();

const programs = repo.loadPrograms();
const selectedId = repo.loadSelectedId(programs);
const treadmill = new Treadmill();

/** @type {import("./app/store.js").Store<import("./app/controller.js").AppState>} */
const store = createStore({
  programs,
  selectedId,
  editId: selectedId,
  settings: repo.loadSettings(),
  history: repo.loadHistory(),
  treadmill: /** @type {any} */ (null), // uzupełnia kontroler
  workout: null,
  workoutRev: 0,
  summary: null,
  runWarning: null,
  notice: "",
  log: []
});

const app = createController({ store, repo, treadmill, feedback: new Feedback() });
app.recoverInterruptedRun();

initShell(store, app, { helpSeen: repo.helpSeen });
initTrainView(store, app);
initProgramsView(store, app);
initHistoryView(store, app);
initSettingsView(store, app);
initUpdates(store, app);

app.log(`Gotowe. ${treadmill.available ? "Web Bluetooth dostępny." : "Brak Web Bluetooth w tej przeglądarce."}`);
