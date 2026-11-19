/**
 * API del tablero de corcho. Vive en el Apps Script de tu Google Sheets
 * y responde en JSON a la página que está en GitHub Pages.
 * Toda la información queda en este Sheets (pestañas "Tareas" y "Config").
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
    if (accion === 'leer') return json_({ ok: true, datos: getTablero('') });
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
  switch (p.accion) {
    case 'leer': return getTablero(p.clave);
    case 'estado': return cambiarEstado(p.clave, p.id, p.estado);
    case 'mover': return moverTarea(p.clave, p.id, p.x, p.y);
    case 'plano': return moverPlano(p.clave, p.x, p.y);
    case 'guardar': return guardarTarea(p.clave, p.tarea);
    case 'eliminar': return eliminarTarea(p.clave, p.id);
    default: throw new Error('Acción desconocida.');
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Operaciones ---------- */

function getTablero(clave) {
  return {
    tareas: leerTareas_(),
    editor: esEditor_(clave),
    titulo: leerConfig_('titulo') || 'Tablero de la boda',
    fechaBoda: fechaConfig_('fecha_boda'),
    plano: { x: numero_(leerConfig_('plano_x'), 20, 0, 5000), y: numero_(leerConfig_('plano_y'), 320, 0, 5000) }
  };
}

function cambiarEstado(clave, id, estado) {
  exigirEditor_(clave);
  var nuevo = estado === 'completado' ? 'completado' : 'pendiente';
  actualizarCampos_(id, { estado: nuevo });
  return nuevo;
}

function moverTarea(clave, id, x, y) {
  exigirEditor_(clave);
  actualizarCampos_(id, { x: numero_(x, 20, 0, 5000), y: numero_(y, 20, 0, 5000) });
  return true;
}

function moverPlano(clave, x, y) {
  exigirEditor_(clave);
  escribirConfig_('plano_x', numero_(x, 20, 0, 5000));
  escribirConfig_('plano_y', numero_(y, 320, 0, 5000));
  return true;
}

function guardarTarea(clave, t) {
  exigirEditor_(clave);
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

function eliminarTarea(clave, id) {
  exigirEditor_(clave);
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

function esEditor_(clave) {
  var real = String(leerConfig_('clave_edicion') || '');
  return !!clave && real !== '' && String(clave) === real;
}

function exigirEditor_(clave) {
  if (!esEditor_(clave)) throw new Error('Este enlace es solo de lectura.');
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

  ss.toast('Listo. Tu clave de edición está en la pestaña Config (celda B2).', 'Tablero', 10);
}
