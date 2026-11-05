// TESR BOM Viewer — Gerber (RS-274X) + Excellon readers, Gerber .zip loader, and BOM + CPL + Gerber board builder
// Made by TESR — Thai Embedded System and Robotics
import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.module.js';
import { chainLoops, fpTransform, pointInPoly } from './kicad.js?b=20261106b';

// ------------------------------------------------------------ apertures ----

function evalExpr(expr, vars) {
  let e = String(expr).trim().replace(/\$(\d+)/g, (_, n) => `(${vars[n] ?? 0})`).replace(/x/gi, '*');
  if (!/^[\d.+\-*/() ]*$/.test(e) || !e) return 0;
  try { return Function(`"use strict";return (${e});`)(); } catch { return 0; }
}

function rotPt([x, y], deg) {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

/** Bounding box of an aperture macro instance → {w, h, cx, cy} */
function macroBox(body, params) {
  const vars = {};
  params.forEach((p, i) => { vars[i + 1] = p; });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let round = false;
  const add = ([x, y], r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const raw of body) {
    const line = raw.trim();
    if (!line || line.startsWith('0')) continue; // comment
    const asg = /^\$(\d+)\s*=\s*(.+)$/.exec(line);
    if (asg) { vars[asg[1]] = evalExpr(asg[2], vars); continue; }
    const f = line.split(',').map((v) => evalExpr(v, vars));
    const code = f[0];
    if (code === 1) { if (f[1]) { add([f[3], f[4]], f[2] / 2); round = true; } }
    else if (code === 20 || code === 2) { const w = f[2] / 2; add(rotPt([f[3], f[4]], f[7]), w); add(rotPt([f[5], f[6]], f[7]), w); }
    else if (code === 21) { const w = f[2] / 2, h = f[3] / 2; for (const p of [[-w, -h], [w, -h], [w, h], [-w, h]]) add(rotPt([f[4] + p[0], f[5] + p[1]], f[6])); }
    else if (code === 4) { const n = f[2]; for (let i = 0; i <= n; i++) add(rotPt([f[3 + 2 * i], f[4 + 2 * i]], f[5 + 2 * n])); }
    else if (code === 5) { add(rotPt([f[3], f[4]], f[6]), f[5] / 2); }
    else if (code === 7) { add([f[1], f[2]], f[3] / 2); }
  }
  if (!isFinite(x0)) return { w: 0.5, h: 0.5, cx: 0, cy: 0, round: false };
  return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, round };
}

// --------------------------------------------------------------- gerber ----

