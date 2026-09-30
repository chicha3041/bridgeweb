// Alias confirmado por el usuario: Cassandra Nova y CassandraNova son la misma persona.
// No se fusionan otros jugadores por parecido de nombre.
export function canonicalPlayerName(value) {
  const name = String(value || "").trim();
  return name.replace(/\s+/g, "").toLowerCase() === "cassandranova" ? "CassandraNova" : name;
}
export function normalizePlayerHistory(stats) {
  const result = structuredClone(stats);
  for (const team of Object.values(result.equipos || {})) {
    team.jugadores = [...new Set((team.jugadores || []).map(canonicalPlayerName))];
  }
  for (const match of Object.values(result.partidos || {})) {
    const players = {};
    for (const [name, data] of Object.entries(match.jugadores || {})) {
      const canonical = canonicalPlayerName(name);
      // Dos variantes en el mismo partido podrían representar dos asientos reales.
      // No sumar ni descartar puntuaciones ante esa ambigüedad.
      if (Object.hasOwn(players, canonical)) throw new Error("Dos variantes de " + canonical + " aparecen en el mismo partido. El histórico no se ha cambiado; revisa los nombres de ese partido.");
      players[canonical] = data;
    }
    match.jugadores = players;
    for (const side of Object.values(match.equipos || {})) {
      side.jugadores = [...new Set((side.jugadores || []).map(canonicalPlayerName))];
    }
  }
  return result;
}
