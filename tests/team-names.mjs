import assert from 'node:assert/strict';
import {readRoom, normalizeBridgedomEvent} from '../js/room-input.js';
import {readTeamNames} from '../js/team-input.js';
import {registrarEstadisticas,loadStats,filterSelection,teamOptions} from '../js/stats.js';
import {calcularEstadisticasEquipos} from '../js/analyzer.js';
import {webcrypto} from 'node:crypto';globalThis.crypto ||= webcrypto;
let raw=null;globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>raw=v};
const parsed=[[[{info:{TeamNS:'Galactus',TeamEW:'Other'}}],'Abierta'],[[{info:{TeamNS:'Other',TeamEW:'Galactus'}}],'Cerrada']];
assert.deepEqual(readTeamNames(parsed),{'Equipo A':'Galactus','Equipo B':'Other'});
assert.equal(readTeamNames(parsed,{'Equipo A':'New'})['Equipo A'],'New');
assert.throws(()=>readTeamNames([[[{info:{TeamNS:'Wrong'}}],'Cerrada'],...parsed]));
assert.equal(readTeamNames([[[{info:{Event:'Galactus - Other'}}],'Abierta']])['Equipo A'],'');
for(const s of ['·','�','ï¿½','Â·']) {let b={info:{Site:'bridgedom.com',Event:`Galactus - Other ${s} Mesa 2`}};normalizeBridgedomEvent(b);assert.equal(b.info.Event,'Galactus - Other');}
for(const enc of ['utf8','latin1']) {let bytes=Buffer.from('%Content-type: text/x-pbn; charset=ISO-8859-1\n[Event "Galáctus · Mesa 1"]\n[Board "1"]\n[North "José"]\n',enc);let room=await readRoom([{name:'test.pbn',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}],'Abierta');assert.equal(room.boards[0].info.North,'José');}
const a=(event,id,ra,rb,names)=>({matchEvent:event,matchIdentity:id,sourceFiles:['a','b'],activeBoards:new Set([1]),teamsRoster:{'Equipo A':new Set(ra),'Equipo B':new Set(rb)},teamNames:names,matchGrossGain:{},playersData:Object.fromEntries([...ra,...rb].map(n=>[n,{bidding:{1:0},play:{1:0},imps:{1:0}}]))});
const first=a('First','one',['Ana','David'],['X','Y'],{'Equipo A':'Galactus','Equipo B':'Other'});
await registrarEstadisticas(first);await registrarEstadisticas(a('Second','two',['X','Z'],['David','Eva'],{'Equipo A':'Else','Equipo B':'Galactus'}));
let t=calcularEstadisticasEquipos(filterSelection(loadStats(),'','global:galactus')).teams['global:galactus'];assert.equal(t.partidos,2);assert.equal(t.jugadores.David.partidos,2);assert.equal(t.jugadores.Eva.partidos,1);assert.equal(teamOptions(loadStats()).filter(([,v])=>v.name==='Galactus').length,1);
await registrarEstadisticas(first);assert.equal(Object.keys(loadStats().partidos).length,2);
console.log('OK: explicit seats, no title guess, contradictory metadata, UTF-8/Latin-1, broken separator, rotating rosters, side reversal, reanalysis.');
