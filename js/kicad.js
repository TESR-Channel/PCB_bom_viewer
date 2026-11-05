// TESR BOM Viewer — KiCad .kicad_pcb parser (KiCad 6 / 7 / 8 / 9)
// Made by TESR — Thai Embedded System and Robotics

/** Tokenise + parse an S-expression into nested arrays. Strings stay strings, atoms stay strings. */
export function parseSexpr(text) {
  const root = [];
  const stack = [root];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 40) { // (
      const node = [];
      stack[stack.length - 1].push(node);
      stack.push(node);
      i++;
    } else if (c === 41) { // )
      stack.pop();
      i++;
    } else if (c === 34) { // "
      let j = i + 1;
      let out = '';
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === 92) { // backslash
          const e = text[j + 1];
          out += e === 'n' ? '\n' : e;
          j += 2;
          continue;
        }
        if (d === 34) break;
        out += text[j];
        j++;
      }
      stack[stack.length - 1].push({ s: out });
      i = j + 1;
    } else if (c <= 32) {
      i++;
    } else {
      let j = i;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d <= 32 || d === 40 || d === 41) break;
        j++;
      }
      stack[stack.length - 1].push(text.slice(i, j));
      i = j;
    }
  }
  return root[0];
}

const str = (v) => (v == null ? '' : typeof v === 'object' && 's' in v ? v.s : String(v));
const num = (v) => parseFloat(str(v));
const kids = (node, name) => node.filter((x) => Array.isArray(x) && x[0] === name);
const kid = (node, name) => node.find((x) => Array.isArray(x) && x[0] === name);
const layerOf = (node) => { const l = kid(node, 'layer'); return l ? str(l[1]) : ''; };

function xy(node) { return node ? [num(node[1]), num(node[2])] : [0, 0]; }

/** Rotate a local footprint point into board coordinates (KiCad: Y down, angle CCW on screen). */
export function fpTransform(fp, lx, ly) {
  const a = (fp.rot * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [fp.x + lx * c + ly * s, fp.y - lx * s + ly * c];
}

function arcPoints(p0, pm, p1, segs = 16) {
  // circle through 3 points
  const [ax, ay] = p0, [bx, by] = pm, [cx, cy] = p1;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return [p0, p1];
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  let a0 = Math.atan2(ay - uy, ax - ux), am = Math.atan2(by - uy, bx - ux), a1 = Math.atan2(cy - uy, cx - ux);
  const norm = (a) => { while (a < a0) a += 2 * Math.PI; return a; };
  let ccw = norm(am) < norm(a1);
  let sweep = ccw ? norm(a1) - a0 : -(2 * Math.PI - (norm(a1) - a0));
  const pts = [];
  for (let k = 0; k <= segs; k++) {
    const t = a0 + (sweep * k) / segs;
    pts.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]);
  }
  return pts;
}

