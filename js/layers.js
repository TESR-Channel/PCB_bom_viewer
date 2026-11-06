// TESR BOM Viewer — PCB layer model: layer definitions, colours, stacking order, presets
// Every board (KiCad .kicad_pcb or Gerber) is turned into board.gfx = { [layerId]: { s, f, p, t } }
//   s: strokes [{pts, w, k}]   f: filled polygons [{pts, k}]   p: pad-like flashes [{x, y, w, h, shape, rot, k}]
//   t: texts [{text, x, y, angle, h, w, hj, vj, mirror}]
// k (object kind): 'track' | 'zone' | 'pad' | 'via' | 'gfx' | 'pth' | 'npth' (drill layer)
// Made by TESR — Thai Embedded System and Robotics

const INNER_KC = ['#7fc87f', '#ce7d2c', '#4fcbcb', '#db628b', '#a7a5c6', '#b29e5c', '#5fa8ff', '#e0e070'];
const INNER_AC = ['#bc8e00', '#70dbfa', '#00cc66', '#9966ff', '#00ffff', '#800080', '#ff6600', '#ffd700'];

// Colour palette for the CAD look: 'altium' (Altium Designer defaults) or 'kicad'
let PALETTE = 'altium';
export function setPalette(p) { PALETTE = p === 'kicad' ? 'kicad' : 'altium'; }
export const getPalette = () => PALETTE;

/**
 * Standard layers (canonical KiCad ids).
 * alt: Altium Designer name · ac / kc: Altium / KiCad default colour · side: F / B / '' (both)
 * real: role in the realistic view
 */
