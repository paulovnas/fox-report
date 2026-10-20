import type { CleanReport } from './types';
import type { DecodedAttachment } from './util';

/* Escritor de ZIP "store" (sem compressão): o conteúdo já é comprimido
   (PNGs) ou pequeno (JSONs). Portado do padrão do bugframe (MIT). */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();

const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

type Entry = { name: string; data: Uint8Array };
const u16 = (n: number) => [n & 255, (n >>> 8) & 255];
const u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

function makeZip(entries: Entry[], date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data);
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(day), ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, e.data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(day), ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + e.data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

export const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.slice(dataUrl.indexOf('base64,') + 'base64,'.length);
  return new Uint8Array(Buffer.from(base64, 'base64'));
};

export type BundleInput = {
  itemId: string;
  report: CleanReport;
  /** PNG decodificado da região e da aba inteira. */
  region: Uint8Array;
  full: Uint8Array;
  /** Anexo opcional do usuário. */
  attachment?: DecodedAttachment;
};

/** Nome do arquivo zip entregue no card: único por item. */
export const bundleName = (itemId: string) => `fox-report-${itemId}.zip`;

/**
 * Empacota o relato completo: contexto + network (com headers, quando
 * capturados) + console + metadados + as duas capturas + o anexo do usuário.
 */
export function buildReportZip(input: BundleInput): Uint8Array {
  const { itemId, report, region, full } = input;
  const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2));
  const entries: Entry[] = [
    { name: 'report.json', data: json({ id: itemId, createdAt: report.capturedAt, description: report.description, types: report.types, project: report.project, reporter: report.reporter, sdk: report.context.sdk, capturedAt: report.context.capturedAt }) },
    { name: 'network.json', data: json({ requests: report.context.network }) },
    { name: 'console.json', data: json({ entries: report.context.consoleErrors }) },
    { name: 'metadata.json', data: json(report.context.metadata) },
    { name: 'region.png', data: region },
    { name: 'full.png', data: full },
  ];
  if (input.attachment) {
    // nome único dentro do zip; sanitizado em decodeAttachment
    const safe = input.attachment.name.replace(/^\//, '');
    entries.push({ name: `anexo/${safe}`, data: input.attachment.bytes });
  }
  return makeZip(entries);
}
