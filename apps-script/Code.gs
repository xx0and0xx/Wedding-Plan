/**
 * API del tablero de corcho. Vive en el Apps Script de tu Google Sheets
 * y responde en JSON a la página que está en GitHub Pages.
 * Toda la información queda en este Sheets (pestañas "Tareas" y "Config").
 *
 * Quién puede editar:
 *  - Quien escriba en el teclado numérico el código de 6 números de un administrador
 *    (pestaña "Admins": nombre, correo opcional y código).
 *  - O quien use la clave de la celda B2 de "Config" (respaldo).
 * Cualquier otro código de 6 números entra en modo observación (solo ver).
 *
 * Primer uso: ejecuta setup() una sola vez y luego publica como aplicación web.
 */

var HOJA = 'Tareas';
var CFG = 'Config';
var COLUMNAS = ['id', 'titulo', 'responsable', 'fecha', 'detalle', 'imagen', 'escena', 'estado', 'x', 'y', 'rotacion', 'conecta_con'];
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
    case 'entrar': return entrar_(p.codigo);
    case 'estado': return cambiarEstado(acceso, p.id, p.estado);
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
    editor: !!quien,
    usuario: quien ? quien.nombre : '',
    titulo: leerConfig_('titulo') || 'Tablero de la boda',
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

