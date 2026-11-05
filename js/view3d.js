// TESR BOM Viewer — 3D board view (three.js)
// Board = extruded outline + painted top / bottom textures (mask, copper, silkscreen, texts) + metal pads + procedural parts.
// Made by TESR — Thai Embedded System and Robotics
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { paintSide, THEMES } from './paint.js?b=20261106b';
import { buildPart } from './parts3d.js?b=20261106b';

export class Board3D {
  constructor(host, { onPick, onHover } = {}) {
    this.host = host;
    this.onPick = onPick;
    this.onHover = onHover;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a30, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(-60, 140, 90); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff2dc, 0.7); rim.position.set(90, 60, -110); this.scene.add(rim);
    const under = new THREE.DirectionalLight(0xffffff, 0.9); under.position.set(20, -140, 60); this.scene.add(under);
    this.envMap();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.parts = new Map();   // ref → { group, mats, height, fp }
    this.pickables = [];
    this.selected = new Set();
    this.placed = new Set();
    this.theme = 'black';
    this.ray = new THREE.Raycaster();
    this.fx = new THREE.Group();
    this.scene.add(this.fx);
    this._bind();
    new ResizeObserver(() => this.resize()).observe(host);
    this.visible = false;
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.visible) return;
      this.controls.update();
      const t = performance.now() / 1000;
      for (const [i, b] of this.fx.children.entries()) {
        if (b.userData.cone) { b.position.y = b.userData.y0 + b.userData.dir * Math.sin(t * 3 + i) * 0.8; b.rotation.y = t * 1.5; }
      }
      const k = 0.5 + 0.5 * Math.sin(t * 4);
      for (const ref of this.selected) {
        const p = this.parts.get(ref);
        if (p) for (const m of p.mats) m.emissive?.setRGB(0.35 + 0.35 * k, 0.02, 0.04);
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Small procedural environment so metals look metallic without external HDR files. */
  envMap() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#9a9aa2'); gr.addColorStop(0.55, '#3a3a40'); gr.addColorStop(1, '#141416');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
    x.fillStyle = 'rgba(255,240,210,0.9)'; x.fillRect(60, 30, 120, 40); x.fillRect(330, 50, 90, 30);
    const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
    this.scene.environment = pm.fromScene(s, 0.02).texture;
    this.scene.environmentIntensity = 0.55;
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
    if (this.board) this.setBoard(this.board, true);
  }

  /** Paint one side of the board into a texture (board mm → px). */
  sideTexture(side) {
    const b = this.board;
    const [x0, y0, x1, y1] = b.bounds;
    const W = x1 - x0, H = y1 - y0;
    const ppm = Math.min(28, Math.min(4096, this.renderer.capabilities.maxTextureSize || 4096) / Math.max(W, H));
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * ppm); c.height = Math.ceil(H * ppm);
    const ctx = c.getContext('2d');
    try { paintSide(ctx, b, side, (x, y) => [(x - x0) * ppm, (y - y0) * ppm], ppm, this.theme, { mirrorView: false }); }
    catch (e) { console.warn('[TESR 3D] paint', side, e); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    // shape UVs are (x - cx, -(y - cy)) → map board bounds onto [0, 1]
    tex.repeat.set(1 / W, 1 / H);
    tex.offset.set(-(x0 - this.cx) / W, (y1 - this.cy) / H);
    return tex;
  }

  setBoard(board, keepCamera = false) {
    this.board = board;
    for (const c of [...this.group.children]) { this.group.remove(c); c.traverse?.((o) => o.geometry?.dispose?.()); }
    this.parts.clear(); this.pickables = [];
    if (!board?.outline) return;
    const [x0, y0, x1, y1] = board.bounds;
    this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
    const T = board.thickness || 1.6;
    this.T = T;
    const P = (x, y) => new THREE.Vector2(x - this.cx, -(y - this.cy));

    // ---- board body: outline + cut-outs + plated / mounting holes ----
    const shape = new THREE.Shape(board.outline.map(([x, y]) => P(x, y)));
    for (const h of board.holes || []) shape.holes.push(new THREE.Path(h.map(([x, y]) => P(x, y))));
    for (const fp of board.footprints) for (const pd of fp.pads) {
      if (!pd.drill) continue;
      const r = Math.min(pd.drill[0], pd.drill[1]) / 2;
      if (r < 0.2) continue;
      const path = new THREE.Path(); path.absarc(pd.x - this.cx, -(pd.y - this.cy), r, 0, Math.PI * 2, true);
      shape.holes.push(path);
    }
    const C = THEMES[this.theme] || THEMES.black;
    const body = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 20 });
    body.rotateX(-Math.PI / 2);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8c8466, roughness: 0.9 });
    const coreMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.mask), roughness: 0.6 });
    this.group.add(new THREE.Mesh(body, [coreMat, edgeMat]));

    // ---- painted top / bottom surfaces ----
    const face = new THREE.ShapeGeometry(shape, 20);
    face.rotateX(-Math.PI / 2);
    const topMat = new THREE.MeshStandardMaterial({ map: this.sideTexture('F'), roughness: 0.5, metalness: 0.0, envMapIntensity: 0.15 });
    const top = new THREE.Mesh(face, topMat); top.position.y = T + 0.003;
    const botMat = new THREE.MeshStandardMaterial({ map: this.sideTexture('B'), roughness: 0.5, metalness: 0.0, envMapIntensity: 0.15, side: THREE.BackSide });
    const bot = new THREE.Mesh(face.clone(), botMat); bot.position.y = -0.003;
    this.group.add(top, bot);

    // ---- pads (ENIG gold) + plated barrels ----
    const padMat = new THREE.MeshStandardMaterial({ color: 0xe0c070, metalness: 0.9, roughness: 0.28 });
    const items = [];
    for (const fp of board.footprints) for (const pd of fp.pads) {
      if (pd.front) items.push([pd, 'F']);
      if (pd.back) items.push([pd, 'B']);
    }
    const mk = (geo, list) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, padMat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      list.forEach(([p, side], i) => {
        t.set(p.x - this.cx, side === 'F' ? T + 0.02 : -0.02, p.y - this.cy);
        q.setFromAxisAngle(up, (p.rot * Math.PI) / 180);
        sc.set(p.w, 1, p.h);
        m.compose(t, q, sc); im.setMatrixAt(i, m);
      });
      this.group.add(im);
    };
    mk(new THREE.BoxGeometry(1, 0.035, 1), items.filter(([p]) => p.shape !== 'circle' && p.shape !== 'oval'));
    mk(new THREE.CylinderGeometry(0.5, 0.5, 0.035, 24), items.filter(([p]) => p.shape === 'circle'));
    // ovals → capsule-ish: cylinder stretched
    mk(new THREE.CylinderGeometry(0.5, 0.5, 0.035, 24), items.filter(([p]) => p.shape === 'oval'));
    // dark drill holes on top of plated pads
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
    const holes = board.footprints.flatMap((fp) => fp.pads.filter((p) => p.drill));
    if (holes.length) {
      const hg = new THREE.CylinderGeometry(0.5, 0.5, T + 0.1, 20);
      const im = new THREE.InstancedMesh(hg, holeMat, holes.length);
      const m = new THREE.Matrix4();
      holes.forEach((p, i) => { m.makeScale(p.drill[0], 1, p.drill[1]); m.setPosition(p.x - this.cx, T / 2, p.y - this.cy); im.setMatrixAt(i, m); });
      this.group.add(im);
    }

    // ---- components ----
    for (const fp of board.footprints) {
      if (!fp.ref || !isFinite(fp.x)) continue;
      let part = null;
      try { part = buildPart(fp); } catch (e) { console.warn('[TESR 3D] part', fp.ref, e); }
      if (!part) continue;
      const g = part.group;
      g.position.set(fp.x - this.cx, fp.side === 'F' ? T + 0.035 : -0.035, fp.y - this.cy);
      g.rotation.y = (fp.rot * Math.PI) / 180;
      if (fp.side === 'B') g.scale.y = -1;
      this.group.add(g);
      part.fp = fp;
      for (const m of part.mats) m.userData.base = m.emissive ? m.emissive.getHex() : 0;
      this.parts.set(fp.ref, part);
      g.traverse((o) => { if (o.isMesh) { o.userData.fp = fp; this.pickables.push(o); } });
    }
    this.size = Math.max(x1 - x0, y1 - y0);
    this.applyState();
    if (!keepCamera) this.view('iso');
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
    for (const [ref, p] of this.parts) {
      const sel = this.selected.has(ref), pl = this.placed.has(ref);
      for (const m of p.mats) {
        if (!m.emissive) continue;
        if (sel) m.emissive.setHex(0x6a0008);
        else if (pl) m.emissive.setHex(0x0f6a30);
        else m.emissive.setHex(m.userData.base || 0);
      }
    }
    for (const b of [...this.fx.children]) { this.fx.remove(b); b.geometry?.dispose(); }
    const coneGeo = new THREE.ConeGeometry(0.9, 2.4, 4);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, emissive: 0x6b5520, metalness: 0.6, roughness: 0.3 });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc9a84c });
    for (const ref of this.selected) {
      const p = this.parts.get(ref);
      if (!p) continue;
      const box = new THREE.Box3().setFromObject(p.group);
      const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const top = p.fp.side === 'F';
      // gold outline box
      const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.4, size.y + 0.2, size.z + 0.4));
      const outline = new THREE.LineSegments(eg, lineMat);
      outline.position.copy(ctr);
      this.fx.add(outline);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      const y = top ? box.max.y + 3.2 : box.min.y - 3.2;
      cone.position.set(ctr.x, y, ctr.z);
      cone.rotation.x = top ? Math.PI : 0;
      cone.userData = { cone: true, y0: y, dir: top ? 1 : -1 };
      this.fx.add(cone);
    }
  }

  _hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const h = this.ray.intersectObjects(this.pickables, false)[0];
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
