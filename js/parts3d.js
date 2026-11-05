// TESR BOM Viewer — procedural 3D component models (no external STEP files, works offline)
// Each builder works in the footprint's local frame: X = local x, Z = local y (KiCad), Y = up from the board surface.
// Made by TESR — Thai Embedded System and Robotics
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/three/RoundedBoxGeometry.js';
import { mergeGeometries } from '../vendor/three/BufferGeometryUtils.js';

// ------------------------------------------------------------ helpers ----
const COL = {
  ic: 0x1c1c1f, icTop: 0x232327, tin: 0xd3d6dc, gold: 0xd8b75e, ceramic: 0xe6e1d4, resTop: 0x141416,
  cap: 0xb98a55, alu: 0xd5d8de, sleeve: 0x16161a, plastic: 0x121214, beige: 0xeee6cf, metal: 0xc8cbd1, ferrite: 0x2b2b30,
};
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.05, transparent: !!o.opacity, opacity: o.opacity ?? 1, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
const metalMat = (color = COL.tin) => mat(color, { metal: 0.85, rough: 0.28 });

function boxGeo(w, h, d, x = 0, y = 0, z = 0, r = 0) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}
function cylGeo(r, h, x = 0, y = 0, z = 0, seg = 32, r2 = r) {
  const g = new THREE.CylinderGeometry(r, r2, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

const texCache = new Map();
/** Laser-marking style text texture for the top of a package. */
function markTexture(lines, aspect, color = '#9a9aa2') {
  const key = lines.join('\n') + '|' + aspect.toFixed(2) + color;
  if (texCache.has(key)) return texCache.get(key);
  const H = 128, W = Math.max(32, Math.min(1024, Math.round(H * aspect)));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.fillStyle = color;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = lines.length;
  let fs = H / (n + 0.6);
  x.font = `600 ${fs}px "IBM Plex Mono", monospace`;
  const maxW = Math.max(...lines.map((l) => x.measureText(l).width));
  if (maxW > W * 0.9) fs *= (W * 0.9) / maxW;
  x.font = `600 ${fs}px "IBM Plex Mono", monospace`;
  lines.forEach((l, i) => x.fillText(l, W / 2, (H * (i + 1)) / (n + 1)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
function markPlane(lines, w, d, y, color, rotate = 0) {
  if (!lines.length || w < 0.6 || d < 0.4) return null;
  const long = rotate ? d : w, short = rotate ? w : d;
  const g = new THREE.PlaneGeometry(long * 0.86, short * 0.7);
  g.rotateX(-Math.PI / 2);
  if (rotate) g.rotateY(Math.PI / 2);
  g.translate(0, y + 0.004, 0);
  const m = new THREE.MeshBasicMaterial({ map: markTexture(lines, (long * 0.86) / (short * 0.7), color), transparent: true, depthWrite: false });
  return new THREE.Mesh(g, m);
}

/** Pads in the footprint frame with dimensions in local axes. */
function localPads(fp) {
  return fp.pads.map((p) => {
    let a = (((p.rot ?? 0) - fp.rot) % 180 + 180) % 180;
    let w = p.w, h = p.h;
    if (p.ref !== undefined && p.rot === 0 && fp.rot % 180 !== 0) a = (360 - fp.rot) % 180; // Gerber pads: world-aligned
    if (Math.abs(a - 90) < 1) [w, h] = [h, w];
    return { num: p.num, x: p.lx, z: p.ly, w, h, drill: p.drill, smd: !p.drill };
  });
}

function dimsFromName(n) {
  const m = /_(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:x\d+(?:\.\d+)?)?mm/i.exec(n);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

function bodyBox(fp) {
  const [a, b, c, d] = fp.localBox;
  return { cx: (a + c) / 2, cz: (b + d) / 2, w: Math.max(0.3, c - a), d: Math.max(0.3, d - b) };
}

/** Gull-wing / J leads from the body edge to each pad (merged into one geometry). */
function leadsGeo(pads, body, h, opt = {}) {
  const geos = [];
  const t = opt.t ?? 0.15;               // lead thickness
  const yTop = Math.min(h * 0.45, 0.9);  // where the lead leaves the body
  for (const p of pads) {
    if (!p.smd) continue;
    const dx = p.x - body.cx, dz = p.z - body.cz;
    const alongX = Math.abs(dx) / (body.w / 2 + 1e-6) >= Math.abs(dz) / (body.d / 2 + 1e-6);
    const sgn = alongX ? Math.sign(dx) || 1 : Math.sign(dz) || 1;
    const edge = alongX ? body.cx + sgn * body.w / 2 : body.cz + sgn * body.d / 2;
    const padLen = alongX ? p.w : p.h;
    const padWid = alongX ? p.h : p.w;
    const wid = Math.min(padWid * (opt.wf ?? 0.62), opt.maxW ?? 0.5);
    const tip = (alongX ? p.x : p.z) + sgn * padLen * 0.32;
    const knee = (alongX ? p.x : p.z) - sgn * padLen * 0.18;
    if (sgn * (tip - edge) <= 0.05) continue; // pad under the body (QFN-like)
    const seg = (a, b, y0, y1) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const len = Math.max(0.05, hi - lo), mid = (lo + hi) / 2;
      const g = new THREE.BoxGeometry(alongX ? len : wid, Math.max(t, y1 - y0), alongX ? wid : len);
      g.translate(alongX ? mid : p.x, (y0 + y1) / 2, alongX ? p.z : mid);
      geos.push(g);
    };
    seg(edge - sgn * 0.05, knee, yTop - t, yTop);           // upper horizontal
    seg(knee - sgn * t / 2, knee + sgn * t / 2, 0, yTop);    // bend down
    seg(knee, tip, 0, t);                                    // foot on the pad
  }
  return geos.length ? mergeGeometries(geos) : null;
}

// ---------------------------------------------------------- classifier ----
export function classify(fp) {
  const n = fp.footprint || '', r = fp.ref || '';
  if (/MountingHole|Fiducial|TestPoint|Logo|SolderJumper|NetTie|^TESR_/i.test(n)) return null;
  if (/CP_Elec|CP_Radial|Elec/i.test(n)) return 'elec';
  if (/^LED_|LED_\d{4}/i.test(n) && !/THT/i.test(n)) return 'led';
  if (/^(R|C|L|D|F)_(\d{4})_\d{4}Metric|^(R|C)_0[2468]0[1-5]|^(R|C)_1206|^(R|C)_1210|^(R|C)_2512/i.test(n)) return /^R/i.test(n) ? 'res' : /^C/i.test(n) ? 'mlcc' : 'chip';
  if (/LQFP|TQFP|[^A-Z]QFP/i.test(n)) return 'qfp';
  if (/QFN|DFN|WSON|SON-|VSON|LGA/i.test(n)) return 'qfn';
  if (/SOT-223|TO-252|DPAK/i.test(n)) return 'sot223';
  if (/SOIC|SOP|SSOP|TSSOP|MSOP|SO-\d/i.test(n)) return 'so';
  if (/SOT-?\d|SC-70|SC-88|TSOT/i.test(n)) return 'sot';
  if (/SOD-|D_SMA|D_SMB|D_SMC|MiniMELF|D_PowerDI/i.test(n)) return 'sod';
  if (/Crystal|Oscillator|Resonator/i.test(n)) return 'xtal';
  if (/^L_|Inductor|SRN|SRR|CD54|NR\d|Bourns-SR/i.test(n)) return 'ind';
  if (/USB_C|USB-C|TYPE-C/i.test(n)) return 'usbc';
  if (/PinHeader/i.test(n)) return 'header';
  if (/PinSocket/i.test(n)) return 'socket';
  if (/JST|Molex_Pico|PicoBlade|PH_B\d|XH_B\d/i.test(n)) return 'jst';
  if (/(^|[^A-Z])M8|M12_|Binder/i.test(n)) return 'm8';
  if (/^U/.test(r)) return 'so';
  if (/^J|^P|^CN/.test(r)) return 'conn';
  return 'box';
}

// ------------------------------------------------------------ builders ----
/**
 * Build a component model. Returns { group, mats[], height } or null.
 */
export function buildPart(fp) {
  const kind = classify(fp);
  if (!kind || !fp.localBox) return null;
  const g = new THREE.Group();
  const mats = [];
  const add = (geo, m) => { if (!geo) return null; const mesh = new THREE.Mesh(geo, m); g.add(mesh); if (!mats.includes(m)) mats.push(m); return mesh; };
  const pads = localPads(fp);
  let B = bodyBox(fp);
  let H = 1.2;
  const name = fp.footprint || '';
  const val = (fp.value || '').replace(/\s+/g, ' ').trim();

  // body dimensions from the footprint name when the box comes from pads (Gerber / CPL boards)
  const nd = dimsFromName(name);
  if (nd && (!fp.fab?.length) && /qfp|qfn|so|sot223|xtal/.test(kind)) {
    const [a, b] = nd.sort((p, q) => p - q);
    const spreadX = Math.max(...pads.map((p) => p.x)) - Math.min(...pads.map((p) => p.x));
    const spreadZ = Math.max(...pads.map((p) => p.z)) - Math.min(...pads.map((p) => p.z));
    B = { cx: B.cx, cz: B.cz, w: spreadX >= spreadZ ? a : b, d: spreadX >= spreadZ ? b : a };
    if (kind === 'qfp' || kind === 'qfn') B.w = B.d = Math.max(a, b);
  }
  const pin1 = pads.find((p) => p.num === '1') || pads[0];

  switch (kind) {
    case 'res': case 'mlcc': case 'chip': case 'led': {
      const m = /_(\d{4})_(\d{4})Metric/.exec(name);
      const code = m ? m[2] : '';
      let L = code ? parseInt(code.slice(0, 2), 10) / 10 : Math.max(B.w, B.d);
      let W = code ? parseInt(code.slice(2), 10) / 10 : Math.min(B.w, B.d);
      H = kind === 'res' ? Math.min(0.55, W * 0.7) : kind === 'led' ? Math.min(0.7, W * 0.9) : { '0603': 0.3, '1005': 0.5, '1608': 0.8, '2012': 1.0, '3216': 1.15, '3225': 1.6, '4532': 2.0 }[code] || W * 0.9;
      const along = pads.length >= 2 ? Math.abs(pads[0].x - pads[1].x) >= Math.abs(pads[0].z - pads[1].z) : B.w >= B.d;
      const sx = along ? L : W, sz = along ? W : L;
      const cap = L * 0.2;
      if (kind === 'res') {
        add(boxGeo(sx - (along ? 2 * cap : 0), H * 0.92, sz - (along ? 0 : 2 * cap), B.cx, 0, B.cz), mat(COL.ceramic, { rough: 0.8 }));
        add(boxGeo(along ? sx - 2 * cap : sx * 0.98, 0.03, along ? sz * 0.98 : sz - 2 * cap, B.cx, H * 0.92, B.cz), mat(COL.resTop, { rough: 0.7 }));
      } else if (kind === 'led') {
        add(boxGeo(sx - (along ? 2 * cap : 0), H * 0.45, sz - (along ? 0 : 2 * cap), B.cx, 0, B.cz), mat(0xf2f0ea, { rough: 0.6 }));
        const c = /red/i.test(val) ? 0xff4a4a : /blue/i.test(val) ? 0x5aa0ff : /yel|amb|orange/i.test(val) ? 0xffcc33 : /white/i.test(val) ? 0xf8f8ff : 0x6dff9a;
        add(boxGeo(sx - (along ? 2 * cap : 0), H * 0.55, sz - (along ? 0 : 2 * cap), B.cx, H * 0.45, B.cz, 0.05), mat(c, { opacity: 0.85, emissive: c, ei: 0.35, rough: 0.2 }));
      } else {
        add(boxGeo(sx - (along ? 2 * cap : 0), H, sz - (along ? 0 : 2 * cap), B.cx, 0, B.cz, 0.04), mat(kind === 'mlcc' ? COL.cap : 0x2a2a2e, { rough: 0.75 }));
      }
      const tm = metalMat();
      for (const s of [-1, 1]) {
        add(boxGeo(along ? cap : sx, H, along ? sz : cap, B.cx + (along ? s * (sx / 2 - cap / 2) : 0), 0, B.cz + (along ? 0 : s * (sz / 2 - cap / 2)), 0.03), tm);
      }
      if (kind === 'res' && L >= 1.5) {
        const mk = markPlane([shortValue(val)], along ? sx - 2 * cap : sx, along ? sz : sz - 2 * cap, H * 0.95, '#e8e8e8', !along);
        if (mk) g.add(mk);
      }
      break;
    }
    case 'elec': {
      const m = /Elec_(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i.exec(name);
      const D = m ? parseFloat(m[1]) : Math.min(B.w, B.d) * 0.95;
      H = m ? parseFloat(m[2]) : D * 1.1;
      const R = D / 2;
      add(boxGeo(Math.min(B.w, D * 1.06), 0.5, Math.min(B.d, D * 1.06), B.cx, 0, B.cz, 0.1), mat(COL.sleeve, { rough: 0.8 }));
      add(cylGeo(R, H - 0.5, B.cx, 0.5, B.cz, 40), mat(COL.alu, { metal: 0.7, rough: 0.32 }));
      // polarity band on the minus side (pad 2)
      const neg = pads.find((p) => p.num === '2');
      const ang = neg ? Math.atan2(neg.x - B.cx, neg.z - B.cz) : 0;
      const band = new THREE.CylinderGeometry(R + 0.02, R + 0.02, H - 0.9, 24, 1, true, ang - 0.6, 1.2);
      band.translate(B.cx, 0.5 + (H - 0.9) / 2 + 0.2, B.cz);
      add(band, mat(0x1f2a44, { rough: 0.5 }));
      // top with vent cross
      const topT = new THREE.CircleGeometry(R * 0.96, 40);
      topT.rotateX(-Math.PI / 2); topT.translate(B.cx, H + 0.003, B.cz);
      add(topT, mat(0xb7bbc2, { metal: 0.6, rough: 0.35 }));
      for (const a of [0, Math.PI / 2]) {
        const v = new THREE.BoxGeometry(D * 0.7, 0.04, 0.12);
        v.rotateY(a); v.translate(B.cx, H + 0.01, B.cz);
        add(v, mat(0x7c7f86, { metal: 0.6, rough: 0.4 }));
      }
      break;
    }
    case 'qfp': case 'so': case 'sot': case 'sot223': case 'qfn': {
      H = kind === 'qfp' ? 1.45 : kind === 'qfn' ? 0.85 : kind === 'sot223' ? 1.65 : kind === 'sot' ? 1.05 : /SOP-4/i.test(name) ? 2.0 : 1.5;
      if (kind === 'sot223') {
        // body sits over the 3 small pins; the big tab is a separate lead
        const small = pads.filter((p) => p.smd);
        const big = small.reduce((a, p) => (p.w * p.h > a.w * a.h ? p : a), small[0]);
        const rest = small.filter((p) => p !== big);
        const bodyB = nd ? { ...B, w: B.w, d: B.d } : B;
        add(boxGeo(bodyB.w, H - 0.1, bodyB.d, bodyB.cx, 0.1, bodyB.cz, 0.08), mat(COL.ic, { rough: 0.7 }));
        const lg = leadsGeo(rest, bodyB, H, { maxW: 0.7 });
        const tm = metalMat();
        if (lg) add(lg, tm);
        if (big) {
          const along = Math.abs(big.x - bodyB.cx) > Math.abs(big.z - bodyB.cz);
          add(boxGeo(along ? big.w * 0.8 : big.w * 0.9, 0.2, along ? big.h * 0.9 : big.h * 0.8, (big.x + bodyB.cx) / 2, 0, (big.z + bodyB.cz) / 2), tm);
        }
        const mk = markPlane(markLines(val, fp.ref), bodyB.w, bodyB.d, H, '#8e8e96', bodyB.d > bodyB.w);
        if (mk) g.add(mk);
        break;
      }
      const lift = kind === 'qfn' ? 0.02 : 0.1;
      add(boxGeo(B.w, H - lift, B.d, B.cx, lift, B.cz, kind === 'qfn' ? 0.04 : 0.1), mat(COL.ic, { rough: 0.72 }));
      if (kind !== 'qfn') {
        const lg = leadsGeo(pads, B, H, { maxW: kind === 'qfp' ? 0.3 : 0.48 });
        if (lg) add(lg, metalMat());
      }
      // pin-1 dimple
      if (pin1 && kind !== 'sot') {
        const ddx = Math.sign(pin1.x - B.cx) || -1, ddz = Math.sign(pin1.z - B.cz) || -1;
        const r = Math.min(B.w, B.d) * 0.07 + 0.1;
        const dimple = new THREE.CircleGeometry(r, 20);
        dimple.rotateX(-Math.PI / 2);
        dimple.translate(B.cx + ddx * (B.w / 2 - r * 2.2), H + 0.005, B.cz + ddz * (B.d / 2 - r * 2.2));
        add(dimple, mat(0x0c0c0e, { rough: 0.3 }));
      }
      const mk = markPlane(markLines(val, fp.ref), B.w, B.d, H, '#8e8e96', B.d > B.w * 1.4);
      if (mk) g.add(mk);
      break;
    }
    case 'sod': {
      H = 1.1;
      const along = pads.length >= 2 ? Math.abs(pads[0].x - pads[1].x) >= Math.abs(pads[0].z - pads[1].z) : B.w >= B.d;
      const bw = along ? Math.min(B.w, Math.abs(pads[0].x - pads[1].x) || B.w) : B.w, bd = along ? B.d : Math.min(B.d, Math.abs(pads[0].z - pads[1].z) || B.d);
      add(boxGeo(bw * 0.95, H, bd * 0.95, B.cx, 0, B.cz, 0.08), mat(COL.ic, { rough: 0.7 }));
      const k = pads.find((p) => p.num === '1') || pads[0];
      if (k) {
        const s = along ? Math.sign(k.x - B.cx) : Math.sign(k.z - B.cz);
        add(boxGeo(along ? bw * 0.14 : bw * 0.95, 0.02, along ? bd * 0.95 : bd * 0.14, B.cx + (along ? s * bw * 0.3 : 0), H, B.cz + (along ? 0 : s * bd * 0.3)), mat(0xbfc3ca, { rough: 0.5 }));
      }
      const tm = metalMat();
      for (const p of pads) add(boxGeo(along ? p.w * 0.6 : p.w * 0.7, 0.15, along ? p.h * 0.7 : p.h * 0.6, p.x, 0, p.z), tm);
      break;
    }
    case 'xtal': {
      H = 0.8;
      add(boxGeo(B.w, 0.28, B.d, B.cx, 0, B.cz, 0.05), mat(0xd8cdb3, { rough: 0.8 }));
      add(boxGeo(B.w * 0.9, H - 0.28, B.d * 0.9, B.cx, 0.28, B.cz, 0.08), mat(COL.metal, { metal: 0.85, rough: 0.25 }));
      const mk = markPlane([shortValue(val)], B.w * 0.9, B.d * 0.9, H, '#5b5e66', B.d > B.w);
      if (mk) g.add(mk);
      break;
    }
    case 'ind': {
      const hm = /(\d{2})(\d{2})(?:[^\d]|$)/.exec(name.replace(/.*SRN|.*SRR|.*CD/i, ''));
      H = hm ? Math.min(6, parseInt(hm[2], 10) / 10) : 2.8;
      const s = Math.min(B.w, B.d);
      add(boxGeo(B.w * 0.98, H, B.d * 0.98, B.cx, 0, B.cz, s * 0.18), mat(COL.ferrite, { rough: 0.85 }));
      const top = new THREE.CircleGeometry(s * 0.36, 32);
      top.rotateX(-Math.PI / 2); top.translate(B.cx, H + 0.005, B.cz);
      add(top, mat(0x3a3a40, { rough: 0.6 }));
      const mk = markPlane([shortValue(val)], s * 0.6, s * 0.4, H + 0.01, '#d0d0d4');
      if (mk) g.add(mk);
      break;
    }
    case 'usbc': {
      H = 3.2;
      const smd = pads.filter((p) => p.smd);
      const cz = smd.length ? smd.reduce((a, p) => a + p.z, 0) / smd.length : B.cz;
      const front = cz < B.cz ? 1 : -1; // opening faces away from the signal pads
      const W = Math.min(B.w, 9.0), Dp = Math.min(B.d * 0.95, 7.4);
      const sh = new THREE.Shape();
      const r = H / 2 - 0.05, hw = W / 2;
      sh.moveTo(-hw + r, -r); sh.lineTo(hw - r, -r); sh.absarc(hw - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
      sh.lineTo(-hw + r, r); sh.absarc(-hw + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
      const shell = new THREE.ExtrudeGeometry(sh, { depth: Dp, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 18 });
      shell.translate(0, 0, -Dp / 2);
      shell.translate(B.cx, H / 2, B.cz + front * 0.4);
      add(shell, mat(COL.metal, { metal: 0.9, rough: 0.22 }));
      const hole = new THREE.Shape();
      const ri = r - 0.45, hwi = hw - 0.45;
      hole.moveTo(-hwi + ri, -ri); hole.lineTo(hwi - ri, -ri); hole.absarc(hwi - ri, 0, ri, -Math.PI / 2, Math.PI / 2, false);
      hole.lineTo(-hwi + ri, ri); hole.absarc(-hwi + ri, 0, ri, Math.PI / 2, Math.PI * 1.5, false);
      const hg = new THREE.ShapeGeometry(hole, 18);
      if (front < 0) hg.rotateY(Math.PI);
      hg.translate(B.cx, H / 2, B.cz + front * (0.4 + Dp / 2 + 0.1));
      add(hg, mat(0x050506, { rough: 0.9 }));
      const tongue = new THREE.BoxGeometry(W * 0.62, 0.7, 0.3);
      tongue.translate(B.cx, H / 2, B.cz + front * (0.4 + Dp / 2 - 0.05));
      add(tongue, mat(0x18181b, { rough: 0.6 }));
      break;
    }
    case 'header': case 'socket': {
      const pitch = /_P(\d+(?:\.\d+)?)mm/i.exec(name);
      const pp = pitch ? parseFloat(pitch[1]) : 2.54;
      const female = kind === 'socket';
      H = female ? 8.5 : 2.5;
      const xs = pads.map((p) => p.x), zs = pads.map((p) => p.z);
      const x0 = Math.min(...xs) - pp / 2, x1 = Math.max(...xs) + pp / 2, z0 = Math.min(...zs) - pp / 2, z1 = Math.max(...zs) + pp / 2;
      add(boxGeo(x1 - x0 - 0.05, H, z1 - z0 - 0.05, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.08), mat(COL.plastic, { rough: 0.75 }));
      const pinM = mat(COL.gold, { metal: 0.9, rough: 0.25 });
      const pins = [];
      for (const p of pads) {
        if (female) {
          const hole = new THREE.BoxGeometry(pp * 0.42, 0.02, pp * 0.42);
          hole.translate(p.x, H + 0.012, p.z);
          pins.push({ g: hole, dark: true });
          const below = new THREE.BoxGeometry(0.5, 3, 0.5);
          below.translate(p.x, -1.5 - 1.6, p.z);
          pins.push({ g: below });
        } else {
          const pin = new THREE.BoxGeometry(0.64, H + 6 + 3 + 1.6, 0.64);
          pin.translate(p.x, (H + 6 - 3 - 1.6) / 2, p.z);
          pins.push({ g: pin });
        }
      }
      const gold = pins.filter((q) => !q.dark).map((q) => q.g), dark = pins.filter((q) => q.dark).map((q) => q.g);
      if (gold.length) add(mergeGeometries(gold), pinM);
      if (dark.length) add(mergeGeometries(dark), mat(0x030304, { rough: 0.95 }));
      if (!female) H += 6;
      break;
    }
    case 'jst': {
      H = 6.0;
      const xs = pads.map((p) => p.x), zs = pads.map((p) => p.z);
      const tht = pads.filter((p) => p.drill);
      const along = tht.length > 1 ? Math.abs(tht[0].x - tht[1].x) >= Math.abs(tht[0].z - tht[1].z) : true;
      const w = Math.max(B.w, (along ? Math.max(...xs) - Math.min(...xs) : 0) + 3.9), d = Math.max(B.d, (along ? 0 : Math.max(...zs) - Math.min(...zs)) + 3.9);
      const bw = along ? w : Math.min(w, 4.5), bd = along ? Math.min(d, 4.5) : d;
      const housing = mat(COL.beige, { rough: 0.7 });
      add(boxGeo(bw, 1.2, bd, B.cx, 0, B.cz), housing);
      const wall = 0.45;
      add(boxGeo(bw, H - 1.2, wall, B.cx, 1.2, B.cz - bd / 2 + wall / 2), housing);
      add(boxGeo(bw, H - 1.2, wall, B.cx, 1.2, B.cz + bd / 2 - wall / 2), housing);
      add(boxGeo(wall, H - 1.2, bd, B.cx - bw / 2 + wall / 2, 1.2, B.cz), housing);
      add(boxGeo(wall, H - 1.2, bd, B.cx + bw / 2 - wall / 2, 1.2, B.cz), housing);
      const pinG = tht.map((p) => { const q = new THREE.BoxGeometry(0.5, H - 1.0 + 4.6, 0.5); q.translate(p.x, (H - 1.0 - 4.6) / 2 + 0.6, p.z); return q; });
      if (pinG.length) add(mergeGeometries(pinG), mat(COL.gold, { metal: 0.9, rough: 0.25 }));
      break;
    }
    case 'm8': {
      const R = Math.min(B.w, B.d) / 2;
      const tht = pads.filter((p) => p.drill);
      const cx = tht.length ? tht.reduce((a, p) => a + p.x, 0) / tht.length : B.cx, cz = tht.length ? tht.reduce((a, p) => a + p.z, 0) / tht.length : B.cz;
      H = 12;
      const met = mat(COL.metal, { metal: 0.9, rough: 0.25 });
      add(cylGeo(Math.min(R, 5.2), 2.2, cx, 0, cz, 6), met);                // hex nut
      add(cylGeo(Math.min(R, 5.2) * 0.78, H - 2.2, cx, 2.2, cz, 40), met);   // threaded body
      const rings = [];
      for (let y = 3; y < H - 0.6; y += 0.7) { const t = new THREE.TorusGeometry(Math.min(R, 5.2) * 0.78, 0.09, 6, 40); t.rotateX(Math.PI / 2); t.translate(cx, y, cz); rings.push(t); }
      add(mergeGeometries(rings), met);
      const ins = new THREE.CircleGeometry(Math.min(R, 5.2) * 0.6, 32);
      ins.rotateX(-Math.PI / 2); ins.translate(cx, H + 0.01, cz);
      add(ins, mat(0x101012, { rough: 0.9 }));
      const pinsG = tht.map((p) => { const q = cylGeo(0.35, 0.3, cx + (p.x - cx) * 0.7, H, cz + (p.z - cz) * 0.7, 10); return q; });
      if (pinsG.length) add(mergeGeometries(pinsG), mat(COL.gold, { metal: 0.9, rough: 0.25 }));
      break;
    }
    case 'conn': {
      H = 5;
      add(boxGeo(B.w, H, B.d, B.cx, 0, B.cz, 0.1), mat(0x2a2a2e, { rough: 0.7 }));
      break;
    }
    default: {
      H = 1.2;
      add(boxGeo(B.w, H, B.d, B.cx, 0, B.cz, 0.08), mat(0x2b2b30, { rough: 0.7 }));
    }
  }
  for (const c of g.children) c.userData.fp = fp;
  return { group: g, mats, height: H, kind };
}

function shortValue(v) {
  return String(v || '').replace(/\s*\d+V$/i, '').replace(/\s+/g, '').slice(0, 8);
}
function markLines(val, ref) {
  const v = String(val || ref || '').replace(/\s*\(.*\)$/, '').trim();
  if (!v) return [];
  if (v.length <= 8) return [v];
  return [v.slice(0, Math.ceil(v.length / 2)), v.slice(Math.ceil(v.length / 2))];
}
