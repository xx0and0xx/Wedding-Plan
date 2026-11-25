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
- Para todos: el mismo enlace. Aparece la caja fuerte; se escribe el código de acceso (la fecha de la boda) y luego el correo registrado. La hoja decide si esa persona edita o solo mira. Alternativa con la clave de respaldo: el mismo enlace con `#clave=TU-CLAVE` al final.

## Quién entra y con qué rol

**El código de acceso** es el mismo para todos y está en la pestaña `Config`, fila `codigo_acceso` (6 números, ahora `150427`). Para cambiarlo, edita esa celda: las sesiones abiertas se cierran y todos tendrán que escribir el nuevo.

**La lista de personas:** pestaña `Personas`, con tres columnas:
- `nombre`
- `correo`
- `rol`: `admin` (edita) u `observador` (solo ve). Es un menú desplegable.

Cada persona entra con su correo. Quien no esté en la lista no pasa. El cambio de rol vale al instante, también para quien ya había entrado. Para quitar a alguien, borra su fila.

**Seguridad, en pocas palabras:**
- El código es la fecha de la boda: es fácil de adivinar para quien conozca la pareja. Además, el correo no se verifica con una contraseña propia, solo se busca en la lista. Quien sepa el código y el correo de un admin podría entrar como él. Sirve para un tablero entre amigos, no para datos delicados.
- Si quieres más seguridad, cambia el código por uno menos obvio o quita el rol `admin` a quien no lo necesite.
- Ver el tablero no es confidencial: cualquiera con el enlace puede leerlo si logra abrirlo.
- Hay un límite de 30 intentos cada 10 minutos para todos juntos; pasado el límite, hay que esperar unos minutos.

**Menú "Tablero" en el Sheets:** arriba aparece el menú `Tablero` > `Preparar o actualizar hojas`, que hace lo mismo que ejecutar `setup`.

**Actualizar el Apps Script cuando cambie `Code.gs`:** pega el código nuevo, ejecuta `setup` otra vez (crea la fila `codigo_acceso` en `Config` y la pestaña `Personas`) y luego Implementar > Administrar implementaciones > Editar (lápiz) > Versión: Nueva versión > Implementar. La pestaña `Admins` de la versión anterior ya no se usa; puedes borrarla.

La clave de la celda B2 de `Config` sigue funcionando como respaldo. Para dejar solo el acceso por correo, borra el valor de B2.

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

## Notas, fechas e imagen de cada tarea

- **Fecha o cita:** el formulario abre un calendario (y una hora opcional). Se guarda como `2026-12-05 15:00` y se muestra como "sáb, 5 dic, 3:00 p. m.". Si una tarea tenía una fecha escrita a mano, se conserva hasta que elijas una del calendario o pulses "Quitar".
- **Notas:** cada tarea puede tener varias (hasta 10), cada una con su propia fecha y hora opcionales. En el Sheets quedan en la columna `detalle`, una por línea, con el formato `2026-12-05 15:00|texto` (la fecha es opcional). Si escribes una nota a mano en esa celda, aparece como nota sin fecha.
- **Nota hecha:** cada nota tiene un círculo; al pulsarlo se marca con un check verde y el texto se tacha. Quedan guardadas en el Sheets (`[ok]` al inicio de la línea) y todos las ven así.
- **Mover las notas:** los administradores pueden arrastrar cada nota alrededor de su tarjeta. Siempre quedan pegadas a ella (pueden sobresalir un poco por los lados, pero no alejarse) y se mueven con la tarjeta. La posición queda guardada como `[x,y]` al inicio de la línea. En el formulario, el botón "Reacomodar notas" las devuelve a su lugar. Los observadores solo ven.
- **Responsable:** ya no se muestra ni se pide. La columna `responsable` del Sheets queda sin usar y puedes borrarla.
- **Cómo se acomoda la imagen:** columna `ajuste` (la agrega `setup` sola). Opciones: `cubrir` (llena el cuadro y recorta los bordes), `arriba` o `abajo` (llena el cuadro, mostrando esa parte) y `completa` (se ve entera, sin recortar). Se elige en el formulario, en "Cómo se acomoda la imagen".
- **Título del tablero:** celda `titulo` de la hoja `Config` (ahora "Wedding Plan").

