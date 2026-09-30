// PDF local: el partido actual y todos los jugadores del ámbito seleccionado.
import { calcularEstadisticasEquipos, filasJugadoresEquipo } from "./analyzer.js";
import { filterSelection, eventOptions, matchKey } from "./stats.js";
import { pyRound2 } from "./bridge-core.js";
const num = x => String(pyRound2(x || 0));
export async function exportToPdf(analyzer, stats, selectedEvent = "", selectedTeam = "") {
  if (!selectedTeam) throw new Error("Elige un equipo en el desplegable Equipo antes de descargar su PDF.");
  if (!globalThis.jspdf?.jsPDF) throw new Error("No se pudo cargar el generador PDF. Recarga la página.");
  const scope = filterSelection(stats, selectedEvent, selectedTeam);
  const { teams } = calcularEstadisticasEquipos(scope);
  const ids = Object.keys(teams).sort((a, b) => teams[a].nombre.localeCompare(teams[b].nombre, "es"));
  if (!ids.length) throw new Error("No hay estadísticas para el equipo y evento seleccionados.");
  const firma = await matchKey(analyzer);
  const current = Object.values(scope.partidos).find(p => p.firma === firma);
  const event = selectedEvent ? new Map(eventOptions(stats)).get(selectedEvent) || selectedEvent : "Global - todos los eventos";
  const doc = new globalThis.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 12;
  const ink = [31, 58, 95], gray = [85, 85, 85];
  for (let i = 0; i < ids.length; i++) {
    if (i) doc.addPage();
    const id = ids[i], t = teams[id];
    const side = Object.values(current?.equipos || {}).find(s => s.id === id);
    const played = new Set(side?.jugadores || []);
    doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...ink);
    const title = doc.splitTextToSize("BridgeLab | " + t.nombre, 270);
    doc.text(title, margin, 18);
    let y = 18 + title.length * 8;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...gray);
    const subtitle = doc.splitTextToSize("Partido: " + (analyzer.matchEvent || "Sin evento") +
      " | Fecha: " + (analyzer.matchDate || "No indicada") + " | " + (analyzer.singleTable ? "Mesa única contra par" : "Dos salas"), 270);
    doc.text(subtitle, margin, y); y += subtitle.length * 5 + 3;
    const netImps = Object.values(t.jugadores).reduce((sum, j) => sum + j.imps, 0);
    const currentImps = [...played].reduce((sum, name) => sum + (current?.jugadores[name]?.imps || 0), 0);
    const scopeLine = doc.splitTextToSize("Acumulado: " + event + " | " + t.partidos + " partido(s), " + t.manos + " manos, " + num(netImps) + " IMPs netos", 270);
    doc.text(scopeLine, margin, y); y += scopeLine.length * 5 + 1;
    doc.text(side ? "Este partido: " + (current.manos || 0) + " manos | " + num(currentImps) + " IMPs netos" :
      "Este equipo no participa en el partido actual dentro del ámbito seleccionado.", margin, y); y += 8;
    const rows = filasJugadoresEquipo(t).map(f => {
      const j = played.has(f.name) ? current.jugadores[f.name] : null;
      return [f.name, ...(j ? [j.manos, num(j.imps), num(j.manos ? j.imps / j.manos : 0), num(j.subasta), num(j.carteo)] : ["-", "-", "-", "-", "-"]),
        f.partidos, f.manos, num(f.imps), num(f.butler), num(f.subasta), num(f.carteo), f.errores];
    });
    doc.autoTable({ startY: y, margin: { left: margin, right: margin, bottom: 16 },
      head: [[{content:"Jugador", rowSpan:2}, {content:"Este partido", colSpan:5}, {content:"Acumulado", colSpan:7}],
        ["Manos", "IMPs", "Butler", "Subasta", "Carteo", "Partidos", "Manos", "IMPs", "Butler", "Subasta", "Carteo", "Err. carteo"]],
      body: rows, theme: "striped", styles: { font: "helvetica", fontSize: 8, cellPadding: 2, halign: "right", overflow: "linebreak" },
      headStyles: {fillColor: ink, textColor:255, halign:"center", fontStyle:"bold"},
      columnStyles: {0:{halign:"left",cellWidth:42}},
      didParseCell: data => { if (data.section === "body" && data.column.index && /^-\d/.test(String(data.cell.raw))) data.cell.styles.textColor = [176,0,32]; }
    });
    y = doc.lastAutoTable.finalY + 7;
    if (y > 177) { doc.addPage(); y = 18; }
    doc.setFontSize(9).setTextColor(...gray);
    doc.text("IMPs netos = suma atribuida a los jugadores. Butler = IMPs / mano. Subasta y carteo: puntos técnicos. '-' = no jugó este partido.", margin, y);
    doc.text("Los acumulados incluyen el partido actual si pertenece al ámbito. Los nombres de jugador deben coincidir exactamente.", margin, y + 5);
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...ink);
    doc.text("Detalle de los partidos | " + t.nombre, margin, 18);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...gray);
    doc.text("Una fila por jugador y partido. Fecha: la guardada en el histórico (puede ser la fecha de análisis).", margin, 25);
    const history = filasJugadoresEquipo(t).flatMap(f => Object.values(scope.partidos).flatMap(p => {
      const inTeam = Object.values(p.equipos || {}).some(s => s.id === id && s.jugadores?.includes(f.name));
      const j = inTeam && p.jugadores?.[f.name];
      return j ? [[f.name, p.fecha || "No indicada", p.evento || "Sin evento", j.manos, num(j.imps), num(j.subasta), num(j.carteo)]] : [];
    }));
    doc.autoTable({startY:31, margin:{left:margin,right:margin,bottom:16},
      head:[["Jugador", "Fecha", "Partido / evento", "Manos", "IMPs", "Subasta", "Carteo"]], body:history,
      theme:"striped",styles:{fontSize:8,cellPadding:2,overflow:"linebreak"},headStyles:{fillColor:ink},columnStyles:{0:{cellWidth:42},1:{cellWidth:25},2:{cellWidth:120}}});
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFontSize(8).setTextColor(...gray);
    doc.text("BridgeLab v7.5 | Histórico de este navegador", margin, 202);
    doc.text(page + " / " + pages, 284, 202, {align:"right"});
  }
  doc.save("bridgelab-partido-y-acumulado.pdf");
}
