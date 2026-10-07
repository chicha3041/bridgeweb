// Copias locales v7.7: validación completa antes de escribir; no hay servidor.
import {loadStats,saveStats} from './stats.js';
import {normalizePlayerHistory} from './player-names.js';
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function check(condition) { if (!condition) throw new Error('Copia incompatible o incompleta. El histórico no se ha cambiado.'); }
function safeTree(v, depth=0) {
  check(depth < 30);
  if (Array.isArray(v)) { check(v.length <= 100000); for(const item of v) safeTree(item,depth+1); }
  else if(isObject(v)) for(const [key,value] of Object.entries(v)) { check(!['__proto__','constructor','prototype'].includes(key)); safeTree(value,depth+1); }
  else check(v===null || ['string','boolean'].includes(typeof v) || (typeof v==='number' && Number.isFinite(v)));
}
export function validateHistory(value) {
  safeTree(value);
  check(isObject(value) && value.version===6 && isObject(value.partidos) && isObject(value.equipos));
  check(Object.keys(value.partidos).length<=10000 && Object.keys(value.equipos).length<=10000);
  for(const team of Object.values(value.equipos)) check(isObject(team) && typeof team.nombre==='string' && Array.isArray(team.jugadores) && team.jugadores.every(n=>typeof n==='string'));
  for(const match of Object.values(value.partidos)) {
    check(isObject(match) && typeof match.evento==='string' && typeof match.eventoClave==='string' && typeof match.fecha==='string' && Number.isInteger(match.manos) && match.manos>=0 && isObject(match.jugadores) && isObject(match.equipos));
    for(const player of Object.values(match.jugadores)) {
      check(isObject(player) && ['subasta','carteo','imps','manos'].every(k=>typeof player[k]==='number' && Number.isFinite(player[k])) && Number.isInteger(player.manos) && player.manos>=0 && Array.isArray(player.errores_carteo));
    }
    for(const side of Object.values(match.equipos)) check(isObject(side) && typeof side.id==='string' && Object.hasOwn(value.equipos,side.id) && Array.isArray(side.jugadores) && side.jugadores.every(n=>typeof n==='string' && Object.hasOwn(match.jugadores,n)) && typeof side.imps==='number' && Number.isFinite(side.imps));
  }
  return normalizePlayerHistory(value);
}
export function serializeBackup(stats=loadStats()) {
  return JSON.stringify({format:'BridgeLab-history',backupVersion:1,createdAt:new Date().toISOString(),stats:validateHistory(stats)},null,2);
}
export function parseBackup(text) {
  if(typeof text!=='string' || text.length>20*1024*1024) throw new Error('Copia demasiado grande (máximo 20 MB).');
  let value;try{value=JSON.parse(text)}catch{throw new Error('El archivo no es una copia JSON válida. El histórico no se ha cambiado.');}
  check(isObject(value) && value.format==='BridgeLab-history' && value.backupVersion===1);
  return validateHistory(value.stats);
}
export function importBackup(text) { const stats=parseBackup(text);saveStats(stats);return stats; }
export function downloadBackup(stats=loadStats(),suffix='') {
  const blob=new Blob([serializeBackup(stats)],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=`bridgelab-historico${suffix}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
