import { BridgeAnalyzer } from "./analyzer.js";
import { DdsClient } from "./dds-client.js";
import { loadStats, clearStats, registrarEstadisticas, eventKey, eventOptions, teamOptions, resolveTeamSelection, filterSelection } from "./stats.js";
import { renderReport, renderStats } from "./report.js";
import { exportToPdf } from "./export-pdf.js";
import { exportToExcel } from "./export-xlsx.js";
import { readRoom, normalizeBridgedomEvent } from "./room-input.js";

import { readTeamNames } from "./team-input.js";
import * as backupModule from "./history-backup.js";

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
    ...teams.map(([id, team]) => new Option(team.name, id)));
  teamSelector.value = resolveTeamSelection(stats, selectedEvent, preferredTeam);
  selectedTeam = teamSelector.value;
  teamSelector.disabled = !teams.length;
  $("clear-event-btn").disabled = !selectedEvent;
  $("pdf-btn").disabled = !selectedTeam;
  const scope = filterSelection(stats, selectedEvent, selectedTeam);
  const count = Object.keys(scope.partidos || {}).length;
  $("pdf-scope").textContent = selectedTeam ?
    `PDF de ${teamSelector.selectedOptions[0].textContent}: ${count} partido(s) · ${selector.selectedOptions[0].textContent}. Incluye el partido actual si pertenece a este ámbito.` :
    "Elige un equipo para su PDF. Global acumula sus partidos de todos los eventos; un evento limita el acumulado.";
  if (lastAnalyzer) renderReport(lastAnalyzer, stats, $("report"), selectedEvent, selectedTeam);
  else renderStats(stats, $("report"), selectedEvent, selectedTeam);
}


function setStatus(msg) { $("status").textContent = msg; }
function setProgress(f) { $("progress").value = f; }