function guardarTarea(acceso, t) {
  exigirEditor_(acceso);
  var titulo = limpiar_(t && t.titulo, 120);
  if (!titulo) throw new Error('Falta el título.');

  var datos = {
    titulo: titulo,
    responsable: limpiar_(t.responsable, 80),
    fecha: limpiar_(t.fecha, 80),
    detalle: limpiar_(t.detalle, 400),
    imagen: limpiar_(t.imagen, 500),
    escena: ESCENAS.indexOf(t.escena) >= 0 ? t.escena : 'generico',
    conecta_con: limpiar_(t.conecta_con, 60)
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
    conecta_con: String(o.conecta_con || '')
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

/** Devuelve { nombre, correo } si el acceso es válido (sesión por código o clave), o null. */
function quien_(acceso) {
  acceso = acceso || {};
  var s = sesionValida_(acceso.sesion);
  if (s) return s;
  var real = String(leerConfig_('clave_edicion') || '');
  if (acceso.clave && real !== '' && String(acceso.clave) === real) {
    return { nombre: 'Clave de edición', correo: '' };
  }
  return null;
}

function exigirEditor_(acceso) {
  if (!quien_(acceso)) throw new Error('Este enlace es solo de lectura.');
}

/* ---------- Administradores (pestaña "Admins") y sesiones ---------- */

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

function codigoAlAzar_() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function leerAdmins_() {
  var h = ss_().getSheetByName('Admins');
  if (!h) return [];
  var v = h.getDataRange().getValues();
  var salida = [];
  for (var i = 1; i < v.length; i++) {
    var codigo = codigoDeHoja_(v[i][2]);
    if (!codigo) continue;
    var correo = String(v[i][1] || '').trim().toLowerCase();
    salida.push({ nombre: String(v[i][0] || '').trim() || correo || 'Admin', correo: correo, codigo: codigo });
  }
  return salida;
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
 * Teclado numérico: si el código es de un administrador, abre una sesión de edición;
 * cualquier otro código entra como observador. Si hay demasiados intentos seguidos,
 * no se comprueba el código y se responde observador (así no se puede adivinar).
 */
function entrar_(codigo) {
  codigo = String(codigo === null || codigo === undefined ? '' : codigo).trim();
  if (!/^\d{6}$/.test(codigo)) throw new Error('El código debe tener 6 números.');
  if (!permitirIntento_()) return { rol: 'observador', limitado: true };
  var admins = leerAdmins_();
  for (var i = 0; i < admins.length; i++) {
    if (admins[i].codigo === codigo) {
      return { rol: 'admin', sesion: crearSesion_(admins[i]), nombre: admins[i].nombre };
    }
  }
  return { rol: 'observador' };
}

function crearSesion_(admin) {
  var props = PropertiesService.getScriptProperties();
  var todo = props.getProperties();
  Object.keys(todo).forEach(function (k) {
    if (k.indexOf('ses_') !== 0) return;
    try { if (JSON.parse(todo[k]).e < Date.now()) props.deleteProperty(k); } catch (err) { props.deleteProperty(k); }
  });
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty('ses_' + sha256Hex_(token), JSON.stringify({ h: huellaCodigo_(admin.codigo), e: Date.now() + SESION_DIAS * 86400000 }));
  return token;
}

/** La sesión vale mientras no venza y el código de ese admin siga igual en la hoja. */
function sesionValida_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('ses_' + sha256Hex_(token));
  if (!raw) return null;
  var s;
  try { s = JSON.parse(raw); } catch (err) { return null; }
  if (s.e < Date.now()) return null;
  var admins = leerAdmins_();
  for (var i = 0; i < admins.length; i++) {
    if (huellaCodigo_(admins[i].codigo) === s.h) return { nombre: admins[i].nombre, correo: admins[i].correo };
  }
  return null;
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
    return Utilities.formatDate(v, 'America/Bogota', conHora ? 'd MMM yyyy, h:mm a' : 'd MMM yyyy');
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
    .addItem('Dar código a los admins que no tengan', 'generarCodigos')
    .addItem('Código nuevo para la fila seleccionada (Admins)', 'codigoNuevoFila')
    .addToUi();
}

/** Da un código al azar de 6 números a cada admin de la pestaña Admins que no tenga uno válido. */
function generarCodigos() {
  var ss = SpreadsheetApp.getActive();
  var a = ss.getSheetByName('Admins');
  if (!a) { setup(); return; }
  a.getRange('C:C').setNumberFormat('@');
  a.getRange('C1').setValue('codigo');
  var n = a.getLastRow();
  var nuevos = 0;
  if (n > 1) {
    var rango = a.getRange(2, 1, n - 1, 3);
    var vals = rango.getValues();
    vals.forEach(function (r) {
      var c = codigoDeHoja_(r[2]);
      if (c) { r[2] = c; return; }
      if (String(r[0]).trim() || String(r[1]).trim()) { r[2] = codigoAlAzar_(); nuevos++; }
    });
    rango.setValues(vals);
  }
  ss.toast(nuevos ? 'Códigos nuevos: ' + nuevos + '. Míralos en la columna C de Admins.' : 'Todos los admins ya tienen código.', 'Tablero', 8);
}

/** Cambia por uno al azar el código de la fila que tengas seleccionada en la pestaña Admins. */
function codigoNuevoFila() {
  var ss = SpreadsheetApp.getActive();
  var a = ss.getSheetByName('Admins');
  var hoja = ss.getActiveSheet();
  if (!a || hoja.getName() !== 'Admins') { ss.toast('Primero selecciona una fila de la pestaña Admins.', 'Tablero', 6); return; }
  var fila = hoja.getActiveRange().getRow();
  if (fila < 2) { ss.toast('Selecciona la fila de un admin, no el encabezado.', 'Tablero', 6); return; }
  a.getRange('C:C').setNumberFormat('@');
  a.getRange(fila, 3).setValue(codigoAlAzar_());
  ss.toast('Listo: código nuevo en la fila ' + fila + '. La sesión anterior de esa persona se cerró.', 'Tablero', 8);
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
    h.getRange(2, 1, ejemplo.length, COLUMNAS.length).setValues(ejemplo);
    h.getRange('H2:H200').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['pendiente', 'completado'], true).build());
    h.getRange('G2:G200').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(ESCENAS, true).build());
    h.setColumnWidths(1, 1, 40);
    h.setColumnWidths(2, 1, 260);
    h.setColumnWidths(5, 2, 220);
  }

  var c = ss.getSheetByName(CFG) || ss.insertSheet(CFG);
  if (c.getLastRow() === 0) {
    c.getRange(1, 1, 5, 2).setValues([
      ['titulo', 'Despedida de solteros'],
      ['clave_edicion', Utilities.getUuid().replace(/-/g, '').slice(0, 10)],
      ['fecha_boda', ''],
      ['plano_x', 20],
      ['plano_y', 320]
    ]);
    c.getRange('A:A').setFontWeight('bold');
    c.setColumnWidths(1, 1, 140);
    c.setColumnWidths(2, 1, 260);
  }

  var a = ss.getSheetByName('Admins') || ss.insertSheet('Admins');
  a.getRange('C:C').setNumberFormat('@');
  if (a.getLastRow() === 0) {
    a.getRange(1, 1, 3, 3).setValues([
      ['nombre', 'correo', 'codigo'],
      ['Novio', '', codigoAlAzar_()],
      ['Padrino', '', codigoAlAzar_()]
    ]);
  } else {
    // Hoja de una versión anterior: agrega la columna "codigo" y da uno al azar a quien no lo tenga.
    a.getRange('C1').setValue('codigo');
    var n = a.getLastRow();
    if (n > 1) {
      var rango = a.getRange(2, 1, n - 1, 3);
      var vals = rango.getValues();
      vals.forEach(function (r) {
        if ((String(r[0]).trim() || String(r[1]).trim()) && !codigoDeHoja_(r[2])) r[2] = codigoAlAzar_();
        else if (codigoDeHoja_(r[2])) r[2] = codigoDeHoja_(r[2]);
      });
      rango.setValues(vals);
    }
  }
  a.getRange('A1:C1').setFontWeight('bold');
  a.setColumnWidths(1, 1, 160);
  a.setColumnWidths(2, 1, 260);
  a.setColumnWidths(3, 1, 120);

  ss.toast('Listo. Los códigos de 6 números de cada admin están en la pestaña Admins; cámbialos si quieres.', 'Tablero', 10);
}
