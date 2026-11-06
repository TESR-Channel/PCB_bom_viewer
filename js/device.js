// TESR BOM Viewer — device detection: phone / tablet / desktop, OS name, orientation, touch
// The layout is chosen from the device *and* the current viewport, and re-evaluated on rotate / resize.
// Made by TESR — Thai Embedded System and Robotics

export function detectDevice() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = nav.userAgent || '';
  const touchPts = nav.maxTouchPoints || 0;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const w = window.innerWidth, h = window.innerHeight;
  const sw = Math.min(screen.width || w, screen.height || h), sl = Math.max(screen.width || w, screen.height || h);

  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPts > 1); // iPadOS 13+ reports "Macintosh"
  const iPhone = /iPhone|iPod/.test(ua);
  const android = /Android/i.test(ua);
  const androidPhone = android && /Mobile/i.test(ua);
  const otherTablet = /Tablet|Silk|Kindle|PlayBook|SM-T\d|Tab\b/i.test(ua) || (android && !androidPhone);
  const otherPhone = /Windows Phone|IEMobile|Opera Mini|Mobi/i.test(ua) && !iPad && !otherTablet;

  let kind;
  if (iPhone || androidPhone || otherPhone) kind = 'phone';
  else if (iPad || otherTablet) kind = 'tablet';
  else if (coarse && !fine) kind = sw < 600 ? 'phone' : 'tablet'; // unknown touch-only device: decide by screen size
  else kind = 'desktop';

  let name;
  if (iPhone) name = 'iPhone';
  else if (iPad) name = 'iPad';
  else if (androidPhone) name = 'Android phone';
  else if (android) name = 'Android tablet';
  else if (/Windows/i.test(ua)) name = 'PC (Windows)';
  else if (/Macintosh|Mac OS X/.test(ua)) name = 'Mac';
  else if (/CrOS/.test(ua)) name = 'Chromebook';
  else if (/Linux/i.test(ua)) name = 'PC (Linux)';
  else name = kind === 'phone' ? 'Phone' : kind === 'tablet' ? 'Tablet' : 'Computer';

  return {
    kind, name,
    touch: coarse || touchPts > 0,
    orientation: w >= h ? 'landscape' : 'portrait',
    width: w, height: h, screenShort: sw, screenLong: sl,
  };
}

/**
 * Layout for a device + viewport. `force` = user override ('auto' | 'desktop' | 'tablet' | 'phone').
 * A narrow window falls back to a smaller layout (e.g. a half-screen PC window gets the tablet layout).
 */
export function pickLayout(dev, force = 'auto') {
  if (force && force !== 'auto') return force;
  const w = dev.width;
  if (dev.kind === 'phone') return w >= 900 && dev.orientation === 'landscape' ? 'tablet' : 'phone'; // big phones sideways
  if (w < 640) return 'phone';
  if (dev.kind === 'tablet') return 'tablet';
  return w < 1100 ? 'tablet' : 'desktop';
}
