// TESR BOM Viewer — main application
// Made by TESR — Thai Embedded System and Robotics · https://www.tesrshop.com
import { parseKicadPcb, buildBom, readTableCsv, readTable, mergeBomCsv, refCompare } from './kicad.js?b=20261106f';
import { VERSION, BUILD_DATE, CHANGELOG } from './version.js?b=20261106f';
import { parseLabel, matchGroups, CameraScanner, decodeFile, beep } from './scan.js?b=20261106f';
import { Board2D } from './view2d.js?b=20261106f';
import { t, setLang } from './i18n.js?b=20261106f';
import { GROUPS, OBJECTS, PRESETS, panelLayers, applyPreset, defaultVis, layerDef, setPalette } from './layers.js?b=20261106f';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ state ----
const S = {
  board: null,
  bom: [],
  byRef: new Map(),       // ref → group
  byKey: new Map(),       // key → group
  sel: null,              // selected group key
  placed: new Set(),      // refs
  sourced: new Set(),     // group keys
  hidePlaced: false,
  mode: '2d',
  side: 'F',
  storeKey: '',
};
const OPT_KEY = 'tesr-bomv-opts';
const opts = Object.assign({ lang: 'th', mask: 'black', autoSource: true, beep: true, refs: true, nonBom: false },
  safeJson(localStorageGet(OPT_KEY)) || {});

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
function safeJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
function saveOpts() { localStorageSet(OPT_KEY, JSON.stringify(opts)); }

// ------------------------------------------------------------------ views ----
const tip = $('#tip');
const v2 = new Board2D($('#cv2d'), { onPick: (fp) => pickPart(fp), onHover: (fp, e) => hover(fp, e), onCursor: (q) => showCursor(q) });

// ------------------------------------------------------------ layer view ----
// Visibility of every PCB layer (F.Cu, B.SilkS, Edge.Cuts, F.Fab …) + object filters, shared by 2D and 3D.
// UI follows Altium Designer: layer tabs (bottom), LS layer sets, current layer, Single Layer Mode (Shift+S),
// + / − / * to change layer, Q for units, L for the View Configuration panel.
const LP = Object.assign({ style: 'real', opacity: 0.85, single: 'off', active: 'F.Cu', open: false, preset: 'assembly', units: 'mm' }, opts.layers || {});
LP.vis = { ...defaultVis(), ...(opts.layers?.vis || {}), refs: opts.refs };
if (!['off', 'hide', 'gray', 'mono'].includes(LP.single)) LP.single = 'off';
if (!LP.active) LP.active = 'F.Cu';
opts.barPos = opts.barPos === 'top' ? 'top' : 'bottom';
opts.palette = opts.palette === 'kicad' ? 'kicad' : 'altium';
setPalette(opts.palette);
const langKey = () => (opts.lang === 'en' ? 'en' : 'th');
const SINGLE_NEXT = { off: 'hide', hide: 'gray', gray: 'mono', mono: 'off' };

function saveLayers() {
  opts.layers = { vis: LP.vis, style: LP.style, opacity: LP.opacity, single: LP.single, active: LP.active, open: LP.open, preset: LP.preset, units: LP.units };
  saveOpts();
}
function applyLayers({ only2d = false } = {}) {
  v2.setLayers({ vis: { ...LP.vis }, style: LP.style, opacity: LP.opacity, active: LP.active, single: LP.single, palette: opts.palette });
  if (v3 && !only2d) { try { v3.setLayers(LP.vis); } catch (e) { err3d(e); } }
  renderLayerBar();
  renderLayerPanel();
  saveLayers();
}
const boardLayers = () => panelLayers(S.board);

