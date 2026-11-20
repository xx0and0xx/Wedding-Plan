/**
 * API del tablero de corcho. Vive en el Apps Script de tu Google Sheets
 * y responde en JSON a la página que está en GitHub Pages.
 * Toda la información queda en este Sheets (pestañas "Tareas" y "Config").
 *
 * Cómo se entra:
 *  - Todos escriben en el teclado numérico el código de acceso (celda "codigo_acceso" de "Config",
 *    por ejemplo la fecha de la boda) y luego su correo.
 *  - La pestaña "Personas" (nombre, correo, rol) dice quién es admin (edita) y quién observador (solo ve).
 *  - Respaldo: quien use la clave de la celda "clave_edicion" de "Config" también edita.
 */

var HOJA = 'Tareas';
var CFG = 'Config';
var COLUMNAS = ['id', 'titulo', 'responsable', 'fecha', 'detalle', 'imagen', 'escena', 'estado', 'x', 'y', 'rotacion', 'conecta_con', 'ajuste'];
var AJUSTES = ['cubrir', 'arriba', 'abajo', 'completa'];
var ESCENAS = ['traje', 'playa', 'calendario', 'tiquetes', 'habitacion', 'generico'];

/* ---------- Puntos de entrada web ---------- */

/** Lectura pública (solo lectura): ?accion=leer */
function doGet(e) {
  try {
    var accion = e && e.parameter && e.parameter.accion;
    if (accion === 'leer') return json_({ ok: true, datos: getTablero({}) });
    return json_({ ok: true, datos: { servicio: 'tablero-boda' } });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/** Todo lo que requiere la clave de edición llega por POST con cuerpo JSON. */
function doPost(e) {
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_({ ok: true, datos: manejar_(p) });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function manejar_(p) {
  var acceso = { clave: p.clave, sesion: p.sesion };
  switch (p.accion) {
    case 'leer': return getTablero(acceso);
    case 'entrar': return entrar_(p.codigo, p.correo);
    case 'estado': return cambiarEstado(acceso, p.id, p.estado);
    case 'notas': return guardarNotas(acceso, p.id, p.detalle);
    case 'mover': return moverTarea(acceso, p.id, p.x, p.y);
    case 'plano': return moverPlano(acceso, p.x, p.y);
    case 'guardar': return guardarTarea(acceso, p.tarea);
    case 'eliminar': return eliminarTarea(acceso, p.id);
    default: throw new Error('Acción desconocida.');
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Operaciones ---------- */

function getTablero(acceso) {
  var quien = quien_(acceso);
  return {
    tareas: leerTareas_(),
    editor: !!quien && quien.rol === 'admin',
    usuario: quien ? quien.nombre : '',
    rol: quien ? quien.rol : '',
    titulo: leerConfig_('titulo') || 'Wedding Plan',
    fechaBoda: fechaConfig_('fecha_boda'),
    plano: { x: numero_(leerConfig_('plano_x'), 20, 0, 5000), y: numero_(leerConfig_('plano_y'), 320, 0, 5000) }
  };
}

function cambiarEstado(acceso, id, estado) {
  exigirEditor_(acceso);
  var nuevo = estado === 'completado' ? 'completado' : 'pendiente';
  actualizarCampos_(id, { estado: nuevo });
  return nuevo;
}

function moverTarea(acceso, id, x, y) {
  exigirEditor_(acceso);
  actualizarCampos_(id, { x: numero_(x, 20, 0, 5000), y: numero_(y, 20, 0, 5000) });
  return true;
}

function moverPlano(acceso, x, y) {
  exigirEditor_(acceso);
  escribirConfig_('plano_x', numero_(x, 20, 0, 5000));
  escribirConfig_('plano_y', numero_(y, 320, 0, 5000));
  return true;
}

/** Guarda solo las notas de una tarea (marcar una nota como hecha o moverla). */
function guardarNotas(acceso, id, detalle) {
  exigirEditor_(acceso);
  actualizarCampos_(id, { detalle: limpiar_(detalle, 2500) });
  return true;
}

function guardarTarea(acceso, t) {
  exigirEditor_(acceso);
  var titulo = limpiar_(t && t.titulo, 120);
  if (!titulo) throw new Error('Falta el título.');

  var datos = {
    titulo: titulo,
    fecha: limpiar_(t.fecha, 80),
    detalle: limpiar_(t.detalle, 2500),
    imagen: limpiar_(t.imagen, 500),
    escena: ESCENAS.indexOf(t.escena) >= 0 ? t.escena : 'generico',
    conecta_con: limpiar_(t.conecta_con, 60),
    ajuste: AJUSTES.indexOf(t.ajuste) >= 0 ? t.ajuste : 'cubrir'
  };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var h = hoja_();
    var v = h.getDataRange().getValues();
    var enc = v[0].map(String);
    var iid = enc.indexOf('id');
    var fila = -1;
    var maxId = 0;
    for (var i = 1; i < v.length; i++) {
      var id = Number(v[i][iid]);
      if (id > maxId) maxId = id;
      if (t.id && id === Number(t.id)) fila = i + 1;
    }

    var registro = {};
    if (fila > 0) {
      enc.forEach(function (c, j) { registro[c] = v[fila - 1][j]; });
    } else {
      registro.id = maxId + 1;
      registro.estado = 'pendiente';
      registro.x = numero_(t.x, 20, 0, 5000);
      registro.y = numero_(t.y, 20, 0, 5000);
      registro.rotacion = Math.round((Math.random() * 5 - 2.5) * 10) / 10;
    }
    Object.keys(datos).forEach(function (k) { registro[k] = datos[k]; });

    var valores = enc.map(function (c) { return registro[c] === undefined ? '' : registro[c]; });
    if (fila > 0) {
      h.getRange(fila, 1, 1, enc.length).setValues([valores]);
    } else {
      h.getRange(h.getLastRow() + 1, 1, 1, enc.length).setValues([valores]);
    }
    return normalizar_(registro);
  } finally {
    lock.releaseLock();
  }
}

function eliminarTarea(acceso, id) {
  exigirEditor_(acceso);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var h = hoja_();
    var v = h.getDataRange().getValues();
    var iid = v[0].map(String).indexOf('id');
    for (var i = 1; i < v.length; i++) {
      if (Number(v[i][iid]) === Number(id)) {
        h.deleteRow(i + 1);
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Lectura y escritura en el Sheets ---------- */

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function hoja_() {
  var h = ss_().getSheetByName(HOJA);
  if (!h) throw new Error('Falta la pestaña "Tareas". Ejecuta setup() una vez.');
  return h;
}

function leerTareas_() {
  var v = hoja_().getDataRange().getValues();
  if (v.length < 2) return [];
  var enc = v[0].map(String);
  var salida = [];
  for (var i = 1; i < v.length; i++) {
    var o = {};
    enc.forEach(function (c, j) { o[c] = v[i][j]; });
    if (o.id === '' || String(o.titulo).trim() === '') continue;
    salida.push(normalizar_(o));
  }
  return salida;
}

function normalizar_(o) {
  return {
    id: Number(o.id),
    titulo: String(o.titulo || ''),
    responsable: String(o.responsable || ''),
    fecha: textoFecha_(o.fecha),
    detalle: String(o.detalle || ''),
    imagenOriginal: String(o.imagen || ''),
    imagen: urlImagen_(o.imagen),
    escena: ESCENAS.indexOf(o.escena) >= 0 ? o.escena : 'generico',
    estado: String(o.estado).toLowerCase() === 'completado' ? 'completado' : 'pendiente',
    x: numero_(o.x, 20, 0, 5000),
    y: numero_(o.y, 20, 0, 5000),
    rotacion: numero_(o.rotacion, 0, -10, 10),
    conecta_con: String(o.conecta_con || ''),
    ajuste: AJUSTES.indexOf(o.ajuste) >= 0 ? o.ajuste : 'cubrir'
  };
}

function actualizarCampos_(id, campos) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var h = hoja_();
    var v = h.getDataRange().getValues();
    var enc = v[0].map(String);
    var iid = enc.indexOf('id');
    for (var i = 1; i < v.length; i++) {
      if (Number(v[i][iid]) === Number(id)) {
        Object.keys(campos).forEach(function (k) {
          var col = enc.indexOf(k);
          if (col >= 0) h.getRange(i + 1, col + 1).setValue(campos[k]);
        });
        return;
      }
    }
    throw new Error('No encontré la tarea ' + id + '.');
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Configuración y permisos ---------- */

function leerConfig_(clave) {
  var c = ss_().getSheetByName(CFG);
  if (!c) return '';
  var v = c.getDataRange().getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() === clave) return v[i][1];
  }
  return '';
}

function escribirConfig_(clave, valor) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var c = ss_().getSheetByName(CFG);
    var v = c.getDataRange().getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][0]).trim() === clave) {
        c.getRange(i + 1, 2).setValue(valor);
        return;
      }
    }
    c.getRange(c.getLastRow() + 1, 1, 1, 2).setValues([[clave, valor]]);
  } finally {
    lock.releaseLock();
  }
}

