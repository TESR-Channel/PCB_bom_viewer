// TESR BOM Viewer — shared board painter (2D canvas view + 3D board textures)
//  • paintSide     realistic look of one side: solder mask / bare FR-4, copper seen through the mask, silkscreen, texts
//  • paintOverlays technical layers drawn over the realistic look (paste, fab, courtyard, user layers …)
//  • paintCad      CAD / Gerber-viewer look: every visible layer in its own colour, stacked far → near
// All functions honour the layer + object visibility map `vis` (see layers.js).
// Made by TESR — Thai Embedded System and Robotics
import { layerDef, stackOrder, kindVisible, gfxCount } from './layers.js?b=20261106c';

export const THEMES = {
  black: { mask: '#141416', cu: '#26262b', cuEdge: '#2e2e34', edge: '#3a3a40', pad: '#C9A84C', padTh: '#d8c07a', silk: '#ecebe6', body: 'rgba(255,255,255,0.05)', fr4: '#6b5a36', bare: '#c27a3e' },
  green: { mask: '#14512e', cu: '#1e6a3c', cuEdge: '#237844', edge: '#2d6b45', pad: '#d9c27a', padTh: '#e5d29a', silk: '#f4f4f0', body: 'rgba(255,255,255,0.06)', fr4: '#7a6a42', bare: '#c98142' },
  white: { mask: '#efece4', cu: '#e2ddd0', cuEdge: '#d9d3c4', edge: '#c8c2b4', pad: '#b9a25e', padTh: '#c9b27a', silk: '#1a1a1d', body: 'rgba(0,0,0,0.05)', fr4: '#8a7a50', bare: '#c98142' },
};

const on = (vis, id) => !vis || vis[id] !== false;

/**
 * Realistic side.
 * @param T  (x, y) → [X, Y] board mm → canvas px      @param s px per mm
 * @param o  { mirrorView, vis, mask, copper, silk } — mask / copper / silk force a part off (legacy)
 */
