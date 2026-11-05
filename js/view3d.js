// TESR BOM Viewer — 3D board view (three.js): extruded board, pads, silkscreen, component bodies
// Made by TESR — Thai Embedded System and Robotics
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MASK = { black: 0x0c0c0e, green: 0x1d5a37, white: 0xece8de };

/** Height (mm) + colour + style for a footprint, guessed from its name / reference. */
function partStyle(fp) {
  const n = fp.footprint || '', r = fp.ref || '', v = (fp.value || '').toLowerCase();
  const sz = /_(\d{4})_(\d{4})Metric/.exec(n);
  const metric = sz ? sz[2] : '';
  const chipH = { '0603': 0.3, '1005': 0.45, '1608': 0.8, '2012': 1.0, '3216': 1.15, '3225': 1.4, '4532': 1.6 }[metric] || 0.8;
  let m;
  if (/MountingHole|Fiducial|TestPoint|Logo|SolderJumper|NetTie/i.test(n)) return null;
  if ((m = /CP_Elec_([\d.]+)x([\d.]+)/i.exec(n))) return { h: parseFloat(m[2]), color: 0xc9cbd0, cyl: parseFloat(m[1]) / 2, top: 0x1b1b1f };
  if (/^R_/i.test(n) || /^R\d/.test(r) && sz) return { h: chipH * 0.8, color: 0x17171a, top: 0x26262a };
  if (/^C_/i.test(n)) return { h: chipH, color: 0xb88d5c };
  if (/^LED_/i.test(n)) return { h: 0.6, color: /red/.test(v) ? 0xff5a5a : /blue/.test(v) ? 0x6aa8ff : /yel|amb/.test(v) ? 0xffd34d : 0x7dffa1, glow: true };
  if (/^L_|Inductor|SRN|SRR|NR\d/i.test(n)) return { h: 2.8, color: 0x2e2e33 };
  if (/Crystal|Oscillator|Resonator/i.test(n)) return { h: 0.8, color: 0xc7c7cc };
  if (/USB_C|USB/i.test(n)) return { h: 3.2, color: 0xc6c8cc, metal: true };
  if ((m = /PinHeader_(\d)x(\d+)/i.exec(n))) return { h: 2.5, color: 0x161618, pins: 8.5 };
  if (/PinSocket/i.test(n)) return { h: 8.5, color: 0x161618 };
  if (/JST|Molex|TE_|Phoenix|TerminalBlock/i.test(n)) return { h: 6, color: /Terminal/i.test(n) ? 0x2f8a46 : 0xe8e1cc };
  if (/M8|M12/i.test(n)) return { h: 9, color: 0xb9bcc2, metal: true, cyl: 4.5 };
  if (/RJ45|DSUB|Barrel/i.test(n)) return { h: 9, color: 0x2a2a2e };
  if (/QFN|DFN|WSON|SON/i.test(n)) return { h: 0.9, color: 0x232326 };
  if (/LQFP|TQFP|QFP/i.test(n)) return { h: 1.5, color: 0x1f1f22 };
  if (/SOIC|SO-|SOP|SSOP|TSSOP|MSOP/i.test(n)) return { h: /SOP-4/i.test(n) ? 2.0 : 1.6, color: 0x1f1f22 };
  if (/SOT-223/i.test(n)) return { h: 1.7, color: 0x1f1f22 };
  if (/SOT|SC-70|SOD|SMA|SMB|SMC|TO-/i.test(n)) return { h: 1.1, color: 0x1f1f22 };
  if (/Switch|SW_/i.test(n)) return { h: 3.5, color: 0x3a3a3f };
  if (/^J/.test(r)) return { h: 5, color: 0x2a2a2e };
  if (/^U/.test(r)) return { h: 1.4, color: 0x1f1f22 };
  return { h: 1.2, color: 0x2b2b30 };
}