/** Parse one RS-274X layer. All output in mm, Gerber orientation (Y up). */
export function parseGerber(text) {
  const out = { strokes: [], flashes: [], regions: [], attrs: {} };
  let intX = 3, decX = 6, intY = 3, decY = 6, trailing = false, scale = 1;
  const aps = {}, macros = {};
  let cur = null, x = 0, y = 0, interp = 1, region = false, contour = [], objRef = '';
  const coord = (s, dec, int) => {
    if (s == null) return null;
    if (s.includes('.')) return parseFloat(s) * scale;
    let neg = s.startsWith('-'); let d = s.replace(/^[+-]/, '');
    if (trailing) d = d.padEnd(int + dec, '0');
    return (neg ? -1 : 1) * (parseInt(d, 10) / 10 ** dec) * scale;
  };
  let i = 0;
  const n = text.length;
  const doWord = (w) => {
    w = w.trim();
    if (!w) return;
    if (/^G0?4/.test(w)) return; // comment
    let m;
    if ((m = /^G0?([1-3])(?=\D|$)/.exec(w))) interp = +m[1];
    if (/G36/.test(w)) { region = true; contour = []; }
    if (/G37/.test(w)) { if (contour.length > 2) out.regions.push(contour); region = false; contour = []; return; }
    if (/^M0?2/.test(w)) return;
    if ((m = /(?:G54)?D(\d+)$/.exec(w)) && +m[1] >= 10 && !/[XY]/.test(w)) { cur = aps[m[1]] || null; return; }
    const g = (k) => { const r = new RegExp(`${k}([+-]?[\\d.]+)`).exec(w); return r ? r[1] : null; };
    const nx = coord(g('X'), decX, intX), ny = coord(g('Y'), decY, intY);
    const ii = coord(g('I'), decX, intX) || 0, jj = coord(g('J'), decY, intY) || 0;
    const dm = /D0?([123])\s*$/.exec(w);
    const X = nx == null ? x : nx, Y = ny == null ? y : ny;
    const op = dm ? +dm[1] : (nx != null || ny != null) ? 1 : 0;
    if (op === 1) {
      let pts;
      if (interp === 1) pts = [[x, y], [X, Y]];
      else {
        const cx = x + ii, cy = y + jj, r = Math.hypot(x - cx, y - cy);
        let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(Y - cy, X - cx);
        if (interp === 2) { while (a1 >= a0) a1 -= 2 * Math.PI; } else { while (a1 <= a0) a1 += 2 * Math.PI; }
        if (Math.abs(X - x) < 1e-9 && Math.abs(Y - y) < 1e-9) a1 = a0 + (interp === 2 ? -2 : 2) * Math.PI;
        const k = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 0.25));
        pts = [];
        for (let q = 0; q <= k; q++) { const t = a0 + ((a1 - a0) * q) / k; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
      }
      if (region) { if (!contour.length) contour.push(pts[0]); contour.push(...pts.slice(1)); }
      else out.strokes.push({ pts, w: cur ? Math.min(cur.w, cur.h) : 0.1 });
    } else if (op === 2) {
      if (region && contour.length > 2) { out.regions.push(contour); }
      if (region) contour = [[X, Y]];
    } else if (op === 3 && cur) {
      out.flashes.push({ x: X, y: Y, ...cur, ref: objRef });
    }
    x = X; y = Y;
  };
  while (i < n) {
    const ch = text.charCodeAt(i);
    if (ch === 10 || ch === 13 || ch === 32 || ch === 9) { i++; continue; }
    if (text[i] === '%') {
      const j = text.indexOf('%', i + 1);
      const block = text.slice(i + 1, j < 0 ? n : j);
      i = j < 0 ? n : j + 1;
      const parts = block.split('*').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const head = parts[0];
      let m;
      if ((m = /^FS([LTD]?)([AI]?)X(\d)(\d)Y(\d)(\d)/.exec(head))) { trailing = m[1] === 'T'; intX = +m[3]; decX = +m[4]; intY = +m[5]; decY = +m[6]; }
      else if (/^MOIN/.test(head)) scale = 25.4;
      else if (/^MOMM/.test(head)) scale = 1;
      else if ((m = /^AM([^*]+)/.exec(head))) macros[m[1]] = parts.slice(1);
      else if ((m = /^ADD(\d+)([^,]+),?(.*)$/.exec(head))) {
        const [, code, name, rest] = m;
        const p = rest ? rest.split('X').map(parseFloat) : [];
        let ap;
        if (name === 'C') ap = { shape: 'circle', w: p[0] * scale, h: p[0] * scale };
        else if (name === 'R') ap = { shape: 'rect', w: p[0] * scale, h: (p[1] ?? p[0]) * scale };
        else if (name === 'O') ap = { shape: 'oval', w: p[0] * scale, h: (p[1] ?? p[0]) * scale };
        else if (name === 'P') ap = { shape: 'circle', w: p[0] * scale, h: p[0] * scale };
        else {
          const b = macroBox(macros[name] || [], p);
          ap = { shape: /round/i.test(name) || b.round ? 'roundrect' : 'rect', w: b.w * scale, h: b.h * scale, ox: b.cx * scale, oy: b.cy * scale };
        }
        aps[code] = ap;
      } else if ((m = /^TF\.FileFunction,(.+)$/.exec(head))) out.attrs.fileFunction = m[1];
      else if ((m = /^TO\.C,(.+)$/.exec(head))) objRef = m[1].trim();
      else if (/^TD/.test(head) && (head === 'TD' || /^TD\.C\b/.test(head))) objRef = '';
      continue;
    }
    const j = text.indexOf('*', i);
    const w = text.slice(i, j < 0 ? n : j);
    i = j < 0 ? n : j + 1;
    doWord(w.replace(/[\r\n]/g, ''));
  }
  return out;
}

// ------------------------------------------------------------- excellon ----