// ---- bottom tab bar ----
function renderLayerBar() {
  $('#paneBoard').classList.toggle('bar-top', opts.barPos === 'top');
  const list = boardLayers();
  const real = LP.style === 'real';
  // first tab = the board as manufactured (realistic look); any layer tab = CAD layer view
  $('#lbTabs').innerHTML = `<button class="lb-tab lb-real${real ? ' active' : ''}" role="tab" aria-selected="${real}" data-real="1" title="${esc(t('realTabTip'))}">${esc(t('realTab'))}</button>`
    + list.map((l) => {
      const off = LP.vis[l.id] === false, act = !real && LP.active === l.id;
      return `<button class="lb-tab${off ? ' off' : ''}${act ? ' active' : ''}" role="tab" aria-selected="${act}" data-id="${esc(l.id)}" style="--c:${l.color}" title="${esc(l.alt)} · ${esc(l.kname)} — ${esc(l[langKey()])}${l.count ? ` (${l.count})` : ''}">${esc(l.alt)}</button>`;
    }).join('');
  setCurSwatch();
  const sb = $('#lbSingle');
  sb.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="4.5" y="4.5" width="7" height="7" fill="currentColor"/></svg><span class="lbl">${esc(t('slTitle'))}: ${esc(t('sl' + LP.single[0].toUpperCase() + LP.single.slice(1)))}</span>`;
  sb.classList.toggle('on', LP.single !== 'off');
  scrollTabIntoView();
}
function scrollTabIntoView() {
  const tab = $('#lbTabs .lb-tab.active'), box = $('#lbTabs');
  if (!tab) return;
  const l = tab.offsetLeft - box.offsetLeft, r = l + tab.offsetWidth;
  if (l < box.scrollLeft) box.scrollLeft = l - 8;
  else if (r > box.scrollLeft + box.clientWidth) box.scrollLeft = r - box.clientWidth + 8;
}
function setCurSwatch() {
  const cur = layerDef(LP.active), real = LP.style === 'real';
  $('#lbCur').classList.toggle('real', real);
  $('#lbCur').style.setProperty('--c', cur.color);
  $('#lbCur').title = real ? t('realTab') : `${cur.alt} (${cur.id})`;
}
/** patch "current layer" highlight without rebuilding (keeps double-click working) */
function patchActive() {
  const real = LP.style === 'real';
  for (const el of document.querySelectorAll('#lbTabs .lb-tab, #lpBody .lp-row[data-id]')) {
    const on = el.dataset.real ? real : !real && el.dataset.id === LP.active;
    el.classList.toggle('active', el.classList.contains('lb-tab') ? on : el.dataset.id === LP.active);
    if (el.classList.contains('lb-tab')) el.setAttribute('aria-selected', String(on));
  }
  setCurSwatch();
  scrollTabIntoView();
}
/** make `id` the current layer (Altium: click a layer tab) */
function setCurrentLayer(id) {
  // picking a layer means the user wants the layer (CAD) view — in 2D
  if (S.mode === '3d') $('#segMode button[data-mode="2d"]').click();
  const wasHidden = LP.vis[id] === false, wasReal = LP.style !== 'cad';
  LP.active = id;
  LP.style = 'cad'; LP._styleBeforeSingle = null;
  if (wasHidden) setLayerVis(id, true);
  if (wasHidden || wasReal) applyLayers({ only2d: !wasHidden });
  else { patchActive(); v2.setLayers({ active: LP.active }); saveLayers(); }
}
function setSingle(mode) {
  if (mode !== 'off' && LP.style !== 'cad') { LP._styleBeforeSingle = LP.style; LP.style = 'cad'; } // single layer is a CAD view
  if (mode === 'off' && LP._styleBeforeSingle) { LP.style = LP._styleBeforeSingle; LP._styleBeforeSingle = null; }
  LP.single = mode;
  applyLayers({ only2d: true });
  toast(`Single Layer Mode: ${t('sl' + mode[0].toUpperCase() + mode.slice(1))}`);
}
function setStyle(st) {
  LP.style = st; LP._styleBeforeSingle = null;
  if (st === 'real') LP.single = 'off'; // the realistic view has no single-layer mode
  applyLayers({ only2d: true });
}
function stepLayer(dir) {
  const ids = boardLayers().filter((l) => LP.vis[l.id] !== false).map((l) => l.id);
  if (!ids.length) return;
  const k = ids.indexOf(LP.active);
  setCurrentLayer(ids[(k + dir + ids.length) % ids.length]);
}
function showCursor(q) {
  const box = $('#lbXY'), b = S.board;
  if (!q || !b?.bounds) { box.textContent = ''; return; }
  const x = q.x - b.bounds[0], y = b.bounds[3] - q.y; // from the board's lower-left corner, Y up
  box.textContent = LP.units === 'mil' ? `X:${(x / 0.0254).toFixed(0)}mil  Y:${(y / 0.0254).toFixed(0)}mil` : `X:${x.toFixed(2)}mm  Y:${y.toFixed(2)}mm`;
  box.title = `${t('coordFrom')} · ${q.side === 'B' ? 'BOTTOM' : 'TOP'} · Q = mm / mil`;
}
function toggleUnits() { LP.units = LP.units === 'mil' ? 'mm' : 'mil'; saveLayers(); toast(`Units: ${LP.units}`); }

// ---- popup menus (LS layer sets, tab right-click) ----
const menu = $('#lbMenu');
function openMenu(html, anchor) {
  menu.innerHTML = html;
  menu.classList.remove('hide');
  const host = $('#boardHost').getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const left = Math.max(4, Math.min(a.left - host.left, host.width - w - 4));
  menu.style.left = left + 'px';
  if (opts.barPos === 'top') { menu.style.top = '4px'; menu.style.bottom = ''; }
  else { menu.style.bottom = '4px'; menu.style.top = ''; }
  if (h > host.height - 8) menu.style.maxHeight = (host.height - 8) + 'px';
}
function closeMenu() { menu.classList.add('hide'); $('#lbLS').classList.remove('on'); }
document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && e.target !== $('#lbLS')) closeMenu(); });
$('#lbLS').addEventListener('click', (e) => {
  if (!menu.classList.contains('hide') && $('#lbLS').classList.contains('on')) { closeMenu(); return; }
  const lang = langKey();
  openMenu(`<div class="mh">${esc(t('lsTitle'))}</div>` + PRESETS.map((p) => `<button data-preset="${p.id}">${esc(p.ls)}<small>${esc(p[lang])}${LP.preset === p.id ? ' ✓' : ''}</small></button>`).join(''), e.currentTarget);
  $('#lbLS').classList.add('on');
});
function tabMenu(id, anchor) {
  const d = layerDef(id), off = LP.vis[id] === false;
  openMenu(`<div class="mh">${esc(d.alt)} · ${esc(d.id)}</div>`
    + `<button data-act="current" data-id="${esc(id)}">${esc(t('ctxCurrent'))}</button>`
    + `<button data-act="${off ? 'show' : 'hide'}" data-id="${esc(id)}">${esc(off ? t('ctxShow') : t('ctxHide'))}</button>`
    + `<button data-act="only" data-id="${esc(id)}">${esc(t('ctxOnly'))}<small>Shift+S</small></button>`
    + `<button data-act="others" data-id="${esc(id)}">${esc(t('ctxHideOthers'))}</button>`
    + `<hr><button data-act="all">${esc(t('ctxAll'))}</button>`, anchor);
}
menu.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.preset) applyLayerSet(b.dataset.preset);
  else {
    const id = b.dataset.id, act = b.dataset.act;
    if (act === 'current') setCurrentLayer(id);
    else if (act === 'show' || act === 'hide') { setLayerVis(id, act === 'show'); applyLayers(); }
    else if (act === 'only') { LP.active = id; if (LP.single === 'off') setSingle('hide'); else applyLayers({ only2d: true }); }
    else if (act === 'others') { for (const l of boardLayers()) LP.vis[l.id] = l.id === id || l.id === 'Edge.Cuts'; LP.active = id; LP.preset = null; applyLayers(); }
    else if (act === 'all') { for (const l of boardLayers()) LP.vis[l.id] = true; LP.preset = 'all'; applyLayers(); }
  }
  closeMenu();
});
function applyLayerSet(id) {
  const p = PRESETS.find((x) => x.id === id);
  const extra = boardLayers().map((l) => l.id).filter((k) => /^In\d+\.Cu$/.test(k));
  LP.vis = { ...applyPreset(LP.vis, p.id, extra), refs: LP.vis.refs };
  LP.style = p.id === 'assembly' ? 'real' : 'cad'; // "Assembly" = the real board, every other set = layer view
  if (LP.style === 'real') LP.single = 'off';
  LP.preset = p.id;
  if (LP.vis[LP.active] === false) LP.active = boardLayers().find((l) => LP.vis[l.id] !== false)?.id || 'F.Cu';
  if (p.side) { LP.active = `${p.side}.Cu`; if (S.mode === '3d' && v3) v3.view(p.side === 'B' ? 'bottom' : 'top'); else setSide(p.side); }
  applyLayers();
}

// tab bar events
$('#lbTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.lb-tab'); if (!b) return;
  if (b.dataset.real) setStyle('real'); else setCurrentLayer(b.dataset.id);
});
$('#lbTabs').addEventListener('dblclick', (e) => {
  const b = e.target.closest('.lb-tab'); if (!b || b.dataset.real) return;
  LP.active = b.dataset.id;
  setSingle(LP.single === 'hide' ? 'off' : 'hide');
});
$('#lbTabs').addEventListener('contextmenu', (e) => { const b = e.target.closest('.lb-tab'); if (!b || b.dataset.real) return; e.preventDefault(); tabMenu(b.dataset.id, b); });
$('#lbTabs').addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $('#lbTabs').scrollLeft += e.deltaY; } }, { passive: false });
for (const b of document.querySelectorAll('#layerBar .lb-nav')) b.addEventListener('click', () => { $('#lbTabs').scrollBy({ left: +b.dataset.dir * 160, behavior: 'smooth' }); });
$('#lbSingle').addEventListener('click', () => setSingle(SINGLE_NEXT[LP.single]));
$('#lbXY').addEventListener('click', toggleUnits);

// ---- View Configuration panel (L) ----
function renderLayerPanel() {
  const panel = $('#layerPanel');
  $('#btnLayers').classList.toggle('on', LP.open);
  $('#btnLayers').setAttribute('aria-expanded', String(LP.open));
  panel.classList.toggle('hide', !LP.open);
  if (!LP.open) return;
  const lang = langKey();
  for (const b of document.querySelectorAll('#lpSingle button')) b.classList.toggle('on', b.dataset.single === LP.single);
  $('#lpNote3d').classList.toggle('hide', S.mode !== '3d');
  $('#lpPresets').innerHTML = PRESETS.map((p) => `<button data-preset="${p.id}" class="${LP.preset === p.id ? 'on' : ''}" title="${esc(p.ls)}">${esc(p[lang])}</button>`).join('');
  const list = boardLayers();
  let html = S.board && !S.board.gfx ? `<div class="lp-msg">${esc(t('lpNoGfx'))}</div>` : '';
  for (const g of GROUPS) {
    const rows = list.filter((l) => l.group === g.id);
    if (!rows.length) continue;
    const allOn = rows.every((l) => LP.vis[l.id] !== false);
    html += `<div class="lp-group"><div class="lp-ghead"><span>${esc(g[lang])}</span><button class="lp-gall" data-group="${g.id}" data-on="${allOn ? 0 : 1}">${esc(allOn ? t('lpHideAll') : t('lpShowAll'))}</button></div>`;
    for (const l of rows) {
      const off = LP.vis[l.id] === false;
      html += `<div class="lp-row${off ? ' off' : ''}${LP.active === l.id ? ' active' : ''}${l.count || !S.board ? '' : ' empty'}" data-id="${esc(l.id)}" title="${esc(l[lang])} — ${esc(t('lpSolo'))}: double-click">`
        + `<button class="lp-eye" style="--c:${l.color}" data-eye="${esc(l.id)}" aria-pressed="${!off}" aria-label="${esc(l.alt)}"></button>`
        + `<span class="lp-name"><b>${esc(l.alt)}</b><small data-empty="${esc(t('lpEmpty'))}">${esc(l.kname)} · ${esc(l[lang])}</small></span>`
        + `<span class="lp-n">${l.count || ''}</span></div>`;
    }
    html += '</div>';
  }
  html += `<div class="lp-group"><div class="lp-ghead"><span>${esc(t('lpObjects'))}</span></div>`;
  for (const o of OBJECTS) {
    const off = LP.vis[o.id] === false;
    html += `<div class="lp-row obj${off ? ' off' : ''}" data-obj="${o.id}"><button class="lp-eye" data-eye="${o.id}" aria-pressed="${!off}" aria-label="${esc(o[lang])}"></button><span class="lp-name"><b style="font-family:var(--body)">${esc(o[lang])}</b></span></div>`;
  }
  html += '</div>';
  const body = $('#lpBody'), top = body.scrollTop;
  body.innerHTML = html;
  body.scrollTop = top;
  $('#lpOpacity').value = LP.opacity;
}
function setLayerVis(id, on) {
  LP.vis[id] = on;
  LP.preset = null;
  if (id === 'refs') { opts.refs = on; $('#optRefs').checked = on; v2.showRefs = on; }
}
function toggleLayerPanel(open = !LP.open) { LP.open = open; renderLayerPanel(); panelInset(); saveLayers(); }
// keep the 2D board clear of the panel on wide screens
function panelInset() {
  const host = $('#boardHost').getBoundingClientRect();
  const want = LP.open && host.width > 540 ? $('#layerPanel').getBoundingClientRect().width + 12 : 0;
  if (want !== (v2.insetRight || 0)) { v2.insetRight = want; v2.fit(); }
}
new ResizeObserver(() => panelInset()).observe($('#boardHost'));
$('#btnLayers').addEventListener('click', () => toggleLayerPanel());
$('#lpClose').addEventListener('click', () => toggleLayerPanel(false));
$('#lpSingle').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSingle(b.dataset.single); });
$('#lpOpacity').addEventListener('input', (e) => { LP.opacity = +e.target.value; applyLayers({ only2d: true }); });
$('#lpPresets').addEventListener('click', (e) => { const b = e.target.closest('button[data-preset]'); if (b) applyLayerSet(b.dataset.preset); });
$('#lpBody').addEventListener('click', (e) => {
  const eye = e.target.closest('[data-eye]');
  const row = e.target.closest('.lp-row');
  const gall = e.target.closest('.lp-gall');
  if (gall) {
    const on = gall.dataset.on === '1';
    for (const l of boardLayers().filter((x) => x.group === gall.dataset.group)) setLayerVis(l.id, on);
    applyLayers();
  } else if (eye) {
    const id = eye.dataset.eye;
    setLayerVis(id, LP.vis[id] === false);
    applyLayers({ only2d: id === 'refs' });
  } else if (row?.dataset.obj) {
    const id = row.dataset.obj;
    setLayerVis(id, LP.vis[id] === false);
    applyLayers({ only2d: id === 'refs' });
  } else if (row?.dataset.id) setCurrentLayer(row.dataset.id);
});
$('#lpBody').addEventListener('dblclick', (e) => {
  const row = e.target.closest('.lp-row[data-id]'); if (!row || e.target.closest('[data-eye]')) return;
  LP.active = row.dataset.id;
  setSingle(LP.single === 'hide' ? 'off' : 'hide');
});

let v3 = null, v3Loading = null;
// 3D is loaded on demand. Any failure (no WebGL, stale cached files, a bad part) is shown in the
// 3D pane instead of leaving it silently blank, and the next click retries.
function err3d(err) {
  const box = $('#err3d');
  if (!err) { box.classList.add('hide'); return; }
  console.error('[TESR 3D]', err);
  $('#err3dMsg').textContent = String(err?.message || err).slice(0, 220);
  box.classList.remove('hide');
}
function board3d(board) {
  try { v3.setBoard(board); err3d(null); } catch (e) { err3d(e); }
}
async function ensure3d() {
  if (v3) return v3;
  if (!v3Loading) v3Loading = (async () => {
    const { Board3D } = await import('./view3d.js?b=20261106f');
    const v = new Board3D($('#host3d'), { onPick: (fp) => pickPart(fp), onHover: (fp, e) => hover(fp, e) });
    v3 = v;
    v.visible = true;
    v.vis = { ...LP.vis };
    v.setTheme(opts.mask);
    if (S.board) board3d(S.board);
    syncViews();
    return v;
  })().catch((e) => { v3Loading = null; throw e; });
  return v3Loading;
}

function hover(fp, e) {
  if (!fp || !e) { tip.style.display = 'none'; return; }
  const g = S.byRef.get(fp.ref);
  const r = $('#boardHost').getBoundingClientRect();
  tip.innerHTML = `<b>${esc(fp.ref)}</b> · ${esc(fp.value)}<br><span style="color:var(--mute)">${esc(fp.footprint)}</span>` +
    (g ? `<br>#${g.idx} · ${S.placed.has(fp.ref) ? '✓ ' + t('placedMsg') : g.refs.length + ' ' + t('parts')}` : `<br><i>${t('notInBom')}</i>`);
  tip.style.display = 'block';
  const x = Math.min(e.clientX - r.left + 14, r.width - 270), y = Math.min(e.clientY - r.top + 14, r.height - 80);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}

