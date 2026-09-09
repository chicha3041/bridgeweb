// Cliente del worker DDS para la página principal
export class DdsClient {
  constructor() {
    this.worker = new Worker("js/dds-worker.js", { type: "module" });
    this.nextId = 1;
    this.pending = new Map();
    this.worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      ok ? p.resolve(result) : p.reject(new Error(error));
    };
  }
  _call(op, payload) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, op, payload });
    });
  }
  calcDDTable(pbn) { return this._call("calcDDTable", pbn); }
  dealerPar(table, dealer, vul) { return this._call("dealerPar", { table, dealer, vul }); }
  solveBoard(input, target, solutions, mode) { return this._call("solveBoard", { input, target, solutions, mode }); }
}
