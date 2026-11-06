# Changelog — TESR BOM Viewer

## v1.30 — 2026-11-06
- **Layers panel** (toolbar button or `L`): show / hide every PCB layer — F.Cu / B.Cu / inner copper, F/B silkscreen, F/B solder mask, F/B paste, F/B adhesive, F/B fab, F/B courtyard, Edge.Cuts, drills, Margin, User.Drawings / Comments / Eco / User.1–9 — with object counts per layer
- Two looks: **Realistic** (board as manufactured; hiding the mask shows bare copper on FR-4) and **Layer colours (CAD)** like KiCad / a Gerber viewer, layers stacked far → near for the viewed side
- Presets: Assembly · All · Top · Bottom · Copper · Silkscreen · Mask + paste · Mechanical
- Select a layer + high-contrast mode, double-click to solo a layer, layer opacity, object filters (pads, vias, tracks, zones, texts, components, reference labels)
- 3D board follows the layer / object switches (surfaces repainted, pads and components hidden)
- Cursor X / Y readout in mm from the board's lower-left corner; 2D board keeps clear of the open panel
- KiCad parser keeps every graphic, text, pad, via, zone and track per layer (incl. inner copper and user layer names); Gerber reader keeps every layer with clear polarity (LPC) and splits drills into PTH / NPTH / via

## v1.20 — 2026-11-06
- Detailed procedural 3D parts: chip R/C with metal end caps, gull-wing leads for SOIC / SOP / QFP / SOT, pin-1 dimple and top marking, electrolytic caps with polarity band and vent, crystals, inductors, USB-C shell, pin headers / sockets, JST housings, M8 connector
- 3D board surfaces painted from the design: copper tracks / zones / vias under the mask, thick silkscreen, logos and texts (top and bottom)
- 2D view shows copper and silkscreen texts (KiCad + Gerber), static layers cached for smooth animation
- 3D "BOTTOM" view button label
- Fix: 3D view could stay blank when the browser mixed cached files from the previous release — files are now cache-busted per build (`tools/set-build.sh`), three.js add-ons load by path, and any 3D failure (no WebGL, a bad part) is shown in the 3D pane instead of a silent blank

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