function syncViews() {
  const g = S.byKey.get(S.sel);
  const refs = g ? g.refs : [];
  v2.selected = new Set(refs);
  v2.placed = S.placed;
  v2.draw();
  if (v3) v3.setState(refs, S.placed);
}

// ---------------------------------------------------------------- loading ----
// files are classified by content / extension:
//   .kicad_pcb → full board · BOM .csv/.xlsx → parts list · CPL .csv/.xlsx → positions · Gerber .zip / loose gerbers → board picture
const GERBER_EXT = /\.(gbr|ger|pho|art|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gm\d*|gko|gml|drl|xln|exc|nc|g\d+)$/i;

async function classify(f) {
  const n = f.name;
  if (/\.kicad_pcb$/i.test(n)) return { kind: 'pcb', name: n, text: await f.text() };
  if (/\.zip$/i.test(n)) {
    const { readGerberZip } = await import('./gerber.js?b=20261106f');
    return { kind: 'gerber', name: n, gerber: readGerberZip(await f.arrayBuffer()) };
  }
  if (/\.xlsx$/i.test(n)) {
    const { readXlsx } = await import('./xlsx.js?b=20261106f');
    const tbl = readTable(readXlsx(await f.arrayBuffer()));
    return { kind: tbl.kind, name: n, rows: tbl.rows };
  }
  if (GERBER_EXT.test(n)) return { kind: 'gerberFile', name: n, text: await f.text() };
  const text = await f.text();
  if (/^\s*\(kicad_pcb/.test(text)) return { kind: 'pcb', name: n, text };
  if (/^%|^G04|^M48/m.test(text.slice(0, 200))) return { kind: 'gerberFile', name: n, text };
  const tbl = readTableCsv(text);
  return { kind: tbl.kind, name: n, rows: tbl.rows };
}

// fabrication set collected across drops (BOM, CPL and Gerber can arrive one by one)
S.fab = { bom: null, cpl: null, gerber: null, names: {} };

async function loadFiles(files) {
  const items = [];
  for (const f of files) {
    try { items.push(await classify(f)); } catch (e) { toast(`${f.name}: ${e.message}`, true); }
  }
  const pcb = items.find((i) => i.kind === 'pcb');
  const bom = items.find((i) => i.kind === 'bom');
  const cpl = items.find((i) => i.kind === 'cpl');
  let gerber = items.find((i) => i.kind === 'gerber');
  const loose = items.filter((i) => i.kind === 'gerberFile');
  if (!gerber && loose.length) {
    const { readGerberFiles } = await import('./gerber.js?b=20261106f');
    gerber = { kind: 'gerber', name: `${loose.length} Gerber files`, gerber: readGerberFiles(loose) };
  }
  if (pcb) {
    let board;
    try { board = parseKicadPcb(pcb.text, pcb.name); } catch (e) { toast(`${pcb.name}: ${e.message}`, true); return; }
    S.fab = { bom: null, cpl: null, gerber: null, names: {} };
    const merged = bom ? mergeBomCsv(board, bom.rows) : 0;
    board.source = { pcb: pcb.name, bom: bom?.name };
    setBoard(board);
    toast(`${t('loaded')}: ${board.title}${merged ? ` · ${t('merged')} (${merged})` : ''}`);
    return;
  }
  if (!bom && !cpl && !gerber) return;
  // a BOM dropped onto a KiCad board only adds LCSC / MPN
  if (S.board && !S.board.fab && !S.board.csvOnly && bom && !cpl && !gerber) {
    const n = mergeBomCsv(S.board, bom.rows);
    setBoard(S.board, true);
    toast(`${t('merged')} · ${n} ${t('refsMerged')}`);
    return;
  }
  if (bom) { S.fab.bom = bom.rows; S.fab.names.bom = bom.name; }
  if (cpl) { S.fab.cpl = cpl.rows; S.fab.names.cpl = cpl.name; }
  if (gerber) { S.fab.gerber = gerber.gerber; S.fab.names.gerber = gerber.name; }
  const { boardFromFab } = await import('./gerber.js?b=20261106f');
  const title = (S.fab.names.bom || S.fab.names.cpl || S.fab.names.gerber || 'Board')
    .replace(/\.(csv|xlsx|zip|txt)$/i, '').replace(/^(BOM|CPL|Gerber)[_ -]?/i, '').replace(/[_ -]?(JLCPCB|BOM|CPL)$/i, '') || 'Board';
  const board = boardFromFab(S.fab.bom, S.fab.cpl, S.fab.gerber, title);
  board.source = { ...S.fab.names };
  setBoard(board, S.board?.fab && S.board.title === board.title);
  const have = ['bom', 'cpl', 'gerber'].filter((k) => S.fab[k]);
  toast(`${t('loaded')}: ${have.map((k) => k.toUpperCase()).join(' + ')}${have.length < 3 ? ' · ' + t('addMore') : ''}`);
}

async function fetchFile(url, name) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return new File([await r.blob()], name);
}