function fechaConfig_(clave) {
  var val = leerConfig_(clave);
  if (!val) return '';
  var d = val instanceof Date ? val : new Date(val);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
}

/** Devuelve { nombre, correo, rol } si el acceso es válido (sesión o clave), o null. */
function quien_(acceso) {
  acceso = acceso || {};
  var s = sesionValida_(acceso.sesion);
  if (s) return s;
  var real = String(leerConfig_('clave_edicion') || '');
  if (acceso.clave && real !== '' && String(acceso.clave) === real) {
    return { nombre: 'Clave de edición', correo: '', rol: 'admin' };
  }
  return null;
}

function exigirEditor_(acceso) {
  var q = quien_(acceso);
  if (!q || q.rol !== 'admin') throw new Error('Tu acceso es solo de lectura.');
}

/* ---------- Administradores (pestaña "Personas") y sesiones ---------- */

var SESION_DIAS = 30;
var MAX_INTENTOS_CODIGO = 30;   // intentos de código permitidos por ventana
var VENTANA_CODIGO_SEG = 600;   // 10 minutos

function sha256Hex_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/** Sal secreta: se genera una sola vez y vive en las propiedades del script. */
function sal_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SAL');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SAL', s);
  }
  return s;
}

function huellaCodigo_(codigo) {
  return sha256Hex_(sal_() + '|codigo|' + codigo).substring(0, 32);
}

