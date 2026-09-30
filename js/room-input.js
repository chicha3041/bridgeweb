// Entradas v7.2: PBN/LIN individual, selección de PBNs, o ZIP local de PBNs.
import { parsePBN } from "./pbn.js";
import { parseLIN } from "./lin.js";
import { detectFormat } from "./format.js";

const MAX_FILES = 500, MAX_ENTRY = 5 * 1024 * 1024, MAX_TOTAL = 20 * 1024 * 1024;
const boardOrder = (a, b) => a.boardNum - b.boardNum;
const hasPbnExtension = name => /\.pbn$/i.test(name);

function parseContent(text, name, onlyPbn = false) {
  const format = detectFormat(text.trimStart());
  if (!format || (onlyPbn && format !== "pbn"))
    throw new Error(`No se encontraron manos PBN válidas en ${name}.`);
  const boards = format === "pbn" ? parsePBN(text) : parseLIN(text);
  if (!boards.length) throw new Error(`No se encontraron manos válidas en ${name}.`);
  return { boards, format };
}

function decodePbn(bytes) {
  // Bridgedom declara ISO-8859-1; conservar acentos sin corromper el evento.
  const header = new TextDecoder("ascii").decode(bytes.subarray(0, Math.min(bytes.length, 300)));
  const latin = /charset\s*=\s*(?:ISO-8859-1|latin-?1)/i.test(header);
  return new TextDecoder(latin ? "iso-8859-1" : "utf-8").decode(bytes);
}

export async function readRoom(files, roomName) {
  if (!files?.length) return null;
  if (files.length > MAX_FILES) throw new Error("Demasiados archivos en una sala.");
  const sourceNames = [], chunks = [];
  let archiveCount = 0, totalBytes = 0;
  for (const file of files) {
    sourceNames.push(file.name);
    if (files.length > 1 && /\.zip$/i.test(file.name)) throw new Error("Selecciona un ZIP o varios PBN en cada sala, no una mezcla.");
    if (/\.zip$/i.test(file.name)) {
      archiveCount++;
      if (!globalThis.JSZip) throw new Error("No se pudo cargar el lector ZIP. Recarga la página.");
      if (file.size > MAX_TOTAL) throw new Error("El ZIP es demasiado grande.");
      const zip = await globalThis.JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files).filter(e => !e.dir && hasPbnExtension(e.name));
      if (!entries.length) throw new Error(`${file.name} no contiene archivos .pbn.`);
      if (entries.length + chunks.length > MAX_FILES) throw new Error("Demasiados PBN en una sala.");
      for (const entry of entries) {
        // JSZip expone tamaño descomprimido de cada entrada tras leer el directorio ZIP.
        const size = entry._data?.uncompressedSize;
        if (!Number.isSafeInteger(size) || size > MAX_ENTRY || (totalBytes += size) > MAX_TOTAL)
          throw new Error("El ZIP contiene archivos demasiado grandes.");
        const bytes = await entry.async("uint8array");
        chunks.push({ name: `${file.name}/${entry.name}`, text: decodePbn(bytes), onlyPbn: true });
      }
    } else {
      if (file.size > MAX_ENTRY || (totalBytes += file.size) > MAX_TOTAL) throw new Error("Archivos demasiado grandes.");
      chunks.push({ name: file.name, text: decodePbn(new Uint8Array(await file.arrayBuffer())), onlyPbn: files.length > 1 });
    }
  }
  if (chunks.length > MAX_FILES) throw new Error("Demasiados PBN en una sala.");
  const boards = [];
  for (const chunk of chunks) {
    if (chunk.onlyPbn && !hasPbnExtension(chunk.name)) throw new Error(`Selecciona solo PBN al cargar varios archivos: ${chunk.name}`);
    boards.push(...parseContent(chunk.text, chunk.name, chunk.onlyPbn).boards);
  }
  boards.sort(boardOrder);
  const seen = new Set();
  for (const board of boards) {
    if (seen.has(board.boardNum)) throw new Error(`Mano ${board.boardNum} duplicada en sala ${roomName.toLowerCase()}.`);
    seen.add(board.boardNum);
  }
  return { boards, sourceNames, legacyText: archiveCount || files.length !== 1 ? null : chunks[0].text };
}

export function normalizeBridgedomEvent(board) {
  if (!/^(?:www\.)?bridgedom\.com$/i.test(board.info.Site || "")) return;
  if (board.info.Event) board.info.Event = board.info.Event.replace(/\s*[·•]\s*Mesa\s+\d+\s*$/i, "").trim();
}
