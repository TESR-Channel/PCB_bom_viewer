// TESR BOM Viewer — shared board painter (2D canvas view + 3D board textures)
// Draws one side of the board: solder mask, copper (tracks / zones / vias seen through the mask), silkscreen and texts.
// Made by TESR — Thai Embedded System and Robotics

export const THEMES = {
  black: { mask: '#141416', cu: '#26262b', cuEdge: '#2e2e34', edge: '#3a3a40', pad: '#C9A84C', padTh: '#d8c07a', silk: '#ecebe6', body: 'rgba(255,255,255,0.05)' },
  green: { mask: '#14512e', cu: '#1e6a3c', cuEdge: '#237844', edge: '#2d6b45', pad: '#d9c27a', padTh: '#e5d29a', silk: '#f4f4f0', body: 'rgba(255,255,255,0.06)' },
  white: { mask: '#efece4', cu: '#e2ddd0', cuEdge: '#d9d3c4', edge: '#c8c2b4', pad: '#b9a25e', padTh: '#c9b27a', silk: '#1a1a1d', body: 'rgba(0,0,0,0.05)' },
};

/**
 * @param ctx      CanvasRenderingContext2D
 * @param board    board model
 * @param side     'F' | 'B'
 * @param T        (x, y) → [X, Y] board mm → canvas px
 * @param s        px per mm
 * @param theme    key of THEMES
 * @param o        { mirrorView: bool (canvas is mirrored, e.g. bottom seen from below), mask: bool, copper: bool, silk: bool }
 */
export function paintSide(ctx, board, side, T, s, theme = 'black', o = {}) {
  const C = THEMES[theme] || THEMES.black;
  const opt = { mask: true, copper: true, silk: true, mirrorView: false, ...o };
  const path = (pts, close) => { pts.forEach(([x, y], i) => { const [X, Y] = T(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); if (close) ctx.closePath(); };

  if (opt.mask && board.outline) {
    ctx.beginPath();
    path(board.outline, true);
    for (const h of board.holes || []) path(h, true);
    ctx.fillStyle = C.mask;
    ctx.fill('evenodd');
    ctx.lineWidth = Math.max(1, 0.25 * s); ctx.strokeStyle = C.edge; ctx.stroke();
  }

  if (opt.copper && board.copper?.[side]) {
    const cu = board.copper[side];
    ctx.save();
    if (board.outline) { ctx.beginPath(); path(board.outline, true); ctx.clip(); }
    ctx.fillStyle = C.cu;
    for (const z of cu.zones) { ctx.beginPath(); path(z, true); ctx.fill(); }
    ctx.strokeStyle = C.cuEdge; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const t of cu.tracks) {
      ctx.lineWidth = Math.max(0.5, t.w * s);
      ctx.beginPath(); path(t.pts, false); ctx.stroke();
    }
    for (const v of board.vias || []) {
      const [X, Y] = T(v.x, v.y);
      ctx.fillStyle = C.cuEdge; ctx.beginPath(); ctx.arc(X, Y, (v.d / 2) * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(X, Y, (v.drill / 2) * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  if (opt.silk) {
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
    for (const t of board.texts?.[side] || []) drawText(ctx, t, T, s, opt.mirrorView);
    ctx.restore();
  }
}

function drawText(ctx, t, T, s, mirrorView) {
  let ang = ((t.angle % 360) + 360) % 360;
  if (ang > 90 && ang <= 270) ang -= 180; // keep text upright (KiCad default)
  const [X, Y] = T(t.x, t.y);
  ctx.save();
  ctx.translate(X, Y);
  if (mirrorView) ctx.scale(-1, 1);
  ctx.rotate((-ang * Math.PI) / 180);
  if (t.mirror) ctx.scale(-1, 1);
  const px = Math.max(1, t.h * s * 1.32);
  ctx.font = `600 ${px}px "Chakra Petch", "IBM Plex Sans Thai", sans-serif`;
  ctx.textAlign = t.hj === 'left' ? 'left' : t.hj === 'right' ? 'right' : 'center';
  ctx.textBaseline = t.vj === 'top' ? 'top' : t.vj === 'bottom' ? 'bottom' : 'middle';
  // KiCad characters are narrower / wider depending on size w/h
  const sx = (t.w || t.h) / t.h * 0.92;
  ctx.scale(sx, 1);
  ctx.fillText(t.text, 0, 0);
  ctx.restore();
}