/** Acepta el código como texto o número y devuelve 6 dígitos (recupera ceros a la izquierda), o ''. */
function codigoDeHoja_(v) {
  var t = String(v === null || v === undefined ? '' : v).trim();
  if (/^\d{1,6}$/.test(t)) t = ('000000' + t).slice(-6);
  return /^\d{6}$/.test(t) ? t : '';
}

function codigoAcceso_() {
  return codigoDeHoja_(leerConfig_('codigo_acceso'));
}

function leerPersonas_() {
  var h = ss_().getSheetByName('Personas');
  if (!h) return [];
  var v = h.getDataRange().getValues();
  var salida = [];
  for (var i = 1; i < v.length; i++) {
    var correo = String(v[i][1] || '').trim().toLowerCase();
    if (correo.indexOf('@') < 1) continue;
    var r = String(v[i][2] || '').trim().toLowerCase();
    var rol = (r.indexOf('admin') === 0 || r === 'editor') ? 'admin' : 'observador';
    salida.push({ nombre: String(v[i][0] || '').trim() || correo, correo: correo, rol: rol });
  }
  return salida;
}

function buscarPersona_(correo) {
  correo = String(correo || '').trim().toLowerCase();
  var gente = leerPersonas_();
  for (var i = 0; i < gente.length; i++) if (gente[i].correo === correo) return gente[i];
  return null;
}

/** Máximo de intentos por ventana de tiempo, compartido por todos (no sabemos quién es cada visitante). */
function permitirIntento_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var ahora = Date.now();
    var v = null;
    try { v = JSON.parse(cache.get('codigo_ventana') || 'null'); } catch (err) { v = null; }
    if (!v || ahora - v.t > VENTANA_CODIGO_SEG * 1000) v = { n: 0, t: ahora };
    if (v.n >= MAX_INTENTOS_CODIGO) return false;
    v.n++;
    cache.put('codigo_ventana', JSON.stringify(v), Math.max(1, Math.ceil(VENTANA_CODIGO_SEG - (ahora - v.t) / 1000)));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Paso 1 (sin correo): comprueba que el código de acceso sea el correcto.
 * Paso 2 (con correo): si el correo está en la pestaña Personas, abre sesión con el rol de esa fila.
 * El código de 6 números lo comparten todos; el rol solo lo decide la hoja.
 */
