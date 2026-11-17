# Architektura aplikacji

Aplikacja to statyczna strona (HTML + CSS + moduły ES) bez frameworka i bez kroku budowania.
Kod jest podzielony na warstwy. Każda warstwa zależy tylko od warstw pod nią:

```
 ┌────────────────────────────────────────────────────────────────────┐
 │ ui/        widoki zakładek, wykres, pasek aktualizacji (DOM)       │
 ├────────────────────────────────────────────────────────────────────┤
 │ app/       kontroler (akcje), store (stan), feedback (dźwięk, ekran)│
 ├──────────────────────────────┬─────────────────────────────────────┤
 │ domain/  logika treningu     │ ftms/      Bluetooth FTMS           │
 │          programy, historia  │ storage/   localStorage             │
 ├──────────────────────────────┴─────────────────────────────────────┤
 │ util/      formatowanie, drobne funkcje                            │
 └────────────────────────────────────────────────────────────────────┘
```

| Katalog | Zawartość | Zależy od DOM / przeglądarki? |
|---|---|---|
| `js/util/` | formatowanie liczb i czasu, `escapeHtml`, `uid` | nie |
| `js/domain/` | model programu, **silnik treningu**, historia, ustawienia, przeliczanie nachylenia | nie |
| `js/ftms/protocol.js` | UUID, parsowanie pakietów FTMS, kodowanie komend | nie |
| `js/ftms/treadmill.js` | klasa `Treadmill`: połączenie Web Bluetooth, kolejka komend, zdarzenia | Web Bluetooth |
| `js/storage/` | `Repository`: odczyt i zapis w localStorage, wersja schematu, migracje | localStorage |
| `js/app/` | `store` (stan aplikacji), `controller` (akcje), `feedback` (dźwięk, głos, blokada ekranu) | tak |
| `js/ui/` | po jednym module na zakładkę + wykres, pasek aktualizacji, wspólne narzędzia DOM | tak |
| `js/main.js` | punkt startowy: tworzy usługi, stan i widoki | tak |

Warstwy `util`, `domain` i `ftms/protocol` to czyste funkcje i klasy bez efektów ubocznych.
Są w całości pokryte testami jednostkowymi, które działają w Node.js bez przeglądarki.

## Przepływ danych

Przepływ jest jednokierunkowy:

```
  kliknięcie ──▶ widok ──▶ akcja kontrolera ──▶ silnik / bieżnia / repozytorium
                   ▲                                   │
                   └──────── store.subscribe ◀── store.set(nowy stan)
```

- **Widoki nie zmieniają stanu same.** Wywołują akcję kontrolera, np. `app.startProgram()` albo `app.updateProgram(id, p => …)`.
- **Kontroler** wykonuje akcję, zapisuje dane przez `Repository` i aktualizuje stan przez `store.set(...)`.
- **Store** powiadamia subskrybentów, przekazując nowy i poprzedni stan. Każdy widok porównuje interesujące go fragmenty (`st.programs !== prev.programs`) i przerysowuje tylko to, co się zmieniło.
- **Bieżnia** (`Treadmill`) zgłasza zdarzenia `change`, `data`, `status` i `log`. Kontroler zamienia je na stan dla widoków.

Stan (`AppState`, opisany w `js/app/controller.js`) zawiera m.in. programy, ustawienia, historię,
migawkę stanu bieżni (`treadmill`) i bieżący trening (`workout`). Silnik treningu jest obiektem mutowalnym,
dlatego jego zmiany sygnalizuje licznik `workoutRev`.

## Silnik treningu (`js/domain/workout-engine.js`)

Maszyna stanów, która **nie wykonuje żadnych operacji wejścia/wyjścia**. Dostaje zdarzenia i zwraca listę efektów:

```
idle ──start()──▶ starting ──(opóźnienie)──▶ running ──(koniec ostatniego odcinka)──▶ done
                     │                          │  ▲
                     └──── pause() / pilot ─────▶ paused ──resume()──▶ resuming ──(opóźnienie)──┘
```

| Zdarzenie | Kiedy |
|---|---|
| `start()`, `pause()`, `resume()`, `stop()` | przyciski w aplikacji |
| `tick(dt, {speed, grade})` | co 250 ms, z aktualną prędkością bieżni i nachyleniem |
| `remotePause()`, `remoteStart()` | status z bieżni (pilot, przycisk, klucz bezpieczeństwa) |
| `disconnected()`, `reconnected()` | utrata i odzyskanie połączenia |
| `previous()`, `skip()`, `addMinute()` | przyciski nawigacji po odcinkach |

| Efekt | Co robi kontroler |
|---|---|
| `belt {action}` | `treadmill.start()` / `pause()` / `stop()` |
| `incline {level}` | ustawia nachylenie przed ruszeniem taśmy |
| `segment {index, announce}` | ustawia prędkość i nachylenie odcinka, opcjonalnie sygnał i komunikat głosowy |
| `beep` | sygnał 3-2-1 (jeśli włączony w ustawieniach) |
| `persist` | zapisuje postęp, żeby odzyskać trening po zamknięciu strony |
| `finished {status}` | zapis w historii, podsumowanie, akcja po zakończeniu |

