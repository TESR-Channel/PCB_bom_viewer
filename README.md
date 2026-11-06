<p align="center">
  <a href="https://www.tesrshop.com"><img src="assets/tesr_logo.png" width="110" alt="TESR"></a>
</p>

<h1 align="center">TESR BOM Viewer <sub>v1.30</sub></h1>
<p align="center"><b>จากถุงอะไหล่ → ตำแหน่งบนบอร์ด</b> · From the bag to the board</p>

<p align="center">
  <a href="https://tesr-channel.github.io/PCB_bom_viewer/"><b>▶ เปิดใช้งานบนเว็บ / Open the web app</b></a> ·
  <a href="https://tesr-channel.github.io/PCB_bom_viewer/?demo=1">ตัวอย่าง KiCad</a> ·
  <a href="https://tesr-channel.github.io/PCB_bom_viewer/?demo=jlc">ตัวอย่างไฟล์ JLCPCB</a> ·
  <a href="https://www.tesrshop.com">tesrshop.com</a>
</p>

---

เครื่องมือช่วยประกอบ PCB ด้วยมือ — เปิดไฟล์ KiCad แล้ว **สแกนฉลากถุงอะไหล่ (LCSC / DigiKey / Mouser) ด้วยเว็บแคมหรือกล้องมือถือ** โปรแกรมจะไฮไลต์ว่าชิ้นนั้นต้องวางตรงไหนบนบอร์ดทันที หรือจะ **พิมพ์รหัสเอง** / **คลิกแถวในตาราง** / **คลิกชิ้นส่วนบนภาพบอร์ด 2D หรือ 3D** ก็ได้ทุกทาง

ทำงานในเบราว์เซอร์ 100% — ไม่มีเซิร์ฟเวอร์ ไม่ส่งไฟล์หรือภาพจากกล้องขึ้นคลาวด์

## ความสามารถ

| | |
|---|---|
| 📂 **เปิดไฟล์** | `.kicad_pcb` (KiCad 6 / 7 / 8 / 9) ลากวางได้เลย · เติม LCSC / MPN จาก BOM `.csv` (JLCPCB / KiCad) · หรือใช้ BOM + CPL `.csv` อย่างเดียวก็ได้ |
| 📷 **สแกน** | QR (LCSC / JLCPCB), DataMatrix ECIA (DigiKey / Mouser / Arrow), Code128 / 1D (`1P…`, `P…`) ผ่านเว็บแคม กล้องมือถือ หรือรูปถ่าย |
| ⌨️ **พิมพ์ / ยิงบาร์โค้ด** | พิมพ์ LCSC (`C8734`), MPN, Ref (`R25`), Value (`10k`) · รองรับเครื่องยิงบาร์โค้ด USB โดยไม่ต้องคลิกช่อง |
| 🖱️ **คลิกเลือก** | ตาราง BOM ↔ บอร์ด 2D (บน / ล่าง / สองด้าน) ↔ บอร์ด 3D (หมุน ซูม คลิกชิ้นส่วน) ซิงค์กันทั้งหมด |
| 🗂️ **ดูเลเยอร์** | แผงเลเยอร์ (กด `L`): เปิด/ปิด ทองแดงบน/ล่าง/ชั้นใน, ซิลค์สกรีน, โซลเดอร์มาสก์, Paste, Fab, Courtyard, Edge.Cuts, รูเจาะ, เลเยอร์ผู้ใช้ · โหมด **สมจริง** / **สีเลเยอร์ (CAD)** · ชุดมุมมอง ด้านบน / ด้านล่าง / ทองแดง / กลไก ฯลฯ · ดับเบิลคลิกดูเลเยอร์เดียว · High contrast · ใช้กับ 2D และ 3D |
| ✅ **เช็กลิสต์** | ติ๊ก "หยิบแล้ว" / "วางแล้ว" รายชิ้น · แถบความคืบหน้า · บันทึกอัตโนมัติในเครื่อง · Export `.csv` |
| 🎨 **ธีม TESR** | ดำ / แดงเข้ม / ทอง · ภาษาไทย / English · PCB สีดำ / เขียว / ขาว |

## ต้องใช้ไฟล์อะไร?

กด **เปิดไฟล์** ในเว็บ จะมีหน้าต่างบอกให้ใส่ทีละช่อง — เลือกทางใดทางหนึ่ง

**A. ไฟล์ KiCad (ง่ายสุด)**

| ไฟล์ | ใช้ทำอะไร | |
|---|---|---|
| `.kicad_pcb` | ตาราง BOM + บอร์ด 2D + 3D ครบในไฟล์เดียว | จำเป็น |
| BOM `.csv` / `.xlsx` | เติมเลข LCSC / MPN (ถ้าไม่ได้ใส่ไว้ใน KiCad) เพื่อให้สแกนถุงเจอ | เสริม |

**B. ไฟล์สั่ง PCB + PCBA ของ JLCPCB** (ชุดเดียวกับที่อัปโหลดสั่งงาน — ใช้ได้กับ KiCad / EasyEDA / Altium)

| ไฟล์ | ใช้ทำอะไร | |
|---|---|---|
| **BOM** `.csv` / `.xlsx` | รายการชิ้นส่วน (Comment, Designator, Footprint, LCSC) → ตาราง + สแกนถุง | จำเป็น |
| **CPL** (Pick & Place) `.csv` / `.xlsx` | ตำแหน่งชิ้นส่วน (Designator, Mid X, Mid Y, Layer, Rotation) → ไฮไลต์บนบอร์ด | แนะนำ |
| **Gerber** `.zip` | รูปร่างบอร์ด pad รู silkscreen → ภาพ 2D / 3D เหมือนจริง | แนะนำ |