const L = (id, side, group, real, alt, ac, kc, name, th, en) => ({ id, side, group, real, alt, ac, kc, name, th, en });
export const LAYERS = [
  L('F.Cu', 'F', 'cu', 'cu', 'Top Layer', '#ff0000', '#c83434', 'F.Cu', 'ทองแดงด้านบน', 'Top copper'),
  L('B.Cu', 'B', 'cu', 'cu', 'Bottom Layer', '#0000ff', '#4d7fc4', 'B.Cu', 'ทองแดงด้านล่าง', 'Bottom copper'),
  L('Edge.Cuts', '', 'mech', 'edge', 'Mechanical 1', '#ff00ff', '#d0d200', 'Edge.Cuts', 'ขอบบอร์ด / รูปร่างบอร์ด', 'Board outline'),
  L('F.SilkS', 'F', 'tech', 'silk', 'Top Overlay', '#ffff00', '#f2eda1', 'F.Silkscreen', 'ซิลค์สกรีนด้านบน', 'Top silkscreen'),
  L('B.SilkS', 'B', 'tech', 'silk', 'Bottom Overlay', '#808000', '#e8b2a7', 'B.Silkscreen', 'ซิลค์สกรีนด้านล่าง', 'Bottom silkscreen'),
  L('F.Paste', 'F', 'tech', 'over', 'Top Paste', '#808080', '#b4a09a', 'F.Paste', 'ครีมตะกั่ว (Stencil) ด้านบน', 'Top solder paste (stencil)'),
  L('B.Paste', 'B', 'tech', 'over', 'Bottom Paste', '#800000', '#00c2c2', 'B.Paste', 'ครีมตะกั่ว (Stencil) ด้านล่าง', 'Bottom solder paste (stencil)'),
  L('F.Mask', 'F', 'tech', 'mask', 'Top Solder', '#800080', '#d864ff', 'F.Mask', 'โซลเดอร์มาสก์ด้านบน (ช่องเปิด)', 'Top solder mask (openings)'),
  L('B.Mask', 'B', 'tech', 'mask', 'Bottom Solder', '#ff00ff', '#02ffee', 'B.Mask', 'โซลเดอร์มาสก์ด้านล่าง (ช่องเปิด)', 'Bottom solder mask (openings)'),
  L('F.Fab', 'F', 'mech', 'over', 'Top Assembly', '#c8c8ff', '#afafaf', 'F.Fab', 'แบบประกอบ (Fab) ด้านบน', 'Top fabrication / assembly'),
  L('B.Fab', 'B', 'mech', 'over', 'Bottom Assembly', '#8080ff', '#7a7aff', 'B.Fab', 'แบบประกอบ (Fab) ด้านล่าง', 'Bottom fabrication / assembly'),
  L('F.CrtYd', 'F', 'mech', 'over', 'Top Courtyard', '#00ffff', '#ff26e2', 'F.Courtyard', 'พื้นที่จองชิ้นส่วน ด้านบน', 'Top courtyard'),
  L('B.CrtYd', 'B', 'mech', 'over', 'Bottom Courtyard', '#00a0a0', '#26e9ff', 'B.Courtyard', 'พื้นที่จองชิ้นส่วน ด้านล่าง', 'Bottom courtyard'),
  L('F.Adhes', 'F', 'tech', 'over', 'Top Glue', '#a03ac6', '#a03ac6', 'F.Adhesive', 'กาวยึดชิ้นส่วนด้านบน', 'Top adhesive'),
  L('B.Adhes', 'B', 'tech', 'over', 'Bottom Glue', '#3a5ac6', '#3a5ac6', 'B.Adhesive', 'กาวยึดชิ้นส่วนด้านล่าง', 'Bottom adhesive'),
  L('Margin', '', 'mech', 'over', 'Keep-Out Layer', '#ff00ff', '#ff6ad5', 'Margin', 'ระยะขอบ / Keep-out', 'Board margin / keep-out'),
  L('Dwgs.User', '', 'user', 'over', 'Mechanical 2', '#c0c0c0', '#c2c2c2', 'User.Drawings', 'ภาพวาด / ขนาด (Drawings)', 'User drawings / dimensions'),
  L('Cmts.User', '', 'user', 'over', 'Mechanical 3', '#5994dc', '#5994dc', 'User.Comments', 'หมายเหตุ (Comments)', 'User comments'),
  L('Eco1.User', '', 'user', 'over', 'Mechanical 4', '#b4dbd2', '#b4dbd2', 'User.Eco1', 'ECO 1', 'ECO 1'),
  L('Eco2.User', '', 'user', 'over', 'Mechanical 5', '#d8c852', '#d8c852', 'User.Eco2', 'ECO 2', 'ECO 2'),
  ...Array.from({ length: 9 }, (_, i) => {
    const c = ['#c8c8c8', '#89c4ff', '#ffb089', '#a6e3a1', '#f5c2e7', '#f9e2af', '#94e2d5', '#cba6f7', '#eba0ac'][i];
    return L(`User.${i + 1}`, '', 'user', 'over', `Mechanical ${i + 6}`, c, c, `User.${i + 1}`, `เลเยอร์ผู้ใช้ ${i + 1}`, `User layer ${i + 1}`);
  }),
  L('Drill', '', 'mech', 'drill', 'Drill Drawing', '#ff002a', '#e6e6e6', 'Drill', 'รูเจาะ (PTH / NPTH / Via)', 'Drill holes (PTH / NPTH / via)'),
];

/** Layers shown in the panel even when empty (the core of every board). */
export const CORE = new Set(['F.Cu', 'B.Cu', 'F.SilkS', 'B.SilkS', 'F.Mask', 'B.Mask', 'Edge.Cuts', 'Drill']);

export const GROUPS = [
  { id: 'cu', th: 'ทองแดง (Copper)', en: 'Copper' },
  { id: 'tech', th: 'ซิลค์สกรีน / มาสก์ / ครีมตะกั่ว', en: 'Silkscreen / mask / paste' },
  { id: 'mech', th: 'กลไก / ประกอบ (Mechanical)', en: 'Mechanical / assembly' },
  { id: 'user', th: 'เลเยอร์ผู้ใช้ (User)', en: 'User layers' },
];

/** Object filters (apply to every layer). */
export const OBJECTS = [
  { id: 'pads', th: 'แพด (Pad)', en: 'Pads' },
  { id: 'vias', th: 'เวีย (Via)', en: 'Vias' },
  { id: 'tracks', th: 'ลายทองแดง (Track)', en: 'Tracks' },
  { id: 'zones', th: 'พื้นทองแดง (Zone / Pour)', en: 'Zones / pours' },
  { id: 'texts', th: 'ตัวหนังสือบนบอร์ด', en: 'Texts' },
  { id: 'parts', th: 'ตัวชิ้นส่วน (3D / กรอบ)', en: 'Components (3D / outline)' },
  { id: 'refs', th: 'ป้ายชื่อชิ้นส่วน (Ref)', en: 'Reference labels' },
];
const KIND_OBJ = { track: 'tracks', zone: 'zones', pad: 'pads', via: 'vias' };

