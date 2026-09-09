# BridgeLab Web

Analizador de partidos de bridge por equipos, directamente en el navegador.
Subes los archivos PBN de la sala abierta y la sala cerrada (exportados de BBO
o MyHands) y obtienes:

- Puntos técnicos de subasta y carteo por jugador y mano
- Comparación con el par doble-dummy de cada mano
- IMPs del partido y atribución por jugador
- Jugadas críticas del carteo, baza a baza
- Informe Excel descargable
- Estadísticas acumuladas (butler individual, tendencias, desglose por partido)
  guardadas en tu navegador

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
   **Borrar histórico** empiezas de cero.

Notas:

- El Equipo A es NS en sala abierta y EO en sala cerrada (igual que en la
  versión de escritorio).
- Si analizas el mismo partido dos veces no se duplica en las estadísticas.
- Los nombres de los jugadores se leen de las etiquetas `North`, `South`,
  `East`, `West` del PBN; conviene que sean consistentes entre partidos para
  que las estadísticas se acumulen bien.