Como las tarjetas con muchas notas crecen hacia abajo, arrastra el papel azul o las tarjetas de abajo si se tapan entre sí.

## Tamaño de las tarjetas y notas

Todas las tarjetas tienen el mismo tamaño fijo. Debajo del título hay un lugar para la primera nota; las demás cuelgan debajo de la tarjeta hasta que un administrador las arrastre. Mover una nota nunca cambia el tamaño de la tarjeta. Las tarjetas y las notas pueden sobresalir un poco del corcho, para que no se corten en las esquinas.

## Agendar en Google Calendar

Dentro del formulario de una tarea, cada nota tiene el botón **Agendar en Google Calendar**. Se elige la duración, el lugar (opcional) y las personas a invitar, que salen de la pestaña `Personas` (por ejemplo el novio y los caballeros de honor que corresponden a esa cita). Al pulsar "Crear evento e invitar":

- El evento se crea en el Google Calendar de la cuenta que publicó el Apps Script (la del padrino) y Google envía la invitación por correo a cada invitado.
- Si la nota tiene hora, el evento dura lo elegido (hora de Colombia); si solo tiene fecha, es de todo el día.
- Solo se puede invitar a correos que estén en la pestaña `Personas`. Solo los administradores ven esa lista.
- La nota queda con un icono de calendario y el texto "Ya agendada en Calendar".
- Si después cambias la fecha de la nota, el evento no se actualiza solo: edítalo o bórralo en Google Calendar. Si pulsas de nuevo "Agendar", se crea otro evento.

**Una sola vez:** en el Sheets, menú `Tablero` > `Autorizar Calendar y Drive` y acepta los permisos. Luego publica una nueva versión del Apps Script (Implementar > Administrar implementaciones > Editar > Nueva versión). Sin esos dos pasos, el botón da error de permisos.

## Observadores

Los caballeros de honor pueden arrastrar las tarjetas para verlas a su gusto, pero no editarlas. Ese orden se guarda solo en su navegador y no cambia el tablero de los novios.

## Carpeta de fotos (trajes)

Crea una tarjeta nueva y elige en "Dibujo o tipo de tarjeta" la opción **Carpeta de fotos (galería)**. Aparece como una carpeta con una cámara; al hacer clic (cualquier persona que haya entrado) se abre una pantalla estilo cuaderno con las notas importantes y las fotos pegadas con cinta. Se puede ampliar cada foto y pasar con las flechas. En computador se ve como un cuaderno abierto de dos hojas con dos fotos por hoja (cuatro por vista); si hay más, los botones Anterior y Siguiente (o las flechas del teclado) pasan a las siguientes hojas. En el celular se ve una hoja a la vez. Cada foto tiene su espacio de notas al lado.

- En "Enlaces de las fotos" pega, uno por línea, el enlace de **una carpeta de Drive** (las fotos nuevas aparecen solas, en unos 5 minutos) y/o el de cada foto. Con la carpeta basta.
- En Drive, la carpeta o las fotos deben estar compartidas con "Cualquier persona con el enlace" (lector), y la cuenta dueña del Apps Script debe poder verlas.
- Los enlaces solo los ven los administradores; los caballeros de honor reciben únicamente las fotos.
- Las notas las edita un administrador desde la propia pantalla de fotos.
- Primera vez: pega el nuevo `Code.gs`, ejecuta `Tablero` > `Preparar o actualizar hojas` (crea la columna `enlace`), `Tablero` > `Autorizar Calendar y Drive`, y publica una nueva versión.

## Si no ves los cambios

El navegador guarda copias de los archivos. Tras un cambio, haz una recarga forzada (`Ctrl + Shift + R`). Para que se actualice solo, sube el número `?v=` de los archivos en `index.html` cuando cambies `style.css` o `app.js`. `config.js` no lo necesita.
