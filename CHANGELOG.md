# Changelog — TESR BOM Viewer

## v1.10 — 2026-11-06
- Guided **Open files** dialog: explains which file does what (BOM → table, CPL → positions, Gerber → 2D/3D board), with a "what you get" matrix and export tips for KiCad / EasyEDA / Altium
- JLCPCB order set support: **BOM + CPL + Gerber .zip** builds the 2D / 3D board without a KiCad file
- In-browser Gerber (RS-274X, aperture macros, X2 attributes) + Excellon drill reader: outline, pads, holes, silkscreen
- Automatic CPL ↔ Gerber origin alignment
- BOM / CPL as `.xlsx`; CPL units in mm / mil
- New demo: `?demo=jlc` (TESR Pincer V2 JLCPCB files)
- Version badge in the header + "What's new" panel

## v1.00 — 2026-11-06
- Open `.kicad_pcb` (KiCad 6–9) + BOM `.csv`
- Scan LCSC (QR) / DigiKey / Mouser (ECIA DataMatrix) / 1D barcodes via webcam, phone camera or photo
- Type codes, USB barcode scanners, click in the table / 2D / 3D board
- Sourced / placed checklist (saved locally) + CSV export · TESR theme · Thai / English

Made by TESR — Thai Embedded System and Robotics
