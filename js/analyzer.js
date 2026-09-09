// Port fiel de BridgeAnalyzer (analizador_bridgelab.py)
import {
  PLAYER_NAMES, PLAYER_ABBR, SUIT_LETTERS, PENALTY,
  nextPlayer, partner, lho, isNS,
  calculateBridgeScore, getImps, pyRound2,
  DealState, isPassout, contractToString, vulDisplay, cardToString,
} from "./bridge-core.js";

const DDS_VUL = { none: 0, both: 1, ns: 2, ew: 3 }; // enum DDS/endplay

function handsToPBN(hands) {
  const parts = [];
  for (let p = 0; p < 4; p++) {
    const suits = [[], [], [], []];
    for (const c of hands[p]) suits[c.suit].push("??23456789TJQKA"[c.rank]);
    parts.push(suits.map(s => s.join("")).join("."));
  }
  return "N:" + parts.join(" ");
}

// Convierte los contratos par de DDS ("3N-EW+1", "3D*-W-1", "2N-NS") al formato
// de endplay normalizado por el analizador ("3NTW+1", "3DOx-1"... con letras de palo)
function ddsParToContracts(raw) {
  const out = [];
  for (const c of raw) {
    const m = c.match(/^([1-7])([CDHSN])(\*)?-(NS|EW|[NESW])([+-]\d+)?$/);
    if (!m) continue;
    const level = parseInt(m[1], 10);
    const denom = { S: 0, H: 1, D: 2, C: 3, N: 4 }[m[2]];
    const pen = m[3] ? "x" : "";
    let declarers;
    if (m[4] === "NS") declarers = [0, 2];
    else if (m[4] === "EW") declarers = [1, 3];
    else declarers = ["NESW".indexOf(m[4])];
    const res = m[5] ? m[5] : "=";
    const dname = denom === 4 ? "NT" : SUIT_LETTERS[denom];
    // endplay muestra el segundo jugador del bando para contratos par (NS->S, EW->W)
    const d = declarers[declarers.length - 1];
    out.push({ level, str: `${level}${dname}${PLAYER_ABBR[d]}${pen}${res}` });
  }
  // endplay (DealerParBin) devuelve los contratos ordenados por nivel ascendente
  out.sort((a, b) => a.level - b.level);
  return out.map(o => o.str);
}

export class BridgeAnalyzer {
  constructor(dds) {
    this.dds = dds; // adaptador con calcDDTable(pbn), dealerPar(table,dealer,vul), solveBoard(input,target,solutions,mode)
    this.playersData = {};
    this.activeBoards = new Set();
    this.boardsDetail = {};
    this.teamsRoster = { "Equipo A": new Set(), "Equipo B": new Set() };
    this.matchGrossGain = { "Equipo A": 0, "Equipo B": 0 };
    this.matchDate = null;
    this.matchEvent = null;
    this.sourceFiles = [];
  }

  getPlayerName(board, role) {
    const name = board.info[PLAYER_NAMES[role][0] + PLAYER_NAMES[role].slice(1).toLowerCase()] || board.info[PLAYER_NAMES[role]] || PLAYER_NAMES[role];
    return String(name).trim();
  }

  ensurePlayer(name) {
    if (name && !this.playersData[name]) {
      this.playersData[name] = { bidding: {}, play: {}, imps: {}, errores_carteo: [] };
    }
  }

