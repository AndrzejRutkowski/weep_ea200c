// Wykres programu (SVG): słupki prędkości, linia nachylenia, oś czasu, siatka prędkości
// i podpowiedź z parametrami odcinka. Rysujemy w pikselach (bez rozciągania viewBox),
// żeby napisy osi się nie deformowały – dlatego wykres trzeba przerysować po zmianie szerokości.

import { clamp, escapeHtml, fmtLevel, fmtNum, fmtTime } from "../util/format.js";
import { programDuration, segmentIndexAt, segmentStart } from "../domain/program.js";

/** Lewy margines na oś prędkości (px). */
const LEFT = 34;
const TOP = 12;
const AXIS_H = 18;

const niceStep = (range, maxTicks, steps) => steps.find(s => range / s <= maxTicks) || steps[steps.length - 1];

/**
 * @typedef {object} ChartOptions
 * @property {number} speedMax      górna granica skali prędkości (zwykle maks. bieżni)
 * @property {number} inclineMax    górna granica skali nachylenia
 * @property {number|null} [progress]  miejsce w programie (s) – zaciemnienie przebytej części
 * @property {number|null} [activeIndex]
 * @property {number|null} [hoverIndex]
 */

/**
 * @param {SVGSVGElement} svg
 * @param {import("../domain/program.js").Program} program
 * @param {ChartOptions} o
 */
export function renderProgramChart(svg, program, o) {
  const W = Math.round(svg.clientWidth) || 1000;
  const H = Math.round(svg.clientHeight) || 140;
  const bottom = H - AXIS_H;
  const plotH = bottom - TOP;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const total = Math.max(1, programDuration(program));
  const maxS = Math.max(o.speedMax, ...program.segments.map(s => s.speed), 1);
  const maxI = Math.max(o.inclineMax, ...program.segments.map(s => s.incline || 0), 1);
  const X = t => LEFT + (t / total) * (W - LEFT);
  const YS = v => bottom - (v / maxS) * plotH;
  const YI = v => bottom - (v / maxI) * plotH;
  const parts = [];

  // siatka prędkości (pod słupkami)
  const sStep = niceStep(maxS, 3, [1, 2, 2.5, 3, 4, 5, 6, 10]);
  const yAxis = [`<line x1="${LEFT + 0.5}" y1="${TOP - 4}" x2="${LEFT + 0.5}" y2="${bottom}" stroke="#2c313c"/>`];
  for (let v = sStep; v <= maxS + 1e-9; v += sStep) {
    const y = YS(v);
    parts.push(
      `<line x1="${LEFT}" y1="${y}" x2="${W}" y2="${y}" stroke="#ffffff" stroke-opacity="0.09" stroke-dasharray="3 4"/>`
    );
    yAxis.push(
      `<line x1="${LEFT - 3}" y1="${y}" x2="${LEFT}" y2="${y}" stroke="#4a5160"/>`,
      `<text x="${LEFT - 6}" y="${y + 3.5}" text-anchor="end" fill="#9aa1ae" font-size="10.5">${fmtLevel(v)}</text>`
    );
  }

  // słupki prędkości i linia nachylenia
  const pts = [];
  let t = 0;
  program.segments.forEach((s, i) => {
    const x = X(t);
    const w = X(t + s.dur) - x;
    const y = YS(s.speed);
    const strong = i === o.activeIndex || i === o.hoverIndex;
    if (i === o.hoverIndex)
      parts.push(
        `<rect x="${x}" y="${TOP - 4}" width="${w}" height="${bottom - TOP + 4}" fill="#ffffff" opacity="0.08"/>`
      );
    parts.push(
      `<rect x="${x + 0.75}" y="${y}" width="${Math.max(1, w - 1.5)}" height="${bottom - y}" rx="2" fill="#9be15d" opacity="${strong ? 1 : 0.55}"/>`
    );
    const iy = YI(s.incline || 0);
    pts.push(`${x},${iy}`, `${x + w},${iy}`);
    t += s.dur;
  });
  parts.push(
    `<polyline points="${pts.join(" ")}" fill="none" stroke="#4cc3ff" stroke-width="2.5" stroke-linejoin="round"/>`
  );

  // postęp treningu
  if (o.progress != null) {
    const px = Math.min(W, X(o.progress));
    parts.push(
      `<rect x="${LEFT}" y="${TOP - 4}" width="${px - LEFT}" height="${bottom - TOP + 4}" fill="#000" opacity="0.35"/>`,
      `<line x1="${px}" y1="${TOP - 4}" x2="${px}" y2="${bottom}" stroke="#fff" stroke-width="2"/>`
    );
  }

  // oś czasu
  const tStep = niceStep(
    total,
    Math.max(2, Math.floor((W - LEFT) / 70)),
    [60, 120, 300, 600, 900, 1200, 1800, 3600, 7200]
  );
  parts.push(`<line x1="${LEFT}" y1="${bottom + 0.5}" x2="${W}" y2="${bottom + 0.5}" stroke="#2c313c"/>`);
  for (let v = 0; v <= total + 1e-9; v += tStep) {
    const x = X(v);
    if (v > 0 && W - x < 24) break; // nie wchodź na krawędź
    parts.push(
      `<line x1="${x}" y1="${bottom}" x2="${x}" y2="${bottom + 4}" stroke="#4a5160"/>`,
      `<text x="${x}" y="${H - 4}" text-anchor="middle" fill="#9aa1ae" font-size="10.5">${fmtTime(v)}</text>`
    );
  }

  svg.innerHTML = parts.concat(yAxis).join("");
  return { inclineMax: maxI };
}