/** KiCad 7+ user-facing names → canonical ids (some exporters / Gerber names use them). */
const ALIAS = {
  'F.Silkscreen': 'F.SilkS', 'B.Silkscreen': 'B.SilkS', 'F.Courtyard': 'F.CrtYd', 'B.Courtyard': 'B.CrtYd',
  'F.Adhesive': 'F.Adhes', 'B.Adhesive': 'B.Adhes', 'User.Drawings': 'Dwgs.User', 'User.Comments': 'Cmts.User',
  'User.Eco1': 'Eco1.User', 'User.Eco2': 'Eco2.User',
};
export const canon = (id) => ALIAS[id] || id;

export function innerDef(id) {
  const n = parseInt(/^In(\d+)\.Cu$/.exec(id)?.[1] || '1', 10);
  return L(id, 'I', 'cu', 'inner', `Mid-Layer ${n}`, INNER_AC[(n - 1) % INNER_AC.length], INNER_KC[(n - 1) % INNER_KC.length], id, `ทองแดงชั้นใน ${n}`, `Inner copper ${n}`);
}
const BY_ID = new Map(LAYERS.map((l) => [l.id, l]));
/** Layer definition with `color` resolved for the current palette. */
export function layerDef(id) {
  const d = BY_ID.get(id) || (/^In\d+\.Cu$/.test(id) ? innerDef(id) : L(id, '', 'user', 'over', id, '#c8c8c8', '#c8c8c8', id, id, id));
  return { ...d, color: PALETTE === 'kicad' ? d.kc : d.ac };
}

// ---------------------------------------------------------------- gfx ----

export function gfxLayer(gfx, id) {
  id = canon(id);
  return gfx[id] || (gfx[id] = { s: [], f: [], p: [], t: [] });
}
export function gfxCount(g) { return g ? g.s.length + g.f.length + g.p.length + g.t.length : 0; }

/** Copper layer ids of a board, top → bottom. */
export function copperLayers(board) {
  const ids = new Set(['F.Cu', 'B.Cu', ...(board.cuLayers || []), ...Object.keys(board.gfx || {}).filter((k) => /^In\d+\.Cu$/.test(k))]);
  const inner = [...ids].filter((k) => /^In\d+\.Cu$/.test(k)).sort((a, b) => parseInt(a.slice(2), 10) - parseInt(b.slice(2), 10));
  return ['F.Cu', ...inner, 'B.Cu'];
}

/** Layers to list in the panel for this board: core + every layer that has data. */
export function panelLayers(board) {
  const gfx = board?.gfx || {};
  const ids = new Set([...CORE, ...Object.keys(gfx).filter((k) => gfxCount(gfx[k]) > 0), ...copperLayers(board || {})]);
  // Altium tab order: signal layers, mechanical 1, overlays, paste, solder, assembly / courtyard, user, drill
  const order = [...copperLayers(board || {}), ...LAYERS.map((l) => l.id).filter((k) => !/\.Cu$/.test(k))];
  for (const k of ids) if (!order.includes(k)) order.push(k);
  return order.filter((k) => ids.has(k)).map((k) => {
    const d = layerDef(k);
    const nm = board?.layerNames?.[k];
    return { ...d, kname: nm && nm !== k ? nm : d.name, count: gfxCount(gfx[k]) };
  });
}

/** Drawing order (far → near) when looking at the board from `view` ('F' top / 'B' bottom). */
export function stackOrder(board, view = 'F') {
  const inner = copperLayers(board).filter((k) => k.startsWith('In'));
  const sideL = (s) => [`${s}.Cu`, `${s}.Mask`, `${s}.Paste`, `${s}.SilkS`, `${s}.Adhes`, `${s}.Fab`, `${s}.CrtYd`];
  const far = view === 'B' ? 'F' : 'B', near = view === 'B' ? 'B' : 'F';
  const common = ['Margin', 'Dwgs.User', 'Cmts.User', 'Eco1.User', 'Eco2.User', ...Array.from({ length: 9 }, (_, i) => `User.${i + 1}`)];
  const extra = Object.keys(board.gfx || {}).filter((k) => !LAYERS.some((l) => l.id === k) && !/^In\d+\.Cu$/.test(k));
  return [...sideL(far).reverse(), ...(view === 'B' ? inner : [...inner].reverse()), ...sideL(near), ...common, ...extra, 'Edge.Cuts', 'Drill'];
}

