# Bieżnia Weep EA200C

Aplikacja w przeglądarce do tworzenia własnych programów treningowych i sterowania bieżnią **WEEP Easy EA200C** przez Bluetooth. Pozwala zapisać dowolną liczbę programów (odcinki z czasem, prędkością i nachyleniem) i uruchamiać je bez aplikacji FitShow. Nie wymaga konta, serwera ani abonamentu.

**Aplikacja:** https://andrzejrutkowski.github.io/weep_ea200c/

Bieżnia ma moduł Bluetooth FitShow FS-BT-D2, który obsługuje standard **FTMS** (Fitness Machine Service). Aplikacja powinna więc działać także z innymi bieżniami zgodnymi z FTMS.

---

## Spis treści

1. [Wymagania](#wymagania)
2. [Instalacja jako aplikacja](#instalacja-jako-aplikacja)
3. [Pierwsze połączenie z bieżnią](#pierwsze-połączenie-z-bieżnią)
4. [Trening](#trening)
5. [Tworzenie programów](#tworzenie-programów)
6. [Gdzie zapisują się programy](#gdzie-zapisują-się-programy)
7. [Ustawienia](#ustawienia)
8. [Rozwiązywanie problemów](#rozwiązywanie-problemów)
9. [Bezpieczeństwo](#bezpieczeństwo)
10. [Informacje techniczne](#informacje-techniczne)

---

## Wymagania

| Urządzenie | Przeglądarka |
|---|---|
| Mac, Windows, Linux | **Chrome** lub **Edge** |
| iPhone / iPad | **Bluefy** (darmowa, z App Store) |
| Android | Chrome |

Safari (na Macu i iPhonie) **nie obsługuje Web Bluetooth**, więc nie połączy się z bieżnią. Edytor programów działa w każdej przeglądarce.

## Instalacja jako aplikacja

Aplikację można zainstalować, żeby miała własne okno i ikonę, jak zwykły program.

- **Chrome:** otwórz adres aplikacji i kliknij ikonę instalacji po prawej stronie paska adresu.
- **Edge:** menu **⋯ → Aplikacje → Zainstaluj tę witrynę jako aplikację**.
- **iPhone (Bluefy):** otwórz adres aplikacji w Bluefy. Możesz dodać zakładkę albo skrót na ekranie początkowym.

Po instalacji aplikacja otwiera się też bez internetu. Nowa wersja pobiera się w tle i pojawia przy kolejnym uruchomieniu.

## Pierwsze połączenie z bieżnią

1. Włącz bieżnię.
2. **Zamknij aplikację FitShow** na telefonie. Bieżnia przyjmuje tylko jedno połączenie Bluetooth naraz.
3. Kliknij **Połącz z bieżnią** i wybierz z listy urządzenie o nazwie zaczynającej się od `FS-` (np. `FS-C7F4F0`).
4. Po połączeniu w nagłówku pojawi się zielona kropka z nazwą bieżni.

W zakładce **Ustawienia → Bieżnia** widać dane odczytane z bieżni: model modułu, zakres prędkości, zakres nachylenia i dostępne sterowanie.

> **Tryb chodzenia i biegania.** EA200C ma dwa tryby: chodzenie (do 6 km/h) i bieganie (do 12 km/h). Jeśli bieżnia podaje maksimum 6 km/h, rozłóż poręcz (tryb biegania). Aplikacja sprawdza zakres prędkości przed każdym startem programu i ostrzega, gdy program ma szybsze odcinki, niż bieżnia teraz przyjmie.

## Trening

### Uruchomienie programu

1. W zakładce **Trening** wybierz program z listy. Wykres pokazuje prędkość (zielone słupki) i nachylenie (niebieska linia).
2. Stań na bieżni i kliknij **▶ Start programu**.
3. Bieżnia odlicza 3 sekundy i rusza. Po krótkim opóźnieniu (domyślnie 4 s) aplikacja ustawia prędkość i nachylenie pierwszego odcinka.
4. Każdy kolejny odcinek przestawia bieżnię automatycznie.

Na ekranie widać:
- prędkość, nachylenie (poziom i przybliżony %), czas, dystans, kalorie i tętno (jeśli bieżnia je podaje),
- bieżący odcinek z odliczaniem i paskiem postępu,
- następny odcinek i czas do końca programu.

### Przyciski w trakcie programu

| Przycisk | Działanie |
|---|---|
| **❚❚ Pauza** / **▶ Wznów** | Zatrzymuje taśmę i licznik programu. Po wznowieniu taśma rusza, a aplikacja ustawia prędkość bieżącego odcinka. |
| **■ Stop** | Natychmiast zatrzymuje taśmę i kończy program. |
| **◀ Poprzedni odcinek** | W ciągu pierwszych 5 s odcinka przechodzi do poprzedniego, później zaczyna bieżący od nowa. |
| **Następny odcinek ▶** | Pomija resztę bieżącego odcinka. |
| **+1 min do odcinka** | Wydłuża bieżący odcinek o minutę (tylko w tym treningu, zapisany program się nie zmienia). |

Pauza i start z **pilota bieżni** też działają: aplikacja wykrywa je i wstrzymuje albo wznawia licznik programu.

Po zakończeniu pojawia się podsumowanie: czas, dystans i kalorie.

### Sterowanie ręczne

Przyciski **−/+** zmieniają prędkość (krok ustawisz w Ustawieniach) i nachylenie (o jeden poziom). **Start taśmy** i **Pauza taśmy** działają też bez programu.

W trakcie programu ręczna zmiana obowiązuje do końca bieżącego odcinka. Następny odcinek ustawi swoje wartości.

## Tworzenie programów

Programy edytujesz w zakładce **Programy**.

- **+ Nowy** tworzy program z trzema odcinkami do edycji.
- **Duplikuj** kopiuje wybrany program.
- **Usuń** usuwa program. Kliknij dwa razy, drugi raz potwierdza („Na pewno?”).

### Odcinki

Każdy odcinek ma:

| Pole | Opis |
|---|---|
| **Nazwa** | Opcjonalna, np. „Rozgrzewka”. Pojawia się na ekranie treningu i w komunikacie głosowym. |
| **Czas** | Format `m:ss` (np. `1:30`), `h:mm:ss` albo sama liczba minut (np. `5`). |
| **km/h** | Prędkość z dokładnością do 0,1 km/h. |
| **Nachylenie** | **Poziom 0–15**, tak jak na bieżni. |

Przyciski przy odcinku: **↑ ↓** zmieniają kolejność, **⧉** duplikuje, **✕** usuwa. **+ Dodaj odcinek** dodaje odcinek na końcu z prędkością i nachyleniem poprzedniego.

Nad listą widać wykres programu, łączny czas i szacowany dystans. Jeśli prędkość albo nachylenie wychodzi poza zakres bieżni, pojawi się ostrzeżenie, a wartość zostanie w trakcie treningu przycięta do zakresu.

### Generator interwałów

Szybki sposób na trening interwałowy. Podaj liczbę powtórzeń, czas i prędkość części szybkiej, czas i prędkość części wolnej oraz poziom nachylenia, a potem kliknij **Dodaj na końcu**. Przykład: 6 × (1:00 przy 9 km/h + 2:00 przy 5 km/h).

### Programy przykładowe

Przy pierwszym uruchomieniu aplikacja ma trzy programy:
- **Interwały 25 min**: rozgrzewka, 6 interwałów i schłodzenie,
- **Marsz pod górę 26 min**: marsz ze zmiennym nachyleniem,
- **Test nachylenia (6 min)**: marsz 3 km/h na kolejnych poziomach nachylenia, przydatny do sprawdzenia, jak bieżnia reaguje.

Możesz je dowolnie zmieniać albo usunąć.

## Gdzie zapisują się programy

### Automatycznie w przeglądarce

Każda zmiana zapisuje się sama w pamięci przeglądarki. Nie trzeba nic klikać.

Ta pamięć jest osobna dla każdej przeglądarki, urządzenia i adresu strony. Programy znikną, jeśli wyczyścisz dane witryn albo użyjesz okna incognito. Dlatego warto czasem zrobić kopię.

### Eksport i import

W zakładce **Programy → Eksport / import**:
- **Pobierz plik .json** zapisuje wszystkie programy do pliku,
- **Kopiuj JSON** kopiuje je do schowka,
- **Wybierz plik** wczytuje programy z pliku .json,
- **Importuj z pola (dodaj)** wczytuje programy wklejone w pole tekstowe.

Import **dodaje** programy do istniejących, niczego nie usuwa. W ten sposób przeniesiesz programy np. z Maca na iPhone'a.

### Zapis w pliku HTML (opcjonalnie)

Programy można też zapisać wewnątrz samego pliku strony, np. gdy używasz jej jako pliku na dysku:
- **Zapisz do pliku…** (tylko Chrome i Edge na komputerze) nadpisuje wskazany plik HTML. Za pierwszym razem wybierasz plik, później wystarczy jedno kliknięcie.
- **Pobierz kopię strony z programami** (każda przeglądarka) pobiera nowy plik `bieznia.html` z Twoimi programami w środku.

Przy otwarciu strona porównuje daty zapisu w pliku i w przeglądarce i używa nowszej wersji.

## Ustawienia

| Ustawienie | Domyślnie | Opis |
|---|---|---|
| Opóźnienie po starcie taśmy | 4 s | Czas między komendą start a ustawieniem prędkości odcinka. Bieżnia po starcie odlicza 3 s. |
| Po zakończeniu programu | zatrzymaj taśmę | Albo „zostaw wolny marsz”: najniższa prędkość i nachylenie 0. |
| Kąt przy najwyższym poziomie nachylenia | 6° | Służy tylko do przeliczania poziomów na %. Możesz to zmierzyć: ustaw poziom 15 i połóż telefon na pasie (iPhone: aplikacja **Miarka → Poziomica**). |
| Krok ręcznej prędkości | 0,5 km/h | O ile zmieniają prędkość przyciski −/+. |
| Sygnał dźwiękowy 3-2-1 | włączony | Krótkie sygnały przed zmianą odcinka. |
| Komunikat głosowy | wyłączony | Odczytuje nazwę i parametry nowego odcinka po polsku. |

W **Ustawieniach** jest też **Log Bluetooth**. Każda komenda wysłana do bieżni ma tam odpowiedź (OK, nieobsługiwane, zły parametr itp.). Przydaje się przy szukaniu problemów.

## Rozwiązywanie problemów

**Lista urządzeń jest pusta albo nie widać bieżni.**
Sprawdź, czy bieżnia jest włączona i czy aplikacja FitShow jest zamknięta. Na Macu sprawdź, czy przeglądarka ma dostęp do Bluetooth: **Ustawienia systemowe → Prywatność i ochrona → Bluetooth**.

**Przycisk „Połącz z bieżnią” jest nieaktywny.**
Przeglądarka nie obsługuje Web Bluetooth. Użyj Chrome lub Edge, a na iPhonie Bluefy.

**Bieżnia nie przekracza 6 km/h.**
Jest w trybie chodzenia. Rozłóż poręcz i uruchom program ponownie.

**Bieżnia się rozłączyła.**
Program przechodzi w pauzę. Kliknij **Połącz ponownie**, a potem **▶ Wznów**.

**Prędkość nie zmienia się po starcie.**
Zwiększ w Ustawieniach opóźnienie po starcie taśmy (np. do 5–6 s).

**Coś innego nie działa.**
Otwórz **Ustawienia → Log Bluetooth**, kliknij **Kopiuj log** i dołącz go do zgłoszenia problemu.

## Bezpieczeństwo

- Przycisk **■ Stop** jest zawsze widoczny, ale **zawsze przypinaj klucz bezpieczeństwa bieżni**. To jedyne pewne zatrzymanie awaryjne, niezależne od Bluetooth i przeglądarki.
- Aplikacja zmienia prędkość i nachylenie automatycznie. Przed treningiem sprawdź program, zwłaszcza szybkie odcinki.
- Nie zostawiaj pracującej bieżni bez nadzoru.

## Informacje techniczne

- Jeden plik `index.html` (HTML, CSS, JavaScript) bez zależności i bez budowania.
- Komunikacja: **Web Bluetooth** i standard **FTMS** (usługa `0x1826`):
  - `0x2ACD` Treadmill Data: prędkość, dystans, nachylenie, kalorie, tętno,
  - `0x2AD9` Fitness Machine Control Point: start, pauza, stop, prędkość, nachylenie,
  - `0x2ADA` Fitness Machine Status: reakcja na pilota,
  - `0x2AD4` / `0x2AD5`: zakres prędkości i nachylenia,
  - `0x2ACC` Fitness Machine Feature: dostępne funkcje.
- Bieżnia przesyła nachylenie w polu FTMS przeznaczonym na procenty, ale w praktyce są to **poziomy 0–15**. Przybliżony % aplikacja liczy z kąta podanego w Ustawieniach.
- `manifest.webmanifest` i `sw.js` pozwalają zainstalować stronę jako aplikację i używać jej offline.

### Pliki

| Plik | Opis |
|---|---|
| `index.html` | Cała aplikacja |
| `manifest.webmanifest` | Nazwa, kolory i ikony aplikacji |
| `sw.js` | Service worker (praca offline i aktualizacje) |
| `icons/` | Ikony aplikacji |