function oldArcPoints(center, start, angleDeg, segs = 16) {
  // KiCad 5 style arc: (start=center) (end=start point) (angle)
  const [cx, cy] = center, [sx, sy] = start;
  const r = Math.hypot(sx - cx, sy - cy);
  const a0 = Math.atan2(sy - cy, sx - cx);
  const sw = (angleDeg * Math.PI) / 180;
  const pts = [];
  for (let k = 0; k <= segs; k++) {
    const t = a0 + (sw * k) / segs;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

function circlePoints(c, r, segs = 40) {
  const pts = [];
  for (let k = 0; k <= segs; k++) {
    const t = (2 * Math.PI * k) / segs;
    pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return pts;
}

/** Convert a graphic item (gr_* / fp_*) to one or more polylines in its own coordinate frame. */
function shapeToPolylines(node) {
  const t = node[0].replace(/^(gr_|fp_)/, '');
  if (t === 'line') return [[xy(kid(node, 'start')), xy(kid(node, 'end'))]];
  if (t === 'rect') {
    const [x0, y0] = xy(kid(node, 'start')), [x1, y1] = xy(kid(node, 'end'));
    return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  }
  if (t === 'circle') {
    const c = xy(kid(node, 'center')), e = xy(kid(node, 'end'));
    return [circlePoints(c, Math.hypot(e[0] - c[0], e[1] - c[1]))];
  }
  if (t === 'arc') {
    const mid = kid(node, 'mid');
    if (mid) return [arcPoints(xy(kid(node, 'start')), xy(mid), xy(kid(node, 'end')))];
    const ang = kid(node, 'angle');
    if (ang) return [oldArcPoints(xy(kid(node, 'start')), xy(kid(node, 'end')), num(ang[1]))];
    return [];
  }
  if (t === 'poly') {
    const p = kid(node, 'pts');
    if (!p) return [];
    const pts = kids(p, 'xy').map(xy);
    if (pts.length) pts.push(pts[0]);
    return [pts];
  }
  if (t === 'curve') {
    const p = kid(node, 'pts');
    return p ? [kids(p, 'xy').map(xy)] : [];
  }
  return [];
}

/** Join loose segments into closed loops (tolerance in mm). */
export function chainLoops(polylines, tol = 0.02) {
  const segs = polylines.filter((p) => p.length >= 2).map((p) => p.slice());
  const closed = [];
  const open = [];
  for (const p of segs) {
    const a = p[0], b = p[p.length - 1];
    if (p.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < tol) closed.push(p);
    else open.push(p);
  }
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
  while (open.length) {
    let cur = open.shift();
    let grown = true;
    while (grown) {
      grown = false;
      for (let k = 0; k < open.length; k++) {
        const s = open[k];
        const head = cur[0], tail = cur[cur.length - 1];
        if (near(tail, s[0])) cur = cur.concat(s.slice(1));
        else if (near(tail, s[s.length - 1])) cur = cur.concat(s.slice(0, -1).reverse());
        else if (near(head, s[s.length - 1])) cur = s.slice(0, -1).concat(cur);
        else if (near(head, s[0])) cur = s.slice(1).reverse().concat(cur);
        else continue;
        open.splice(k, 1);
        grown = true;
        break;
      }
    }
    closed.push(cur);
  }
  return closed;
}

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length - 1; i++) a += p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1];
  return a / 2;
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bboxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Parse a .kicad_pcb text into a board model. */
export function parseKicadPcb(text, fileName = 'board.kicad_pcb') {
  const tree = parseSexpr(text);
  if (!tree || tree[0] !== 'kicad_pcb') throw new Error('Not a KiCad PCB file (kicad_pcb)');
  const version = num((kid(tree, 'version') || [])[1]) || 0;
  const tb = kid(tree, 'title_block');
  const title = tb && kid(tb, 'title') ? str(kid(tb, 'title')[1]) : fileName.replace(/\.kicad_pcb$/i, '');
  const rev = tb && kid(tb, 'rev') ? str(kid(tb, 'rev')[1]) : '';
  const date = tb && kid(tb, 'date') ? str(kid(tb, 'date')[1]) : '';
  const company = tb && kid(tb, 'company') ? str(kid(tb, 'company')[1]) : '';

  // ---- board outline ----
  const edgePolys = [];
  for (const n of tree) {
    if (!Array.isArray(n) || !/^gr_/.test(n[0])) continue;
    if (layerOf(n) !== 'Edge.Cuts') continue;
    edgePolys.push(...shapeToPolylines(n));
  }

  // ---- thickness / colour ----
  let thickness = 1.6;
  let maskColor = null;
  const setup = kid(tree, 'setup');
  const gen = kid(tree, 'general');
  if (gen && kid(gen, 'thickness')) thickness = num(kid(gen, 'thickness')[1]) || 1.6;
  if (setup && kid(setup, 'stackup')) {
    for (const l of kids(kid(setup, 'stackup'), 'layer')) {
      if (str(l[1]) === 'F.Mask' && kid(l, 'color')) maskColor = str(kid(l, 'color')[1]);
    }
  }

  // ---- footprints ----
  const footprints = [];
  for (const n of tree) {
    if (!Array.isArray(n) || (n[0] !== 'footprint' && n[0] !== 'module')) continue;
    const fpName = str(n[1]);
    const layer = layerOf(n);
    const at = kid(n, 'at');
    const fp = {
      fpid: fpName,
      footprint: fpName.includes(':') ? fpName.split(':').pop() : fpName,
      side: layer.startsWith('B') ? 'B' : 'F',
      x: at ? num(at[1]) : 0,
      y: at ? num(at[2]) : 0,
      rot: at && at[3] != null ? num(at[3]) : 0,
      ref: '', value: '', props: {}, attr: {}, pads: [], silk: [], fab: [], crtyd: [],
    };
    for (const p of kids(n, 'property')) {
      const k = str(p[1]), v = str(p[2]);
      if (k === 'Reference') fp.ref = v;
      else if (k === 'Value') fp.value = v;
      else fp.props[k] = v;
    }
    for (const t of kids(n, 'fp_text')) {
      const kind = str(t[1]);
      if (kind === 'reference' && !fp.ref) fp.ref = str(t[2]);
      if (kind === 'value' && !fp.value) fp.value = str(t[2]);
    }
    const attr = kid(n, 'attr');
    if (attr) for (const a of attr.slice(1)) fp.attr[str(a)] = true;
    if (kid(n, 'dnp')) fp.attr.dnp = true;
    for (const g of n) {
      if (!Array.isArray(g) || !/^fp_(line|rect|circle|arc|poly|curve)$/.test(g[0])) continue;
      const ly = layerOf(g);
      const polys = shapeToPolylines(g);
      if (/SilkS$/.test(ly)) fp.silk.push(...polys);
      else if (/Fab$/.test(ly)) fp.fab.push(...polys);
      else if (/CrtYd$/.test(ly)) fp.crtyd.push(...polys);
      else if (ly === 'Edge.Cuts') edgePolys.push(...polys.map((pl) => pl.map(([x, y]) => fpTransform(fp, x, y))));
    }
    for (const p of kids(n, 'pad')) {
      const pat = kid(p, 'at');
      const size = kid(p, 'size');
      const drill = kid(p, 'drill');
      const layers = kid(p, 'layers');
      const ly = layers ? layers.slice(1).map(str) : [];
      let dr = null;
      if (drill) {
        const vals = drill.slice(1).filter((v) => typeof v === 'string' && !isNaN(parseFloat(v))).map(parseFloat);
        if (vals.length) dr = vals.length > 1 ? [vals[0], vals[1]] : [vals[0], vals[0]];
      }
      const lx = pat ? num(pat[1]) : 0, lyy = pat ? num(pat[2]) : 0;
      const [wx, wy] = fpTransform(fp, lx, lyy);
      const pad = {
        num: str(p[1]), type: str(p[2]), shape: str(p[3]),
        lx, ly: lyy, x: wx, y: wy,
        rot: pat && pat[3] != null ? num(pat[3]) : fp.rot,
        w: size ? num(size[1]) : 0.5, h: size ? num(size[2]) : 0.5,
        drill: dr,
        front: ly.some((l) => l === 'F.Cu' || l === '*.Cu'),
        back: ly.some((l) => l === 'B.Cu' || l === '*.Cu'),
      };
      if (version && version < 20211014 && pat && pat[3] != null) pad.rot = num(pat[3]); // KiCad 5: already absolute
      fp.pads.push(pad);
    }
    // body: fab bbox → courtyard bbox → pad bbox (local frame)
    let local = null;
    const pts = (arr) => arr.flat();
    if (fp.fab.length) local = bboxOf(pts(fp.fab));
    else if (fp.crtyd.length) {
      const b = bboxOf(pts(fp.crtyd));
      local = [b[0] + 0.15, b[1] + 0.15, b[2] - 0.15, b[3] - 0.15];
    } else if (fp.pads.length) {
      const corners = fp.pads.flatMap((q) => [[q.lx - q.w / 2, q.ly - q.h / 2], [q.lx + q.w / 2, q.ly + q.h / 2]]);
      local = bboxOf(corners);
    } else if (fp.silk.length) local = bboxOf(pts(fp.silk));
    else local = [-0.5, -0.5, 0.5, 0.5];
    fp.localBox = local;
    const [a, b, c, d] = local;
    fp.body = [[a, b], [c, b], [c, d], [a, d]].map(([x, y]) => fpTransform(fp, x, y));
    fp.inBom = !(fp.attr.exclude_from_bom || fp.attr.board_only || fp.ref.startsWith('#') || (!fp.pads.length && !fp.value));
    footprints.push(fp);
  }

  // ---- outline loops ----
  let loops = chainLoops(edgePolys);
  loops = loops.filter((l) => l.length > 2);
  loops.sort((p, q) => Math.abs(polyArea(q)) - Math.abs(polyArea(p)));
  let outline = loops[0] || null;
  let holes = loops.slice(1).filter((h) => outline && pointInPoly(h[0][0], h[0][1], outline));
  if (!outline) {
    // no Edge.Cuts: box around everything
    const all = footprints.flatMap((f) => f.body);
    const [x0, y0, x1, y1] = all.length ? bboxOf(all) : [0, 0, 50, 50];
    outline = [[x0 - 3, y0 - 3], [x1 + 3, y0 - 3], [x1 + 3, y1 + 3], [x0 - 3, y1 + 3], [x0 - 3, y0 - 3]];
    holes = [];
  }
  const bounds = bboxOf(outline);

  return {
    fileName, title, rev, date, company, version, thickness, maskColor,
    outline, holes, bounds, footprints,
  };
}

/** Natural sort for reference designators (C2 < C10). */
export function refCompare(a, b) {
  const ra = /^([A-Za-z_#]*)(\d*)(.*)$/.exec(a), rb = /^([A-Za-z_#]*)(\d*)(.*)$/.exec(b);
  if (ra[1] !== rb[1]) return ra[1] < rb[1] ? -1 : 1;
  const na = parseInt(ra[2] || '0', 10), nb = parseInt(rb[2] || '0', 10);
  if (na !== nb) return na - nb;
  return ra[3] < rb[3] ? -1 : ra[3] > rb[3] ? 1 : 0;
}

const PREFIX_ORDER = ['U', 'IC', 'Q', 'D', 'LED', 'Y', 'X', 'L', 'FB', 'F', 'C', 'R', 'RN', 'SW', 'J', 'P', 'CN', 'K', 'TP', 'JP', 'H'];
const prefixOf = (ref) => (/^([A-Za-z_]+)/.exec(ref) || ['', ref])[1].toUpperCase();

/** Field lookup helpers (property names vary between projects) */
const FIELD_ALIASES = {
  lcsc: ['LCSC', 'LCSC Part', 'LCSC Part #', 'LCSC#', 'JLCPCB', 'JLCPCB Part', 'JLC', 'JLCPCB Part #', 'LCSC_PN', 'LCSCStockCode'],
  mpn: ['MPN', 'Manufacturer Part Number', 'Manufacturer_Part_Number', 'MFR PN', 'Mfr PN', 'Mfr. Part #', 'PartNumber', 'Part Number', 'MPN1', 'Manf#'],
  manufacturer: ['Manufacturer', 'MFR', 'Mfr', 'Manufacturer_Name', 'Manf'],
  digikey: ['Digikey', 'DigiKey', 'Digi-Key', 'DigiKey Part', 'Digikey Part Number', 'DK', 'Digi-Key_PN', 'DigiKey_PN'],
  mouser: ['Mouser', 'Mouser Part', 'Mouser Part Number', 'Mouser_PN'],
  datasheet: ['Datasheet'],
  description: ['Description', 'Desc'],
};

export function fieldOf(props, key) {
  const want = FIELD_ALIASES[key] || [key];
  for (const w of want) {
    for (const k of Object.keys(props)) {
      if (k.toLowerCase() === w.toLowerCase() && props[k] && props[k] !== '~') return props[k];
    }
  }
  return '';
}

/** Group BOM-relevant footprints into BOM lines. */
export function buildBom(board, { includeNonBom = false } = {}) {
  const groups = new Map();
  for (const fp of board.footprints) {
    if (!fp.ref) continue;
    if (!fp.inBom && !includeNonBom) continue;
    const lcsc = fieldOf(fp.props, 'lcsc');
    const mpn = fieldOf(fp.props, 'mpn');
    const key = [fp.value, fp.footprint, lcsc, mpn, fp.attr.dnp ? 'DNP' : ''].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        key, value: fp.value, footprint: fp.footprint, lcsc, mpn,
        manufacturer: fieldOf(fp.props, 'manufacturer'),
        digikey: fieldOf(fp.props, 'digikey'),
        mouser: fieldOf(fp.props, 'mouser'),
        datasheet: fieldOf(fp.props, 'datasheet'),
        description: fieldOf(fp.props, 'description'),
        dnp: !!fp.attr.dnp,
        refs: [], fps: [],
      });
    }
    const g = groups.get(key);
    g.refs.push(fp.ref);
    g.fps.push(fp);
    for (const k of ['manufacturer', 'digikey', 'mouser', 'datasheet', 'description']) if (!g[k]) g[k] = fieldOf(fp.props, k);
  }
  const list = [...groups.values()];
  for (const g of list) {
    g.refs.sort(refCompare);
    g.fps.sort((a, b) => refCompare(a.ref, b.ref));
    g.prefix = prefixOf(g.refs[0]);
    g.sides = [...new Set(g.fps.map((f) => f.side))].join('');
  }
  const rank = (p) => { const i = PREFIX_ORDER.indexOf(p); return i < 0 ? 50 : i; };
  list.sort((a, b) => rank(a.prefix) - rank(b.prefix) || (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0) || refCompare(a.refs[0], b.refs[0]));
  list.forEach((g, i) => { g.idx = i + 1; });
  return list;
}

