// TESR BOM Viewer — UI strings (Thai / English)
export const STR = {
  th: {
    noBoard: 'ยังไม่ได้เปิดบอร์ด', placed: 'วางแล้ว', sourced: 'หยิบของแล้ว', open: 'เปิดไฟล์', demo: 'ตัวอย่าง',
    filterPh: 'กรอง: value / ref / MPN / LCSC', hidePlaced: 'ซ่อนที่วางครบ', showAll: 'แสดงทั้งหมด',
    thSourced: 'หยิบ', thPlaced: 'วาง', thRefs: 'Refs', thValue: 'Value', thFootprint: 'Footprint', thQty: 'Qty',
    dropHint: 'ลากไฟล์ <b>.kicad_pcb</b> (และ BOM <b>.csv</b> ถ้ามี) มาวางที่นี่<br>หรือกด <b>ตัวอย่าง</b> เพื่อลองกับบอร์ด TESR Pincer V2',
    scanKicker: 'สแกนถุงอะไหล่ · QR / DataMatrix / Barcode', readyTitle: 'พร้อมสแกน', readySub: 'เปิดกล้อง แล้วส่องฉลากถุง LCSC / DigiKey / Mouser',
    defaultCam: 'กล้องเริ่มต้น', startCam: 'เปิดกล้อง', stopCam: 'ปิดกล้อง', photo: 'รูปภาพ', codePh: 'พิมพ์ / ยิงบาร์โค้ด: C8734, MPN, R25…', find: 'หา',
    selection: 'รายการที่เลือก', selectHint: 'คลิกแถวในตาราง คลิกชิ้นส่วนบนบอร์ด หรือสแกนฉลาก',
    placeAll: 'วางครบทั้งแถว ✓', unplaceAll: 'ยกเลิกการวางทั้งแถว', next: 'ถัดไป ▸', history: 'ประวัติการสแกน',
    offline: 'ทำงานในเบราว์เซอร์ 100% — ไม่ส่งไฟล์/ภาพขึ้นคลาวด์', settings: 'ตั้งค่า', lang: 'ภาษา', maskColor: 'สี PCB',
    autoSource: 'สแกนเจอ → ติ๊ก "หยิบแล้ว" อัตโนมัติ', beep: 'เสียงบี๊บเมื่อสแกน', showRefs: 'แสดงชื่อ Ref บนบอร์ด 2D',
    nonBom: 'แสดงชิ้นที่ไม่อยู่ใน BOM (รูยึด, โลโก้, jumper)', export: 'Export checklist (.csv)', reset: 'ล้างสถานะบอร์ดนี้', close: 'ปิด',
    help: '<b>คีย์ลัด</b>: ↑ / ↓ เลือกแถว · Space = วางชิ้นถัดไปของแถว · / = โฟกัสช่องรหัส · Esc = ยกเลิกเลือก<br><b>รองรับฉลาก</b>: LCSC / JLCPCB (QR), DigiKey / Mouser / Arrow (DataMatrix ECIA), บาร์โค้ด 1P / P, หรือพิมพ์ LCSC / MPN / Ref / Value เอง<br><b>เครื่องยิงบาร์โค้ด USB</b>: ยิงได้เลยแม้ไม่ได้คลิกช่อง<br><b>ไฟล์</b>: .kicad_pcb (KiCad 6–9) + BOM .csv (JLCPCB / KiCad) เพื่อเติม LCSC / MPN · หรือ BOM + CPL .csv อย่างเดียวก็ได้',
    dropTitle: 'วางไฟล์ที่นี่', found: 'เจอ', notFound: 'ไม่พบใน BOM', loaded: 'เปิดแล้ว', merged: 'รวม BOM แล้ว', refsMerged: 'ชิ้น',
    parts: 'ชิ้น', lines: 'รายการ', side: 'ด้าน', top: 'บน', bottom: 'ล่าง', camErr: 'เปิดกล้องไม่ได้', noCode: 'ไม่พบโค้ดในภาพ',
    resetQ: 'ล้างสถานะ หยิบ/วาง ของบอร์ดนี้?', allDone: 'วางครบทุกชิ้นแล้ว 🎉', manual: 'พิมพ์', placedMsg: 'วางแล้ว', qty: 'จำนวน',
    clickToPlace: 'คลิก Ref เพื่อติ๊กว่าวางแล้ว', notInBom: 'ไม่อยู่ใน BOM',
  },
  en: {
    noBoard: 'No board loaded', placed: 'Placed', sourced: 'Sourced', open: 'Open', demo: 'Demo',
    filterPh: 'Filter: value / ref / MPN / LCSC', hidePlaced: 'Hide done', showAll: 'Show all',
    thSourced: 'Src', thPlaced: 'Placed', thRefs: 'Refs', thValue: 'Value', thFootprint: 'Footprint', thQty: 'Qty',
    dropHint: 'Drop a <b>.kicad_pcb</b> (and optional BOM <b>.csv</b>) here<br>or press <b>Demo</b> to try the TESR Pincer V2 board',
    scanKicker: 'Scan part bags · QR / DataMatrix / Barcode', readyTitle: 'Ready at your bench', readySub: 'Start the camera and show an LCSC / DigiKey / Mouser bag label',
    defaultCam: 'Default camera', startCam: 'Start camera', stopCam: 'Stop camera', photo: 'Photo', codePh: 'Type / scan: C8734, MPN, R25…', find: 'Find',
    selection: 'Selection', selectHint: 'Click a table row, click a part on the board, or scan a label',
    placeAll: 'Mark line placed ✓', unplaceAll: 'Unmark line', next: 'Next ▸', history: 'Scan history',
    offline: '100% in-browser — files and camera images never leave this device', settings: 'Settings', lang: 'Language', maskColor: 'PCB colour',
    autoSource: 'Scan match → tick "Sourced" automatically', beep: 'Beep on scan', showRefs: 'Show reference labels in 2D',
    nonBom: 'Show non-BOM parts (holes, logos, jumpers)', export: 'Export checklist (.csv)', reset: 'Reset this board', close: 'Close',
    help: '<b>Keys</b>: ↑ / ↓ select line · Space = place next part of the line · / = focus code box · Esc = clear<br><b>Labels</b>: LCSC / JLCPCB (QR), DigiKey / Mouser / Arrow (ECIA DataMatrix), 1P / P barcodes, or type an LCSC / MPN / ref / value<br><b>USB barcode scanners</b> work without focusing the box<br><b>Files</b>: .kicad_pcb (KiCad 6–9) + BOM .csv (JLCPCB / KiCad) to add LCSC / MPN · or BOM + CPL .csv only',
    dropTitle: 'Drop files here', found: 'Found', notFound: 'Not in BOM', loaded: 'Loaded', merged: 'BOM merged', refsMerged: 'parts',
    parts: 'parts', lines: 'lines', side: 'Side', top: 'Top', bottom: 'Bottom', camErr: 'Camera error', noCode: 'No code found in image',
    resetQ: 'Clear sourced / placed state for this board?', allDone: 'All parts placed 🎉', manual: 'typed', placedMsg: 'Placed', qty: 'Qty',
    clickToPlace: 'Click a ref to tick it as placed', notInBom: 'Not in BOM',
  },
};

let lang = 'th';
export const t = (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k;
export function setLang(l) {
  lang = STR[l] ? l : 'th';
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
}
export const getLang = () => lang;
