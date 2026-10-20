import Papa from 'papaparse';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

// ---------------------------------------------------------------------------
// Reading and writing tables: CSV (papaparse) and XLSX. XLSX is a zip of XML
// files; fflate does the zip and the small reader/writer below does the XML.
// Only cell values matter here (no formulas, styles beyond date detection, or
// merged cells), which is all an import or export needs.
// ---------------------------------------------------------------------------

export type Table = string[][];

/** The byte-order mark: Excel needs it to open a UTF-8 CSV (Hebrew names) correctly. */
const BOM = String.fromCharCode(0xfeff);
const BOM_PATTERN = new RegExp(`^${BOM}`);

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return XML_ENTITIES[e.toLowerCase()] ?? _m;
  });
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab/newline are not allowed in XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** Text of every <t> inside a fragment (a shared string can be split into rich-text runs). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** "AB12" -> column index 27. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

function columnName(index: number): string {
  let s = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Excel's built-in date formats, plus any custom format that has day/month/year parts. */
function dateStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\s[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId'));
    custom.set(id, decodeXml(attr(m[0], 'formatCode') ?? ''));
  }
  const isDate = (id: number) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const code = custom.get(id)?.replace(/"[^"]*"|\[[^\]]*\]/g, '');
    return Boolean(code && /[dmy]/i.test(code) && !/^[#0.,%\s]+$/.test(code));
  };
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  [...cellXfs.matchAll(/<xf\s[^>]*>/g)].forEach((m, i) => {
    if (isDate(Number(attr(m[0], 'numFmtId') ?? 0))) out.add(i);
  });
  return out;
}

/** Excel's day number (1900 system) as an ISO date. */
export function excelSerialToISO(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** The first worksheet of an .xlsx file as rows of text. Date-formatted cells become ISO dates. */
export function readXlsx(data: Uint8Array): Table {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error('This is not a readable .xlsx file');
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : undefined);
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw new Error('This is not a readable .xlsx file');

  // Find the first sheet's file through the workbook relationships.
  const firstSheet = /<sheet\s[^>]*>/.exec(workbook)?.[0];
  const relId = firstSheet ? attr(firstSheet, 'r:id') : undefined;
  const rels = text('xl/_rels/workbook.xml.rels') ?? '';
  const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => attr(r, 'Id') === relId);
  const target = rel ? attr(rel, 'Target') : 'worksheets/sheet1.xml';
  const sheetPath = target?.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const sheet = text(sheetPath);
  if (!sheet) throw new Error('The workbook has no readable sheet');

  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const dates = dateStyles(text('xl/styles.xml'));

  const table: Table = [];
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    const body = row[2] ?? '';
    for (const c of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${c[1]}>`;
      const inner = c[2] ?? '';
      const ref = attr(tag, 'r');
      const index = ref ? columnIndex(ref) : cells.length;
      const type = attr(tag, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textOf(inner);
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else if (raw !== undefined) {
        value = decodeXml(raw);
        const style = Number(attr(tag, 's') ?? -1);
        if (type !== 'str' && type !== 'e' && dates.has(style) && value !== '' && !Number.isNaN(Number(value))) {
          value = excelSerialToISO(Number(value));
        }
      }
      cells[index] = value;
    }
    const rowIndex = Number(attr(`<row${row[1]}>`, 'r') ?? table.length + 1) - 1;
    while (table.length < rowIndex) table.push([]);
    table[rowIndex] = Array.from(cells, (v) => v ?? '');
  }
  return table;
}

export function readCsv(text: string): Table {
  const result = Papa.parse<string[]>(text.replace(BOM_PATTERN, ''), { skipEmptyLines: 'greedy' });
  return result.data.map((row) => row.map((v) => String(v ?? '')));
}

/** Read an uploaded table: .xlsx by its zip signature, anything else as CSV (UTF-8). */
export function readTable(data: Uint8Array): Table {
  const isZip = data[0] === 0x50 && data[1] === 0x4b;
  const rows = isZip ? readXlsx(data) : readCsv(new TextDecoder('utf-8').decode(data));
  // Trim cells, undo the formula guard our own exports add ('+420… -> +420…), drop empty rows.
  return rows
    .map((r) => r.map((v) => v.trim().replace(/^'(?=[=+\-@])/, '')))
    .filter((r) => r.some((v) => v !== ''));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Cells that a spreadsheet would run as a formula get a leading apostrophe (CSV injection). */
const safeCsvCell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function writeCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return BOM + Papa.unparse([headers, ...rows.map((r) => r.map((v) => (typeof v === 'number' ? v : safeCsvCell(v))))]);
}

export function writeXlsx(sheetName: string, headers: string[], rows: Array<Array<string | number>>): Uint8Array {
  const cell = (v: string | number, r: number, c: number, bold = false) => {
    const ref = `${columnName(c)}${r + 1}`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    const s = String(v);
    if (s === '') return '';
    return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${encodeXml(s)}</t></is></c>`;
  };
  const sheetRows = [headers, ...rows]
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c, r === 0)).join('')}</row>`)
    .join('');
  const cols = headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" customWidth="1"/>`).join('');
  const safeName = encodeXml(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        `<cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };
  return zipSync(files);
}
