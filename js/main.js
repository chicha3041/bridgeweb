import { parsePBN } from "./pbn.js";
import { BridgeAnalyzer } from "./analyzer.js";
import { DdsClient } from "./dds-client.js";
import { loadStats, saveStats, clearStats, registrarEstadisticas } from "./stats.js";
import { renderReport } from "./report.js";
import { exportToExcel } from "./export-xlsx.js";

const $ = (id) => document.getElementById(id);
let lastAnalyzer = null, lastStats = null;

function setStatus(msg) { $("status").textContent = msg; }
function setProgress(f) { $("progress").value = f; }

async function readFile(input) {
  const f = input.files && input.files[0];
  if (!f) return null;
  return { name: f.name, text: await f.text() };
}

async function analyze() {
  const open = await readFile($("file-open"));
  const closed = await readFile($("file-closed"));
  if (!open && !closed) { setStatus("Sube al menos un archivo PBN."); return; }

  $("analyze-btn").disabled = true;
  $("report").innerHTML = "";
  try {
    setStatus("Cargando motor de análisis (DDS/WASM)...");
    const dds = new DdsClient();
    const analyzer = new BridgeAnalyzer(dds);
    analyzer.sourceFiles = [open, closed].filter(Boolean).map(f => f.name);

    const rooms = [];
    if (open) rooms.push([open, "Abierta"]);
    if (closed) rooms.push([closed, "Cerrada"]);

    let totalBoards = 0;
    const parsed = [];
    for (const [file, room] of rooms) {
      const boards = parsePBN(file.text);
      if (!boards.length) { setStatus(`No se encontraron manos en ${file.name}. ¿Es un PBN válido?`); $("analyze-btn").disabled = false; return; }
      totalBoards += boards.length;
      parsed.push([boards, room]);
    }

    let done = 0;
    for (const [boards, room] of parsed) {
      for (const b of boards) {
        setStatus(`Analizando mano ${b.boardNum} (sala ${room.toLowerCase()})...`);
        await analyzer.analyzeDeal(b, room);
        done++;
        setProgress(done / totalBoards);
      }
    }
    setStatus("Calculando atribución de IMPs...");
    analyzer.finalizeAnalysis();
    const stats = await registrarEstadisticas(analyzer);
    lastAnalyzer = analyzer; lastStats = stats;
    renderReport(analyzer, stats, $("report"));
    $("export-btn").disabled = false;
    setStatus("Análisis completo.");
    setProgress(1);
  } catch (err) {
    console.error(err);
    setStatus("Error: " + (err && err.message || err));
  } finally {
    $("analyze-btn").disabled = false;
  }
}

$("analyze-btn").addEventListener("click", analyze);
$("export-btn").addEventListener("click", () => {
  if (lastAnalyzer && lastStats) exportToExcel(lastAnalyzer, lastStats);
});
$("clear-stats-btn").addEventListener("click", () => {
  if (confirm("¿Borrar todo el histórico de partidos guardado en este navegador?")) {
    clearStats();
    setStatus("Histórico borrado.");
    if (lastAnalyzer) renderReport(lastAnalyzer, loadStats(), $("report"));
  }
});
