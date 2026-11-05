// TESR BOM Viewer — label decoding (LCSC / DigiKey / Mouser / generic) + matching + camera scanner
// Made by TESR — Thai Embedded System and Robotics

const GS = /[\x1d\x1e\x04]/;

/** Normalise a part code for comparison. */
export const norm = (s) => String(s || '').toUpperCase().replace(/[\s_]/g, '').replace(/[‐‑–—]/g, '-');

/**
 * Parse a scanned / typed string into candidate codes.
 * Returns { source, raw, lcsc, mpn, supplierPn, qty, tokens[] }
 */
export function parseLabel(raw) {
  const text = String(raw || '').trim();
  const out = { source: 'Text', raw: text, lcsc: '', mpn: '', supplierPn: '', qty: null, tokens: [] };
  if (!text) return out;

  // --- LCSC / JLCPCB bag QR: {pbn:PICK..,on:WM..,pc:C2040,pm:CL10A106KP8NNNC,qty:10,...}
  if (/(^|[{,])\s*pc\s*:/i.test(text) || /(^|[{,])\s*pm\s*:/i.test(text)) {
    const get = (k) => { const m = new RegExp(`(?:^|[{,])\\s*${k}\\s*:\\s*([^,}]*)`, 'i').exec(text); return m ? m[1].trim() : ''; };
    out.source = 'LCSC';
    out.lcsc = get('pc');
    out.mpn = get('pm');
    const q = parseInt(get('qty'), 10);
    if (!isNaN(q)) out.qty = q;
    out.tokens = [out.lcsc, out.mpn].filter(Boolean);
    return out;
  }

  // --- ECIA / ANSI MH10.8.2 2D labels (DigiKey, Mouser, Arrow, Farnell…): [)>RS06GS P…GS 1P…GS Q…
  const ecia = /^\[\)>/.test(text) || GS.test(text);
  if (ecia) {
    const fields = text.replace(/^\[\)>\s*[\x1e]?\s*(06|05)?/, '').split(GS).map((f) => f.trim()).filter(Boolean);
    out.source = 'ECIA';
    for (const f of fields) {
      const m = /^(\d{0,3}[A-Z])(.*)$/.exec(f);
      if (!m) continue;
      const [, di, v] = m;
      if (di === '1P') out.mpn = v;
      else if (di === 'P' || di === '30P') { if (!out.supplierPn || di === '30P') out.supplierPn = v; }
      else if (di === 'Q') out.qty = parseInt(v, 10);
      else if (di === '1K' || di === 'K' || di === '10K' || di === '11K') { /* order / invoice numbers – ignored */ }
    }
    if (/-ND$/i.test(out.supplierPn)) out.source = 'DigiKey';
    else if (/^\d{2,3}-/.test(out.supplierPn)) out.source = 'Mouser';
    out.tokens = [out.mpn, out.supplierPn].filter(Boolean);
    if (out.tokens.length) return out;
  }

  // --- single 1-D barcode with a data identifier (Mouser / DigiKey 1D labels)
  let m = /^1P(.+)$/.exec(text);
  if (m) { out.source = 'Barcode'; out.mpn = m[1].trim(); out.tokens = [out.mpn]; return out; }
  m = /^(?:30)?P(\d{2,4}-.+|.+-ND)$/.exec(text);
  if (m) { out.source = 'Barcode'; out.supplierPn = m[1].trim(); out.tokens = [out.supplierPn]; return out; }
  if (/^Q\d+$/.test(text)) { out.source = 'Barcode'; out.qty = parseInt(text.slice(1), 10); return out; }

  // --- plain LCSC number
  m = /^C\d{3,9}$/i.exec(text);
  if (m) { out.source = 'LCSC'; out.lcsc = text.toUpperCase(); out.tokens = [out.lcsc]; return out; }

  // --- generic text: whole string + tokens
  out.tokens = [text, ...text.split(/[\s,;|]+/).filter((t) => t.length >= 2 && t !== text)];
  return out;
}

/**
 * Score BOM groups against a parsed label. Returns [{group, score, why}] sorted best-first.
 */
export function matchGroups(label, groups) {
  const res = [];
  const L = norm(label.lcsc), M = norm(label.mpn), S = norm(label.supplierPn);
  const toks = label.tokens.map(norm).filter(Boolean);
  for (const g of groups) {
    let score = 0, why = '';
    const gl = norm(g.lcsc), gm = norm(g.mpn), gd = norm(g.digikey), gmo = norm(g.mouser), gv = norm(g.value);
    const take = (s, w) => { if (s > score) { score = s; why = w; } };
    if (L && gl && L === gl) take(100, 'LCSC');
    if (M && gm && M === gm) take(96, 'MPN');
    if (S && (S === gd || S === gmo)) take(94, 'Supplier PN');
    if (M && gm && M.length >= 6 && gm.length >= 6 && (M.startsWith(gm) || gm.startsWith(M))) take(78, 'MPN≈');
    for (const t of toks) {
      if (gl && t === gl) take(100, 'LCSC');
      if (gm && t === gm) take(95, 'MPN');
      if ((gd && t === gd) || (gmo && t === gmo)) take(93, 'Supplier PN');
      if (g.refs.some((r) => norm(r) === t)) take(90, 'Ref');
      if (gm && t.length >= 6 && gm.length >= 6 && (t.startsWith(gm) || gm.startsWith(t))) take(76, 'MPN≈');
      if (gv && t === gv) take(60, 'Value');
      if (t.length >= 3 && (gm.includes(t) || gl.includes(t) || gv.includes(t) || norm(g.footprint).includes(t))) take(35, 'Text');
    }
    if (score) res.push({ group: g, score, why });
  }
  res.sort((a, b) => b.score - a.score);
  if (!res.length) return [];
  const best = res[0].score;
  return res.filter((r) => r.score >= Math.max(best - 5, 30) && (best < 60 ? true : r.score >= 60));
}

// ------------------------------------------------------------- camera ----

let zxingReady = null;
function loadZxing() {
  if (zxingReady) return zxingReady;
  zxingReady = new Promise((resolve, reject) => {
    if (window.ZXingWASM) return resolve(window.ZXingWASM);
    const s = document.createElement('script');
    s.src = 'vendor/zxing/zxing-reader.iife.js';
    s.onload = () => {
      const Z = window.ZXingWASM;
      const base = new URL('vendor/zxing/', document.baseURI).href;
      Z.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? base + path : prefix + path) }, fireImmediately: true });
      resolve(Z);
    };
    s.onerror = () => reject(new Error('Cannot load barcode decoder'));
    document.head.appendChild(s);
  });
  return zxingReady;
}