function entrar_(codigo, correo) {
  codigo = String(codigo === null || codigo === undefined ? '' : codigo).trim();
  if (!/^\d{6}$/.test(codigo)) throw new Error('El código debe tener 6 números.');
  if (!permitirIntento_()) throw new Error('Demasiados intentos seguidos. Espera unos minutos.');
  var real = codigoAcceso_();
  if (!real) throw new Error('Falta el código de acceso en la hoja Config (fila codigo_acceso).');
  if (codigo !== real) throw new Error('Código incorrecto.');
  if (!String(correo || '').trim()) return { paso: 'correo' };
  var persona = buscarPersona_(correo);
  if (!persona) throw new Error('Ese correo no está en la lista. Pídele a quien administra el tablero que lo agregue.');
  return { rol: persona.rol, sesion: crearSesion_(persona), nombre: persona.nombre };
}

function crearSesion_(persona) {
  var props = PropertiesService.getScriptProperties();
  var todo = props.getProperties();
  Object.keys(todo).forEach(function (k) {
    if (k.indexOf('ses_') !== 0) return;
    try { if (JSON.parse(todo[k]).e < Date.now()) props.deleteProperty(k); } catch (err) { props.deleteProperty(k); }
  });
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty('ses_' + sha256Hex_(token), JSON.stringify({
    c: persona.correo, h: huellaCodigo_(codigoAcceso_()), e: Date.now() + SESION_DIAS * 86400000
  }));
  return token;
}

/** Vale mientras no venza, el código de acceso siga igual y la persona siga en la hoja (con su rol de ahora). */
function sesionValida_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('ses_' + sha256Hex_(token));
  if (!raw) return null;
  var s;
  try { s = JSON.parse(raw); } catch (err) { return null; }
  if (s.e < Date.now()) return null;
  var real = codigoAcceso_();
  if (!real || huellaCodigo_(real) !== s.h) return null;
  return buscarPersona_(s.c);
}

/* ---------- Utilidades ---------- */

function limpiar_(s, max) {
  var t = String(s === undefined || s === null ? '' : s).trim().slice(0, max);
  return /^[=+@]/.test(t) ? "'" + t : t;
}

function numero_(v, porDefecto, min, max) {
  var n = Number(v);
  if (isNaN(n) || v === '' || v === null) return porDefecto;
  return Math.min(max, Math.max(min, n));
}

