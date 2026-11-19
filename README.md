# Tablero de corcho para la boda

Página web estilo corcho con tarjetas Polaroid para planear la boda y la despedida de solteros.

- La página vive en este repositorio y se publica con GitHub Pages.
- Toda la información (tareas, estados, fechas, posiciones) vive en un Google Sheets.
- Un Apps Script pequeño conecta la página con el Sheets.
- El novio y el padrino editan con un enlace especial. Los caballeros de honor ven el tablero con el enlace normal, sin poder cambiar nada.

## Estructura

```
index.html            página
css/style.css         colores y estilo del corcho y las polaroids
js/config.js          aquí se pega la URL de Apps Script
js/escenas.js         dibujos por defecto (traje, playa, calendario...)
js/app.js             lógica del tablero
img/                  fotos propias (opcional)
apps-script/Code.gs   código que va dentro del Sheets
```

## Puesta en marcha

### 1. El Sheets y el Apps Script (5 minutos)

1. Crea un Google Sheets nuevo, por ejemplo "Tablero boda".
2. Menú Extensiones > Apps Script. Borra lo que haya y pega todo el contenido de `apps-script/Code.gs`.
3. Arriba, elige la función `setup` y pulsa Ejecutar. Acepta los permisos. Se crean las pestañas `Tareas` (con 5 tareas de ejemplo) y `Config`.
4. En la pestaña `Config`, la celda B2 es la clave de edición. Puedes cambiarla por otra.
5. Implementar > Nueva implementación > Aplicación web.
   - Ejecutar como: Yo
   - Quién tiene acceso: Cualquier persona
6. Copia la URL que termina en `/exec`.

### 2. GitHub Pages

1. Sube esta carpeta a un repositorio nuevo de GitHub.
2. Abre `js/config.js` y pega la URL en `API_URL`. Guarda el cambio (commit).
3. En el repositorio: Settings > Pages > Source: "Deploy from a branch", rama `main`, carpeta `/ (root)`.
4. Espera un minuto. La página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

### 3. Enlaces

- Para los caballeros de honor (solo ver): `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`
- Para el novio y el padrino (editar): el mismo enlace con `#clave=TU-CLAVE` al final.
  Ejemplo: `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/#clave=ab12cd34ef`
  La primera vez que lo abren, el navegador recuerda la clave. No compartan este enlace con los demás.

## Uso diario

- Clic en una tarjeta: la marca o desmarca como completada (la foto pasa a blanco y negro y aparece el sello LISTO).
- El papel azul del tablero cuenta los pasos completados. Se arrastra a donde quieras y la posición queda guardada en la pestaña Config.
- Arrastrar una tarjeta: cambia su posición en el corcho.
- Lápiz en la tarjeta: editar título, fecha de cita, detalle, imagen y conexiones.
- Nueva tarea: botón arriba.
- También se puede editar directamente en el Sheets. La página se actualiza sola cada minuto.

## Fotos propias

En la columna `imagen` del Sheets (o en el campo Imagen al editar) se acepta:

- Una ruta de este repositorio: sube la foto a la carpeta `img/` y escribe `img/playa.jpg`.
- Un link de Drive (la foto debe estar compartida como "cualquier persona con el enlace").
- Cualquier link `https://`.

Si queda vacía, se usa el dibujo de la columna `escena`.

## Cambiar el aspecto o agregar funciones

Todo está en archivos separados:

- Colores, tamaños y estilo: `css/style.css`
- Dibujos por defecto: `js/escenas.js`
- Comportamiento: `js/app.js`

Cada cambio que se guarda (commit) en GitHub se publica solo en un par de minutos. Si se modifica `Code.gs`, hay que pegarlo de nuevo en el Apps Script y usar Implementar > Administrar implementaciones > Editar > Nueva versión.

## Probar sin conectar nada

Con `API_URL` vacío, la página abre en modo demostración con datos de ejemplo (no se guardan). Para verla en el computador: `python3 -m http.server` dentro de esta carpeta y abrir `http://localhost:8000`.