Dzięki temu cały przebieg treningu (przejścia odcinków, pauzy z pilota, liczenie dystansu)
testuje się w milisekundach: `tests/unit/workout-engine.test.mjs`.

## Bieżnia (`js/ftms/`)

- `protocol.js`: format danych FTMS. Na przykład `parseTreadmillData(dataView)` zwraca `{speed, incline, kcal, …}`, a `command.setSpeed(8.5)` zwraca bajty komendy.
- `treadmill.js`: klasa `Treadmill extends EventTarget`:
  - łączy się (`connect()`, `reconnect()`), odczytuje cechy i zakresy, subskrybuje dane i status,
  - **kolejkuje komendy**, bo Web Bluetooth nie pozwala na równoległe zapisy, i czeka na odpowiedź Control Point (z limitem czasu 3 s),
  - przejmuje kontrolę (`Request Control`) przed pierwszą komendą i ponawia ją po odpowiedzi „brak kontroli”,
  - przycina wartości do zakresu bieżni (`snapToRange`).

W testach e2e `navigator.bluetooth` jest podmieniany na symulowaną bieżnię (`tests/e2e/helpers.mjs`).
Ta sama technika pozwala dodać np. tryb demonstracyjny bez sprzętu.

## Dane (`js/storage/repository.js`)

- Wszystkie odczyty i zapisy w localStorage idą przez `Repository`. Błędy, np. brak miejsca albo tryb prywatny, nie przerywają działania aplikacji.
- **Klucze (`KEYS`) są zgodne z wcześniejszymi wersjami.** Nie zmieniaj ich, bo użytkownicy stracą programy i historię.
- Zmiana formatu danych:
  1. zwiększ `SCHEMA_VERSION`,
  2. dopisz funkcję do `MIGRATIONS` (klucz = numer nowej wersji),
  3. dodaj test w `tests/unit/domain.test.mjs`.

## Service worker i wersje (`sw.js`, `tools/update-sw.mjs`)

- `sw.js` zapisuje wszystkie pliki aplikacji w pamięci podręcznej, dzięki czemu aplikacja działa offline.
- Nowa wersja instaluje się w tle i **czeka na kliknięcie „Aktualizuj”** (`js/ui/update-bar.js`). W trakcie treningu pasek aktualizacji się nie pokazuje.
- `npm run version` liczy odcisk (hash) wszystkich plików aplikacji. Gdy się zmienił, podbija `VERSION` i odświeża listę `FILES` w `sw.js`. CI sprawdza, czy `sw.js` jest aktualny.

## Testy

| Rodzaj | Gdzie | Co sprawdza |
|---|---|---|
| jednostkowe | `tests/unit/` | protokół FTMS (także na bajtach z prawdziwego logu bieżni), silnik treningu, programy, historia, ustawienia, repozytorium, store |
| e2e | `tests/e2e/` | cała aplikacja w Chrome z symulowaną bieżnią: połączenie, program od startu do końca, pilot, tryb chodzenia, historia, edytor, kolejność, import, tooltip, aktualizacja |

Serwer testowy (`tests/server.mjs`) nie ma zależności. Pozwala też podmienić treść pliku w trakcie testu,
np. żeby zasymulować nową wersję `sw.js`.

## Jak dodać nową funkcję – przykład

**Eksport treningu do pliku TCX (Strava/Garmin):**

1. `js/domain/`: czysta funkcja `historyEntryToTcx(entry, samples)` z testem jednostkowym.
2. Silnik treningu: jeśli potrzebny jest przebieg prędkości, dodaj zbieranie próbek w `tick()` (np. co 5 s) i test.
3. `js/app/controller.js`: akcja `exportTcx(id)` zwracająca tekst pliku.
4. `js/ui/history-view.js`: przycisk przy treningu, który wywołuje akcję i `downloadText(...)`.
5. Test e2e: trening → historia → pobranie pliku.

**Pas tętna (Bluetooth Heart Rate):**

1. `js/ftms/heart-rate.js`: klasa podobna do `Treadmill` (usługa `0x180D`), zdarzenie `data` z tętnem.
2. Kontroler: tętno do stanu, ewentualnie nowy efekt silnika (np. korekta prędkości przy treningu na tętno).
3. Widok: odczyt w zakładce Trening i przycisk połączenia w Ustawieniach.

## Konwencje

- Komentarze i teksty interfejsu po polsku. Nazwy w kodzie po angielsku.
- Typy opisane w JSDoc (`@typedef`, `@param`) i sprawdzane przez `npm run typecheck`.
- Formatowanie: Prettier (szerokość 120 znaków). Reguły: ESLint (`eslint.config.js`).
- Widoki nie importują `ftms/` ani `storage/`. Rozmawiają tylko z kontrolerem i store.
- Nowa logika najpierw trafia do `domain/` (czysta, testowalna), a dopiero potem do widoku.
