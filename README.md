# BridgeLab Web

Analizador de partidos de bridge por equipos, directamente en el navegador.
Subes los archivos PBN de la sala abierta y la sala cerrada (exportados de BBO
o MyHands) y obtienes:

- Puntos técnicos de subasta y carteo por jugador y mano, ordenados por equipos
- Comparación con el par doble-dummy de cada mano
- IMPs del partido y atribución por jugador
- Carteo interactivo: recorre la jugada carta a carta, con cada carta en la
  posición de su jugador (N, S, E, O) como en la mesa, y verás en rojo cada
  error técnico en el momento en que se comete
- Mesa de subasta visual (columnas O, N, E, S) con los palos como símbolos;
  las voces que difieren de la otra sala van sombreadas y el contrato final se
  marca en verde si se juega lo mismo en las dos salas o en rojo si no
- Resumen del partido en la web tan completo como el del Excel: IMPs por
  jugador en la tabla técnica y mejores técnico y competitivo de cada equipo
- Informe Excel descargable con formato (resumen, una hoja por mano,
  estadísticas)
- Estadísticas acumuladas **por equipo** guardadas en tu navegador: cada
  equipo agrupa a todos sus jugadores (aunque no jueguen todos los partidos)
  con butler, tendencias y desglose por partido

Todo el cálculo ocurre en tu dispositivo (motor DDS de Bo Haglund compilado a
WebAssembly). Ningún archivo se sube a ningún servidor.

## Cómo publicarlo gratis en GitHub Pages

No hace falta saber programar. Solo una cuenta de GitHub (gratuita).

1. Entra en https://github.com e inicia sesión (o crea una cuenta gratis).
2. Arriba a la derecha, pulsa **+** → **New repository**.
   - Nombre: por ejemplo `bridgelab`
   - Déjalo **Public** y pulsa **Create repository**.
3. En la página del repositorio, pulsa **uploading an existing file**
   (o **Add file** → **Upload files**).
4. Arrastra **todos** los archivos y carpetas de esta carpeta
   (`index.html`, `README.md`, las carpetas `css` y `js` con todo su contenido).
   - Si GitHub no te deja subir carpetas enteras, súbelas una a una:
     primero crea la carpeta con **Add file** → **Create new file** y escribe
     `css/style.css` como nombre, pega el contenido y confirma; repite con cada
     archivo. También puedes arrastrar la carpeta completa desde el explorador
     de archivos, que suele funcionar.
5. Pulsa **Commit changes**.
6. Ve a **Settings** → **Pages** (menú lateral izquierdo).
   - En **Source** elige **Deploy from a branch**.
   - En **Branch** elige **main** y carpeta **/ (root)**. Pulsa **Save**.
7. Espera 1-2 minutos y entra en:
   `https://TU-USUARIO.github.io/bridgelab/`
   (sustituye TU-USUARIO por tu nombre de usuario de GitHub y `bridgelab`
   por el nombre del repositorio).

Ya está. Esa dirección es la que puedes compartir con tus amigos.

## Cómo usarlo