// ------------------------------------------------------------------ CSV ----

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const delim = (() => {
    const head = text.split(/\r?\n/)[0] || '';
    const c = (head.match(/,/g) || []).length, s = (head.match(/;/g) || []).length, t = (head.match(/\t/g) || []).length;
    return t > c && t > s ? '\t' : s > c ? ';' : ',';
  })();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const COLS = {
  refs: ['designator', 'designators', 'reference', 'references', 'ref', 'refs', 'refdes', 'part', 'parts'],
  value: ['comment', 'value', 'val', 'values'],
  footprint: ['footprint', 'package', 'pcb footprint', 'footprint name'],
  lcsc: ['lcsc', 'lcsc part #', 'lcsc part', 'lcsc#', 'jlcpcb part #', 'jlcpcb part', 'jlc', 'lcsc part number', 'supplier part'],
  mpn: ['mpn', 'mpn / note', 'manufacturer part number', 'mfr. part #', 'mfr part', 'part number', 'manufacturer part', 'mfg part #'],
  manufacturer: ['manufacturer', 'mfr', 'mfr.', 'manufacturer name'],
  digikey: ['digikey', 'digi-key', 'digikey part number', 'digi-key part number', 'digikey part #'],
  mouser: ['mouser', 'mouser part number', 'mouser #'],
  qty: ['quantity', 'qty', 'count'],
  midx: ['mid x', 'center-x(mm)', 'posx', 'pos x', 'x'],
  midy: ['mid y', 'center-y(mm)', 'posy', 'pos y', 'y'],
  layer: ['layer', 'side', 'tb'],
  rotation: ['rotation', 'rot'],
};