export function parseExcellon(text) {
  const holes = [];
  const tools = {};
  let scale = 1, tool = null, metric = true, lz = true;
  let decDigits = 3;
  const num = (s) => {
    if (s == null) return null;
    if (s.includes('.')) return parseFloat(s) * scale;
    const neg = s.startsWith('-'); const d = s.replace(/^[+-]/, '');
    const v = lz ? parseInt(d, 10) / 10 ** (d.length - (metric ? 3 : 2)) : parseInt(d, 10) / 10 ** decDigits;
    return (neg ? -1 : 1) * v * scale;
  };
  let x = 0, y = 0;
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith(';')) continue;
    if (/^(METRIC|M71)/.test(line)) { scale = 1; metric = true; decDigits = 3; if (/TZ/.test(line)) lz = false; if (/LZ/.test(line)) lz = true; }
    if (/^(INCH|M72)/.test(line)) { scale = 25.4; metric = false; decDigits = 4; if (/TZ/.test(line)) lz = false; if (/LZ/.test(line)) lz = true; }
    let m = /^T(\d+)(?:F\d+)?(?:S\d+)?C([\d.]+)/.exec(line);
    if (m) { tools[+m[1]] = parseFloat(m[2]) * scale; continue; }
    m = /^T(\d+)$/.exec(line);
    if (m) { tool = +m[1]; continue; }
    m = /^X([+-]?[\d.]+)?(?:Y([+-]?[\d.]+))?(?:G85X([+-]?[\d.]+)?(?:Y([+-]?[\d.]+))?)?/.exec(line);
    const m2 = /^Y([+-]?[\d.]+)/.exec(line);
    if (m || m2) {
      if (m) { if (m[1] != null) x = num(m[1]); if (m[2] != null) y = num(m[2]); }
      else y = num(m2[1]);
      const d = tools[tool] || 0.8;
      if (m && m[3] != null) {
        const x2 = num(m[3]), y2 = m[4] != null ? num(m[4]) : y;
        holes.push({ x: (x + x2) / 2, y: (y + y2) / 2, d, slot: [x, y, x2, y2] });
        x = x2; y = y2;
      } else holes.push({ x, y, d });
    }
  }
  return holes;
}

// --------------------------------------------------------- zip / layers ----

const ROLE_RULES = [
  ['edge', /\.(gm1|gm|gml|gko|gbr_outline|oln)$|edge[_.-]?cuts|outline|profile|boardoutline/i],
  ['pasteF', /\.gtp$|f[_.-]?paste|toppaste/i],
  ['pasteB', /\.gbp$|b[_.-]?paste|bottompaste/i],
  ['cuF', /\.gtl$|f[_.-]?cu\b|toplayer(?!.*(mask|paste|silk))|copper_top|\.cmp$/i],
  ['cuB', /\.gbl$|b[_.-]?cu\b|bottomlayer(?!.*(mask|paste|silk))|copper_bottom|\.sol$/i],
  ['silkF', /\.gto$|f[_.-]?silk|topsilk|silkscreen_top/i],
  ['silkB', /\.gbo$|b[_.-]?silk|bottomsilk|silkscreen_bottom/i],
  ['maskF', /\.gts$|f[_.-]?mask|topsolder|soldermask_top/i],
  ['maskB', /\.gbs$|b[_.-]?mask|bottomsolder|soldermask_bottom/i],
];

function roleOf(name, text) {
  const ff = /%TF\.FileFunction,([^*]+)\*/.exec(text);
  if (ff) {
    const f = ff[1];
    if (/^Profile/.test(f)) return 'edge';
    if (/^Copper,L1,Top|^Copper,L1\b/.test(f)) return 'cuF';
    if (/^Copper,L\d+,Bot/.test(f)) return 'cuB';
    if (/^Paste,Top/.test(f)) return 'pasteF';
    if (/^Paste,Bot/.test(f)) return 'pasteB';
    if (/^Legend,Top/.test(f)) return 'silkF';
    if (/^Legend,Bot/.test(f)) return 'silkB';
    if (/^Soldermask,Top/.test(f)) return 'maskF';
    if (/^Soldermask,Bot/.test(f)) return 'maskB';
    if (/Drillmap|Other|Component/.test(f)) return null;
  }
  if (/^M48/m.test(text.slice(0, 400)) || /\.(drl|xln|exc|drd)$/i.test(name)) return 'drill';
  if (/drl_map|drill_map|drillmap|-job\.|\.gbrjob$/i.test(name)) return null;
  for (const [r, re] of ROLE_RULES) if (re.test(name)) return r;
  return null;
}