/** Is an object of kind k visible under the object filters? */
export function kindVisible(vis, k) {
  const o = KIND_OBJ[k];
  return !o || vis[o] !== false;
}

// ------------------------------------------------------------- presets ----

const ALL_IDS = () => [...LAYERS.map((l) => l.id)];
export const PRESETS = [
  { id: 'assembly', th: 'งานประกอบ', en: 'Assembly', ls: 'Assembly (TESR)', on: ['F.Cu', 'B.Cu', 'F.Mask', 'B.Mask', 'F.SilkS', 'B.SilkS', 'Edge.Cuts', 'Drill'], inner: false },
  { id: 'all', th: 'ทั้งหมด', en: 'All', ls: 'All Layers', on: 'all', inner: true },
  { id: 'copper', th: 'ทองแดง', en: 'Copper', ls: 'Signal Layers', on: ['F.Cu', 'B.Cu', 'Edge.Cuts', 'Drill'], inner: true, style: 'cad' },
  { id: 'nonsignal', th: 'ซิลค์ / มาสก์ / Paste', en: 'Overlay / mask / paste', ls: 'NonSignal Layers', on: ['F.SilkS', 'B.SilkS', 'F.Mask', 'B.Mask', 'F.Paste', 'B.Paste', 'F.Adhes', 'B.Adhes', 'Edge.Cuts', 'Drill'], inner: false, style: 'cad' },
  { id: 'mech', th: 'กลไก', en: 'Mechanical', ls: 'Mechanical Layers', on: ['Edge.Cuts', 'Drill', 'Margin', 'F.Fab', 'B.Fab', 'F.CrtYd', 'B.CrtYd', 'Dwgs.User', 'Cmts.User', 'Eco1.User', 'Eco2.User', ...Array.from({ length: 9 }, (_, i) => `User.${i + 1}`)], inner: false, style: 'cad' },
  { id: 'top', th: 'ด้านบน', en: 'Top', ls: 'Top Side', on: ['F.Cu', 'F.Mask', 'F.Paste', 'F.SilkS', 'F.Adhes', 'F.Fab', 'F.CrtYd', 'Edge.Cuts', 'Drill'], inner: false, side: 'F' },
  { id: 'bottom', th: 'ด้านล่าง', en: 'Bottom', ls: 'Bottom Side', on: ['B.Cu', 'B.Mask', 'B.Paste', 'B.SilkS', 'B.Adhes', 'B.Fab', 'B.CrtYd', 'Edge.Cuts', 'Drill'], inner: false, side: 'B' },
  { id: 'silk', th: 'ซิลค์สกรีน', en: 'Silkscreen', ls: 'Overlay', on: ['F.SilkS', 'B.SilkS', 'Edge.Cuts'], inner: false, style: 'cad' },
  { id: 'mask', th: 'มาสก์ + Paste', en: 'Mask + paste', ls: 'Solder / Paste', on: ['F.Mask', 'B.Mask', 'F.Paste', 'B.Paste', 'Edge.Cuts'], inner: false, style: 'cad' },
];

/** Default visibility map: layers + objects. */
export function defaultVis() { return applyPreset({}, 'assembly', []); }

/** Returns a new vis map for preset `id`; `extraIds` = layer ids of the board not in LAYERS (inner Cu…). */
export function applyPreset(vis, id, extraIds = []) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  const out = { ...vis };
  const on = p.on === 'all' ? new Set([...ALL_IDS(), ...extraIds]) : new Set(p.on);
  for (const k of [...ALL_IDS(), ...extraIds]) out[k] = /^In\d+\.Cu$/.test(k) ? !!p.inner : on.has(k);
  for (const o of OBJECTS) if (out[o.id] == null) out[o.id] = true;
  return out;
}