function mapHeader(header) {
  const h = header.map((x) => x.trim().toLowerCase());
  const m = {};
  for (const [k, names] of Object.entries(COLS)) {
    const i = h.findIndex((c) => names.includes(c));
    if (i >= 0) m[k] = i;
  }
  return m;
}

export function splitRefs(s) {
  const out = [];
  for (const tok of s.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^([A-Za-z_]+)(\d+)-(?:[A-Za-z_]+)?(\d+)$/.exec(tok);
    if (m) for (let k = +m[2]; k <= +m[3]; k++) out.push(m[1] + k);
    else out.push(tok);
  }
  return out;
}

/**
 * Read a CSV (BOM or CPL). Returns { kind: 'bom'|'cpl', rows: [{refs, ...}] }.
 */
export function readTableCsv(text) { return readTable(parseCsv(text)); }

/** Parse a length cell that may carry a unit (12.3, 12.3mm, 500mil, 0.5in). */
function lengthMm(s) {
  const m = /^\s*([+-]?[\d.]+)\s*(mm|mil|in|inch)?\s*$/i.exec(String(s || ''));
  if (!m) return NaN;
  const v = parseFloat(m[1]);
  const u = (m[2] || 'mm').toLowerCase();
  return u === 'mil' ? v * 0.0254 : u.startsWith('in') ? v * 25.4 : v;
}