1. En BBO: **Account** → **MyHands** (http://myhands.bridgebase.com), descarga
   el PBN de la sesión de cada sala, o exporta los PBN desde el historial de
   manos. Nombra los archivos como quieras (p. ej. `abierta.pbn` y
   `cerrada.pbn`); lo importante es subir cada uno en su campo.
2. Abre la web, sube ambos archivos y pulsa **Analizar partido**.
3. El primer análisis tarda unos segundos en cargar el motor; después cada mano
   tarda un momento porque calcula el doble-dummy de cada jugada.
4. Pulsa **Descargar informe Excel** para el informe completo en `.xlsx`.
5. Las estadísticas acumuladas se guardan solas en el navegador; con
   **Borrar evento** eliminas solo el evento elegido; **Borrar todo el histórico**
  empieza de cero.

## Equipos y estadísticas

- El Equipo A es NS en sala abierta y EO en sala cerrada (igual que en la
  versión de escritorio).
- Las estadísticas se agrupan por **equipo**: la primera vez que analizas un
  partido se crean dos equipos ("Equipo 1" y "Equipo 2"). Usa el botón ✏️
  junto al nombre para ponerles el nombre real (queda guardado).
- En partidos siguientes, cada alineación se asigna automáticamente al equipo
  con más jugadores en común, así los suplentes se suman a su equipo aunque no
  jueguen todos los partidos. Si un partido lo juegan 8 jugadores distintos,
  se crean dos equipos nuevos.
- Si analizas el mismo partido dos veces no se duplica en las estadísticas.
- Los nombres de los jugadores se leen de las etiquetas `North`, `South`,
  `East`, `West` del PBN; conviene que sean consistentes entre partidos para
  que las estadísticas se acumulen bien.

## Cambios v4 (criterios de atribución)

- Puntos de subasta por pareja, repartidos 50/50 (la defensa solo cobra si intervino).
- Si en las dos salas la pareja que falla queda por debajo del par, la mano la
  gana la pareja que menos se aleja del par; los IMPs van a las dos parejas que
  fallaron y la defensa se queda a 0.
- Dentro de esa pareja, los IMPs se reparten según los errores de carteo de
  cada uno, con un tope de 75% / 25%.
- Los parámetros (BID_SHARE_PER_PLAYER y MAX_PLAY_SHIFT) están explicados al
  principio de js/analyzer.js.

## Cambios v5

- La regla "gana la pareja que menos se aleja del par" solo se aplica si las
  dos parejas que fallan tienen el mismo papel (las dos declaran o las dos
  defienden). Si no, los IMPs del ganador van a su pareja por encima del par y
  los del perdedor a su pareja por debajo.
- Errores decisivos de carteo (en todas las manos): un error que en el momento
  de cometerse cambia el signo de la mano. En el equipo que pierde, la pérdida
  se reparte según los IMPs que se habrían salvado sin cada error. En el
  equipo que gana, un error decisivo que luego devolvieron los contrarios
  carga el 25% de los IMPs del equipo (PENAL_ERROR_DEVUELTO).
- Debajo de cada mano se listan los errores decisivos y cómo cambia la mano.

## Contador de visitas (v5.1)

El contador visible al pie de `index.html` usa el servicio gratuito hits.dwyl.com. No requiere crear una cuenta ni editar un identificador: ya está integrado en el archivo. Muestra visitas registradas por el servicio, no personas únicas garantizadas; puede verse afectado por caché, bloqueadores o visitas propias. El recuento empieza con esta versión y no recupera visitas anteriores. El navegador solicita el distintivo al servicio externo; los archivos PBN siguen procesándose en tu dispositivo.

Para publicar esta versión, descomprime el ZIP y sube **el contenido** (no el ZIP) al repositorio en GitHub con **Add file → Upload files → Commit changes**. Espera 1-2 minutos a GitHub Pages y recarga con **Ctrl+F5**.

## Cambios v6 - histórico por evento

- El selector **Estadísticas** muestra un evento o **Global - todos los eventos**.
  El informe de las manos siempre es del partido cargado. La hoja Estadísticas
  del Excel respeta el selector; el resto del Excel sigue siendo del partido.
- La clave del evento sale de `[Event "..."]` del PBN: se quitan acentos,
  puntuación y diferencias entre mayúsculas y espacios. Si hay un sufijo
  `: Equipo A vs Equipo B` (también `v.` o `contra`), se quita ese
  enfrentamiento y se conserva la liga/temporada anterior. Así, `Liga AEB:
  Last Minute vs Galactus` y otra jornada de Liga AEB van juntas; `Liga AEB
  2025` y `Liga AEB 2026` quedan separadas. Sin etiqueta, va a **Sin evento**.
  No se adivinan nombres equivalentes distintos: revisa la etiqueta en tus PBN
  si dos partidos de la misma liga aparecen en dos opciones. Los eventos de
  sala abierta y cerrada deben coincidir tras normalizar; si no, no se guarda.
- La primera apertura convierte automáticamente el histórico v5 sin perder
  partidos, datos por jugador ni nombres de equipo. Se conserva la etiqueta
  original de cada partido. No se borra el histórico si falla la migración.
- Los equipos se asignan **dentro de cada evento** por jugadores en común;
  de esta forma una alineación de entrenamiento no altera el equipo de liga.
  En Global aparecen los equipos de cada evento por separado, no se fusionan
  por tener jugadores comunes. Los identificadores del partido ya guardado
  se conservan al reanalizarlo. Los partidos se deduplican por el contenido
  de ambos PBN; un partido antiguo equivalente se reemplaza al reanalizarlo.
- **Borrar evento** borra solo los partidos del evento seleccionado; **Borrar
  todo el histórico** borra todos. Ambas acciones piden confirmación. Todo
  sigue guardado únicamente en este navegador; no se sincroniza entre equipos.

Para actualizar: descomprime el ZIP y sube **su contenido** al repositorio
(GitHub: Add file > Upload files). Pulsa **Commit changes**, espera 1-2 minutos
para GitHub Pages y recarga con **Ctrl+F5**.

## Cambios v6.1 - filtro combinado de equipo y evento

- Elige **Evento** (una liga o Global) y **Equipo** (todos o uno). La vista
  acumulada se reduce al equipo seleccionado. Al cambiar de evento se conserva
  el equipo si participa allí; si no, vuelve a Todos los equipos. El informe
  de manos siempre corresponde al último partido analizado.
- En Global, cada equipo lleva la etiqueta de su evento; seleccionar uno
  muestra solo sus partidos de ese evento, sin mezclar equipos de distintas
  ligas por un nombre o jugadores parecidos. Para ver un equipo en otra liga,
  selecciónalo allí. Los equipos antiguos sin datos de equipo no aparecen
  como opción; puedes reanalizar esos partidos para incorporarlos.
- La hoja **Estadísticas** del Excel sigue ambos selectores; Resumen y hojas
  de manos siguen siendo las del partido analizado. No cambia el esquema del
  histórico v6 ni su migración desde v5, deduplicación o borrado por evento.

## Cambios v7 - entrada LIN y mesa única

**Entrada.** Se aceptan `.pbn`, `.lin` y `.txt` en cualquiera de los dos campos.
La detección es por contenido: etiqueta PBN `[Event "..."]` o registro LIN `md|...|`.
Dos archivos conservan el partido de dos salas. Un archivo solo, en cualquiera
 de los campos, activa automáticamente **mesa única**. No se publica ni se sube
ningún archivo a un servidor: DDS y el histórico trabajan en el navegador.

**LIN.** El lector en `js/lin.js` admite manos de tres o cuatro jugadores en
`md|` (orden Sur-Oeste-Norte-[Este], cuarto completado desde la baraja),
`pn|` con el mismo orden de nombres, `sv|`, `qx|` o `ah|` para número, `mb|`
para subasta (P/D/R), `pc|` en orden cronológico y `mc|` para bazas finales
 del declarante cuando hubo reclamación. `tn|` o `rh|` aportan evento y
`dt|` la fecha si existen. Sin evento se guarda en **Sin evento**; si quieres
separar ligas, asegúrate de que el LIN lo traiga. Un carteo parcial sin `mc`
se rechaza: adivinar el resultado afectaría puntos e IMPs. Se rechazan
repartos incompletos o duplicados y cartas jugadas fuera del reparto.

LIN es una notación privada sin especificación pública completa. Se han
contrastado los tags con ejemplos de los foros de BBO y el lector abierto
morgoth/lin:
- https://www.bridgebase.com/forums/topic/85366-lin-file-format/
- https://www.bridgebase.com/forums/topic/2233-example-lin-file-for-upload-to-tourney/
- https://raw.githubusercontent.com/morgoth/lin/master/lib/lin/parser.rb

Otros dialectos LIN podrían traer el resultado en tags distintos o carecer de
subasta/carteo; no se extrapola un resultado no presente. Para comprobar un
archivo real que falle, conserva el LIN y el error mostrado antes de editarlo.
`tests/mesa1.lin` y `tests/mesa2.lin` son conversión sintética de los PBN
adjuntos, no exportaciones reales de BBO. `node tests/lin-equivalence.mjs
<mesa1.pbn> <mesa2.pbn>` reproduce la prueba de equivalencia de las 28 manos.

**Sala fantasma.** Para cada mano la referencia de la otra sala es exactamente
el par NS que calcula DDS: `IMPs = tabla_IMPs(resultado_NS_real - par_NS)`.
No se inventan cuatro jugadores más. El equipo A son NS y el B son EO de la
mesa real; el par ganador es el que sale mejor que el par, y si una pareja
queda por debajo del par carga los IMPs negativos. Cada pareja empieza 50/50;
el ajuste por errores de carteo no decisivos tiene tope 75/25 y los errores
que cambian el signo de los IMPs se comparan **contra el par** con la capa
v5 de errores decisivos y penalización del 25% si el error se devuelve.
La puntuación técnica sigue siendo resultado menos par y no cambia.
El par de DDS es una referencia de puntuación, **no** una sala con jugadores
ni un resultado real de otro equipo. Así, el balance de mesa única no se
interpreta como marcador oficial entre dos equipos de cuatro.

**Histórico.** Cada partido de mesa única guarda `mesaUnica: true` y una clave
de evento `mesa-unica:<evento>`, visible como "Mesa única · <evento>". Se
separa de la liga homónima de dos salas, incluidos equipos y asignación por
plantilla. La vista Global muestra ambas series **etiquetadas por separado**;
selecciona la serie de Evento para ver solo una. El equipo fantasma no tiene
identidad ni jugadores y no entra en estadísticas. PBN y LIN equivalentes
comparten huella de contenido y se sustituyen al reanalizar; para un partido
v6.1 anterior con el mismo contenido bruto, se conserva su identificador.

**Prueba Chrome local.** Los dos PBN del 22/09/2026 mantienen Last Minute vs
Galactus 24-50 IMPs, neto -26. Los LIN sintéticos correspondientes dan el mismo
informe, puntos por jugador y 24-50. Solo mesa 1 frente al par da 39 IMPs
brutos NS y 62 EO, neto -23: por ejemplo, mano 1, resultado NS supera el par
por 500 puntos = +11 IMPs NS; mano 2 cae 300 puntos = -7 IMPs NS.
La misma mesa en LIN repite resultados idénticos. La prueba sucesiva deja
solo dos historiales (uno dos salas y otro mesa única) con filtros separados.

**Publicación por David:** descomprime el ZIP, sube los archivos de dentro al
repositorio con **Upload files**, pulsa **Commit changes**, espera 1-2 minutos
y recarga con **Ctrl+F5**. Esta entrega no se ha publicado.