function textoFecha_(v) {
  if (v instanceof Date) {
    var conHora = v.getHours() !== 0 || v.getMinutes() !== 0;
    return Utilities.formatDate(v, 'America/Bogota', conHora ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  return String(v || '');
}

/**
 * La columna "imagen" acepta:
 *  - un link de Drive o el ID de un archivo de Drive (compartido "cualquiera con el enlace")
 *  - cualquier link https
 *  - una ruta de la carpeta img/ del repositorio, por ejemplo img/playa.jpg
 */
function urlImagen_(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^img\/[\w\-. ]+\.(jpe?g|png|webp|gif|avif)$/i.test(v)) return v;
  var m = v.match(/\/d\/([\w-]{20,})/) || v.match(/[?&]id=([\w-]{20,})/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
  if (/^[\w-]{25,}$/.test(v)) return 'https://drive.google.com/thumbnail?id=' + v + '&sz=w800';
  return /^https:\/\//i.test(v) ? v : '';
}

/* ---------- Preparación inicial (ejecutar una sola vez) ---------- */

/* ---------- Menú "Tablero" dentro del Google Sheets ---------- */

/** Se ejecuta sola al abrir el Sheets y agrega el menú "Tablero" arriba. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tablero')
    .addItem('Preparar o actualizar hojas', 'setup')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId());

  var h = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
  if (h.getLastRow() === 0) {
    var ejemplo = [
      [1, 'Trajes de los caballeros de honor', 'Novio', '', 'Agendar citas de prueba', '', 'traje', 'pendiente', 20, 28, -2, ''],
      [2, 'Escoger lugar de la despedida', 'Padrino', '', 'Playa u otras opciones por definir', '', 'playa', 'pendiente', 255, 22, 2, '3'],
      [3, 'Definir fecha y días del viaje', 'Novio y padrino', '', 'Cuántos días y qué fechas', '', 'calendario', 'pendiente', 490, 34, -1.5, '4,5'],
      [4, 'Comprar tiquetes', 'Padrino', '', 'Cuando esté la fecha definida', '', 'tiquetes', 'pendiente', 255, 262, -2, ''],
      [5, 'Reservar habitaciones', 'Novio', '', 'Con fecha y lugar definidos', '', 'habitacion', 'pendiente', 490, 268, 2.5, '']
    ];
    h.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
    h.setFrozenRows(1);
    h.getRange('D:D').setNumberFormat('@');
    h.getRange(2, 1, ejemplo.length, COLUMNAS.length).setValues(ejemplo.map(function (f) { return f.concat(['cubrir']); }));
    h.getRange('H2:H200').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['pendiente', 'completado'], true).build());
    h.getRange('G2:G200').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ESCENAS, true).build());
    h.setColumnWidths(1, 1, 40);
    h.setColumnWidths(2, 1, 260);
    h.setColumnWidths(5, 2, 220);
  }

  // Hojas de una versión anterior: agrega la columna "ajuste" (cómo se acomoda la foto) si falta.
  var encabezado = h.getDataRange().getValues()[0].map(String);
  if (encabezado.indexOf('ajuste') < 0) {
    h.getRange(1, encabezado.length + 1).setValue('ajuste');
    h.getRange(1, encabezado.length + 1).setFontWeight('bold');
    encabezado.push('ajuste');
  }
  h.getRange(2, encabezado.indexOf('ajuste') + 1, 199, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(AJUSTES, true).build());

  var c = ss.getSheetByName(CFG) || ss.insertSheet(CFG);
  if (c.getLastRow() === 0) {
    c.getRange(1, 1, 5, 2).setValues([
      ['titulo', 'Wedding Plan'],
      ['clave_edicion', Utilities.getUuid().replace(/-/g, '').slice(0, 10)],
      ['fecha_boda', ''],
      ['plano_x', 20],
      ['plano_y', 320]
    ]);
    c.getRange('A:A').setFontWeight('bold');
    c.setColumnWidths(1, 1, 140);
    c.setColumnWidths(2, 1, 260);
  }

  var tituloActual = String(leerConfig_('titulo')).trim();
  if (!tituloActual || tituloActual === 'Despedida de solteros') escribirConfig_('titulo', 'Wedding Plan');

  if (!String(leerConfig_('codigo_acceso')).trim()) {
    escribirConfig_('codigo_acceso', '150427');
  }
  var cfg = ss.getSheetByName(CFG);
  var filas = cfg.getDataRange().getValues();
  for (var f = 0; f < filas.length; f++) {
    if (String(filas[f][0]).trim() === 'codigo_acceso') {
      // Formato de texto para no perder ceros a la izquierda.
      var cel = cfg.getRange(f + 1, 2);
      cel.setNumberFormat('@');
      var cv = codigoDeHoja_(filas[f][1]);
      if (cv) cel.setValue(cv);
    }
  }

  var a = ss.getSheetByName('Personas') || ss.insertSheet('Personas');
  if (a.getLastRow() === 0) {
    a.getRange(1, 1, 4, 3).setValues([
      ['nombre', 'correo', 'rol'],
      ['Novio', '', 'admin'],
      ['Padrino', '', 'admin'],
      ['Caballero de honor (ejemplo)', '', 'observador']
    ]);
  }
  a.getRange('A1:C1').setFontWeight('bold');
  a.setFrozenRows(1);
  a.getRange('C2:C200').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['admin', 'observador'], true).build());
  a.setColumnWidths(1, 1, 200);
  a.setColumnWidths(2, 1, 280);
  a.setColumnWidths(3, 1, 120);

  ss.toast('Listo. Llena la pestaña Personas (nombre, correo y rol). El código de acceso está en Config.', 'Tablero', 10);
}
