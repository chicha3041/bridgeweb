// Port fiel de BridgeAnalyzer (analizador_bridgelab.py)
import {
  PLAYER_NAMES, PLAYER_ABBR, SUIT_LETTERS, PENALTY,
  nextPlayer, partner, lho, isNS,
  calculateBridgeScore, getImps, pyRound2,
  DealState, isPassout, contractToString, vulDisplay, cardToString,
} from "./bridge-core.js";

const DDS_VUL = { none: 0, both: 1, ns: 2, ew: 3 }; // enum DDS/endplay

// ---------------------------------------------------------------------------
// CRITERIOS DE ATRIBUCIÓN (v4) - parámetros ajustables
// ---------------------------------------------------------------------------
// 1) PUNTOS TÉCNICOS DE SUBASTA POR PAREJA
//    La subasta es un trabajo de pareja: el diferencial potencial-vs-par se
//    calcula para la PAREJA y se reparte 50/50 entre sus dos jugadores, sin
//    mirar quién dio las voces (un paso también es una decisión).
//    - Bando declarante: recibe siempre el diferencial (normalmente negativo).
//    - Bando defensor: recibe el diferencial con signo contrario SOLO si alguno
//      de sus dos jugadores intervino en la subasta (dijo algo distinto de
//      paso). Si no abrió la boca, se queda a cero.
//    BID_SHARE_PER_PLAYER = 0.5 -> cada jugador recibe la mitad del diferencial
//    de la pareja (la subasta suma cero en cada sala).
//    Con 1.0 cada jugador recibiría el diferencial entero (la escala antigua
//    cuando los dos hablaban).
const BID_SHARE_PER_PLAYER = 0.5;