async function loadDemo(kind = 'kicad') {
  if (kind === 'jlc') {
    S.fab = { bom: null, cpl: null, gerber: null, names: {} };
    S.board = null;
    const files = await Promise.all([
      fetchFile('demo/jlcpcb/BOM_TESR_Pincer_V2_JLCPCB.csv', 'BOM_TESR_Pincer_V2_JLCPCB.csv'),
      fetchFile('demo/jlcpcb/CPL_TESR_Pincer_V2_JLCPCB.csv', 'CPL_TESR_Pincer_V2_JLCPCB.csv'),
      fetchFile('demo/jlcpcb/Gerber_TESR_Pincer_V2.zip', 'Gerber_TESR_Pincer_V2.zip'),
    ]);
    await loadFiles(files);
    if (S.board) { S.board.title = 'TESR Pincer V2.0 (JLCPCB files)'; setBoard(S.board, true); }
    return;
  }
  const [pcb, bom] = await Promise.all([
    fetch('demo/TESR_Pincer_V2.kicad_pcb').then((r) => r.text()),
    fetch('demo/BOM_TESR_Pincer_V2_JLCPCB.csv').then((r) => r.text()),
  ]);
  const board = parseKicadPcb(pcb, 'TESR_Pincer_V2.kicad_pcb');
  board.title = 'TESR Pincer V2.0';
  board.rev = board.rev || 'A';
  mergeBomCsv(board, readTableCsv(bom).rows);
  board.source = { pcb: 'TESR_Pincer_V2.kicad_pcb', bom: 'BOM_TESR_Pincer_V2_JLCPCB.csv' };
  S.fab = { bom: null, cpl: null, gerber: null, names: {} };
  setBoard(board);
  toast(`${t('loaded')}: TESR Pincer V2.0`);
}