  async analyzeDeal(board, roomName = "Unknown") {
    const boardNum = board.boardNum || 1;
    this.activeBoards.add(boardNum);
    if (!this.matchDate && board.info.Date) this.matchDate = String(board.info.Date);
    if (!this.matchEvent && board.info.Event) this.matchEvent = String(board.info.Event);
    if (!(boardNum in this.boardsDetail)) this.boardsDetail[boardNum] = { imps_summary: {} };

    // Análisis DDS
    const dealPbn = handsToPBN(board.hands);
    const ddTable = await this.dds.calcDDTable(dealPbn);
    const par = await this.dds.dealerPar(ddTable, board.dealer, DDS_VUL[board.vul]);
    const parScore = par.score;
    const parContracts = ddsParToContracts(par.contracts);

    let actualNs, bidRes, playRes, playErr, comm, bidMath, critPlays, actors;
    if (isPassout(board.contract)) {
      actualNs = 0;
      bidRes = [0, 0, 0, 0]; playRes = [0, 0, 0, 0]; playErr = ["", "", "", ""];
      comm = "Mano de Paso."; bidMath = ["", "", "", ""]; critPlays = []; actors = [];
    } else {
      const tricks = board.contract.level + 6 + (board.contract.result || 0);
      const decl = board.contract.declarer;
      const isV = board.vul === "both" || (board.vul === "ns" && isNS(decl)) || (board.vul === "ew" && !isNS(decl));
      const sc = calculateBridgeScore(board.contract, tricks, isV);
      actualNs = isNS(decl) ? sc : -sc;
      ({ bidRes, playRes, playErr, comm, bidMath, critPlays, actors } =
        await this._performFullAnalysis(board, ddTable, parScore));
    }

    const manos = {};
    for (let p = 0; p < 4; p++) {
      const suits = { S: "", H: "", D: "", C: "" };
      // ordenar por rango descendente para mostrar
      const sorted = board.hands[p].slice().sort((a, b) => a.suit - b.suit || b.rank - a.rank);
      for (const c of sorted) suits[SUIT_LETTERS[c.suit]] += "??23456789TJQKA"[c.rank];
      manos[PLAYER_ABBR[p]] = suits;
    }

    const roomMeta = {
      "Sala": roomName,
      "Subasta Real": board.auction.map(b => b.str).join(" - "),
      "Contrato Final": board.contract ? contractToString(board.contract) : "Paso",
      "Puntos Reales (NS)": actualNs,
      "Par Contrato": parContracts[0] || "Pass",
      "Par Puntos (NS)": parScore,
      "Comentarios": comm,
      "Manos": manos,
      "Vulnerabilidad": vulDisplay(board.vul),
      "Dador": PLAYER_NAMES[board.dealer],
      "Play": board.play.map(cardToString),
      "Actors": actors,
      "Critical_Plays": critPlays,
    };

    const playersInfo = [];
    for (const role of [0, 1, 2, 3]) {
      const name = this.getPlayerName(board, role);
      if (!name) continue;
      this.ensurePlayer(name);
      const isA = (roomName.toLowerCase() === "abierta" && isNS(role)) ||
                  (roomName.toLowerCase() === "cerrada" && !isNS(role));
      this.teamsRoster[isA ? "Equipo A" : "Equipo B"].add(name);

      const bp = bidRes[role] || 0, pp = playRes[role] || 0;
      this.playersData[name].bidding[boardNum] = (this.playersData[name].bidding[boardNum] || 0) + bp;
      this.playersData[name].play[boardNum] = (this.playersData[name].play[boardNum] || 0) + pp;
      const errCt = playErr[role] || "";
      if (errCt) this.playersData[name].errores_carteo.push(`M${boardNum}-${roomName[0]}: ${errCt}`);

      playersInfo.push({
        "Jugador": name, "Pos": PLAYER_NAMES[role], "Subasta": bp, "Carteo": pp,
        "Total": bp + pp, "Detalle_Carteo": playErr[role] || "",
        "Subasta_Calculo": bidMath[role] || "", "IMPs_Atribuidos": 0, "Sala": roomName,
        "Vulnerabilidad": vulDisplay(board.vul),
      });
    }

    this.boardsDetail[boardNum][roomName] = { meta: roomMeta, players: playersInfo };
  }