/** Same as readTableCsv but from a 2-D array of cells (CSV or XLSX). */
export function readTable(rows) {
  rows = rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
  let hi = rows.findIndex((r) => { const m = mapHeader(r); return m.refs != null; });
  if (hi < 0) throw new Error('CSV: no Designator / Reference column');
  const m = mapHeader(rows[hi]);
  const isCpl = m.midx != null && m.midy != null;
  const data = rows.slice(hi + 1).map((r) => {
    const g = (k) => (m[k] != null ? (r[m[k]] || '').trim() : '');
    return {
      refs: splitRefs(g('refs')), value: g('value'), footprint: g('footprint'), lcsc: g('lcsc'), mpn: g('mpn'),
      manufacturer: g('manufacturer'), digikey: g('digikey'), mouser: g('mouser'),
      x: lengthMm(g('midx')), y: lengthMm(g('midy')), layer: g('layer'), rot: parseFloat(g('rotation')) || 0,
    };
  }).filter((r) => r.refs.length);
  return { kind: isCpl ? 'cpl' : 'bom', rows: data };
}

/** Merge a BOM CSV into a board's footprints (fills LCSC / MPN / … by reference). */
export function mergeBomCsv(board, rows) {
  const byRef = new Map(board.footprints.map((f) => [f.ref, f]));
  let hit = 0;
  for (const r of rows) {
    for (const ref of r.refs) {
      const fp = byRef.get(ref);
      if (!fp) continue;
      hit++;
      if (r.lcsc) fp.props.LCSC = r.lcsc;
      if (r.mpn) fp.props.MPN = r.mpn;
      if (r.manufacturer) fp.props.Manufacturer = r.manufacturer;
      if (r.digikey) fp.props.DigiKey = r.digikey;
      if (r.mouser) fp.props.Mouser = r.mouser;
    }
  }
  return hit;
}