function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

function setBoard(board, keepState = false) {
  S.board = board;
  S.bom = buildBom(board, { includeNonBom: opts.nonBom });
  S.byRef = new Map(); S.byKey = new Map();
  for (const g of S.bom) { S.byKey.set(g.key, g); for (const r of g.refs) S.byRef.set(r, g); }
  const sig = board.title + '|' + board.footprints.map((f) => f.ref + ':' + f.value).sort().join(',');
  S.storeKey = 'tesr-bomv:' + hashStr(sig);
  if (!keepState) {
    const st = safeJson(localStorageGet(S.storeKey)) || {};
    S.placed = new Set(st.placed || []);
    S.sourced = new Set(st.sourced || []);
    S.sel = null;
  }
  $('#boardTitle').textContent = board.title + (board.rev ? `  ·  Rev ${board.rev}` : '');
  const nParts = S.bom.reduce((a, g) => a + (g.dnp ? 0 : g.refs.length), 0);
  const w = board.bounds ? (board.bounds[2] - board.bounds[0]).toFixed(1) : '—', h = board.bounds ? (board.bounds[3] - board.bounds[1]).toFixed(1) : '—';
  const src = board.source ? Object.values(board.source).filter(Boolean).join(' + ') : board.fileName;
  $('#boardSub').textContent = `${src} · ${S.bom.length} ${t('lines')} · ${nParts} ${t('parts')}${board.bounds ? ` · ${w} × ${h} mm` : ''}` + (board.date ? ` · ${board.date}` : '');
  $('#emptyTable').classList.add('hide');
  v2.showRefs = opts.refs;
  v2.setTheme(opts.mask);
  v2.setBoard(board.outline ? board : null);
  $('#boardHint').classList.toggle('hide', !!board.outline);
  if (v3) board3d(board);
  renderLayerBar(); renderLayerPanel();
  renderTable();
  renderDetail();
  progress();
  syncViews();
}

function persist() {
  if (!S.storeKey) return;
  localStorageSet(S.storeKey, JSON.stringify({ placed: [...S.placed], sourced: [...S.sourced], t: Date.now() }));
}

// ------------------------------------------------------------------ table ----
const tbody = $('#bomTable tbody');

function rowState(g) {
  const n = g.refs.filter((r) => S.placed.has(r)).length;
  return { n, full: n === g.refs.length };
}

function renderTable() {
  const q = $('#filter').value.trim().toLowerCase();
  const side = $('#sideFilter').value;
  const html = [];
  for (const g of S.bom) {
    const st = rowState(g);
    if (S.hidePlaced && st.full && g.key !== S.sel) continue;
    if (side && !g.sides.includes(side)) continue;
    if (q) {
      const hay = [g.refs.join(' '), g.value, g.footprint, g.mpn, g.lcsc, g.manufacturer, g.digikey, g.mouser].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) continue;
    }
    const cls = [g.key === S.sel ? 'sel' : '', st.full ? 'done' : '', g.dnp ? 'dnp' : ''].join(' ');
    const lc = g.lcsc ? `<a href="https://www.lcsc.com/product-detail/${encodeURIComponent(g.lcsc)}.html" target="_blank" rel="noopener">${esc(g.lcsc)}</a>` : '';
    html.push(`<tr data-key="${esc(g.key)}" class="${cls}">
      <td class="c idx">${g.idx}</td>
      <td class="c"><input type="checkbox" class="cb src" ${S.sourced.has(g.key) ? 'checked' : ''} title="${t('sourced')}"></td>
      <td class="c"><label class="pl ${st.full ? 'full' : ''}"><input type="checkbox" class="cb plc" ${st.full ? 'checked' : ''}> ${st.n}/${g.refs.length}</label></td>
      <td class="refs">${esc(g.refs.join(', '))}${g.dnp ? ' <small>(DNP)</small>' : ''}</td>
      <td class="val">${esc(g.value)}<div class="fp-s" title="${esc(g.footprint)}">${esc(g.footprint)}</div></td>
      <td class="mpn" title="${esc(g.mpn)}">${esc(g.mpn)}</td>
      <td class="lcsc">${lc}</td>
      <td class="c">${g.refs.length}</td></tr>`);
  }
  tbody.innerHTML = html.join('');
}

tbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const g = S.byKey.get(tr.dataset.key); if (!g) return;
  if (e.target.classList.contains('src')) {
    if (e.target.checked) S.sourced.add(g.key); else S.sourced.delete(g.key);
    persist(); progress(); return;
  }
  if (e.target.classList.contains('plc')) {
    for (const r of g.refs) e.target.checked ? S.placed.add(r) : S.placed.delete(r);
    persist(); progress(); renderTable(); renderDetail(); syncViews(); return;
  }
  if (e.target.closest('a')) return;
  select(g.key, 'table');
});

