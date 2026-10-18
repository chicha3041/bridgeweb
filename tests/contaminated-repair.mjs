import assert from 'node:assert/strict';
import {registrarEstadisticas,loadStats,deleteMatch,listMatches} from '../js/stats.js';
import {webcrypto} from 'node:crypto';globalThis.crypto ||= webcrypto;
let raw=null;globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>raw=v};
const G=['Ankgor','CassandraNova','Pikachu','chiquinquira'],S=['cedro5','Marqués Borja','n1n2m3','Narien'];
const a=(event,id,ra,rb,names={})=>({matchEvent:event,matchIdentity:id,sourceFiles:['a','b'],activeBoards:new Set([1]),teamsRoster:{'Equipo A':new Set(ra),'Equipo B':new Set(rb)},teamNames:names,matchGrossGain:{},playersData:Object.fromEntries([...ra,...rb].map(n=>[n,{bidding:{1:0},play:{1:0},imps:{1:0}}]))});
const seed=async()=>{raw=null;
 await registrarEstadisticas(a('M1','m1',G,['x1','x2','x3','x4'],{'Equipo A':'Galactus','Equipo B':'R1'}));
 await registrarEstadisticas(a('M2','m2',['y1','y2','y3','y4'],G.slice().reverse(),{'Equipo A':'R2','Equipo B':'Galactus'}));
 await registrarEstadisticas(a('M3','m3',G,['z1','z2','z3','z4'],{'Equipo A':'Galactus','Equipo B':'R3'}));};
const gal=s=>Object.values(s.equipos).find(e=>e.nombre==='Galactus');
const contaminate=async()=>{await seed();await registrarEstadisticas(a('M4','m4',G,S));
 const s=loadStats();const k=Object.keys(s.partidos).find(k=>s.partidos[k].evento==='M4');const p=s.partidos[k];
 // estado v7.9 contaminado: A(Al Sur)->id Galactus, B(Galactus)->id rival, Galactus con 8
 const gid=Object.entries(s.equipos).find(([,e])=>e.nombre==='Galactus')[0];
 const other=p.equipos.B.id;
 p.equipos={A:{id:gid,jugadores:S.slice().sort(),imps:0},B:{id:other,jugadores:G.slice().sort(),imps:0}};
 s.equipos[gid].jugadores=[...G,...S].sort();raw=JSON.stringify(s);return k;};
for(const [lbl,A,B] of [['mismo orden',G,S],['salas invertidas',S,G]]){
 const k=await contaminate();assert.equal(gal(loadStats()).jugadores.length,8);
 await registrarEstadisticas(a('M4','m4',A,B));
 const s=loadStats();assert.equal(Object.keys(s.partidos).length,4);
 assert.deepEqual(gal(s).jugadores,G.slice().sort(),lbl);
 const p4=s.partidos[k];const names=Object.values(p4.equipos).map(e=>s.equipos[e.id].nombre);
 assert.ok(names.includes('Galactus'));console.log(lbl,'OK',names,gal(s).jugadores.length);
}
const k=await contaminate();let s=deleteMatch(k);
assert.equal(Object.keys(s.partidos).length,3);assert.deepEqual(gal(s).jugadores,G.slice().sort());assert.equal(listMatches(s).length,3);
// reanálisis válido conserva nombre tecleado del rival
await seed();await registrarEstadisticas(a('M4','m4',G,S,{'Equipo B':'Al Sur'}));await registrarEstadisticas(a('M4','m4',S,G));
s=loadStats();assert.ok(Object.values(s.equipos).some(e=>e.nombre==='Al Sur'));assert.equal(gal(s).jugadores.length,4);
console.log('OK repair + delete');
