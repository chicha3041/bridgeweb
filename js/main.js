import { parsePBN } from "./pbn.js";
import { parseLIN } from "./lin.js";
import { BridgeAnalyzer } from "./analyzer.js";
import { DdsClient } from "./dds-client.js";
import { loadStats, clearStats, registrarEstadisticas, eventKey, eventOptions, teamOptions } from "./stats.js";
import { renderReport, renderStats } from "./report.js";
import { exportToExcel } from "./export-xlsx.js";

const $ = (id) => document.getElementById(id);
let lastAnalyzer = null;
let selectedEvent = "";
let selectedTeam = "";
function refreshSelector(preferred, preferredTeam = selectedTeam) {
  const stats = loadStats();
  const selector = $("event-filter");
  const events = eventOptions(stats);
  selector.replaceChildren(new Option("Global - todos los eventos", ""),
    ...events.map(([key, label]) => new Option(label, key)));
  selector.value = events.some(([key]) => key === preferred) ? preferred : "";
  selectedEvent = selector.value;
  const teamSelector = $("team-filter");
  const teams = teamOptions(stats, selectedEvent);
  teamSelector.replaceChildren(new Option("Todos los equipos", ""),
    ...teams.map(([id, team]) => new Option(selectedEvent ? team.name : `${team.name} (${team.event})`, id)));
  teamSelector.value = teams.some(([id]) => id === preferredTeam) ? preferredTeam : "";
  selectedTeam = teamSelector.value;
  teamSelector.disabled = !teams.length;
  $("clear-event-btn").disabled = !selectedEvent;
  if (lastAnalyzer) renderReport(lastAnalyzer, stats, $("report"), selectedEvent, selectedTeam);
  else renderStats(stats, $("report"), selectedEvent, selectedTeam);
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
  if (!open && !closed) { setStatus("Sube al menos un archivo PBN o LIN."); return; }

  $("analyze-btn").disabled = true;
  $("report").innerHTML = "";
  try {
    setStatus("Cargando motor de análisis (DDS/WASM)...");
    const dds = new DdsClient();
    const analyzer = new BridgeAnalyzer(dds);
    analyzer.sourceFiles = [open, closed].filter(Boolean).map(f => f.name);
    analyzer.singleTable = !(open && closed);

    const rooms = [];
    if (open) rooms.push([open, "Abierta"]);
    if (closed) rooms.push([closed, analyzer.singleTable ? "Abierta" : "Cerrada"]);

    let totalBoards = 0;
    const parsed = [];
    for (const [file, room] of rooms) {
      const content = file.text.replace(/^\uFEFF/, "").trimStart();
      const boards = /^\[[A-Za-z]+\s+"/.test(content) ? parsePBN(content) :
        /(?:^|\|)md\|/i.test(content) ? parseLIN(content) : [];
      if (!boards.length) throw new Error(`No se encontraron manos válidas en ${file.name}. Comprueba el contenido PBN/LIN.`);
      totalBoards += boards.length;
      parsed.push([boards, room]);
    }

    // Evitar que un archivo con distintos eventos mezcle ligas silenciosamente.
    const eventKeys = new Set(parsed.flatMap(([boards]) => boards.map(b => eventKey(b.info.Event))));
    if (eventKeys.size > 1) throw new Error("Los PBN contienen eventos diferentes. Sepáralos por evento antes de analizarlos.");
    const canonical = b => ({boardNum:b.boardNum, vul:b.vul, dealer:b.dealer,
      hands:b.hands, contract:b.contract, auction:b.auction, play:b.play,
      names:["North","East","South","West"].map(k=>b.info[k]),
      event:eventKey(b.info.Event), date:b.info.Date || ""});
    analyzer.matchIdentity = (analyzer.singleTable ? "MESA-UNICA\n" : "DOS-SALAS\n") +
      parsed.map(([boards]) => JSON.stringify(boards.map(canonical))).sort().join("\n---SALA---\n");
    // Identidad v6.1: permite sustituir el partido guardado antes de esta actualización.
    analyzer.legacyMatchIdentity = [open,closed].filter(Boolean).map(f=>f.text).sort().join("\n---SALA---\n");
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
    refreshSelector((analyzer.singleTable ? "mesa-unica:" : "") + eventKey(analyzer.matchEvent));
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
    await exportToExcel(lastAnalyzer, loadStats(), selectedEvent, selectedTeam);
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
$("team-filter").addEventListener("change", () => refreshSelector(selectedEvent, $("team-filter").value));
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
