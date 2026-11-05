// TESR BOM Viewer — main application
// Made by TESR — Thai Embedded System and Robotics · https://www.tesrshop.com
import { parseKicadPcb, buildBom, readTableCsv, readTable, mergeBomCsv, refCompare } from './kicad.js';
import { VERSION, BUILD_DATE, CHANGELOG } from './version.js';
import { parseLabel, matchGroups, CameraScanner, decodeFile, beep } from './scan.js';
import { Board2D } from './view2d.js';
import { t, setLang } from './i18n.js';

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
const v2 = new Board2D($('#cv2d'), { onPick: (fp) => pickPart(fp), onHover: (fp, e) => hover(fp, e) });
let v3 = null;
async function ensure3d() {
  if (v3) return v3;
  const { Board3D } = await import('./view3d.js');
  v3 = new Board3D($('#host3d'), { onPick: (fp) => pickPart(fp), onHover: (fp, e) => hover(fp, e) });
  v3.setTheme(opts.mask);
  if (S.board) v3.setBoard(S.board);
  syncViews();
  return v3;
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
    const { readGerberZip } = await import('./gerber.js');
    return { kind: 'gerber', name: n, gerber: readGerberZip(await f.arrayBuffer()) };
  }
  if (/\.xlsx$/i.test(n)) {
    const { readXlsx } = await import('./xlsx.js');
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
    const { readGerberFiles } = await import('./gerber.js');
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
  const { boardFromFab } = await import('./gerber.js');
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
  if (v3) v3.setBoard(board);
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
  if (is3) { const v = await ensure3d(); v.visible = true; v.resize(); } else if (v3) v3.visible = false;
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
$('#optMask').value = opts.mask;
$('#optAutoSource').checked = opts.autoSource;
$('#optBeep').checked = opts.beep;
$('#optRefs').checked = opts.refs;
$('#optNonBom').checked = opts.nonBom;
$('#optLang').addEventListener('change', (e) => { opts.lang = e.target.value; saveOpts(); applyLang(); });
$('#optMask').addEventListener('change', (e) => { opts.mask = e.target.value; saveOpts(); v2.setTheme(opts.mask); v3?.setTheme(opts.mask); });
$('#optAutoSource').addEventListener('change', (e) => { opts.autoSource = e.target.checked; saveOpts(); });
$('#optBeep').addEventListener('change', (e) => { opts.beep = e.target.checked; saveOpts(); });
$('#optRefs').addEventListener('change', (e) => { opts.refs = e.target.checked; saveOpts(); v2.showRefs = opts.refs; v2.draw(); });
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { openModal.classList.add('hide'); newsModal.classList.add('hide'); } });

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
  if (S.board) setBoard(S.board, true);
}

// ------------------------------------------------------------------- boot ----
applyLang();
const params = new URLSearchParams(location.search);
if (params.has('demo')) loadDemo(params.get('demo') === 'jlc' ? 'jlc' : 'kicad').catch((err) => toast(err.message, true));
window.TESRBOM = { S, handleCode, loadDemo, loadFiles, select, setSide, refCompare, VERSION }; // for testing / console use
