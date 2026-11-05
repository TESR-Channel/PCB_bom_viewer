// TESR BOM Viewer — 2D board view (canvas): pads, silkscreen, bodies, highlight, pan / zoom / pick
// Made by TESR — Thai Embedded System and Robotics
import { pointInPoly } from './kicad.js';

const MASKS = {
  black: { mask: '#141416', edge: '#3a3a40', pad: '#C9A84C', padTh: '#d8c07a', silk: '#e9e6df', body: 'rgba(255,255,255,0.05)' },
  green: { mask: '#15452b', edge: '#2d6b45', pad: '#d9c27a', padTh: '#e5d29a', silk: '#f2f2f2', body: 'rgba(255,255,255,0.06)' },
  white: { mask: '#efece4', edge: '#c8c2b4', pad: '#b9a25e', padTh: '#c9b27a', silk: '#1a1a1d', body: 'rgba(0,0,0,0.05)' },
};

export class Board2D {
  constructor(canvas, { onPick, onHover } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPick = onPick;
    this.onHover = onHover;
    this.board = null;
    this.side = 'F';          // 'F' | 'B' | 'FB'
    this.selected = new Set(); // refs
    this.placed = new Set();
    this.hover = null;
    this.showRefs = true;
    this.theme = 'black';
    this.view = { s: 1, ox: 0, oy: 0 };
    this.pulse = 0;
    this._bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    const tick = () => { this.pulse = (performance.now() / 600) % (Math.PI * 2); if (this.selected.size) this.draw(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  setBoard(board) { this.board = board; this.fit(); }
  setSide(s) { this.side = s; this.fit(); }
  setTheme(t) { this.theme = t; this.draw(); }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.max(10, r.width * dpr);
    this.cv.height = Math.max(10, r.height * dpr);
    this.cv.style.width = r.width + 'px';
    this.cv.style.height = r.height + 'px';
    this.dpr = dpr;
    this.fit();
  }

  /** panels to draw: [{side, dx}] — both sides are placed next to each other in 'FB' */
  panels() {
    if (!this.board?.bounds) return [];
    const [x0, , x1] = this.board.bounds;
    const w = x1 - x0;
    if (this.side === 'FB') return [{ side: 'F', dx: 0 }, { side: 'B', dx: w + 6 }];
    return [{ side: this.side, dx: 0 }];
  }

  fit() {
    if (!this.board?.bounds) { this.draw(); return; }
    const [x0, y0, x1, y1] = this.board.bounds;
    const n = this.panels().length;
    const w = (x1 - x0) * n + (n - 1) * 6, h = y1 - y0;
    const W = this.cv.width, H = this.cv.height, pad = 24 * (this.dpr || 1);
    const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    this.view = { s, ox: (W - w * s) / 2, oy: (H - h * s) / 2 };
    this.draw();
  }

  /** board mm → canvas px for a panel */
  tx(p, x, y) {
    const [x0, y0, x1] = this.board.bounds;
    const lx = p.side === 'B' ? x1 - x + x0 : x; // mirror bottom (view from below)
    return [this.view.ox + (lx - x0 + p.dx) * this.view.s, this.view.oy + (y - y0) * this.view.s];
  }

  /** canvas px → board mm (returns {side, x, y}) */
  inv(px, py) {
    const [x0, y0, x1] = this.board.bounds;
    const bx = (px - this.view.ox) / this.view.s + x0;
    const y = (py - this.view.oy) / this.view.s + y0;
    for (const p of this.panels()) {
      const lx = bx - p.dx;
      if (lx >= x0 - 3 && lx <= x1 + 3) return { side: p.side, x: p.side === 'B' ? x1 - lx + x0 : lx, y };
    }
    return null;
  }

  pick(px, py) {
    if (!this.board) return null;
    const q = this.inv(px, py);
    if (!q) return null;
    let best = null, bestA = Infinity;
    for (const fp of this.board.footprints) {
      if (fp.side !== q.side || !fp.body?.length || !fp.ref) continue;
      if (pointInPoly(q.x, q.y, fp.body)) {
        const [a, b, c, d] = fp.localBox; const area = (c - a) * (d - b);
        if (area < bestA) { best = fp; bestA = area; }
      }
    }
    if (best) return best;
    // nearest pad within 1 mm
    let bd = 1.0;
    for (const fp of this.board.footprints) {
      if (!fp.ref || (fp.side !== q.side && !fp.pads.some((x) => x.drill))) continue;
      for (const pd of fp.pads) {
        const d = Math.hypot(pd.x - q.x, pd.y - q.y);
        if (d < bd) { bd = d; best = fp; }
      }
    }
    return best;
  }

  _bind() {
    let drag = null, moved = false;
    const cv = this.cv;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr]; };
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      const f = Math.exp(-e.deltaY * 0.0015);
      this.view.ox = x - (x - this.view.ox) * f;
      this.view.oy = y - (y - this.view.oy) * f;
      this.view.s *= f;
      this.draw();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => { drag = { p: pos(e), ox: this.view.ox, oy: this.view.oy }; moved = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (drag) {
        const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
        if (Math.abs(dx) + Math.abs(dy) > 4 * this.dpr) moved = true;
        if (moved) { this.view.ox = drag.ox + dx; this.view.oy = drag.oy + dy; this.draw(); }
        return;
      }
      const fp = this.pick(...p);
      if (fp !== this.hover) { this.hover = fp; this.draw(); this.onHover?.(fp, e); cv.style.cursor = fp ? 'pointer' : 'grab'; }
      else if (fp) this.onHover?.(fp, e);
    });
    cv.addEventListener('pointerup', (e) => {
      if (drag && !moved) { const fp = this.pick(...pos(e)); this.onPick?.(fp, e); }
      drag = null;
    });
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.draw(); this.onHover?.(null); } });
    cv.addEventListener('dblclick', () => this.fit());
  }

  zoomTo(refs) {
    if (!this.board || !refs.length) return;
    const fps = this.board.footprints.filter((f) => refs.includes(f.ref) && f.body?.length);
    if (!fps.length) return;
    // keep whole board if parts are spread; otherwise zoom gently
    this.draw();
  }

  draw() {
    const c = this.ctx, W = this.cv.width, H = this.cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    const b = this.board;
    if (!b?.outline) return;
    const T = MASKS[this.theme] || MASKS.black;
    const s = this.view.s;
    for (const p of this.panels()) {
      // board
      c.beginPath();
      const poly = (pts) => pts.forEach(([x, y], i) => { const [X, Y] = this.tx(p, x, y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
      poly(b.outline); c.closePath();
      for (const h of b.holes) { poly(h); c.closePath(); }
      c.fillStyle = T.mask; c.fill('evenodd');
      c.lineWidth = Math.max(1, 0.25 * s); c.strokeStyle = T.edge; c.stroke();

      // side label
      c.fillStyle = 'rgba(201,168,76,0.9)';
      c.font = `600 ${Math.max(11, 3.2 * s)}px "Chakra Petch", sans-serif`;
      const [lx, ly] = this.tx(p, p.side === 'B' ? b.bounds[2] : b.bounds[0], b.bounds[1]);
      if (this.side === 'FB') c.fillText(p.side === 'F' ? 'TOP' : 'BOTTOM', lx, ly - 6 * this.dpr);

      // silkscreen + pads
      for (const fp of b.footprints) {
        const own = fp.side === p.side;
        // silk on own side
        if (own && fp.silk.length) {
          c.strokeStyle = T.silk; c.globalAlpha = 0.75; c.lineWidth = Math.max(0.6, 0.12 * s);
          c.beginPath();
          for (const pl of fp.silk) pl.forEach(([x0, y0], i) => {
            const a = (fp.rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
            const [X, Y] = this.tx(p, fp.x + x0 * cs + y0 * sn, fp.y - x0 * sn + y0 * cs);
            i ? c.lineTo(X, Y) : c.moveTo(X, Y);
          });
          c.stroke(); c.globalAlpha = 1;
        }
        for (const pd of fp.pads) {
          const vis = p.side === 'F' ? pd.front : pd.back;
          if (!vis) continue;
          this._pad(c, p, pd, pd.drill ? T.padTh : T.pad);
        }
        if (!fp.pads.length && own && fp.body?.length) this._body(c, p, fp, 'rgba(201,168,76,0.35)', T.pad, 1);
      }

      // board-level silkscreen (from Gerber)
      if (b.silk && b.silk[p.side]?.length) {
        c.strokeStyle = T.silk; c.globalAlpha = 0.7; c.lineWidth = Math.max(0.6, 0.12 * s);
        c.beginPath();
        for (const pl of b.silk[p.side]) pl.forEach(([x, y], i) => { const [X, Y] = this.tx(p, x, y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
        c.stroke(); c.globalAlpha = 1;
      }

      // placed overlay
      for (const fp of b.footprints) {
        if (fp.side !== p.side || !this.placed.has(fp.ref) || this.selected.has(fp.ref)) continue;
        this._body(c, p, fp, 'rgba(46,160,90,0.38)', 'rgba(70,200,120,0.9)', 1);
      }
      // selection
      const k = 0.55 + 0.45 * Math.sin(this.pulse);
      for (const fp of b.footprints) {
        if (fp.side !== p.side || !this.selected.has(fp.ref)) continue;
        this._body(c, p, fp, `rgba(190,22,30,${0.45 + 0.35 * k})`, '#C9A84C', 2.2);
        // crosshair halo
        const [cx, cy] = this.tx(p, fp.body.reduce((a, q) => a + q[0], 0) / 4, fp.body.reduce((a, q) => a + q[1], 0) / 4);
        c.beginPath(); c.arc(cx, cy, (2.2 + 1.2 * k) * s, 0, Math.PI * 2);
        c.strokeStyle = `rgba(201,168,76,${0.35 + 0.4 * k})`; c.lineWidth = 1.5 * this.dpr; c.stroke();
      }
      // hover
      if (this.hover && this.hover.side === p.side) this._body(c, p, this.hover, 'rgba(255,255,255,0.12)', '#ffffff', 1.4);

      // ref labels
      if (this.showRefs && s > 6) {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        for (const fp of b.footprints) {
          if (fp.side !== p.side || !fp.body?.length || !fp.inBom) continue;
          const [a, bb, cc, d] = fp.localBox;
          const wmm = Math.max(cc - a, d - bb);
          const fs = Math.min(1.6, Math.max(0.55, wmm / Math.max(3, fp.ref.length) * 1.5)) * s;
          if (fs < 7 * this.dpr) continue;
          const [cx, cy] = this.tx(p, fp.body.reduce((q, r) => q + r[0], 0) / 4, fp.body.reduce((q, r) => q + r[1], 0) / 4);
          const sel = this.selected.has(fp.ref);
          c.font = `600 ${fs}px "Chakra Petch", sans-serif`;
          c.lineWidth = 3 * this.dpr; c.strokeStyle = 'rgba(0,0,0,0.65)';
          c.strokeText(fp.ref, cx, cy);
          c.fillStyle = sel ? '#ffffff' : this.placed.has(fp.ref) ? '#9fe3b6' : 'rgba(245,242,236,0.85)';
          c.fillText(fp.ref, cx, cy);
        }
        c.textAlign = 'start'; c.textBaseline = 'alphabetic';
      }
    }
  }

  _body(c, p, fp, fill, stroke, lw) {
    if (!fp.body?.length) return;
    c.beginPath();
    fp.body.forEach(([x, y], i) => { const [X, Y] = this.tx(p, x, y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.closePath();
    c.fillStyle = fill; c.fill();
    c.lineWidth = lw * (this.dpr || 1); c.strokeStyle = stroke; c.stroke();
  }

  _pad(c, p, pd, color) {
    const [X, Y] = this.tx(p, pd.x, pd.y);
    const s = this.view.s;
    const a = ((p.side === 'B' ? pd.rot : -pd.rot) * Math.PI) / 180;
    c.save();
    c.translate(X, Y); c.rotate(a);
    const w = pd.w * s, h = pd.h * s;
    c.fillStyle = color;
    c.beginPath();
    if (pd.shape === 'circle') c.arc(0, 0, w / 2, 0, Math.PI * 2);
    else if (pd.shape === 'oval') {
      const r = Math.min(w, h) / 2;
      roundRect(c, -w / 2, -h / 2, w, h, r);
    } else if (pd.shape === 'roundrect') roundRect(c, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.25);
    else c.rect(-w / 2, -h / 2, w, h);
    c.fill();
    if (pd.drill) {
      c.fillStyle = '#0B0B0D';
      c.beginPath();
      const dw = pd.drill[0] * s, dh = pd.drill[1] * s;
      if (Math.abs(dw - dh) < 1e-3) c.arc(0, 0, dw / 2, 0, Math.PI * 2);
      else roundRect(c, -dw / 2, -dh / 2, dw, dh, Math.min(dw, dh) / 2);
      c.fill();
    }
    c.restore();
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
