// TESR BOM Viewer — version + change log (shown in the app header / "What's new")
export const VERSION = '1.10';
export const BUILD_DATE = '2026-11-06';

export const CHANGELOG = [
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
