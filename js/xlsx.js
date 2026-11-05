// TESR BOM Viewer — minimal .xlsx reader (first worksheet → 2-D array of strings)
import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.module.js';

const colIndex = (ref) => {
  const letters = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(buf) {
  const z = unzipSync(new Uint8Array(buf));
  const dp = new DOMParser();
  const xml = (p) => (z[p] ? dp.parseFromString(strFromU8(z[p]), 'application/xml') : null);
  const shared = [];
  const ss = xml('xl/sharedStrings.xml');
  if (ss) for (const si of ss.getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
  // first sheet in workbook order
  let sheetPath = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const wb = xml('xl/workbook.xml'), rels = xml('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = wb.getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    for (const r of rels.getElementsByTagName('Relationship')) {
      if (r.getAttribute('Id') === rid) { const t = r.getAttribute('Target').replace(/^\//, ''); sheetPath = t.startsWith('xl/') ? t : 'xl/' + t; }
    }
  }
  const sh = xml(sheetPath);
  if (!sh) throw new Error('XLSX: no worksheet');
  const rows = [];
  for (const row of sh.getElementsByTagName('row')) {
    const out = [];
    for (const c of row.getElementsByTagName('c')) {
      const r = c.getAttribute('r');
      const i = r ? colIndex(r) : out.length;
      const t = c.getAttribute('t');
      let v = '';
      if (t === 's') v = shared[+((c.getElementsByTagName('v')[0] || {}).textContent)] ?? '';
      else if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else v = (c.getElementsByTagName('v')[0] || {}).textContent ?? '';
      out[i] = v;
    }
    rows.push(Array.from(out, (x) => x ?? ''));
  }
  return rows;
}