/** Read loose Gerber / drill files: [{name, text}] → { layers, drills, files } */
export function readGerberFiles(list) {
  const res = { layers: {}, drills: [], files: [] };
  for (const { name, text } of list) {
    const role = roleOf(name, text);
    res.files.push({ name, role });
    if (!role) continue;
    if (role === 'drill') res.drills.push(...parseExcellon(text));
    else if (!res.layers[role]) res.layers[role] = parseGerber(text);
  }
  return res;
}

/** Read a Gerber .zip (ArrayBuffer) → { layers: {role: parsed}, drills: [], files: [] } */
export function readGerberZip(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const list = [];
  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith('/') || data.length === 0 || /__MACOSX/.test(path)) continue;
    list.push({ name: path.split('/').pop(), text: strFromU8(data) });
  }
  const res = readGerberFiles(list);
  if (!res.layers.edge && !Object.keys(res.layers).length) throw new Error('No Gerber layers found in zip');
  return res;
}

// -------------------------------------------------- build board from fab ----

function bbox(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

function guessSize(fpName = '') {
  const m = /(\d{4})_(\d{4})Metric/.exec(fpName);
  if (m) return [parseInt(m[2].slice(0, 2), 10) / 10, parseInt(m[2].slice(2), 10) / 10];
  const imp = { '0201': [0.6, 0.3], '0402': [1, 0.5], '0603': [1.6, 0.8], '0805': [2, 1.25], '1206': [3.2, 1.6], '1210': [3.2, 2.5] };
  for (const [k, v] of Object.entries(imp)) if (fpName.includes(k)) return v;
  return [2, 2];
}

/**
 * Build a board model from JLCPCB-style fabrication files.
 * bomRows / cplRows: from readTable(); gerber: from readGerberZip() (optional).
 * Coordinates: Gerber / CPL are Y-up; the board model uses KiCad-style Y-down (y = -Y).
 */
export function boardFromFab(bomRows, cplRows, gerber, name = 'JLCPCB') {
  const L = gerber?.layers || {};
  // ---- outline ----
  let loops = [];
  if (L.edge) {
    const polys = L.edge.strokes.map((s) => s.pts).concat(L.edge.regions);
    loops = chainLoops(polys, 0.05).filter((l) => l.length > 2);
  }
  const area = (p) => { let a = 0; for (let i = 0; i < p.length - 1; i++) a += p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1]; return Math.abs(a / 2); };
  loops.sort((a, b) => area(b) - area(a));
  const flip = (pts) => pts.map(([x, y]) => [x, -y]);
  let outline = loops[0] ? flip(loops[0]) : null;
  let holes = loops.slice(1).map(flip).filter((h) => outline && pointInPoly(h[0][0], h[0][1], outline));

  // ---- pads: copper flashes (fall back to paste) ----
  const pads = [];
  for (const [side, cu, paste] of [['F', 'cuF', 'pasteF'], ['B', 'cuB', 'pasteB']]) {
    const src = L[cu]?.flashes?.length ? L[cu].flashes : L[paste]?.flashes || [];
    for (const f of src) pads.push({ side, x: f.x + (f.ox || 0), y: -(f.y + (f.oy || 0)), w: f.w, h: f.h, shape: f.shape, rot: 0, ref: f.ref || '' });
  }
  // drills → mark through-hole pads, drop vias, NPTH become board holes
  const drills = (gerber?.drills || []).map((d) => ({ ...d, y: -d.y }));
  const viaKeys = new Set();
  for (const d of drills) {
    let hit = false;
    for (const p of pads) {
      if (Math.hypot(p.x - d.x, p.y - d.y) < 0.05) {
        if (d.d <= 0.45 && p.shape === 'circle' && p.w <= 0.9) viaKeys.add(p);
        else p.drill = [d.d, d.d];
        hit = true;
      }
    }
    if (!hit && d.d >= 1.0) {
      const c = [];
      for (let k = 0; k <= 32; k++) { const t = (k / 32) * 2 * Math.PI; c.push([d.x + (d.d / 2) * Math.cos(t), d.y + (d.d / 2) * Math.sin(t)]); }
      holes.push(c);
    }
  }
  const realPads = pads.filter((p) => !viaKeys.has(p));
  for (const p of realPads) { p.front = p.side === 'F' || !!p.drill; p.back = p.side === 'B' || !!p.drill; }

  // ---- silkscreen + copper (board level, Y-down) ----
  const silk = { F: [], B: [] };
  for (const [side, key] of [['F', 'silkF'], ['B', 'silkB']]) {
    const l = L[key];
    if (!l) continue;
    for (const st of l.strokes) silk[side].push({ pts: flip(st.pts), w: st.w || 0.15, fill: false });
    for (const r of l.regions) silk[side].push({ pts: flip(r.concat([r[0]])), w: 0, fill: true });
    for (const f of l.flashes) {
      const hw = f.w / 2, hh = f.h / 2, x = f.x + (f.ox || 0), y = -(f.y + (f.oy || 0));
      silk[side].push({ pts: [[x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh], [x - hw, y - hh]], w: 0, fill: true });
    }
  }
  const copper = { F: { tracks: [], zones: [] }, B: { tracks: [], zones: [] } };
  for (const [side, key] of [['F', 'cuF'], ['B', 'cuB']]) {
    const l = L[key];
    if (!l) continue;
    for (const st of l.strokes) copper[side].tracks.push({ pts: flip(st.pts), w: st.w || 0.2 });
    for (const r of l.regions) copper[side].zones.push(flip(r));
  }
  const vias = [...viaKeys].map((p) => ({ x: p.x, y: p.y, d: p.w, drill: Math.min(p.w * 0.5, 0.4) }));

  // ---- placement (CPL) with automatic origin alignment ----
  let cpl = (cplRows || []).flatMap((r) => r.refs.map((ref) => ({ ref, x: r.x, y: r.y, rot: r.rot, side: /^b/i.test(r.layer) ? 'B' : 'F' })))
    .filter((c) => isFinite(c.x) && isFinite(c.y));
  if (!outline) {
    const pts = realPads.map((p) => [p.x, p.y]).concat(cpl.map((c) => [c.x, -c.y]));
    if (pts.length) {
      const b = bbox(pts);
      outline = [[b[0] - 3, b[1] - 3], [b[2] + 3, b[1] - 3], [b[2] + 3, b[3] + 3], [b[0] - 3, b[3] + 3], [b[0] - 3, b[1] - 3]];
    }
  }
  if (outline && cpl.length) {
    const ob = bbox(outline);
    const cands = [[0, 0, 1], [0, 0, -1], [ob[0], -ob[3], 1], [ob[0], ob[1], -1]];
    let best = cands[0], bestScore = -1;
    for (const c of cands) {
      let inside = 0;
      for (const q of cpl) { const X = q.x + c[0], Y = c[2] > 0 ? -(q.y + c[1]) : (q.y + c[1]); if (pointInPoly(X, Y, outline)) inside++; }
      if (inside > bestScore) { bestScore = inside; best = c; }
    }
    cpl = cpl.map((q) => ({ ...q, X: q.x + best[0], Y: best[2] > 0 ? -(q.y + best[1]) : q.y + best[1] }));
  } else cpl = cpl.map((q) => ({ ...q, X: q.x, Y: -q.y }));
  const pos = new Map(cpl.map((c) => [c.ref, c]));

  // ---- footprints ----
  const footprints = [];
  const rows = bomRows && bomRows.length ? bomRows : (cplRows || []).map((r) => ({ ...r, value: r.value, footprint: r.footprint }));
  const seen = new Set();
  for (const r of rows) {
    for (const ref of r.refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const p = pos.get(ref);
      footprints.push({
        fpid: r.footprint, footprint: r.footprint || '', ref, value: r.value || '',
        side: p ? p.side : 'F', x: p ? p.X : NaN, y: p ? p.Y : NaN, rot: p ? p.rot : 0,
        props: { LCSC: r.lcsc, MPN: r.mpn, Manufacturer: r.manufacturer, DigiKey: r.digikey, Mouser: r.mouser },
        attr: {}, pads: [], silk: [], fab: [], crtyd: [], inBom: true,
      });
    }
  }
  // assign pads to components: Gerber X2 component attribute (%TO.C) when present,
  // otherwise the component whose expected body (from the footprint name) contains the pad
  const placed = footprints.filter((f) => isFinite(f.x));
  const byRef = new Map(placed.map((f) => [f.ref, f]));
  for (const f of placed) {
    const m = /(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm/i.exec(f.footprint);
    const hdr = /(\d+)x(\d+)_P([\d.]+)mm/i.exec(f.footprint);
    const sz = m ? [parseFloat(m[1]), parseFloat(m[2])]
      : hdr ? [(+hdr[1]) * parseFloat(hdr[3]), (+hdr[2]) * parseFloat(hdr[3])] : guessSize(f.footprint);
    f._half = [sz[0] / 2 + 1.6, sz[1] / 2 + 1.6];
  }
  // copper flashes often lack %TO.C — borrow the reference from paste / mask flashes at the same spot
  const refAt = new Map();
  for (const key of ['pasteF', 'pasteB', 'maskF', 'maskB', 'cuF', 'cuB']) {
    for (const f of L[key]?.flashes || []) if (f.ref) refAt.set(`${Math.round((f.x + (f.ox || 0)) * 50)},${Math.round((f.y + (f.oy || 0)) * 50)}`, f.ref);
  }
  for (const p of realPads) if (!p.ref) p.ref = refAt.get(`${Math.round(p.x * 50)},${Math.round(-p.y * 50)}`) || '';
  for (const p of realPads) {
    if (p.ref && byRef.has(p.ref)) { byRef.get(p.ref).pads.push(p); continue; }
    let best = null, bs = Infinity;
    for (const f of placed) {
      if (f.side !== p.side && !p.drill) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > 12) continue;
      const a = (f.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const dx = p.x - f.x, dy = p.y - f.y;
      const lx = Math.abs(dx * c - dy * s), ly = Math.abs(dx * s + dy * c);
      const [hx, hy] = f._half;
      const inside = (lx <= hx && ly <= hy) || (lx <= hy && ly <= hx); // rotation-tolerant
      const score = inside ? d / Math.max(hx, hy) : 100 + d;
      if (score < bs) { bs = score; best = f; }
    }
    if (best && bs < 100 + 2.5) best.pads.push(p);
  }
  for (const f of placed) delete f._half;
  for (const f of footprints) {
    for (const p of f.pads) {
      // local coordinates (inverse of fpTransform)
      const a = (f.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const dx = p.x - f.x, dy = p.y - f.y;
      p.lx = dx * c - dy * s; p.ly = dx * s + dy * c;
    }
    if (f.pads.length) {
      const a = (f.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const toLocal = (x, y) => { const dx = x - f.x, dy = y - f.y; return [dx * c - dy * s, dx * s + dy * c]; };
      const ext = f.pads.flatMap((p) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => toLocal(p.x + (u * p.w) / 2, p.y + (v * p.h) / 2)));
      const b = bbox(ext);
      // bodies sit between the pads; shrink a little for 2-pad chips
      f.localBox = f.pads.length === 2 ? [b[0] + 0.1, b[1] + 0.05, b[2] - 0.1, b[3] - 0.05] : b;
    } else {
      const sz = guessSize(f.footprint);
      f.localBox = [-sz[0] / 2, -sz[1] / 2, sz[0] / 2, sz[1] / 2];
    }
    const [a, b, c, d] = f.localBox;
    f.body = isFinite(f.x) ? [[a, b], [c, b], [c, d], [a, d]].map(([x, y]) => fpTransform(f, x, y)) : [];
  }
  // pads not claimed by any BOM part stay on the board for the picture
  const orphan = realPads.filter((p) => !footprints.some((f) => f.pads.includes(p)));
  if (orphan.length) footprints.push({ ref: '', value: '', footprint: '', side: 'F', x: 0, y: 0, rot: 0, props: {}, attr: { board_only: true }, pads: orphan, silk: [], fab: [], crtyd: [], inBom: false, localBox: [0, 0, 0, 0], body: [] });

  const bounds = outline ? bbox(outline) : null;
  return {
    fileName: name, title: name.replace(/\.[^.]+$/, ''), rev: '', date: '', company: '', thickness: 1.6, maskColor: null,
    outline, holes, bounds, footprints, silk, texts: { F: [], B: [] }, copper, vias, fab: true, csvOnly: !gerber,
  };
}