  async _performFullAnalysis(board, ddTable, parNs) {
    const contract = board.contract;
    const decl = contract.declarer, dummy = partner(decl);
    const isV = board.vul === "both" || (board.vul === "ns" && isNS(decl)) || (board.vul === "ew" && !isNS(decl));
    const ddTricks = ddTable[contract.denom][decl];
    const potDecl = calculateBridgeScore(contract, ddTricks, isV);
    const potNs = isNS(decl) ? potDecl : -potDecl;
    const diffNs = potNs - parNs;

    const bidRes = [0, 0, 0, 0], bidMath = ["", "", "", ""], bidders = new Set();
    let curr = board.dealer;
    for (const bid of board.auction) {
      if (!["P", "PASS"].includes(bid.str.toUpperCase())) bidders.add(curr);
      curr = nextPlayer(curr);
    }
    for (const p of bidders) {
      bidRes[p] = isNS(p) ? diffNs : -diffNs;
      bidMath[p] = `Potencial: ${potDecl} vs Par: ${parNs}`;
    }

    const playRes = [0, 0, 0, 0], playErrArr = [[], [], [], []], criticalPlays = [], actors = [];
    if (board.play && board.play.length) {
      const dp = new DealState(board.hands, contract.denom, lho(decl));
      let prevNs = potNs, tWon = 0, cP = 0;
      for (const card of board.play) {
        const actor = dp.curplayer();
        const trick = Math.floor(cP / 4) + 1;
        actors.push(PLAYER_ABBR[actor]);
        try { dp.play(card); cP += 1; } catch (e) { break; }
        if (dp.currentTrick.length === 0 && (dp.first === decl || dp.first === dummy)) tWon += 1;

        let maxT;
        if (cP < 52) {
          const fut = await this.dds.solveBoard(dp.toSolveInput(), -1, 3, 1);
          if (!fut || !fut.cards) { maxT = tWon; }
          else {
            const best = Math.max(...fut.score.slice(0, fut.cards));
            if (dp.curplayer() === decl || dp.curplayer() === dummy) {
              maxT = tWon + best;
            } else {
              maxT = tWon + (13 - Math.floor((cP - dp.currentTrick.length) / 4) - best);
            }
          }
        } else {
          maxT = tWon;
        }

        const nowDecl = calculateBridgeScore(contract, maxT, isV);
        const nowNs = isNS(decl) ? nowDecl : -nowDecl;
        const delta = nowNs - prevNs;
        const resp = actor !== dummy ? actor : decl;
        if (delta !== 0) {
          const val = isNS(resp) ? delta : -delta;
          playRes[resp] += val;
          playErrArr[resp].push(`Baza ${trick}(${val})`);
          criticalPlays.push({ idx: cP - 1, player_pos: PLAYER_NAMES[resp][0] + PLAYER_NAMES[resp].slice(1).toLowerCase(), points: val });
        }
        prevNs = nowNs;
      }
    }
    return {
      bidRes, playRes,
      playErr: playErrArr.map(e => e.join(",")),
      comm: "", bidMath, critPlays: criticalPlays, actors,
    };
  }