// 2) IMPs CUANDO AMBAS PAREJAS QUEDAN POR DEBAJO DEL PAR
//    En cada sala, la pareja que "falla" es la que queda por debajo del par
//    (resultado real peor que el par para su bando). Si en las dos salas hay
//    una pareja por debajo del par y son de EQUIPOS DISTINTOS, la mano la gana
//    la pareja que menos se aleja del par (es exactamente la que da los IMPs a
//    su equipo). Entonces:
//    - Los IMPs positivos del equipo ganador van a esa pareja.
//    - Los IMPs negativos del equipo perdedor van a su pareja que falló.
//    - Las otras dos parejas (las que defendían) reciben 0 IMPs.
//    - Empate exacto en distancia al par -> diff 0 -> 0 IMPs para todos.
//    (v5) Solo si las dos parejas que fallan tienen el mismo papel; si no, ver
//    la regla B (punto 4). En el resto de casos (alguna sala llega al par
//    exacto, o las dos parejas que fallan son del mismo equipo) se aplica el
//    reparto proporcional antiguo.
//
// 3) AJUSTE DENTRO DE LA PAREJA POR ERRORES DE CARTEO (solo en el criterio 2)
//    Base: mitad y mitad. Cada jugador carga con la mitad del déficit de
//    subasta de la pareja más el coste de SUS errores de carteo (suma de las
//    bazas en las que perdió puntos técnicos: su carta vs la mejor línea DDS;
//    el muerto cuenta para el declarante). Su parte de la responsabilidad es:
//       resp_i = (deficitSubasta/2 + errores_i) / (deficitSubasta + errores_1 + errores_2)
//    - Si la pareja PIERDE IMPs: cada uno se lleva resp_i de los IMPs negativos.
//    - Si la pareja GANA IMPs: cada uno se lleva (1 - resp_i) de los positivos
//      (el que menos falló se lleva más).
//    TOPE: la parte de cada jugador nunca se aleja del 50% más de
//    MAX_PLAY_SHIFT (0.25 -> como mucho 75% / 25%), para que la subasta siga
//    pesando más que un error puntual de carteo. Con 0 no hay ajuste (siempre
//    50/50); con 0.5 se permite el 100% / 0%.
const MAX_PLAY_SHIFT = 0.25;
//    (v5) La base de subasta del ajuste es el VALOR ABSOLUTO de los puntos de
//    subasta de la pareja (así una pareja ganadora con un error pequeño no se va
//    directa al tope). Los errores decisivos (ver 5) no entran aquí: se cuentan
//    solo en la capa de errores decisivos, para no castigarlos dos veces.
//
// 4) REGLA B: PAREJAS BAJO EL PAR CON PAPEL DISTINTO (v5)
//    La regla 2 solo compara parejas con el MISMO papel: las dos declaran o
//    las dos defienden. Si una falla declarando y la otra defendiendo (mano 2
//    del Last Minute - Galactus), cada pareja se mide por su resultado real
//    frente al par:
//    - Los IMPs positivos del ganador van SOLO a sus parejas por encima del par,
//      en proporción a lo que ganaron.
//    - Los IMPs negativos del perdedor van SOLO a sus parejas por debajo del par,
//      en proporción a lo que perdieron. Las demás, 0.
//
// 5) ERRORES DECISIVOS DE CARTEO (v5, se aplica en TODAS las manos)
//    Un error de carteo es DECISIVO si, en el momento de cometerlo, cambia el
//    signo de la mano para el equipo del que falla (de ganar a empatar/perder,
//    o de empatar a perder). Se mide con el resultado doble-dummy de ese
//    momento contra el resultado REAL de la otra sala. Da igual que luego los
//    contrarios lo devuelvan con otro error: el error queda registrado.
//    - Equipo que PIERDE la mano (D): los IMPs perdidos se reparten entre las
//      causas en proporción a los IMPs que se habrían salvado sin cada una:
//        * el resto del déficit del equipo frente al par (el reparto base, que
//          se escala como un bloque), y
//        * cada error decisivo de uno de sus jugadores (quitando solo ese error).
//      Los "IMPs salvados" no se suman entre sí: se usan solo como proporción.
//    - Equipo que GANA la mano (E): si uno de sus jugadores cometió un error
//      decisivo que luego se compensó, carga PENAL_ERROR_DEVUELTO de los IMPs
//      del equipo. Esa parte pasa a los compañeros de equipo que tenían IMPs
//      positivos en el reparto base (en proporción a ellos).
//    Los totales de cada equipo siguen siendo exactamente los del marcador.
//    Los puntos técnicos no cambian: ya castigan el error en puntos; esta capa
//    solo decide QUIÉN carga los IMPs dentro del equipo.
const PENAL_ERROR_DEVUELTO = 0.25;

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

    let actualNs, bidRes, playRes, playErr, comm, bidMath, critPlays, actors, playErrCost;
    if (isPassout(board.contract)) {
      actualNs = 0;
      bidRes = [0, 0, 0, 0]; playRes = [0, 0, 0, 0]; playErr = ["", "", "", ""]; playErrCost = [0, 0, 0, 0];
      comm = "Mano de Paso."; bidMath = ["", "", "", ""]; critPlays = []; actors = [];
    } else {
      const tricks = board.contract.level + 6 + (board.contract.result || 0);
      const decl = board.contract.declarer;
      const isV = board.vul === "both" || (board.vul === "ns" && isNS(decl)) || (board.vul === "ew" && !isNS(decl));
      const sc = calculateBridgeScore(board.contract, tricks, isV);
      actualNs = isNS(decl) ? sc : -sc;
      ({ bidRes, playRes, playErrCost, playErr, comm, bidMath, critPlays, actors } =
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

    const pen = board.contract
      ? (board.contract.penalty === PENALTY.DOUBLED ? "x" : board.contract.penalty === PENALTY.REDOUBLED ? "xx" : "")
      : "";
    const contractKey = isPassout(board.contract)
      ? "Pass"
      : `${board.contract.level}${board.contract.denom === 4 ? "NT" : SUIT_LETTERS[board.contract.denom]}${PLAYER_ABBR[board.contract.declarer]}${pen}`;

    const roomMeta = {
      "Sala": roomName,
      "Subasta Real": board.auction.map(b => b.str).join(" - "),
      "Auction": board.auction.map(b => b.str),
      "DealerAbbr": PLAYER_ABBR[board.dealer],
      "ContractKey": contractKey,
      "Contrato Final": board.contract ? contractToString(board.contract) : "Paso",
      "Puntos Reales (NS)": actualNs,
      "Par Contrato": parContracts[0] || "Pass",
      "Par Puntos (NS)": parScore,
      "Comentarios": comm,
      "Manos": manos,
      "Vulnerabilidad": vulDisplay(board.vul),
      "Dador": { N: "N", E: "E", S: "S", W: "O" }[PLAYER_ABBR[board.dealer]],
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
        "Total": pyRound2(bp + pp), "Detalle_Carteo": playErr[role] || "",
        "Coste_Errores_Carteo": playErrCost[role] || 0, "Nota_IMPs": "",
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

    // Criterio 1: puntos de subasta por PAREJA, repartidos 50/50
    const bidRes = [0, 0, 0, 0], bidMath = ["", "", "", ""], bidders = new Set();
    let curr = board.dealer;
    for (const bid of board.auction) {
      if (!["P", "PASS"].includes(bid.str.toUpperCase())) bidders.add(curr);
      curr = nextPlayer(curr);
    }
    const declNS = isNS(decl);
    for (const sideNS of [true, false]) {
      const members = sideNS ? [0, 2] : [1, 3];
      const isDeclSide = sideNS === declNS;
      const intervened = members.some(p => bidders.has(p));
      if (!isDeclSide && !intervened) continue; // defensa muda: cero
      const pairPts = sideNS ? diffNs : -diffNs;
      for (const p of members) {
        bidRes[p] = pyRound2(pairPts * BID_SHARE_PER_PLAYER);
        bidMath[p] = `Potencial: ${potDecl} vs Par: ${parNs} (pareja ${pairPts}, ${Math.round(BID_SHARE_PER_PLAYER * 100)}% cada uno)`;
      }
    }

    const playRes = [0, 0, 0, 0], playErrArr = [[], [], [], []], criticalPlays = [], actors = [];
    const playErrCost = [0, 0, 0, 0]; // coste (positivo) de los errores propios de carteo
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
          if (val < 0) playErrCost[resp] += -val;
          playErrArr[resp].push(`Baza ${trick}(${val})`);
          criticalPlays.push({ idx: cP - 1, player_pos: PLAYER_NAMES[resp][0] + PLAYER_NAMES[resp].slice(1).toLowerCase(), points: val,
            role: resp, trick, ns_before: prevNs, ns_after: nowNs });
        }
        prevNs = nowNs;
      }
    }
    return {
      bidRes, playRes, playErrCost,
      playErr: playErrArr.map(e => e.join(",")),
      comm: "", bidMath, critPlays: criticalPlays, actors,
    };
  }

  finalizeAnalysis() {
    this.matchGrossGain = { "Equipo A": 0, "Equipo B": 0 };
    const sortedBoards = [...this.activeBoards].sort((a, b) => a - b);
    for (const num of sortedBoards) {
      const dO = this.boardsDetail[num]["Abierta"], dC = this.boardsDetail[num]["Cerrada"];
      if (!(dO && dC)) continue;
      const diff = dO.meta["Puntos Reales (NS)"] - dC.meta["Puntos Reales (NS)"];
      const boardImps = getImps(diff) * (diff >= 0 ? 1 : -1);
      if (boardImps > 0) this.matchGrossGain["Equipo A"] += boardImps;
      else this.matchGrossGain["Equipo B"] += Math.abs(boardImps);

      const summary = this.boardsDetail[num].imps_summary = {
        diff_pts: diff, board_imps: boardImps, team_a_imps: boardImps, team_b_imps: -boardImps,
        criterio: "Reparto proporcional a los puntos técnicos", errores_decisivos: [],
      };

      const ctx = this._boardContext(num, dO, dC, boardImps);
      // C) errores decisivos (antes del reparto base, para no contarlos dos veces)
      ctx.decisive = this._findDecisiveErrors(ctx);
      summary.errores_decisivos = ctx.decisive.map(e => e.texto);

      // Reparto base: regla 2 (A), regla B o proporcional antiguo
      const base = this._attributeBothBelowPar(ctx) || this._attributeMixedRoles(ctx) || this._attributeProportional(ctx);
      // D) y E) capa de errores decisivos
      this._applyDecisiveLayer(ctx, base);

      for (const e of ctx.entries) {
        e.p.IMPs_Atribuidos = pyRound2(base.get(e) || 0);
        e.p.Nota_IMPs = (e.p.Nota_IMPs || "").replace(/^ · /, "");
        this.playersData[e.p.Jugador].imps[num] = e.p.IMPs_Atribuidos;
      }
    }
  }

  // Datos comunes de la mano: jugadores con equipo/sala/pareja y resultados
  _boardContext(num, dO, dC, boardImps) {
    const entries = [];
    for (const [rn, det] of [["Abierta", dO], ["Cerrada", dC]]) {
      for (const p of det.players) {
        const ns = ["NORTH", "SOUTH"].includes(p.Pos);
        const team = (rn === "Abierta") === ns ? "Equipo A" : "Equipo B";
        p.Nota_IMPs = "";
        entries.push({ p, room: rn, ns, team, role: ["NORTH", "EAST", "SOUTH", "WEST"].indexOf(p.Pos) });
      }
    }
    const ctx = {
      num, dO, dC, boardImps, entries,
      par: dO.meta["Par Puntos (NS)"],
      res: { Abierta: dO.meta["Puntos Reales (NS)"], Cerrada: dC.meta["Puntos Reales (NS)"] },
      teamImps: { "Equipo A": boardImps, "Equipo B": -boardImps },
    };
    // IMPs para un equipo con resultados (NS) hipotéticos de cada sala
    ctx.impsFor = (team, rO, rC) => {
      const d = rO - rC, a = getImps(Math.abs(d)) * (d >= 0 ? 1 : -1);
      return team === "Equipo A" ? a : -a;
    };
    ctx.teamOfSide = (room, ns) => ((room === "Abierta") === ns ? "Equipo A" : "Equipo B");
    return ctx;
  }

  // C) Errores decisivos: recorre el carteo de cada sala y detecta los errores
  // que, en el momento de cometerse, cambian el signo de la mano para el equipo
  // del que falla (gana -> empata/pierde, o empata -> pierde), comparando el
  // resultado doble-dummy de ese momento con el resultado REAL de la otra sala.
  _findDecisiveErrors(ctx) {
    const out = [];
    const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
    const tn = (t, v) => (v === 0 ? "empate" : `${v > 0 ? t : (t === "Equipo A" ? "Equipo B" : "Equipo A")} +${Math.abs(v)}`);
    for (const [rn, det] of [["Abierta", ctx.dO], ["Cerrada", ctx.dC]]) {
      const other = rn === "Abierta" ? "Cerrada" : "Abierta";
      for (const cp of det.meta.Critical_Plays || []) {
        if (!(cp.points < 0) || cp.ns_before === undefined) continue;
        const ns = isNS(cp.role);
        const team = ctx.teamOfSide(rn, ns);
        const imps = (nsVal) => rn === "Abierta"
          ? ctx.impsFor(team, nsVal, ctx.res[other]) : ctx.impsFor(team, ctx.res[other], nsVal);
        const before = imps(cp.ns_before), after = imps(cp.ns_after);
        if (!(sign(after) < sign(before))) continue;
        const entry = ctx.entries.find(e => e.room === rn && e.role === cp.role);
        if (!entry) continue;
        out.push({
          entry, team, room: rn, trick: cp.trick, points: cp.points,
          deltaNs: cp.ns_after - cp.ns_before, swing: before - after,
          texto: `Sala ${rn.toLowerCase()}, baza ${cp.trick}: error de ${entry.p.Jugador} (${cp.points} pts) - la mano pasa de ${tn(team, before)} a ${tn(team, after)} IMPs`,
        });
      }
    }
    return out;
  }

  // Coste de errores de carteo NO decisivos de un jugador (para el ajuste 75/25)
  _nonDecisiveErrCost(ctx, e) {
    const dec = ctx.decisive.filter(d => d.entry === e).reduce((a, d) => a + (-d.points), 0);
    return Math.max(0, (e.p.Coste_Errores_Carteo || 0) - dec);
  }

  // Criterio 3: reparte "imps" entre los dos miembros de una pareja
  _splitPair(ctx, pair, imps, base) {
    if (pair.length === 1) {
      base.set(pair[0], (base.get(pair[0]) || 0) + imps);
      pair[0].p.Nota_IMPs = `${imps} IMPs`;
      return;
    }
    const bid = Math.abs(pair[0].p.Subasta + pair[1].p.Subasta);
    const e = pair.map(x => this._nonDecisiveErrCost(ctx, x));
    const denom = bid + e[0] + e[1];
    let resp = pair.map((_, i) => denom > 0 ? (bid / 2 + e[i]) / denom : 0.5);
    resp = resp.map(r => Math.min(0.5 + MAX_PLAY_SHIFT, Math.max(0.5 - MAX_PLAY_SHIFT, r)));
    const shares = imps < 0 ? resp : resp.map(r => 1 - r);
    pair.forEach((x, i) => {
      base.set(x, (base.get(x) || 0) + imps * shares[i]);
      x.p.Nota_IMPs = `${Math.round(shares[i] * 100)}% de ${pyRound2(imps)} IMPs de la pareja` +
        (e[i] ? ` (errores carteo ${e[i]} pts)` : "");
    });
  }

  _pairOf(ctx, room, ns) {
    return ctx.entries.filter(e => e.room === room && e.ns === ns);
  }

  // Regla 2 (criterio A): ambas parejas por debajo del par, de equipos
  // distintos y con el MISMO papel (las dos declaran o las dos defienden).
  _attributeBothBelowPar(ctx) {
    const { par, res } = ctx;
    if (par !== ctx.dC.meta["Par Puntos (NS)"]) return null;
    const dNsO = res.Abierta - par, dNsC = res.Cerrada - par;
    if (dNsO === 0 || dNsC === 0) return null;
    if ((dNsO < 0) !== (dNsC < 0)) return null; // mismo equipo
    const failNS = dNsO < 0; // en las dos salas falla el mismo lado (NS o EO)
    const declNS = (det) => { const k = det.meta.ContractKey; const m = k && k.match(/^\d(?:NT|[SHDC])([NESW])/); return m ? "NS".includes(m[1]) : null; };
    const roleO = declNS(ctx.dO) === failNS, roleC = declNS(ctx.dC) === failNS;
    if (declNS(ctx.dO) === null || declNS(ctx.dC) === null || roleO !== roleC) return null; // papel distinto -> regla B

    const base = new Map();
    const distO = Math.abs(dNsO), distC = Math.abs(dNsC);
    this.boardsDetail[ctx.num].imps_summary.criterio =
      `Ambas parejas bajo el par con el mismo papel (abierta ${-distO}, cerrada ${-distC}): ` +
      (distO === distC ? "empate, reparto a cero" : `gana la pareja de la sala ${distO < distC ? "abierta" : "cerrada"}`);
    for (const rn of ["Abierta", "Cerrada"]) {
      const pair = this._pairOf(ctx, rn, failNS);
      for (const e of ctx.entries.filter(e => e.room === rn && e.ns !== failNS)) {
        base.set(e, 0); e.p.Nota_IMPs = "Defensa: 0 IMPs (ambas parejas bajo el par)";
      }
      if (pair.length) this._splitPair(ctx, pair, ctx.teamImps[pair[0].team], base);
    }
    return base;
  }

  // Regla B: las parejas que fallan son de equipos distintos pero con papel
  // distinto. Los IMPs del ganador van a sus parejas POR ENCIMA del par (en
  // proporción a lo que ganaron) y los del perdedor a sus parejas POR DEBAJO.
  _attributeMixedRoles(ctx) {
    const { par, res } = ctx;
    const dNsO = res.Abierta - par, dNsC = res.Cerrada - par;
    if (dNsO === 0 || dNsC === 0 || (dNsO < 0) !== (dNsC < 0)) return null;
    const base = new Map();
    this.boardsDetail[ctx.num].imps_summary.criterio =
      "Parejas bajo el par con papel distinto: IMPs del ganador a su pareja por encima del par, los del perdedor a su pareja por debajo";
    for (const team of ["Equipo A", "Equipo B"]) {
      const T = ctx.teamImps[team];
      const pairs = [];
      for (const rn of ["Abierta", "Cerrada"]) for (const ns of [true, false]) {
        const pr = this._pairOf(ctx, rn, ns);
        if (!pr.length || pr[0].team !== team) continue;
        const d = (ns ? 1 : -1) * (res[rn] - par);
        pairs.push({ pr, d });
      }
      for (const { pr } of pairs) for (const e of pr) { base.set(e, 0); e.p.Nota_IMPs = "0 IMPs"; }
      if (T === 0) continue;
      const elig = pairs.filter(x => (T > 0 ? x.d > 0 : x.d < 0));
      const tot = elig.reduce((a, x) => a + Math.abs(x.d), 0);
      for (const x of elig) this._splitPair(ctx, x.pr, T * Math.abs(x.d) / tot, base);
    }
    return base;
  }

  // Reparto proporcional antiguo (por puntos técnicos de los 4 del equipo)
  _attributeProportional(ctx) {
    const base = new Map();
    for (const tn of ["Equipo A", "Equipo B"]) {
      const teamList = ctx.entries.filter(e => e.team === tn);
      const timps = ctx.teamImps[tn];
      if (!teamList.length) continue;
      const origPts = teamList.map(e => e.p.Total);
      let calcPts;
      if (timps > 0 && origPts.every(v => v >= -100 && v <= 100)) {
        calcPts = teamList.map(() => 1);
      } else {
        calcPts = origPts.slice();
        if (timps > 0 && origPts.reduce((a, b) => a + b, 0) < 0) {
          const offset = Math.abs(Math.min(...origPts));
          calcPts = origPts.map(v => v + offset);
        }
      }
      const sumCalc = calcPts.reduce((a, b) => a + b, 0);
      let attrs = calcPts.map(v => timps * (sumCalc !== 0 ? v / sumCalc : 1 / teamList.length));
      if (timps > 0 && attrs.some(a => a > timps)) {
        const maxIdx = attrs.indexOf(Math.max(...attrs));
        attrs = attrs.map((_, i) => i === maxIdx ? Number(timps) : 0.0);
      } else if (timps < 0 && attrs.some(a => a < timps)) {
        const minIdx = attrs.indexOf(Math.min(...attrs));
        attrs = attrs.map((_, i) => i === minIdx ? Number(timps) : 0.0);
      }
      teamList.forEach((e, i) => base.set(e, attrs[i]));
    }
    return base;
  }

  // D) y E): capa de errores decisivos sobre el reparto base
  _applyDecisiveLayer(ctx, base) {
    const { par, res } = ctx;
    for (const team of ["Equipo A", "Equipo B"]) {
      const T = ctx.teamImps[team];
      const errs = ctx.decisive.filter(d => d.team === team);
      if (!errs.length || T === 0) continue;
      const teamEntries = ctx.entries.filter(e => e.team === team);

      if (T < 0) {
        // D) Equipo que pierde: causas = el resto del déficit del equipo (el
        // reparto base, como bloque) + cada error decisivo, en proporción a
        // los IMPs que se habrían salvado sin cada una.
        const errW = errs.map(d => {
          const r = { ...res }; r[d.room] -= d.deltaNs;
          return Math.max(0, ctx.impsFor(team, r.Abierta, r.Cerrada) - T);
        });
        const r = { ...res };
        for (const rn of ["Abierta", "Cerrada"]) for (const ns of [true, false]) {
          if (ctx.teamOfSide(rn, ns) !== team) continue;
          const s = ns ? 1 : -1;
          const D = s * (res[rn] - par);
          const E = errs.filter(d => d.room === rn && d.entry.ns === ns).reduce((a, d) => a + s * d.deltaNs, 0);
          const R = D - E;
          if (R < 0) r[rn] -= s * R;
        }
        const baseW = Math.max(0, ctx.impsFor(team, r.Abierta, r.Cerrada) - T);
        const totW = baseW + errW.reduce((a, b) => a + b, 0);
        if (errW.every(w => w === 0) || totW === 0) continue;
        const f = baseW / totW;
        for (const e of teamEntries) {
          const v = base.get(e) || 0;
          base.set(e, v * f);
          if (v && f < 1) e.p.Nota_IMPs += ` · bloque ${Math.round(f * 100)}%`;
        }
        errs.forEach((d, i) => {
          if (!errW[i]) return;
          const add = T * errW[i] / totW;
          base.set(d.entry, (base.get(d.entry) || 0) + add);
          d.entry.p.Nota_IMPs += ` · error decisivo baza ${d.trick} (${d.room.toLowerCase()}): ${pyRound2(add)} IMPs (sin él se salvaban ${errW[i]})`;
        });
        this.boardsDetail[ctx.num].imps_summary.criterio +=
          ` · Pérdida de ${team} repartida por IMPs salvados: resto ${baseW}` +
          errs.map((d, i) => errW[i] ? `, ${d.entry.p.Jugador} ${errW[i]}` : "").join("");
      } else {
        // E) Equipo que gana: cada error decisivo que luego se compensó carga
        // PENAL_ERROR_DEVUELTO de los IMPs del equipo, que pasan a los demás.
        let pens = errs.map(() => PENAL_ERROR_DEVUELTO * T);
        const totP = pens.reduce((a, b) => a + b, 0);
        if (totP > T) pens = pens.map(x => x * T / totP);
        const penalized = new Set(errs.map(d => d.entry));
        let recips = teamEntries.filter(e => !penalized.has(e) && (base.get(e) || 0) > 0);
        let weights = recips.map(e => base.get(e));
        if (!recips.length) {
          recips = teamEntries.filter(e => !penalized.has(e));
          weights = recips.map(() => 1);
        }
        if (!recips.length) continue;
        const wSum = weights.reduce((a, b) => a + b, 0);
        errs.forEach((d, i) => {
          const pen = pens[i];
          base.set(d.entry, (base.get(d.entry) || 0) - pen);
          d.entry.p.Nota_IMPs += ` · error decisivo devuelto baza ${d.trick} (${d.room.toLowerCase()}): -${pyRound2(pen)} IMPs`;
          recips.forEach((e, j) => base.set(e, (base.get(e) || 0) + pen * weights[j] / wSum));
        });
        for (const e of recips) e.p.Nota_IMPs += " · recibe la penalización por error devuelto";
      }
    }
    // Redondeo a 2 decimales cuadrando el total exacto de cada equipo
    for (const team of ["Equipo A", "Equipo B"]) {
      const te = ctx.entries.filter(e => e.team === team);
      te.forEach(e => base.set(e, pyRound2(base.get(e) || 0)));
      const sum = te.reduce((a, e) => a + base.get(e), 0);
      const gap = pyRound2(ctx.teamImps[team] - sum);
      if (gap !== 0 && te.length) {
        const big = te.reduce((m, e) => Math.abs(base.get(e)) > Math.abs(base.get(m)) ? e : m, te[0]);
        base.set(big, pyRound2(base.get(big) + gap));
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

// Equipo ("A"/"B") de un jugador según sala y posición
export function ladoDe(roomName, pos) {
  const esNS = pos === "NORTH" || pos === "SOUTH";
  return (roomName.toLowerCase() === "abierta") === esNS ? "A" : "B";
}

// Ordena jugadores de una sala: primero un equipo, luego el otro;
// dentro de cada equipo, por puntuación total (mejor primero)
export function ordenarPorEquipos(players, roomName) {
  const conLado = players.map(p => ({ p, lado: ladoDe(roomName, p.Pos) }));
  conLado.sort((x, y) => (x.lado < y.lado ? -1 : x.lado > y.lado ? 1 : y.p.Total - x.p.Total));
  return conLado.map(o => o.p);
}

// Filas del informe técnico agrupadas por equipo (Equipo A, luego B;
// dentro de cada equipo por total descendente, con subtotal)
export function filasInformePorEquipos(analyzer) {
  const grupos = [];
  for (const tn of ["Equipo A", "Equipo B"]) {
    const filas = [];
    for (const name of [...analyzer.teamsRoster[tn]].filter(Boolean)) {
      const d = analyzer.playersData[name];
      if (!d) continue;
      const ts = Object.values(d.bidding).reduce((a, b) => a + b, 0);
      const tc = Object.values(d.play).reduce((a, b) => a + b, 0);
      filas.push([name, ts, tc, ts + tc]);
    }
    filas.sort((a, b) => b[3] - a[3]);
    const sts = filas.reduce((a, r) => a + r[1], 0);
    const stc = filas.reduce((a, r) => a + r[2], 0);
    grupos.push({ equipo: tn, filas, subtotal: [sts, stc, sts + stc] });
  }
  return grupos;
}

// Estadísticas acumuladas por equipo: agrega los partidos por equipo registrado
// y las estadísticas de cada jugador solo dentro de su equipo.
// Devuelve { teams: {id: {...}}, legacyCount: n }
export function calcularEstadisticasEquipos(stats) {
  const equiposDef = stats.equipos || {};
  const teams = {};
  let legacyCount = 0;
  const partidos = Object.values(stats.partidos || {}).sort((a, b) =>
    String(a.procesado || "").localeCompare(String(b.procesado || "")));
  for (const partido of partidos) {
    if (!partido.equipos) { legacyCount++; continue; }
    for (const lado of ["A", "B"]) {
      const side = partido.equipos[lado];
      if (!side) continue;
      const t = teams[side.id] || (teams[side.id] = {
        id: side.id,
        nombre: (equiposDef[side.id] && equiposDef[side.id].nombre) || side.id,
        partidos: 0, manos: 0, imps: 0, subasta: 0, carteo: 0, errores: 0, jugadores: {},
      });
      t.partidos += 1;
      t.manos += partido.manos || 0;
      t.imps += side.imps || 0;
      for (const name of side.jugadores || []) {
        const j = (partido.jugadores || {})[name];
        if (!j) continue;
        t.subasta += j.subasta; t.carteo += j.carteo;
        t.errores += (j.errores_carteo || []).length;
        const pj = t.jugadores[name] || (t.jugadores[name] = {
          partidos: 0, manos: 0, imps: 0, subasta: 0, carteo: 0, errores: 0, historial: [],
        });
        pj.partidos += 1; pj.manos += j.manos; pj.imps += j.imps;
        pj.subasta += j.subasta; pj.carteo += j.carteo;
        pj.errores += (j.errores_carteo || []).length;
        pj.historial.push({
          fecha: partido.fecha || "", partido: (partido.archivos || []).join(", "),
          manos: j.manos, imps: j.imps, subasta: j.subasta, carteo: j.carteo,
        });
      }
    }
  }
  return { teams, legacyCount };
}

// Filas de jugadores de un equipo ordenadas por IMPs (mejor primero)
export function filasJugadoresEquipo(team) {
  const filas = [];
  for (const [name, a] of Object.entries(team.jugadores)) {
    filas.push({
      name, partidos: a.partidos, manos: a.manos, imps: pyRound2(a.imps),
      butler: a.manos ? pyRound2(a.imps / a.manos) : 0,
      subasta: a.subasta, carteo: a.carteo, errores: a.errores,
      tendencia: tendencia(a.historial), historial: a.historial,
    });
  }
  filas.sort((a, b) => b.imps - a.imps);
  return filas;
}
