// Identidad explícita: el orden del título del partido no indica los asientos.
const tag = (info, name) => String(Object.entries(info || {}).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] || '').trim();
export function readTeamNames(parsed, overrides = {}) {
  const names = {};
  for (const [side, label] of [['A', 'Equipo A'], ['B', 'Equipo B']]) {
    const candidates = new Set();
    for (const [boards, room] of parsed) for (const board of boards) {
      const ns = (room === 'Abierta') === (side === 'A');
      const value = tag(board.info, ns ? 'TeamNS' : 'TeamEW');
      if (value) candidates.add(value);
    }
    if (candidates.size > 1) throw new Error(`Nombres de equipo contradictorios para ${label}. Revisa TeamNS/TeamEW en las salas.`);
    names[label] = String(overrides[label] || '').trim() || [...candidates][0] || '';
  }
  if (names['Equipo A'] && names['Equipo B'] && names['Equipo A'].localeCompare(names['Equipo B'], 'es', {sensitivity:'base'}) === 0)
    throw new Error('Los dos bandos no pueden tener el mismo nombre de equipo. Revisa los asientos.');
  return names;
}
