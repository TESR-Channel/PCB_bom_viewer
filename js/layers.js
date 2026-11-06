// TESR BOM Viewer — PCB layer model: layer definitions, colours, stacking order, presets
// Every board (KiCad .kicad_pcb or Gerber) is turned into board.gfx = { [layerId]: { s, f, p, t } }
//   s: strokes [{pts, w, k}]   f: filled polygons [{pts, k}]   p: pad-like flashes [{x, y, w, h, shape, rot, k}]
//   t: texts [{text, x, y, angle, h, w, hj, vj, mirror}]
// k (object kind): 'track' | 'zone' | 'pad' | 'via' | 'gfx' | 'pth' | 'npth' (drill layer)
// Made by TESR — Thai Embedded System and Robotics

const INNER_COLORS = ['#7fc87f', '#ce7d2c', '#4fcbcb', '#db628b', '#a7a5c6', '#b29e5c', '#5fa8ff', '#e0e070'];

/** Standard layers (canonical KiCad ids). side: F / B / '' (both). real: role in the realistic view. */
export const LAYERS = [
  { id: 'F.Cu', side: 'F', group: 'cu', real: 'cu', color: '#c83434', name: 'F.Cu', th: 'ทองแดงด้านบน', en: 'Top copper' },
  { id: 'B.Cu', side: 'B', group: 'cu', real: 'cu', color: '#4d7fc4', name: 'B.Cu', th: 'ทองแดงด้านล่าง', en: 'Bottom copper' },
  { id: 'F.SilkS', side: 'F', group: 'tech', real: 'silk', color: '#f2eda1', name: 'F.Silkscreen', th: 'ซิลค์สกรีนด้านบน', en: 'Top silkscreen' },
  { id: 'B.SilkS', side: 'B', group: 'tech', real: 'silk', color: '#e8b2a7', name: 'B.Silkscreen', th: 'ซิลค์สกรีนด้านล่าง', en: 'Bottom silkscreen' },
  { id: 'F.Mask', side: 'F', group: 'tech', real: 'mask', color: '#d864ff', name: 'F.Mask', th: 'โซลเดอร์มาสก์ด้านบน (ช่องเปิด)', en: 'Top solder mask (openings)' },
  { id: 'B.Mask', side: 'B', group: 'tech', real: 'mask', color: '#02ffee', name: 'B.Mask', th: 'โซลเดอร์มาสก์ด้านล่าง (ช่องเปิด)', en: 'Bottom solder mask (openings)' },
  { id: 'F.Paste', side: 'F', group: 'tech', real: 'over', color: '#b4a09a', name: 'F.Paste', th: 'ครีมตะกั่ว (Stencil) ด้านบน', en: 'Top solder paste (stencil)' },
  { id: 'B.Paste', side: 'B', group: 'tech', real: 'over', color: '#00c2c2', name: 'B.Paste', th: 'ครีมตะกั่ว (Stencil) ด้านล่าง', en: 'Bottom solder paste (stencil)' },
  { id: 'F.Adhes', side: 'F', group: 'tech', real: 'over', color: '#a03ac6', name: 'F.Adhesive', th: 'กาวยึดชิ้นส่วนด้านบน', en: 'Top adhesive' },
  { id: 'B.Adhes', side: 'B', group: 'tech', real: 'over', color: '#3a5ac6', name: 'B.Adhesive', th: 'กาวยึดชิ้นส่วนด้านล่าง', en: 'Bottom adhesive' },
  { id: 'Edge.Cuts', side: '', group: 'mech', real: 'edge', color: '#d0d200', name: 'Edge.Cuts', th: 'ขอบบอร์ด / รูปร่างบอร์ด', en: 'Board outline' },
  { id: 'Drill', side: '', group: 'mech', real: 'drill', color: '#e6e6e6', name: 'Drill', th: 'รูเจาะ (PTH / NPTH / Via)', en: 'Drill holes (PTH / NPTH / via)' },
  { id: 'F.Fab', side: 'F', group: 'mech', real: 'over', color: '#afafaf', name: 'F.Fab', th: 'แบบประกอบ (Fab) ด้านบน', en: 'Top fabrication / assembly' },
  { id: 'B.Fab', side: 'B', group: 'mech', real: 'over', color: '#7a7aff', name: 'B.Fab', th: 'แบบประกอบ (Fab) ด้านล่าง', en: 'Bottom fabrication / assembly' },
  { id: 'F.CrtYd', side: 'F', group: 'mech', real: 'over', color: '#ff26e2', name: 'F.Courtyard', th: 'พื้นที่จองชิ้นส่วน ด้านบน', en: 'Top courtyard' },
  { id: 'B.CrtYd', side: 'B', group: 'mech', real: 'over', color: '#26e9ff', name: 'B.Courtyard', th: 'พื้นที่จองชิ้นส่วน ด้านล่าง', en: 'Bottom courtyard' },
  { id: 'Margin', side: '', group: 'mech', real: 'over', color: '#ff6ad5', name: 'Margin', th: 'ระยะขอบ (Margin)', en: 'Board margin' },
  { id: 'Dwgs.User', side: '', group: 'user', real: 'over', color: '#c2c2c2', name: 'User.Drawings', th: 'ภาพวาด / ขนาด (Drawings)', en: 'User drawings / dimensions' },
  { id: 'Cmts.User', side: '', group: 'user', real: 'over', color: '#5994dc', name: 'User.Comments', th: 'หมายเหตุ (Comments)', en: 'User comments' },
  { id: 'Eco1.User', side: '', group: 'user', real: 'over', color: '#b4dbd2', name: 'User.Eco1', th: 'ECO 1', en: 'ECO 1' },
  { id: 'Eco2.User', side: '', group: 'user', real: 'over', color: '#d8c852', name: 'User.Eco2', th: 'ECO 2', en: 'ECO 2' },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `User.${i + 1}`, side: '', group: 'user', real: 'over', color: ['#c8c8c8', '#89c4ff', '#ffb089', '#a6e3a1', '#f5c2e7', '#f9e2af', '#94e2d5', '#cba6f7', '#eba0ac'][i], name: `User.${i + 1}`, th: `เลเยอร์ผู้ใช้ ${i + 1}`, en: `User layer ${i + 1}` })),
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
  return { id, side: 'I', group: 'cu', real: 'inner', color: INNER_COLORS[(n - 1) % INNER_COLORS.length], name: id, th: `ทองแดงชั้นใน ${n}`, en: `Inner copper ${n}` };
}
export function layerDef(id) {
  return LAYERS.find((l) => l.id === id) || (/^In\d+\.Cu$/.test(id) ? innerDef(id) : { id, side: '', group: 'user', real: 'over', color: '#c8c8c8', name: id, th: id, en: id });
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
  const order = [...copperLayers(board || {}), ...LAYERS.map((l) => l.id).filter((k) => !/\.Cu$/.test(k))];
  for (const k of ids) if (!order.includes(k)) order.push(k);
  return order.filter((k) => ids.has(k)).map((k) => {
    const d = layerDef(k);
    const nm = board?.layerNames?.[k];
    return { ...d, name: nm && nm !== k ? nm : d.name, count: gfxCount(gfx[k]) };
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
  { id: 'assembly', th: 'งานประกอบ', en: 'Assembly', on: ['F.Cu', 'B.Cu', 'F.Mask', 'B.Mask', 'F.SilkS', 'B.SilkS', 'Edge.Cuts', 'Drill'], inner: false },
  { id: 'all', th: 'ทั้งหมด', en: 'All', on: 'all', inner: true },
  { id: 'top', th: 'ด้านบน', en: 'Top', on: ['F.Cu', 'F.Mask', 'F.Paste', 'F.SilkS', 'F.Adhes', 'F.Fab', 'F.CrtYd', 'Edge.Cuts', 'Drill'], inner: false, side: 'F' },
  { id: 'bottom', th: 'ด้านล่าง', en: 'Bottom', on: ['B.Cu', 'B.Mask', 'B.Paste', 'B.SilkS', 'B.Adhes', 'B.Fab', 'B.CrtYd', 'Edge.Cuts', 'Drill'], inner: false, side: 'B' },
  { id: 'copper', th: 'ทองแดง', en: 'Copper', on: ['F.Cu', 'B.Cu', 'Edge.Cuts', 'Drill'], inner: true, style: 'cad' },
  { id: 'silk', th: 'ซิลค์สกรีน', en: 'Silkscreen', on: ['F.SilkS', 'B.SilkS', 'Edge.Cuts'], inner: false, style: 'cad' },
  { id: 'mask', th: 'มาสก์ + Paste', en: 'Mask + paste', on: ['F.Mask', 'B.Mask', 'F.Paste', 'B.Paste', 'Edge.Cuts'], inner: false, style: 'cad' },
  { id: 'mech', th: 'กลไก', en: 'Mechanical', on: ['Edge.Cuts', 'Drill', 'Margin', 'F.Fab', 'B.Fab', 'F.CrtYd', 'B.CrtYd', 'Dwgs.User', 'Cmts.User', 'Eco1.User', 'Eco2.User', ...Array.from({ length: 9 }, (_, i) => `User.${i + 1}`)], inner: false, style: 'cad' },
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