  finalizeAnalysis() {
    this.matchGrossGain = { "Equipo A": 0, "Equipo B": 0 };
    const sortedBoards = [...this.activeBoards].sort((a, b) => a - b);
    for (const num of sortedBoards) {
      const dO = this.boardsDetail[num]["Abierta"], dC = this.boardsDetail[num]["Cerrada"];
      if (dO && dC) {
        const diff = dO.meta["Puntos Reales (NS)"] - dC.meta["Puntos Reales (NS)"];
        const boardImps = getImps(diff) * (diff >= 0 ? 1 : -1);
        if (boardImps > 0) this.matchGrossGain["Equipo A"] += boardImps;
        else this.matchGrossGain["Equipo B"] += Math.abs(boardImps);

        this.boardsDetail[num].imps_summary = {
          diff_pts: diff, board_imps: boardImps, team_a_imps: boardImps, team_b_imps: -boardImps,
        };

        const teamImpsMap = { "Equipo A": boardImps, "Equipo B": -boardImps };
        for (const tn of ["Equipo A", "Equipo B"]) {
          const teamList = [];
          for (const rn of ["Abierta", "Cerrada"]) {
            if (!(rn in this.boardsDetail[num])) continue;
            for (const p of this.boardsDetail[num][rn].players) {
              const isA = (rn === "Abierta" && ["NORTH", "SOUTH"].includes(p.Pos)) ||
                          (rn === "Cerrada" && ["EAST", "WEST"].includes(p.Pos));
              if ((tn === "Equipo A" && isA) || (tn === "Equipo B" && !isA)) teamList.push(p);
            }
          }
          const timps = teamImpsMap[tn];
          if (!teamList.length) continue;

          const origPts = teamList.map(p => p.Total);
          let calcPts;
          if (timps > 0 && origPts.every(v => v >= -100 && v <= 100)) {
            calcPts = [1, 1, 1, 1];
          } else {
            calcPts = origPts.slice();
            if (timps > 0 && origPts.reduce((a, b) => a + b, 0) < 0) {
              const offset = Math.abs(Math.min(...origPts));
              calcPts = origPts.map(v => v + offset);
            }
          }
          const sumCalc = calcPts.reduce((a, b) => a + b, 0);
          let attrs = calcPts.map(v => pyRound2(timps * (sumCalc !== 0 ? v / sumCalc : 0.25)));

          if (timps > 0 && attrs.some(a => a > timps)) {
            const maxIdx = attrs.indexOf(Math.max(...attrs));
            attrs = attrs.map((_, i) => i === maxIdx ? Number(timps) : 0.0);
          } else if (timps < 0 && attrs.some(a => a < timps)) {
            const minIdx = attrs.indexOf(Math.min(...attrs));
            attrs = attrs.map((_, i) => i === minIdx ? Number(timps) : 0.0);
          }

          teamList.forEach((p, i) => {
            p.IMPs_Atribuidos = attrs[i];
            this.playersData[p.Jugador].imps[num] = attrs[i];
          });
        }
      }
    }
  }

  generateReportRows() {
    const rows = [];
    for (const name of Object.keys(this.playersData).sort()) {
      if (!name) continue;
      const d = this.playersData[name];
      const ts = Object.values(d.bidding).reduce((a, b) => a + b, 0);
      const tc = Object.values(d.play).reduce((a, b) => a + b, 0);
      rows.push([name, ts, tc, ts + tc]);
    }
    return rows;
  }
}

// ---- Estadísticas acumuladas (port de los métodos del analizador) ----
export function calcularEstadisticas(stats) {
  const agg = {};
  const partidos = Object.values(stats.partidos || {}).sort((a, b) =>
    String(a.procesado || "").localeCompare(String(b.procesado || "")));
  for (const partido of partidos) {
    for (const [name, j] of Object.entries(partido.jugadores || {})) {
      const a = agg[name] || (agg[name] = { partidos: 0, manos: 0, imps: 0, subasta: 0, carteo: 0, errores: 0, historial: [] });
      a.partidos += 1; a.manos += j.manos; a.imps += j.imps;
      a.subasta += j.subasta; a.carteo += j.carteo; a.errores += (j.errores_carteo || []).length;
      a.historial.push({
        fecha: partido.fecha || "", partido: (partido.archivos || []).join(", "),
        manos: j.manos, imps: j.imps, subasta: j.subasta, carteo: j.carteo,
      });
    }
  }
  return agg;
}

export function tendencia(historial) {
  if (historial.length < 2) return "-";
  const mitad = Math.floor(historial.length / 2);
  const previos = historial.slice(0, mitad), recientes = historial.slice(mitad);
  const butler = (hs) => {
    const m = hs.reduce((a, h) => a + h.manos, 0);
    return m ? hs.reduce((a, h) => a + h.imps, 0) / m : 0;
  };
  const d = butler(recientes) - butler(previos);
  const flecha = d > 0.05 ? "↑" : d < -0.05 ? "↓" : "=";
  return `${flecha} ${d >= 0 ? "+" : ""}${d.toFixed(2)}`;
}

export function filasEstadisticas(agg) {
  const filas = [];
  const names = Object.keys(agg).sort((a, b) => agg[b].imps - agg[a].imps);
  for (const name of names) {
    const a = agg[name];
    filas.push([name, a.partidos, a.manos, pyRound2(a.imps),
      a.manos ? pyRound2(a.imps / a.manos) : 0,
      a.subasta, a.carteo, a.errores, tendencia(a.historial)]);
  }
  return filas;
}