export function paintSide(ctx, board, side, T, s, theme = 'black', o = {}) {
  const C = THEMES[theme] || THEMES.black;
  const vis = o.vis;
  const maskOn = o.mask !== false && on(vis, `${side}.Mask`);
  const cuOn = o.copper !== false && on(vis, `${side}.Cu`);
  const silkOn = o.silk !== false && on(vis, `${side}.SilkS`);
  const path = (pts, close) => { pts.forEach(([x, y], i) => { const [X, Y] = T(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); if (close) ctx.closePath(); };

  if (board.outline && o.base !== false) {
    ctx.beginPath();
    path(board.outline, true);
    for (const h of board.holes || []) path(h, true);
    ctx.fillStyle = maskOn ? C.mask : C.fr4;
    ctx.fill('evenodd');
    ctx.lineWidth = Math.max(1, 0.25 * s); ctx.strokeStyle = maskOn ? C.edge : '#a08a55'; ctx.stroke();
  }

  if (cuOn && board.copper?.[side]) {
    const cu = board.copper[side];
    const fill = maskOn ? C.cu : C.bare, line = maskOn ? C.cuEdge : C.bare;
    ctx.save();
    if (board.outline) { ctx.beginPath(); path(board.outline, true); ctx.clip(); }
    if (on(vis, 'zones')) { ctx.fillStyle = fill; for (const z of cu.zones) { ctx.beginPath(); path(z, true); ctx.fill(); } }
    if (on(vis, 'tracks')) {
      ctx.strokeStyle = line; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const t of cu.tracks) { ctx.lineWidth = Math.max(0.5, t.w * s); ctx.beginPath(); path(t.pts, false); ctx.stroke(); }
    }
    if (on(vis, 'vias')) {
      for (const v of board.vias || []) {
        const [X, Y] = T(v.x, v.y);
        ctx.fillStyle = maskOn ? C.cuEdge : '#d9b35a'; ctx.beginPath(); ctx.arc(X, Y, (v.d / 2) * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(X, Y, (v.drill / 2) * s, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  if (silkOn) {
    ctx.save();
    ctx.strokeStyle = C.silk; ctx.fillStyle = C.silk;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const g of board.silk?.[side] || []) {
      if (!g.pts?.length) continue;
      ctx.beginPath();
      path(g.pts, g.fill);
      if (g.fill) ctx.fill();
      else { ctx.lineWidth = Math.max(0.6, (g.w || 0.15) * s); ctx.stroke(); }
    }
    if (on(vis, 'texts')) for (const t of board.texts?.[side] || []) drawText(ctx, t, T, s, o.mirrorView);
    ctx.restore();
  }
}

/** Technical / mechanical layers of one side drawn over the realistic look (in their CAD colours). */
export function paintOverlays(ctx, board, side, T, s, vis, mirrorView = false) {
  if (!board.gfx || !vis) return;
  for (const id of stackOrder(board, side)) {
    const d = layerDef(id);
    if (d.real !== 'over' || (d.side && d.side !== side) || !on(vis, id)) continue;
    const g = board.gfx[id];
    if (!gfxCount(g)) continue;
    ctx.save();
    ctx.globalAlpha = /Paste|Adhes/.test(id) ? 0.7 : 0.95;
    drawGfx(ctx, g, T, s, d.color, vis, mirrorView, { outlineFills: /Fab|CrtYd/.test(id) });
    ctx.restore();
  }
}

/**
 * CAD look: each visible layer is rendered alone (so clear-polarity / overlaps stay correct) and composited.
 * @param o { vis, mirrorView, opacity, active, contrast, panelSide: 'F' | 'B' | null (two-panel view), scratch: canvas }
 */
export function paintCad(ctx, board, view, T, s, o = {}) {
  const vis = o.vis || {};
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const tmp = o.scratch || document.createElement('canvas');
  if (tmp.width !== W || tmp.height !== H) { tmp.width = W; tmp.height = H; }
  const tc = tmp.getContext('2d');
  const path = (c, pts, close) => { pts.forEach(([x, y], i) => { const [X, Y] = T(x, y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); if (close) c.closePath(); };

  // dark board silhouette for orientation
  if (board.outline) {
    ctx.beginPath(); path(ctx, board.outline, true);
    for (const h of board.holes || []) path(ctx, h, true);
    ctx.fillStyle = '#0f0f12'; ctx.fill('evenodd');
  }
  let order = stackOrder(board, view).filter((id) => {
    if (!on(vis, id)) return false;
    const d = layerDef(id);
    if (o.panelSide && (d.side === 'F' || d.side === 'B') && d.side !== o.panelSide) return false;
    return true;
  });
  const act = o.contrast && o.active && order.includes(o.active) ? o.active : null;
  if (act) order = [...order.filter((k) => k !== act), act];
  const opacity = o.opacity ?? 0.85;
  for (const id of order) {
    const d = layerDef(id);
    let g = board.gfx?.[id];
    if (id === 'Edge.Cuts' && !gfxCount(g) && board.outline) g = { s: [board.outline, ...(board.holes || [])].map((pts) => ({ pts, w: 0.15, k: 'gfx' })), f: [], p: [], t: [] };
    if (!gfxCount(g)) continue;
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.clearRect(0, 0, W, H);
    drawGfx(tc, g, T, s, d.color, vis, o.mirrorView, { drill: id === 'Drill', minW: id === 'Edge.Cuts' ? 1.4 : 0.8 });
    ctx.save();
    ctx.globalAlpha = act ? (id === act ? 1 : 0.16) : d.real === 'mask' ? Math.min(opacity, 0.6) : opacity;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }
}

/** Draw one layer's primitives in a single colour. Clear-polarity items are erased afterwards. */
export function drawGfx(c, g, T, s, color, vis, mirrorView, opt = {}) {
  const minW = opt.minW ?? 0.8;
  const path = (pts, close) => { pts.forEach(([x, y], i) => { const [X, Y] = T(x, y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); if (close) c.closePath(); };
  const pass = (clear) => {
    c.globalCompositeOperation = clear ? 'destination-out' : 'source-over';
    c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const f of g.f) {
      if (!!f.c !== clear || !kindVisible(vis, f.k)) continue;
      c.beginPath(); path(f.pts, true);
      if (opt.outlineFills) { c.lineWidth = Math.max(minW, 0.1 * s); c.stroke(); } else c.fill();
    }
    // strokes grouped by width → one path per width
    const byW = new Map();
    for (const st of g.s) {
      if (!!st.c !== clear || !kindVisible(vis, st.k)) continue;
      const w = Math.max(minW, st.w * s);
      const k = Math.round(w * 4) / 4;
      if (!byW.has(k)) byW.set(k, []);
      byW.get(k).push(st);
    }
    for (const [w, list] of byW) {
      c.lineWidth = w; c.beginPath();
      for (const st of list) path(st.pts, false);
      c.stroke();
    }
    for (const p of g.p) {
      if (!!p.c !== clear || !kindVisible(vis, p.k)) continue;
      if (opt.drill) {
        flashPath(c, T, s, p, mirrorView);
        c.fillStyle = '#060607'; c.fill();
        c.lineWidth = Math.max(1, 0.06 * s); c.strokeStyle = p.k === 'npth' ? '#8fd3ff' : p.k === 'via' ? '#bdbdbd' : color; c.stroke();
        c.fillStyle = color; c.strokeStyle = color;
      } else { flashPath(c, T, s, p, mirrorView); c.fill(); }
    }
    if (!clear && on(vis, 'texts')) for (const t of g.t) drawText(c, t, T, s, mirrorView);
  };
  pass(false);
  if (g.s.some((x) => x.c) || g.f.some((x) => x.c) || g.p.some((x) => x.c)) pass(true);
  c.globalCompositeOperation = 'source-over';
}

/** Pad-like flash outline (circle / oval / rect / roundrect / trapezoid) as the current path. */
export function flashPath(c, T, s, p, mirrorView) {
  const [X, Y] = T(p.x, p.y);
  const a = (((mirrorView ? 1 : -1) * (p.rot || 0)) * Math.PI) / 180;
  const w = p.w * s, h = p.h * s;
  c.beginPath();
  if (p.shape === 'circle') { c.arc(X, Y, w / 2, 0, Math.PI * 2); return; }
  c.save(); c.translate(X, Y); c.rotate(a);
  if (p.shape === 'oval') roundRect(c, -w / 2, -h / 2, w, h, Math.min(w, h) / 2);
  else if (p.shape === 'roundrect') roundRect(c, -w / 2, -h / 2, w, h, Math.min(w, h) * (p.rr ?? 0.25));
  else c.rect(-w / 2, -h / 2, w, h);
  c.restore();
}

export function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawText(ctx, t, T, s, mirrorView) {
  let ang = ((t.angle % 360) + 360) % 360;
  if (ang > 90 && ang <= 270) ang -= 180; // keep text upright (KiCad default)
  const [X, Y] = T(t.x, t.y);
  const px = Math.max(1, t.h * s * 1.32);
  if (px < 1.5) return;
  ctx.save();
  ctx.translate(X, Y);
  if (mirrorView) ctx.scale(-1, 1);
  ctx.rotate((-ang * Math.PI) / 180);
  if (t.mirror) ctx.scale(-1, 1);
  ctx.font = `600 ${px}px "Chakra Petch", "IBM Plex Sans Thai", sans-serif`;
  ctx.textAlign = t.hj === 'left' ? 'left' : t.hj === 'right' ? 'right' : 'center';
  ctx.textBaseline = t.vj === 'top' ? 'top' : t.vj === 'bottom' ? 'bottom' : 'middle';
  // KiCad characters are narrower / wider depending on size w/h
  const sx = (t.w || t.h) / t.h * 0.92;
  ctx.scale(sx, 1);
  ctx.fillText(t.text, 0, 0);
  ctx.restore();
}
