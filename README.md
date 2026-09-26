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
