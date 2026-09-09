// Web Worker: carga el motor DDS (WASM) y responde peticiones de análisis
import { loadDds, Dds } from "./vendor/dds-api.js";

let dds = null;
const ready = (async () => { dds = new Dds(await loadDds()); })();

self.onmessage = async (e) => {
  const { id, op, payload } = e.data;
  try {
    await ready;
    let result;
    if (op === "calcDDTable") result = dds.CalcDDTablePBN({ cards: payload }).resTable;
    else if (op === "dealerPar") result = dds.DealerPar({ resTable: payload.table }, payload.dealer, payload.vul);
    else if (op === "solveBoard") result = dds.SolveBoardPBN(payload.input, payload.target, payload.solutions, payload.mode);
    else throw new Error("op desconocida: " + op);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
