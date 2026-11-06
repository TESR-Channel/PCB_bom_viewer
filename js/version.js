// TESR BOM Viewer — version + change log (shown in the app header / "What's new")
export const VERSION = '1.30';
export const BUILD_DATE = '2026-11-06';

export const CHANGELOG = [
  {
    v: '1.30', date: '2026-11-06',
    th: [
      'แผง "เลเยอร์" (ปุ่ม ≡ เลเยอร์ หรือกด L): เปิด/ปิดทีละเลเยอร์ — ทองแดงบน / ล่าง / ชั้นใน, ซิลค์สกรีน, โซลเดอร์มาสก์, ครีมตะกั่ว (Paste), Fab, Courtyard, ขอบบอร์ด (Edge.Cuts), รูเจาะ, เลเยอร์ผู้ใช้',
      'โหมดแสดงผล 2 แบบ: "สมจริง" (เหมือนบอร์ดจริง ปิดมาสก์แล้วเห็นทองแดง/FR-4) และ "สีเลเยอร์ (CAD)" แบบ KiCad / Gerber viewer',
      'ชุดมุมมองสำเร็จรูป: งานประกอบ · ทั้งหมด · ด้านบน · ด้านล่าง · ทองแดง · ซิลค์สกรีน · มาสก์ + Paste · กลไก',
      'เลือกเลเยอร์ + High contrast, ดับเบิลคลิกเพื่อดูเลเยอร์เดียว, ปรับความทึบ, ตัวกรองวัตถุ (Pad / Via / Track / Zone / ตัวหนังสือ / ชิ้นส่วน / Ref)',
      'บอร์ด 3D ปิด/เปิดเลเยอร์และชิ้นส่วนได้เหมือน 2D · แสดงพิกัด X / Y (mm) ใต้เมาส์',
      'อ่าน Gerber ทุกเลเยอร์รวมถึง polarity (LPC) และทองแดงชั้นใน · รูเจาะแยก PTH / NPTH / Via',
    ],
    en: [
      '"Layers" panel (Layers button or press L): show / hide each layer — top / bottom / inner copper, silkscreen, solder mask, paste, fab, courtyard, board outline (Edge.Cuts), drills, user layers',
      'Two looks: "Realistic" (like the real board; hide the mask to see bare copper / FR-4) and "Layer colours (CAD)" like KiCad / a Gerber viewer',
      'Presets: Assembly · All · Top · Bottom · Copper · Silkscreen · Mask + paste · Mechanical',
      'Select a layer + high contrast, double-click to show one layer only, opacity slider, object filters (pads / vias / tracks / zones / texts / components / refs)',
      '3D board follows the layer and component switches · cursor X / Y (mm) readout',
      'Every Gerber layer is read incl. clear polarity (LPC) and inner copper · drills split into PTH / NPTH / via',
    ],
  },
  {
    v: '1.20', date: '2026-11-06',
    th: [
      'โมเดล 3D ละเอียดขึ้นมาก: R/C มีขั้วโลหะ, IC มีขา gull-wing + จุด pin 1 + ตัวหนังสือบนตัวชิป, ตัวเก็บประจุอิเล็กโทรไลต์, คริสตัล, ตัวเหนี่ยวนำ, USB-C, pin header / socket, JST, M8',
      'บอร์ด 3D แสดงลายทองแดง (track / zone / via) ใต้ solder mask, silkscreen ตัวหนา, โลโก้ และตัวหนังสือ ทั้งด้านบนและด้านล่าง',
      'บอร์ด 2D แสดงลายทองแดง + ตัวหนังสือ silkscreen จากไฟล์ KiCad / Gerber · วาดเร็วขึ้น (cache)',
      'ปุ่มมุมมอง 3D "BOTTOM"',
    ],
    en: [
      'Much more detailed 3D parts: R/C end caps, gull-wing IC leads + pin-1 dimple + top marking, electrolytics, crystals, inductors, USB-C, pin headers / sockets, JST, M8',
      '3D board shows copper (tracks / zones / vias) under the solder mask, thick silkscreen, logos and texts on both sides',
      '2D board shows copper + silkscreen texts from KiCad / Gerber · faster redraw (cached)',
      '3D view button renamed "BOTTOM"',
    ],
  },
  {
    v: '1.10', date: '2026-11-06',
    th: [
      'หน้าต่าง "เปิดไฟล์" แบบมีคำแนะนำ: บอกชัดว่าแต่ละไฟล์ใช้ทำอะไร (BOM → ตาราง, CPL → ตำแหน่ง, Gerber → ภาพบอร์ด 2D/3D)',
      'เปิดชุดไฟล์สั่งงาน JLCPCB ได้ครบ: BOM + CPL + Gerber .zip → ได้ภาพ 2D / 3D โดยไม่ต้องมีไฟล์ KiCad (ใช้กับ EasyEDA / Altium ได้)',
      'อ่าน Gerber (RS-274X) + Drill (Excellon) ในเบราว์เซอร์: รูปร่างบอร์ด, pad, รู, silkscreen',
      'จัดตำแหน่ง CPL ให้ตรงกับ Gerber อัตโนมัติ',
      'รองรับ BOM / CPL แบบ .xlsx และหน่วย mm / mil',
      'ตัวอย่างใหม่: ชุดไฟล์ JLCPCB ของ TESR Pincer V2',
      'แสดงเลขเวอร์ชัน + หน้า "มีอะไรใหม่"',
    ],
    en: [
      'Guided "Open files" dialog explaining what each file is for (BOM → table, CPL → positions, Gerber → 2D/3D board)',
      'Full JLCPCB order set support: BOM + CPL + Gerber .zip gives 2D / 3D without a KiCad file (works for EasyEDA / Altium)',
      'In-browser Gerber (RS-274X) + Excellon drill reader: outline, pads, holes, silkscreen',
      'Automatic CPL ↔ Gerber origin alignment',
      'BOM / CPL as .xlsx, mm / mil units',
      'New demo: TESR Pincer V2 JLCPCB order files',
      'Version badge + "What\'s new" panel',
    ],
  },
  {
    v: '1.00', date: '2026-11-06',
    th: [
      'เปิด .kicad_pcb (KiCad 6–9) + BOM .csv',
      'สแกนฉลาก LCSC (QR) / DigiKey / Mouser (DataMatrix) / บาร์โค้ด ผ่านเว็บแคม กล้องมือถือ หรือรูปภาพ',
      'พิมพ์รหัสเอง / เครื่องยิงบาร์โค้ด USB / คลิกเลือกจากตาราง บอร์ด 2D และ 3D',
      'เช็กลิสต์หยิบ / วาง บันทึกในเครื่อง + Export CSV · ธีม TESR · ไทย / English',
    ],
    en: [
      'Open .kicad_pcb (KiCad 6–9) + BOM .csv',
      'Scan LCSC (QR) / DigiKey / Mouser (DataMatrix) / barcodes from webcam, phone camera or photo',
      'Type codes / USB barcode scanner / click in table, 2D and 3D board',
      'Sourced / placed checklist saved locally + CSV export · TESR theme · Thai / English',
    ],
  },
];