/** Build a minimal board from BOM (+ optional CPL) CSV when no .kicad_pcb is available. */
export function boardFromCsv(bomRows, cplRows, name = 'BOM') {
  const pos = new Map();
  for (const r of cplRows || []) for (const ref of r.refs) pos.set(ref, r);
  const footprints = [];
  for (const r of bomRows) {
    for (const ref of r.refs) {
      const p = pos.get(ref);
      const fp = {
        fpid: r.footprint, footprint: r.footprint, ref, value: r.value,
        side: p && /^b/i.test(p.layer) ? 'B' : 'F',
        x: p ? p.x : NaN, y: p ? -p.y : NaN, rot: p ? p.rot : 0,
        props: { LCSC: r.lcsc, MPN: r.mpn, Manufacturer: r.manufacturer, DigiKey: r.digikey, Mouser: r.mouser },
        attr: {}, pads: [], silk: [], fab: [], crtyd: [], inBom: true,
      };
      const s = guessSize(r.footprint);
      fp.localBox = [-s[0] / 2, -s[1] / 2, s[0] / 2, s[1] / 2];
      fp.body = p ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => fpTransform(fp, (a * s[0]) / 2, (b * s[1]) / 2)) : [];
      footprints.push(fp);
    }
  }
  const placed = footprints.filter((f) => !isNaN(f.x));
  let outline = null, bounds = null;
  if (placed.length) {
    const b = bboxOf(placed.flatMap((f) => f.body));
    outline = [[b[0] - 3, b[1] - 3], [b[2] + 3, b[1] - 3], [b[2] + 3, b[3] + 3], [b[0] - 3, b[3] + 3], [b[0] - 3, b[1] - 3]];
    bounds = bboxOf(outline);
  }
  return { fileName: name, title: name.replace(/\.[^.]+$/, ''), rev: '', date: '', company: '', thickness: 1.6, maskColor: null, outline, holes: [], bounds, footprints, csvOnly: true };
}

function guessSize(fpName = '') {
  const m = /(\d{4})_(\d{4})Metric/.exec(fpName);
  if (m) return [parseInt(m[2].slice(0, 2), 10) / 10, parseInt(m[2].slice(2), 10) / 10];
  const imp = { '0201': [0.6, 0.3], '0402': [1, 0.5], '0603': [1.6, 0.8], '0805': [2, 1.25], '1206': [3.2, 1.6], '1210': [3.2, 2.5] };
  for (const [k, v] of Object.entries(imp)) if (fpName.includes(k)) return v;
  return [2, 2];
}