function scrollRowIntoView() {
  const tr = tbody.querySelector('tr.sel');
  if (tr) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------------------------------------------------------------- select ----
function select(key, from) {
  S.sel = key;
  const g = S.byKey.get(key);
  if (g && from !== 'board') {
    // make sure the side holding the parts is visible
    if (S.side !== 'FB' && !g.sides.includes(S.side)) setSide(g.sides.includes('F') ? 'F' : 'B');
  }
  renderTable();
  renderDetail();
  syncViews();
  if (from !== 'table') scrollRowIntoView();
}

function pickPart(fp) {
  if (!fp) return;
  const g = S.byRef.get(fp.ref);
  if (!g) { toast(`${fp.ref} · ${fp.value} — ${t('notInBom')}`, true); return; }
  if (S.sel === g.key) { togglePlaced(fp.ref); return; }
  select(g.key, 'board');
}

function togglePlaced(ref) {
  if (S.placed.has(ref)) S.placed.delete(ref); else S.placed.add(ref);
  persist(); progress(); renderTable(); renderDetail(); syncViews();
  checkAllDone();
}

function checkAllDone() {
  const total = S.bom.reduce((a, g) => a + (g.dnp ? 0 : g.refs.length), 0);
  const done = S.bom.reduce((a, g) => a + (g.dnp ? 0 : g.refs.filter((r) => S.placed.has(r)).length), 0);
  if (total && done === total) toast(t('allDone'));
}

function renderDetail() {
  const g = S.byKey.get(S.sel);
  const body = $('#detail .detail-body'), empty = $('#detail .detail-empty');
  if (!g) { body.classList.add('hide'); empty.classList.remove('hide'); return; }
  body.classList.remove('hide'); empty.classList.add('hide');
  $('#dValue').textContent = `#${g.idx}  ${g.value}`;
  $('#dFp').textContent = g.footprint;
  $('#dRefs').innerHTML = g.fps.map((f) => `<span class="chip side-${f.side} ${S.placed.has(f.ref) ? 'done' : ''}" data-ref="${esc(f.ref)}" title="${t('clickToPlace')} · ${f.side === 'F' ? t('top') : t('bottom')}">${esc(f.ref)}</span>`).join('');
  const kv = [];
  const add = (k, v) => { if (v) kv.push(`<dt>${k}</dt><dd>${v}</dd>`); };
  add('MPN', esc(g.mpn));
  add('Mfr', esc(g.manufacturer));
  add('LCSC', g.lcsc ? `<a href="https://www.lcsc.com/product-detail/${encodeURIComponent(g.lcsc)}.html" target="_blank" rel="noopener">${esc(g.lcsc)} ↗</a>` : '');
  add('DigiKey', g.digikey ? `<a href="https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(g.digikey)}" target="_blank" rel="noopener">${esc(g.digikey)} ↗</a>` : '');
  add('Mouser', g.mouser ? `<a href="https://www.mouser.com/c/?q=${encodeURIComponent(g.mouser)}" target="_blank" rel="noopener">${esc(g.mouser)} ↗</a>` : '');
  add('Datasheet', /^https?:/i.test(g.datasheet) ? `<a href="${esc(g.datasheet)}" target="_blank" rel="noopener">PDF ↗</a>` : '');
  add(t('side'), g.sides.split('').map((s) => (s === 'F' ? t('top') : t('bottom'))).join(' + '));
  add(t('qty'), `${g.refs.filter((r) => S.placed.has(r)).length} / ${g.refs.length}`);
  add('Desc', esc(g.description));
  $('#dKv').innerHTML = kv.join('');
  const full = rowState(g).full;
  $('#btnPlaceAll').textContent = full ? t('unplaceAll') : t('placeAll');
}

$('#dRefs').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) togglePlaced(c.dataset.ref); });
$('#btnPlaceAll').addEventListener('click', () => {
  const g = S.byKey.get(S.sel); if (!g) return;
  const full = rowState(g).full;
  for (const r of g.refs) full ? S.placed.delete(r) : S.placed.add(r);
  if (!full) S.sourced.add(g.key);
  persist(); progress(); renderTable(); renderDetail(); syncViews();
  if (!full) checkAllDone();
});
$('#btnNext').addEventListener('click', () => step(1));

function visibleKeys() { return [...tbody.querySelectorAll('tr')].map((tr) => tr.dataset.key); }
function step(d) {
  const keys = visibleKeys(); if (!keys.length) return;
  let i = keys.indexOf(S.sel);
  i = i < 0 ? (d > 0 ? 0 : keys.length - 1) : Math.max(0, Math.min(keys.length - 1, i + d));
  select(keys[i], 'key');
}

function progress() {
  const parts = S.bom.filter((g) => !g.dnp);
  const total = parts.reduce((a, g) => a + g.refs.length, 0);
  const done = parts.reduce((a, g) => a + g.refs.filter((r) => S.placed.has(r)).length, 0);
  const src = parts.filter((g) => S.sourced.has(g.key)).length;
  $('#progPlaced').textContent = `${done} / ${total}`;
  $('#barPlaced').style.width = total ? (100 * done) / total + '%' : '0';
  $('#progSourced').textContent = `${src} / ${parts.length}`;
  $('#barSourced').style.width = parts.length ? (100 * src) / parts.length + '%' : '0';
}

// ---------------------------------------------------------------- scanning ---
const status = $('#scanStatus');
const log = $('#scanLog');

function handleCode(raw, via = 'scan') {
  const text = String(raw || '').trim();
  if (!text) return;
  if (!S.bom.length) { toast(t('noBoard'), true); return; }
  const label = parseLabel(text);
  const res = matchGroups(label, S.bom);
  const shown = text.replace(/[\x00-\x1f]/g, '·');
  if (!res.length) {
    if (opts.beep) beep(false);
    status.innerHTML = `<span class="miss">✗ ${t('notFound')}</span> — ${esc(label.source)}: ${esc(label.tokens[0] || shown).slice(0, 80)}`;
    addLog(false, `${t('notFound')}`, shown, null);
    toast(`${t('notFound')}: ${(label.lcsc || label.mpn || label.supplierPn || shown).slice(0, 40)}`, true);
    return;
  }
  const g = res[0].group;
  if (opts.beep) beep(true);
  if (opts.autoSource && via !== 'typed') S.sourced.add(g.key);
  persist(); progress();
  select(g.key, 'scan');
  const qtyWarn = label.qty != null && label.qty < g.refs.length ? ` · ⚠ ${t('qty')} ${label.qty} < ${g.refs.length}` : '';
  const alt = res.length > 1 ? ` · +${res.length - 1}: ` + res.slice(1, 4).map((r) => `<a href="#" data-key="${esc(r.group.key)}">#${r.group.idx} ${esc(r.group.value)}</a>`).join(', ') : '';
  status.innerHTML = `<span class="hit">✓ ${t('found')} #${g.idx}</span> ${esc(g.refs.join(', '))} · ${esc(g.value)} <small>(${esc(label.source)} → ${res[0].why})</small>${qtyWarn}${alt}`;
  addLog(true, `#${g.idx} ${g.value} → ${g.refs.join(', ')}`, shown, g.key);
  toast(`${t('found')}: ${g.refs.join(', ')} · ${g.value}${qtyWarn.replace(/<[^>]+>/g, '')}`);
}

status.addEventListener('click', (e) => { const a = e.target.closest('a[data-key]'); if (a) { e.preventDefault(); select(a.dataset.key, 'scan'); } });

function addLog(ok, title, raw, key) {
  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'bad';
  const time = new Date().toLocaleTimeString();
  li.innerHTML = `${ok ? '✓' : '✗'} ${esc(title)}<small>${esc(time)} · ${esc(raw.slice(0, 120))}</small>`;
  if (key) li.addEventListener('click', () => select(key, 'scan'));
  log.prepend(li);
  while (log.children.length > 40) log.lastChild.remove();
}

$('#codeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#codeInput').value;
  // typed by hand vs. USB scanner typing into the box: scanner input arrives very fast
  handleCode(v, kb.fast ? 'scan' : 'typed');
  $('#codeInput').select();
});

// camera
const scanner = new CameraScanner($('#video'), $('#overlay'), (text) => handleCode(text, 'scan'));
let camOn = false;
async function fillCameras() {
  const sel = $('#camSelect');
  const cams = await CameraScanner.listCameras();
  const cur = sel.value;
  sel.innerHTML = `<option value="">${t('defaultCam')}</option>` + cams.map((c, i) => `<option value="${esc(c.deviceId)}">${esc(c.label || 'Camera ' + (i + 1))}</option>`).join('');
  sel.value = cur;
}
$('#btnCam').addEventListener('click', async () => {
  if (camOn) {
    await scanner.stop(); camOn = false;
    $('#btnCam').textContent = t('startCam'); $('#videoIdle').classList.remove('hide');
    return;
  }
  try {
    await scanner.start($('#camSelect').value || undefined);
    camOn = true;
    $('#btnCam').textContent = t('stopCam'); $('#videoIdle').classList.add('hide');
    fillCameras();
  } catch (e) {
    status.innerHTML = `<span class="miss">${t('camErr')}</span>: ${esc(e.message || e.name)}`;
  }
});
$('#camSelect').addEventListener('change', async () => { if (camOn) { try { await scanner.start($('#camSelect').value || undefined); } catch (e) { status.textContent = e.message; } } });
$('#photoInput').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const res = await decodeFile(f);
    if (!res.length) { status.innerHTML = `<span class="miss">${t('noCode')}</span>`; if (opts.beep) beep(false); }
    for (const r of res) handleCode(r.text, 'scan');
  } catch (err) { status.textContent = err.message; }
  e.target.value = '';
});