/**
 * Indeks odcinka pod kursorem.
 * @param {SVGSVGElement} svg
 * @param {import("../domain/program.js").Program} program
 * @param {number} clientX
 */
export function segmentAtX(svg, program, clientX) {
  if (!program.segments.length) return null;
  const r = svg.getBoundingClientRect();
  const t = clamp((clientX - r.left - LEFT) / (r.width - LEFT), 0, 0.99999) * programDuration(program);
  return segmentIndexAt(program, t);
}

/**
 * Treść podpowiedzi dla odcinka.
 * @param {import("../domain/program.js").Program} program
 * @param {number} i
 * @param {{speedRange: {min: number, max: number}, describeIncline: (level: number) => string,
 *          workout?: {segIdx: number, elapsed: number} | null}} ctx
 */
export function segmentTooltipHtml(program, i, ctx) {
  const s = program.segments[i];
  const from = segmentStart(program, i);
  const to = from + s.dur;
  const { min, max } = ctx.speedRange;
  const capped = s.speed > max || s.speed < min;
  let status = "";
  if (ctx.workout) {
    const { segIdx, elapsed } = ctx.workout;
    if (i < segIdx) status = `<div class="k">✓ zrobiony</div>`;
    else if (i === segIdx) status = `<div class="now">▶ teraz – zostało ${fmtTime(to - elapsed)}</div>`;
    else status = `<div class="k">start za ${fmtTime(from - elapsed)}</div>`;
  }
  return `<b>${i + 1}/${program.segments.length} · ${escapeHtml(s.name || "Odcinek " + (i + 1))}</b>
    <div><span class="k">Czas:</span> ${fmtTime(s.dur)} <span class="k">(${fmtTime(from)}–${fmtTime(to)})</span></div>
    <div><span class="k">Prędkość:</span> ${fmtNum(s.speed)} km/h${capped ? ` <span class="w">(bieżnia: ${fmtNum(clamp(s.speed, min, max))})</span>` : ""}</div>
    <div><span class="k">Nachylenie:</span> poz. ${fmtLevel(s.incline || 0)} (${ctx.describeIncline(s.incline || 0)})</div>
    <div><span class="k">Dystans:</span> ≈${fmtNum((s.speed * s.dur) / 3600, 2)} km</div>${status}`;
}

/**
 * Ustawia podpowiedź obok kursora (po prawej, a gdy brak miejsca – po lewej), żeby nie zasłaniać odcinka.
 * @param {HTMLElement} tip
 * @param {HTMLElement} wrap
 * @param {number} clientX
 */
export function positionTooltip(tip, wrap, clientX) {
  const wr = wrap.getBoundingClientRect();
  const w = tip.offsetWidth;
  const x = clientX - wr.left;
  const gap = 16;
  const left =
    x + gap + w <= wr.width ? x + gap : x - gap - w >= 0 ? x - gap - w : clamp(x - w / 2, 0, Math.max(0, wr.width - w));
  tip.style.left = `${left}px`;
}