const READ_OPTS = {
  formats: ['QRCode', 'DataMatrix', 'MicroQRCode', 'PDF417', 'Aztec', 'Code128', 'Code39', 'Code93', 'EAN-13', 'UPC-A'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  maxNumberOfSymbols: 4,
  textMode: 'Plain',
};

export async function decodeImageData(imageData) {
  const Z = await loadZxing();
  const r = await Z.readBarcodes(imageData, READ_OPTS);
  return r.filter((x) => x.isValid && x.text);
}

export async function decodeFile(file) {
  const Z = await loadZxing();
  const r = await Z.readBarcodes(file, READ_OPTS);
  return r.filter((x) => x.isValid && x.text);
}

export class CameraScanner {
  constructor(video, overlay, onResult) {
    this.video = video;
    this.overlay = overlay;
    this.onResult = onResult;
    this.stream = null;
    this.running = false;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.lastText = '';
    this.lastTime = 0;
  }

  static async listCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === 'videoinput');
  }

  async start(deviceId) {
    await this.stop();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available (needs HTTPS or localhost)');
    loadZxing();
    const constraints = {
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.loop();
  }

  async stop() {
    this.running = false;
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.video.srcObject = null;
    this.clearOverlay();
  }

  clearOverlay() {
    const o = this.overlay;
    if (!o) return;
    o.getContext('2d').clearRect(0, 0, o.width, o.height);
  }

  async loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth) {
      const scale = Math.min(1, 1280 / v.videoWidth);
      const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
      if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = h; }
      this.ctx.drawImage(v, 0, 0, w, h);
      try {
        const res = await decodeImageData(this.ctx.getImageData(0, 0, w, h));
        this.drawOverlay(res, w, h);
        const now = performance.now();
        for (const r of res) {
          if (r.text === this.lastText && now - this.lastTime < 2500) continue;
          this.lastText = r.text; this.lastTime = now;
          this.onResult(r.text, r.format);
        }
      } catch (e) { /* decoder still loading */ }
    }
    setTimeout(() => requestAnimationFrame(() => this.loop()), 120);
  }

  drawOverlay(res, w, h) {
    const o = this.overlay;
    if (!o) return;
    if (o.width !== w) { o.width = w; o.height = h; }
    const c = o.getContext('2d');
    c.clearRect(0, 0, w, h);
    c.lineWidth = Math.max(3, w / 250);
    for (const r of res) {
      const p = r.position;
      c.strokeStyle = '#C9A84C';
      c.fillStyle = 'rgba(139,0,0,0.25)';
      c.beginPath();
      c.moveTo(p.topLeft.x, p.topLeft.y); c.lineTo(p.topRight.x, p.topRight.y);
      c.lineTo(p.bottomRight.x, p.bottomRight.y); c.lineTo(p.bottomLeft.x, p.bottomLeft.y); c.closePath();
      c.fill(); c.stroke();
    }
  }
}

/** Short confirmation beep (WebAudio, no files). */
let actx = null;
export function beep(ok = true) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square';
    o.frequency.value = ok ? 1760 : 330;
    g.gain.setValueAtTime(0.06, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (ok ? 0.09 : 0.25));
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + (ok ? 0.1 : 0.26));
  } catch (e) { /* audio blocked */ }
}