async function analyze() {
  const openInput = $("file-open");
  const closedInput = $("file-closed");
  if (!openInput.files.length && !closedInput.files.length) { setStatus("Sube al menos un archivo PBN o LIN."); return; }

  $("analyze-btn").disabled = true;
  $("report").innerHTML = "";
  try {
    setStatus("Leyendo archivos y manos...");
    const open = await readRoom(openInput.files, "Abierta");
    const closed = await readRoom(closedInput.files, "Cerrada");
    setStatus("Cargando motor de análisis (DDS/WASM)...");
    const dds = new DdsClient();
    const analyzer = new BridgeAnalyzer(dds);
    analyzer.sourceFiles = [open, closed].filter(Boolean).flatMap(f => f.sourceNames);
    analyzer.singleTable = !(open && closed);

    const rooms = [];
    if (open) rooms.push([open, "Abierta"]);
    if (closed) rooms.push([closed, analyzer.singleTable ? "Abierta" : "Cerrada"]);

    const parsed = rooms.map(([input, room]) => [input.boards, room]);
    analyzer.teamNames = readTeamNames(parsed, {"Equipo A": $("team-a-name").value, "Equipo B": $("team-b-name").value});
    const totalBoards = parsed.reduce((n, [boards]) => n + boards.length, 0);
    if (parsed.length === 2) {
      const [a, c] = parsed.map(([boards]) => boards.map(b => b.boardNum).join(","));
      if (a !== c) throw new Error("Las salas no tienen las mismas manos. Revisa los archivos de cada sala.");
    }
    // Bridgedom distingue la mesa en Event; ambas salas pertenecen al mismo partido.
    for (const [boards] of parsed) for (const b of boards) normalizeBridgedomEvent(b);
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
    analyzer.legacyMatchIdentity = [open,closed].filter(Boolean).every(f => f.legacyText != null) ?
      [open,closed].filter(Boolean).map(f=>f.legacyText).sort().join("\n---SALA---\n") : null;
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
    if ($("auto-backup-check").checked) {
      try { backupModule.downloadBackup(stats);backupStatus("Copia automática descargada tras este análisis. Conserva la última copia; el navegador puede pedir permiso de descarga."); }
      catch(err){backupStatus("El análisis está guardado aquí, pero no se pudo descargar la copia: "+err.message);}
    }

    lastAnalyzer = analyzer;
    // Analizar no cambia el ámbito que el usuario ha elegido.
    refreshSelector(selectedEvent);
    $("export-btn").disabled = false;
    setStatus(Object.values(analyzer.teamNames).every(Boolean) ? "Análisis completo." :
      "Análisis completo. El PBN no identifica todos los equipos: indica sus nombres por asientos arriba o usa el lápiz del histórico.");
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
$("pdf-btn").addEventListener("click", async () => {
  setStatus("Generando PDF...");
  try {
    await exportToPdf(lastAnalyzer, loadStats(), selectedEvent, selectedTeam);
    setStatus("PDF descargado.");
  } catch (err) { setStatus("Error al generar el PDF: " + (err?.message || err)); }
});
$("clear-stats-btn").addEventListener("click", () => {
  if (confirm("¿Borrar todo el histórico de partidos guardado en este navegador?")) {
    clearStats();
    setStatus("Histórico borrado.");
    refreshSelector("");
  }
});

$("report").addEventListener("teams-renamed", () => refreshSelector(selectedEvent, ""));
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

for (const id of ["file-open", "file-closed"]) $(id).addEventListener("change", () => {
  $("team-a-name").value = ""; $("team-b-name").value = "";
});

// El informe del último análisis no debe acompañar un histórico importado distinto.
const backupStatus = msg => { $('backup-status').textContent=msg; };
$('backup-export-btn').addEventListener('click',()=>{
  try { const stats=loadStats();backupModule.downloadBackup(stats);backupStatus(`Copia descargada: ${Object.keys(stats.partidos).length} partido(s), todos los equipos y eventos. Guárdala fuera del navegador.`); }
  catch(err){backupStatus('No se pudo guardar la copia: '+err.message);}
});
$('backup-import-file').addEventListener('change',async()=>{
  const input=$('backup-import-file'),file=input.files[0];if(!file)return;
  try {
    if(file.size>20*1024*1024)throw new Error('Copia demasiado grande (máximo 20 MB).');
    const text=await file.text(),incoming=backupModule.parseBackup(text);
    const current=loadStats(),oldCount=Object.keys(current.partidos).length,newCount=Object.keys(incoming.partidos).length;
    if(!confirm(`Importar ${newCount} partido(s) de esta copia sustituirá los ${oldCount} partido(s) guardados aquí. No se mezclan. ${oldCount?'Antes se descargará una copia del histórico actual. ':''}¿Continuar?`)){backupStatus('Importación cancelada. El histórico no se ha cambiado.');return;}
    if(oldCount)backupModule.downloadBackup(current,'-antes-de-importar');
    backupModule.importBackup(text);lastAnalyzer=null;$('export-btn').disabled=true;
    refreshSelector('','');setProgress(0);setStatus('Histórico importado. Vuelve a analizar los PBN para generar el informe del partido.');
    backupStatus(`Importados ${newCount} partido(s). Elige el equipo para ver su acumulado. ${oldCount?'Conserva también la copia anterior descargada.':''}`);
  }catch(err){backupStatus('No se pudo importar: '+err.message);}
  finally{input.value='';}
});

async function updateStorageStatus() {
  const count=Object.keys(loadStats().partidos).length;
  let protectedStorage=false;try{protectedStorage=await navigator.storage?.persisted?.()}catch{}
  $('storage-status').textContent=`Histórico en este navegador: ${count} partido(s). ` +
    (protectedStorage ? 'Almacenamiento persistente concedido: protege frente a limpieza automática por espacio, NO frente a borrar datos al cerrar.' : 'Sin protección persistente confirmada. Puedes solicitarla abajo; no evita un borrado configurado al cerrar.') +
    (count ? '' : ' No hay partidos guardados aquí. Puede ser una primera visita, otro navegador/dispositivo o datos borrados; la web no puede distinguirlo.');
}
$('storage-protect-btn').addEventListener('click',async()=>{
 try{if(!navigator.storage?.persist)throw new Error('Este navegador no permite solicitar almacenamiento persistente');
 const granted=await navigator.storage.persist();await updateStorageStatus();
 $('storage-permission-result').textContent=granted?'Permiso concedido. Revisa también el ajuste de borrar datos al cerrar.':'Permiso no concedido. El histórico sigue local; conserva copias JSON.';
 }catch(err){$('storage-permission-result').textContent=err.message;}
});
try{$('auto-backup-check').checked=localStorage.getItem('bridgelab_auto_backup')==='yes'}catch{}
$('auto-backup-check').addEventListener('change',()=>{
 try{localStorage.setItem('bridgelab_auto_backup',$('auto-backup-check').checked?'yes':'no')}catch{}
});
globalThis.addEventListener('bridgelab-stats-saved',()=>{updateStorageStatus().catch(()=>{});});
await updateStorageStatus();