export class Board3D {
  constructor(host, { onPick, onHover } = {}) {
    this.host = host;
    this.onPick = onPick;
    this.onHover = onHover;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x303034, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-60, 120, 90); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff4e0, 0.45); rim.position.set(80, 40, -100); this.scene.add(rim);
    const under = new THREE.DirectionalLight(0xffffff, 0.6); under.position.set(0, -120, 40); this.scene.add(under);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.bodies = [];
    this.byRef = new Map();
    this.selected = new Set();
    this.placed = new Set();
    this.theme = 'black';
    this.ray = new THREE.Raycaster();
    this.beacons = new THREE.Group();
    this.scene.add(this.beacons);
    this._bind();
    new ResizeObserver(() => this.resize()).observe(host);
    this.visible = false;
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.visible) return;
      this.controls.update();
      const t = performance.now() / 1000;
      this.beacons.children.forEach((b, i) => { b.position.y = b.userData.y0 + Math.sin(t * 3 + i) * 0.8; b.rotation.y = t * 1.5; });
      const k = 0.5 + 0.5 * Math.sin(t * 4);
      for (const ref of this.selected) { const m = this.byRef.get(ref); if (m) m.material.emissive.setRGB(0.45 + 0.3 * k, 0.03, 0.05); }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  setTheme(t) {
    this.theme = t;
    if (this.maskMat) this.maskMat.color.setHex(MASK[t] || MASK.black);
    if (this.silkMat) this.silkMat.color.setHex(t === 'white' ? 0x1a1a1d : 0xf2efe8);
  }

  setBoard(board) {
    this.board = board;
    for (const c of [...this.group.children]) { this.group.remove(c); c.geometry?.dispose?.(); }
    this.bodies = []; this.byRef.clear();
    if (!board?.outline) return;
    const [x0, y0, x1, y1] = board.bounds;
    this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
    const T = board.thickness || 1.6;
    this.T = T;
    const P = (x, y) => new THREE.Vector2(x - this.cx, -(y - this.cy));

    // ---- board (extruded outline with cut-outs + PTH holes) ----
    const shape = new THREE.Shape(board.outline.map(([x, y]) => P(x, y)));
    for (const h of board.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => P(x, y))));
    for (const fp of board.footprints) for (const pd of fp.pads) {
      if (!pd.drill) continue;
      const r = Math.min(pd.drill[0], pd.drill[1]) / 2;
      if (r < 0.2) continue;
      const path = new THREE.Path(); path.absarc(pd.x - this.cx, -(pd.y - this.cy), r, 0, Math.PI * 2, true);
      shape.holes.push(path);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 16 });
    geo.rotateX(-Math.PI / 2); // shape XY → world XZ, extrusion → +Y
    this.maskMat = new THREE.MeshStandardMaterial({ color: MASK[this.theme] || MASK.black, roughness: 0.38, metalness: 0.1 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x6b6450, roughness: 0.9 });
    const boardMesh = new THREE.Mesh(geo, [this.maskMat, edgeMat]);
    this.group.add(boardMesh);

    // ---- pads (instanced) ----
    const pads = board.footprints.flatMap((fp) => fp.pads.flatMap((pd) => [pd.front ? [pd, 'F'] : null, pd.back ? [pd, 'B'] : null].filter(Boolean)));
    const padMat = new THREE.MeshStandardMaterial({ color: 0xd4b25c, metalness: 0.85, roughness: 0.3 });
    const box = new THREE.BoxGeometry(1, 0.04, 1);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 0.04, 20);
    const sq = pads.filter(([p]) => p.shape !== 'circle'), ci = pads.filter(([p]) => p.shape === 'circle');
    const inst = (g, list) => {
      const im = new THREE.InstancedMesh(g, padMat, Math.max(1, list.length));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
      list.forEach(([p, side], i) => {
        t.set(p.x - this.cx, side === 'F' ? T + 0.02 : -0.02, p.y - this.cy);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (p.rot * Math.PI) / 180);
        s.set(p.w, 1, p.h);
        m.compose(t, q, s); im.setMatrixAt(i, m);
      });
      im.count = list.length;
      this.group.add(im);
    };
    inst(box, sq); inst(cyl, ci);

    // ---- silkscreen (line segments) ----
    this.silkMat = new THREE.LineBasicMaterial({ color: this.theme === 'white' ? 0x1a1a1d : 0xf2efe8, transparent: true, opacity: 0.85 });
    for (const side of ['F', 'B']) {
      const pts = [];
      for (const fp of board.footprints) {
        if (fp.side !== side) continue;
        const a = (fp.rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
        for (const pl of fp.silk) for (let i = 0; i < pl.length - 1; i++) {
          for (const [lx, ly] of [pl[i], pl[i + 1]]) {
            const x = fp.x + lx * cs + ly * sn, y = fp.y - lx * sn + ly * cs;
            pts.push(x - this.cx, side === 'F' ? T + 0.015 : -0.015, y - this.cy);
          }
        }
      }
      for (const pl of board.silk?.[side] || []) for (let i = 0; i < pl.length - 1; i++) {
        for (const [x, y] of [pl[i], pl[i + 1]]) pts.push(x - this.cx, side === 'F' ? T + 0.015 : -0.015, y - this.cy);
      }
      if (!pts.length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.group.add(new THREE.LineSegments(g, this.silkMat));
    }

    // ---- component bodies ----
    for (const fp of board.footprints) {
      const st = partStyle(fp);
      if (!st || !fp.localBox || !fp.ref || !isFinite(fp.x)) continue;
      const [a, b, c, d] = fp.localBox;
      const w = Math.max(0.3, c - a), l = Math.max(0.3, d - b);
      const lcx = (a + c) / 2, lcy = (b + d) / 2;
      const ang = (fp.rot * Math.PI) / 180;
      const wx = fp.x + lcx * Math.cos(ang) + lcy * Math.sin(ang), wy = fp.y - lcx * Math.sin(ang) + lcy * Math.cos(ang);
      const mat = new THREE.MeshStandardMaterial({
        color: st.color, roughness: st.metal ? 0.3 : 0.6, metalness: st.metal ? 0.8 : 0.05,
        emissive: st.glow ? st.color : 0x000000, emissiveIntensity: st.glow ? 0.25 : 1,
      });
      let g;
      if (st.cyl) g = new THREE.CylinderGeometry(Math.min(st.cyl, w / 2, l / 2), Math.min(st.cyl, w / 2, l / 2), st.h, 28);
      else g = new THREE.BoxGeometry(w * 0.96, st.h, l * 0.96);
      const mesh = new THREE.Mesh(g, mat);
      const up = fp.side === 'F' ? 1 : -1;
      mesh.position.set(wx - this.cx, fp.side === 'F' ? T + st.h / 2 : -st.h / 2, wy - this.cy);
      mesh.rotation.y = ang;
      mesh.userData = { fp, baseColor: st.color, style: st };
      this.group.add(mesh);
      this.bodies.push(mesh);
      this.byRef.set(fp.ref, mesh);
      if (st.top) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(st.cyl || 1, w / 2) * 0.98, Math.min(st.cyl || 1, w / 2) * 0.98, 0.05, 28),
          new THREE.MeshStandardMaterial({ color: st.top, roughness: 0.5 }));
        if (!st.cyl) cap.geometry = new THREE.BoxGeometry(w * 0.6, 0.02, l * 0.96);
        cap.position.copy(mesh.position); cap.position.y += up * (st.h / 2 + 0.01); cap.rotation.y = ang;
        cap.raycast = () => {};
        this.group.add(cap);
      }
      if (st.pins) {
        const pm = new THREE.MeshStandardMaterial({ color: 0xd8b75e, metalness: 0.9, roughness: 0.25 });
        for (const pd of fp.pads) {
          const pin = new THREE.Mesh(new THREE.BoxGeometry(0.64, st.pins, 0.64), pm);
          pin.position.set(pd.x - this.cx, fp.side === 'F' ? T + st.pins / 2 : -st.pins / 2, pd.y - this.cy);
          pin.raycast = () => {};
          this.group.add(pin);
        }
      }
    }
    this.size = Math.max(x1 - x0, y1 - y0);
    this.applyState();
    this.view('iso');
  }

  view(kind) {
    const D = (this.size || 60) * 1.45;
    this.controls.target.set(0, (this.T || 1.6) / 2, 0);
    this.camera.up.set(0, 1, 0);
    if (kind === 'top') { this.camera.up.set(0, 0, -1); this.camera.position.set(0, D * 1.15, 0.001); }
    else if (kind === 'bottom') { this.camera.up.set(0, 0, -1); this.camera.position.set(0, -D * 1.15, 0.001); }
    else if (kind === 'front') this.camera.position.set(0, D * 0.25, D * 1.1);
    else this.camera.position.set(-D * 0.55, D * 0.75, D * 0.85);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  setState(selected, placed) {
    this.selected = new Set(selected);
    this.placed = new Set(placed);
    this.applyState();
  }

  applyState() {
    for (const m of this.bodies) {
      const ref = m.userData.fp.ref;
      const st = m.userData.style;
      if (this.selected.has(ref)) { m.material.color.setHex(0xbe161e); m.material.emissive.setHex(0x6a0008); }
      else if (this.placed.has(ref)) { m.material.color.setHex(0x2ea05a); m.material.emissive.setHex(0x0a3a1a); }
      else { m.material.color.setHex(m.userData.baseColor); m.material.emissive.setHex(st.glow ? st.color : 0x000000); }
    }
    // beacons above selected parts
    for (const b of [...this.beacons.children]) { this.beacons.remove(b); b.geometry.dispose(); }
    const coneGeo = new THREE.ConeGeometry(0.9, 2.4, 4);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, emissive: 0x6b5520, metalness: 0.6, roughness: 0.3 });
    for (const ref of this.selected) {
      const m = this.byRef.get(ref);
      if (!m) continue;
      const cone = new THREE.Mesh(coneGeo, coneMat);
      const top = m.userData.fp.side === 'F';
      const y = top ? m.position.y + m.userData.style.h / 2 + 3.2 : m.position.y - m.userData.style.h / 2 - 3.2;
      cone.position.set(m.position.x, y, m.position.z);
      cone.rotation.x = top ? Math.PI : 0;
      cone.userData.y0 = y;
      cone.raycast = () => {};
      this.beacons.add(cone);
    }
  }

  _hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const h = this.ray.intersectObjects(this.bodies, false)[0];
    return h ? h.object.userData.fp : null;
  }

  _bind() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) this.onPick?.(this._hit(e), e);
      down = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const fp = this._hit(e);
      el.style.cursor = fp ? 'pointer' : 'grab';
      this.onHover?.(fp, e);
    });
    el.addEventListener('pointerleave', () => this.onHover?.(null));
  }
}