// keyboard: shortcuts + USB keyboard-wedge barcode scanners
const kb = { buf: '', last: 0, lastBuf: 0, fast: false, gaps: [] };
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const inField = tag === 'input' || tag === 'select' || tag === 'textarea';
  const now = performance.now();
  // measure typing speed (scanner ≈ <30 ms per char)
  if (e.key.length === 1 || e.key === 'Enter') {
    const gap = now - kb.last; kb.last = now;
    if (gap > 120) kb.gaps = [];
    else kb.gaps.push(gap);
    kb.fast = kb.gaps.length >= 4 && kb.gaps.reduce((a, b) => a + b, 0) / kb.gaps.length < 35;
  }
  if (inField) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.key === 'Enter' && kb.buf.length >= 3 && kb.fast) { handleCode(kb.buf, 'scan'); kb.buf = ''; e.preventDefault(); return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (now - kb.lastBuf > 120) kb.buf = '';
    kb.lastBuf = now;
    kb.buf += e.key;
  }
  if (e.ctrlKey && e.key === ']') { kb.buf += '\x1d'; return; } // GS from some scanners
  if (kb.fast) return; // looks like a scanner burst — don't trigger shortcuts
  if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  else if (e.key === ' ') {
    const g = S.byKey.get(S.sel);
    if (g) { e.preventDefault(); const r = g.refs.find((x) => !S.placed.has(x)); if (r) { togglePlaced(r); toast(`${t('placedMsg')}: ${r}`); } }
  } else if (e.key === '/') { e.preventDefault(); $('#codeInput').focus(); $('#codeInput').select(); }
  else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    // Altium Designer keys
    if (e.key === 'S' && e.shiftKey) { e.preventDefault(); setSingle(SINGLE_NEXT[LP.single]); }
    else if (e.key === 'l' || e.key === 'L') toggleLayerPanel();
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); stepLayer(1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); stepLayer(-1); }
    else if (e.key === '*') { e.preventDefault(); setCurrentLayer(LP.active === 'F.Cu' ? 'B.Cu' : 'F.Cu'); }
    else if (e.key === 'q' || e.key === 'Q') toggleUnits();
    else if (e.key === '2' || e.key === '3') $(`#segMode button[data-mode="${e.key}d"]`).click(); // Altium: 2 = 2D, 3 = 3D
  }
  else if (e.key === 'Escape') { S.sel = null; renderTable(); renderDetail(); syncViews(); }
});

// --------------------------------------------------------------- controls ----
function setSide(s) {
  S.side = s;
  for (const b of document.querySelectorAll('#segSide button')) b.classList.toggle('on', b.dataset.side === s);
  v2.setSide(s);
  if (v3 && S.mode === '3d') v3.view(s === 'B' ? 'bottom' : s === 'F' ? 'iso' : 'front');
}
$('#segSide').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSide(b.dataset.side); });
$('#segMode').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  S.mode = b.dataset.mode;
  for (const x of document.querySelectorAll('#segMode button')) x.classList.toggle('on', x === b);
  const is3 = S.mode === '3d';
  $('#cv2d').classList.toggle('hide', is3);
  $('#host3d').classList.toggle('hide', !is3);
  $('#seg3d').classList.toggle('hide', !is3);
  $('#segSide').classList.toggle('hide', is3);
  $('#err3d').classList.add('hide');
  if (is3) {
    if (LP.style !== 'real') setStyle('real'); // 3D = the real board
    try { const v = await ensure3d(); v.visible = true; v.resize(); } catch (err) { err3d(err); }
  } else if (v3) v3.visible = false;
  renderLayerPanel();
});
$('#seg3d').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && v3) v3.view(b.dataset.v); });
$('#btnFit').addEventListener('click', () => { if (S.mode === '3d' && v3) v3.view('iso'); else v2.fit(); });
$('#filter').addEventListener('input', renderTable);
$('#sideFilter').addEventListener('change', renderTable);
$('#btnHidePlaced').addEventListener('click', (e) => {
  S.hidePlaced = !S.hidePlaced;
  e.currentTarget.classList.toggle('on', S.hidePlaced);
  e.currentTarget.textContent = S.hidePlaced ? t('showAll') : t('hidePlaced');
  renderTable();
});
$('#btnDemo').addEventListener('click', () => loadDemo().catch((err) => toast(err.message, true)));

