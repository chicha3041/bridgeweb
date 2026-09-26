import { parsePBN } from "./pbn.js";
import { BridgeAnalyzer } from "./analyzer.js";
import { DdsClient } from "./dds-client.js";
import { loadStats, clearStats, registrarEstadisticas, eventKey, eventOptions } from "./stats.js";
import { renderReport, renderStats } from "./report.js";
import { exportToExcel } from "./export-xlsx.js";

const $ = (id) => document.getElementById(id);
let lastAnalyzer = null;
let selectedEvent = "";
function refreshSelector(preferred) {
  const stats = loadStats();
  const selector = $("event-filter");
  const events = eventOptions(stats);
  selector.replaceChildren(new Option("Global - todos los eventos", ""),
    ...events.map(([key, label]) => new Option(label, key)));
  selector.value = events.some(([key]) => key === preferred) ? preferred : "";
  selectedEvent = selector.value;
  $("clear-event-btn").disabled = !selectedEvent;
  if (lastAnalyzer) renderReport(lastAnalyzer, stats, $("report"), selectedEvent);
  else renderStats(stats, $("report"), selectedEvent);
}


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

    // Evitar que un archivo con distintos eventos mezcle ligas silenciosamente.
    const eventKeys = new Set(parsed.flatMap(([boards]) => boards.map(b => eventKey(b.info.Event))));
    if (eventKeys.size > 1) throw new Error("Los PBN contienen eventos diferentes. Sepáralos por evento antes de analizarlos.");
    analyzer.matchIdentity = [open, closed].filter(Boolean).map(f => f.text).sort().join("\n---SALA---\n");
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
    lastAnalyzer = analyzer;
    refreshSelector(eventKey(analyzer.matchEvent));
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
$("export-btn").addEventListener("click", async () => {
  if (!lastAnalyzer) return;
  setStatus("Generando Excel...");
  try {
    await exportToExcel(lastAnalyzer, loadStats(), selectedEvent);
    setStatus("Excel descargado.");
  } catch (err) {
    console.error(err);
    setStatus("Error al generar el Excel: " + (err && err.message || err));
  }
});
$("clear-stats-btn").addEventListener("click", () => {
  if (confirm("¿Borrar todo el histórico de partidos guardado en este navegador?")) {
    clearStats();
    setStatus("Histórico borrado.");
    refreshSelector("");
  }
});

$("event-filter").addEventListener("change", () => refreshSelector($("event-filter").value));
$("clear-event-btn").addEventListener("click", () => {
  const key = $("event-filter").value;
  const label = $("event-filter").selectedOptions[0].textContent;
  if (key && confirm(`¿Borrar solo los partidos de «${label}» guardados en este navegador?`)) {
    clearStats(key);
    refreshSelector("");
    setStatus(`Histórico de «${label}» borrado.`);
  }
});
try { refreshSelector(""); } catch (err) {
  console.error(err);
  setStatus("No se pudo leer el histórico: " + err.message);
}