| ไฟล์ที่มี | ตาราง BOM | สแกนถุง | 2D | 3D |
|---|---|---|---|---|
| `.kicad_pcb` | ✓ | ✓* | ✓ | ✓ |
| BOM | ✓ | ✓ | — | — |
| BOM + CPL | ✓ | ✓ | กล่องตามตำแหน่ง | กล่องตามตำแหน่ง |
| BOM + CPL + Gerber | ✓ | ✓ | ✓ | ✓ |

\* สแกนถุงต้องมีเลข LCSC หรือ MPN ใน BOM · ตำแหน่ง CPL จะถูกจัดให้ตรงกับ Gerber อัตโนมัติ

**หาไฟล์จากไหน** — KiCad: *File → Fabrication Outputs → Gerbers + Drill* (zip รวม), BOM/CPL จากปลั๊กอิน *Fabrication Toolkit* · EasyEDA: *Fabrication → PCB Fabrication File / BOM / Pick and Place File* · Altium: *Gerber + NC Drill / Bill of Materials / Pick and Place*

## วิธีใช้

1. เปิด **https://tesr-channel.github.io/PCB_bom_viewer/** (Chrome / Edge / Safari — มือถือก็ได้)
2. กด **เปิดไฟล์** แล้วใส่ไฟล์ตามช่อง (หรือลากไฟล์ทั้งหมดมาวาง ระบบแยกประเภทให้เอง)
3. กด **เปิดกล้อง** แล้วส่องฉลากถุง → ชิ้นที่ต้องวางจะกะพริบสีแดงบนบอร์ด
4. วางเสร็จ คลิก Ref (เช่น `R25`) ในกล่อง "รายการที่เลือก" หรือคลิกชิ้นนั้นบนบอร์ดอีกครั้ง เพื่อติ๊กว่าวางแล้ว

**คีย์ลัด**: `↑ / ↓` เลือกแถว · `Space` วางชิ้นถัดไปของแถว · `/` ไปช่องรหัส · `L` แผงเลเยอร์ · `Esc` ยกเลิกเลือก

> กล้องต้องใช้ HTTPS หรือ `localhost` — บน GitHub Pages ใช้ได้ทันที
> ใช้งานแบบออฟไลน์: ดาวน์โหลด repo แล้วรัน `python3 -m http.server` ในโฟลเดอร์ จากนั้นเปิด `http://localhost:8000`

## เวอร์ชัน

เลขเวอร์ชันแสดงที่มุมบนซ้าย (กดเพื่อดู "มีอะไรใหม่") และท้ายหน้า · ประวัติทั้งหมดอยู่ใน [CHANGELOG.md](CHANGELOG.md) · แก้เลขเวอร์ชันที่ `js/version.js` · ก่อน deploy ทุกครั้งรัน `tools/set-build.sh <tag>` เพื่อให้เบราว์เซอร์โหลดไฟล์ใหม่ทั้งหมด (กัน cache เก่าปนกัน)

## English

**TESR BOM Viewer** is a browser-only assembly helper for KiCad boards. Load a `.kicad_pcb` — or the JLCPCB order set (BOM + CPL + Gerber .zip, any EDA) — then scan a part bag (LCSC QR, DigiKey / Mouser ECIA DataMatrix, 1D barcodes) with a webcam or phone, type an LCSC / MPN / reference / value, or click a BOM row or a part in the 2D / 3D view — the matching parts are highlighted everywhere. Sourced / placed state is saved locally per board and can be exported as CSV. Nothing is uploaded; all decoding runs locally (ZXing C++ compiled to WebAssembly).

## Project layout

```
index.html          app shell
css/style.css       TESR theme
js/app.js           state, table, selection, scanning, settings
js/kicad.js         .kicad_pcb parser, BOM grouping, CSV BOM / CPL import
js/gerber.js        Gerber RS-274X + Excellon reader, BOM + CPL + Gerber board builder
js/xlsx.js          minimal .xlsx reader
js/version.js       version number + change log
js/scan.js          label parsing (LCSC / ECIA / 1D), matching, camera + decoder
js/view2d.js        2D canvas board view
js/view3d.js        3D board view (three.js)
js/layers.js        PCB layer model: layer list, colours, stacking order, presets
js/paint.js         board painter: realistic look, technical overlays, CAD layer colours
vendor/             three.js r169, zxing-wasm 2.2.4, fflate 0.8.2 (bundled for offline use)
demo/               TESR Pincer V2: KiCad board + BOM, and demo/jlcpcb/ BOM + CPL + Gerber
```

## Third-party

- [three.js](https://threejs.org) — MIT
- [fflate](https://github.com/101arrowz/fflate) — MIT
- [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) / [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) — MIT / Apache-2.0
- Fonts: Chakra Petch, IBM Plex Sans Thai, IBM Plex Mono — SIL Open Font License
- Inspired by the idea behind the *Bag BOM* KiCad plugin (scan a bag, see where it goes)

---

<p align="center">Made by <a href="https://www.tesrshop.com"><b>TESR</b></a> — Thai Embedded System and Robotics</p>