// settings
const drawer = $('#drawer');
$('#btnMenu').addEventListener('click', () => drawer.classList.remove('hide'));
$('#btnCloseDrawer').addEventListener('click', () => drawer.classList.add('hide'));
drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.classList.add('hide'); });
$('#optLang').value = opts.lang;
$('#optBarPos').value = opts.barPos;
$('#optPalette').value = opts.palette;
$('#optBarPos').addEventListener('change', (e) => { opts.barPos = e.target.value; saveOpts(); renderLayerBar(); });
$('#optPalette').addEventListener('change', (e) => { opts.palette = e.target.value; setPalette(opts.palette); saveOpts(); applyLayers({ only2d: true }); });
$('#optMask').value = opts.mask;
$('#optAutoSource').checked = opts.autoSource;
$('#optBeep').checked = opts.beep;
$('#optRefs').checked = opts.refs;
$('#optNonBom').checked = opts.nonBom;
$('#optLang').addEventListener('change', (e) => { opts.lang = e.target.value; saveOpts(); applyLang(); });
$('#optMask').addEventListener('change', (e) => { opts.mask = e.target.value; saveOpts(); v2.setTheme(opts.mask); if (v3) { try { v3.setTheme(opts.mask); } catch (err) { err3d(err); } } });
$('#optAutoSource').addEventListener('change', (e) => { opts.autoSource = e.target.checked; saveOpts(); });
$('#optBeep').addEventListener('change', (e) => { opts.beep = e.target.checked; saveOpts(); });
$('#optRefs').addEventListener('change', (e) => { opts.refs = e.target.checked; LP.vis.refs = opts.refs; v2.showRefs = opts.refs; applyLayers({ only2d: true }); });
$('#optNonBom').addEventListener('change', (e) => { opts.nonBom = e.target.checked; saveOpts(); if (S.board) setBoard(S.board, true); });
$('#btnReset').addEventListener('click', () => {
  if (!S.board || !confirm(t('resetQ'))) return;
  S.placed.clear(); S.sourced.clear(); persist(); progress(); renderTable(); renderDetail(); syncViews();
});
$('#btnExport').addEventListener('click', () => {
  if (!S.bom.length) return;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['#', 'References', 'Value', 'Footprint', 'MPN', 'Manufacturer', 'LCSC', 'Qty', 'Sourced', 'Placed', 'Placed refs'].map(q).join(',')];
  for (const g of S.bom) {
    const pr = g.refs.filter((r) => S.placed.has(r));
    lines.push([g.idx, g.refs.join(','), g.value, g.footprint, g.mpn, g.manufacturer, g.lcsc, g.refs.length, S.sourced.has(g.key) ? 'Y' : '', `${pr.length}/${g.refs.length}`, pr.join(',')].map(q).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(S.board.title || 'board').replace(/[^\w.-]+/g, '_')}_assembly_checklist.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// drag & drop anywhere
const dz = $('#dropzone');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files') && $('#openModal').classList.contains('hide')) { dragDepth++; dz.classList.remove('hide'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dz.classList.add('hide'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; dz.classList.add('hide'); if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]); });


// ------------------------------------------------------- open-files guide ----
const openModal = $('#openModal');
const slots = { pcb: null, bomA: null, bom: null, cpl: null, gerber: null };

function renderSlots() {
  for (const el of openModal.querySelectorAll('.slot')) {
    const k = el.dataset.slot, v = slots[k];
    const em = el.querySelector('.slot-file');
    el.classList.toggle('filled', !!(v && (!Array.isArray(v) || v.length)));
    em.textContent = v ? (Array.isArray(v) ? (v.length === 1 ? v[0].name : `${v.length} files`) : v.name) : t('notChosen');
  }
}
function openFiles() { renderSlots(); openModal.classList.remove('hide'); }
for (const el of openModal.querySelectorAll('.slot')) {
  const inp = el.querySelector('input');
  inp.addEventListener('change', () => {
    if (!inp.files.length) return;
    slots[el.dataset.slot] = el.dataset.slot === 'gerber' ? [...inp.files] : inp.files[0];
    if (el.dataset.slot === 'pcb' || el.dataset.slot === 'bomA') { slots.bom = slots.cpl = slots.gerber = null; }
    else { slots.pcb = slots.bomA = null; }
    inp.value = '';
    renderSlots();
  });
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('over');
    const fs = [...e.dataTransfer.files]; if (!fs.length) return;
    slots[el.dataset.slot] = el.dataset.slot === 'gerber' ? fs : fs[0];
    renderSlots();
  });
}
// drop several files on the dialog → sort them into slots
async function sortIntoSlots(files) {
  const rest = [];
  for (const f of files) {
    if (/\.kicad_pcb$/i.test(f.name)) { slots.pcb = f; continue; }
    if (/\.zip$/i.test(f.name) || GERBER_EXT.test(f.name)) { slots.gerber = [...(slots.gerber || []), f]; continue; }
    rest.push(f);
  }
  for (const f of rest) {
    try {
      const c = await classify(f);
      if (c.kind === 'cpl') slots.cpl = f;
      else if (slots.pcb) slots.bomA = f;
      else slots.bom = f;
    } catch { /* not a table */ }
  }
  if (slots.pcb) { slots.bom = slots.cpl = null; slots.gerber = null; }
  renderSlots();
}
openModal.addEventListener('dragover', (e) => e.preventDefault());
openModal.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); dragDepth = 0; dz.classList.add('hide'); sortIntoSlots([...e.dataTransfer.files]); });
$('#btnLoadSlots').addEventListener('click', async () => {
  let files = [];
  if (slots.pcb) files = [slots.pcb, slots.bomA].filter(Boolean);
  else {
    files = [slots.bom, slots.cpl, ...(slots.gerber || [])].filter(Boolean);
    S.fab = { bom: null, cpl: null, gerber: null, names: {} };
    if (files.length) S.board = null;
  }
  if (!files.length) { toast(t('pickFirst'), true); return; }
  openModal.classList.add('hide');
  await loadFiles(files);
  for (const k of Object.keys(slots)) slots[k] = null;
});
for (const b of openModal.querySelectorAll('[data-demo]')) b.addEventListener('click', () => { openModal.classList.add('hide'); loadDemo(b.dataset.demo).catch((err) => toast(err.message, true)); });
$('#btnOpen').addEventListener('click', openFiles);
$('#btnOpen2').addEventListener('click', openFiles);
$('#btnDemo2').addEventListener('click', () => loadDemo().catch((err) => toast(err.message, true)));

// ------------------------------------------------------- version / news ----
const newsModal = $('#newsModal');
const SEEN_KEY = 'tesr-bomv-seen';
function renderNews() {
  $('#newsTitle').textContent = `TESR BOM Viewer v${VERSION}`;
  $('#newsBody').innerHTML = CHANGELOG.map((c) => `<div class="news-item"><div class="news-v"><b>v${c.v}</b><span>${c.date}</span></div><ul>${(c[opts.lang] || c.en).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
}
function openNews() { renderNews(); newsModal.classList.remove('hide'); localStorageSet(SEEN_KEY, VERSION); $('#verBadge').classList.remove('new'); }
$('#verBadge').textContent = `v${VERSION}`;
$('#verBadge').title = `TESR BOM Viewer v${VERSION} · ${BUILD_DATE}`;
$('#footVer').textContent = `TESR BOM Viewer v${VERSION}`;
if (localStorageGet(SEEN_KEY) !== VERSION) $('#verBadge').classList.add('new');
$('#verBadge').addEventListener('click', openNews);
$('#footVer').addEventListener('click', (e) => { e.preventDefault(); openNews(); });
document.title = `TESR BOM Viewer v${VERSION}`;

for (const m of [openModal, newsModal]) {
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.add('hide'); });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { openModal.classList.add('hide'); newsModal.classList.add('hide'); closeMenu(); } });

// toast
let toastTimer = null;
function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function applyLang() {
  setLang(opts.lang);
  $('#btnCam').textContent = camOn ? t('stopCam') : t('startCam');
  $('#btnHidePlaced').textContent = S.hidePlaced ? t('showAll') : t('hidePlaced');
  renderSlots();
  if (!newsModal.classList.contains('hide')) renderNews();
  renderLayerBar(); renderLayerPanel();
  if (S.board) setBoard(S.board, true);
}

// ------------------------------------------------------------------- boot ----
applyLayers({ only2d: true });
panelInset();
applyLang();
const params = new URLSearchParams(location.search);
if (params.has('demo')) loadDemo(params.get('demo') === 'jlc' ? 'jlc' : 'kicad').catch((err) => toast(err.message, true));
window.TESRBOM = { S, LP, applyLayers, toggleLayerPanel, handleCode, loadDemo, loadFiles, select, setSide, refCompare, VERSION }; // for testing / console use
