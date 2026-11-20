/* Tablero de corcho: lógica de la página.
   Los datos viven en el Google Sheets; aquí solo se dibujan y se envían los cambios. */

var BW = 720, BH = 560, scale = 1;
var S = { tareas: [], editor: false, titulo: '', fechaBoda: '', plano: { x: 20, y: 320 }, usuario: '' };
var drag = null, dragNota = null, confirmarBorrado = false, editando = null;
var DEMO = !CFG.API_URL;

/* ---------- Clave de edición ----------
   El enlace del editor es  https://USUARIO.github.io/REPO/#clave=XXXX
   La parte después de # nunca viaja a ningún servidor. Se guarda en este navegador. */
var CLAVE = (function () {
  var m = location.hash.match(/clave=([\w-]+)/);
  try {
    if (m) {
      localStorage.setItem('tablero_clave', m[1]);
      history.replaceState(null, '', location.pathname + location.search);
      return m[1];
    }
    return localStorage.getItem('tablero_clave') || '';
  } catch (e) {
    return m ? m[1] : '';
  }
})();

/* Sesión de administrador (código correcto) o modo observación (cualquier otro código).
   Se guardan en este navegador; "Cerrar sesión" o "Cambiar código" los borra. */
var SESION = '';
try {
  SESION = localStorage.getItem('tablero_sesion') || '';
} catch (e) {}

var GR = '<svg class="gr" aria-hidden="true"><rect width="100%" height="100%" filter="url(#gr)" opacity=".25"/></svg>';
var LAPIZ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3"/></svg>';

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== '') e.textContent = text;
  return e;
}
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.style.display = 'none'; }, 4000);
}
function porId(id) {
  for (var i = 0; i < S.tareas.length; i++) if (S.tareas[i].id === Number(id)) return S.tareas[i];
  return null;
}

/* ---------- Comunicación con Apps Script ---------- */

function api(accion, datos) {
  if (DEMO) return demo(accion, datos || {});
  var leerPublico = accion === 'leer' && !CLAVE && !SESION;
  var pedido = leerPublico
    ? fetch(CFG.API_URL + '?accion=leer')
    : fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ accion: accion, clave: CLAVE, sesion: SESION }, datos || {}))
      });
  return pedido
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j.ok) throw new Error(j.error || 'Error desconocido');
      return j.datos;
    });
}

/* Modo demostración: datos de ejemplo en memoria, sin backend. */
var demoPlano = { x: 20, y: 440 };
var demoAdmin = false, demoUsuario = '';
var demoTareas = [
  { id: 1, titulo: 'Trajes de los caballeros de honor', responsable: 'Novio', fecha: '', detalle: '2026-12-05 15:00|Cita 1: Juan y Pedro\n2026-12-06 10:30|Cita 2: Luis\n2026-12-12|Cita 3: Mateo\nLlevar zapatos negros', imagenOriginal: '', imagen: '', escena: 'traje', ajuste: 'cubrir', estado: 'pendiente', x: 20, y: 28, rotacion: -2, conecta_con: '' },
  { id: 2, titulo: 'Escoger lugar de la despedida', responsable: 'Padrino', fecha: '', detalle: 'Playa, ya elegida', imagenOriginal: '', imagen: '', escena: 'playa', estado: 'completado', x: 255, y: 22, rotacion: 2, conecta_con: '3' },
  { id: 3, titulo: 'Definir fecha y días del viaje', responsable: 'Novio y padrino', fecha: '', detalle: '3 días, fecha por definir', imagenOriginal: '', imagen: '', escena: 'calendario', estado: 'pendiente', x: 490, y: 34, rotacion: -1.5, conecta_con: '4,5' },
  { id: 4, titulo: 'Comprar tiquetes', responsable: 'Padrino', fecha: '', detalle: 'Esperan la fecha', imagenOriginal: '', imagen: '', escena: 'tiquetes', estado: 'pendiente', x: 255, y: 262, rotacion: -2, conecta_con: '' },
  { id: 5, titulo: 'Reservar habitaciones', responsable: 'Novio', fecha: '', detalle: 'Esperan fecha y lugar', imagenOriginal: '', imagen: '', escena: 'habitacion', estado: 'pendiente', x: 490, y: 268, rotacion: 2.5, conecta_con: '' }
];
function demoPorId(id) {
  for (var i = 0; i < demoTareas.length; i++) if (demoTareas[i].id === Number(id)) return demoTareas[i];
  return null;
}
function demo(accion, d) {
  var r = null, t;
  if (accion === 'leer') {
    r = { tareas: JSON.parse(JSON.stringify(demoTareas)), editor: demoAdmin, usuario: demoUsuario, titulo: 'Wedding Plan (demostración)', fechaBoda: '', plano: JSON.parse(JSON.stringify(demoPlano)) };
  } else if (accion === 'entrar') {
    if (d.codigo !== '123456') throw new Error('Código incorrecto.');
    if (!d.correo) {
      r = { paso: 'correo' };
    } else {
      demoAdmin = /admin/i.test(d.correo);
      demoUsuario = demoAdmin ? 'Admin demo' : 'Visita demo';
      r = { rol: demoAdmin ? 'admin' : 'observador', sesion: 'demo', nombre: demoUsuario };
    }
  } else if (accion === 'notas') {
    t = demoPorId(d.id); if (t) t.detalle = d.detalle; r = true;
  } else if (accion === 'estado') {
    t = demoPorId(d.id); if (t) t.estado = d.estado; r = d.estado;
  } else if (accion === 'mover') {
    t = demoPorId(d.id); if (t) { t.x = d.x; t.y = d.y; } r = true;
  } else if (accion === 'plano') {
    demoPlano = { x: d.x, y: d.y }; r = true;
  } else if (accion === 'guardar') {
    t = d.tarea.id ? demoPorId(d.tarea.id) : null;
    if (!t) {
      t = { id: demoTareas.reduce(function (m, k) { return Math.max(m, k.id); }, 0) + 1, estado: 'pendiente', x: d.tarea.x, y: d.tarea.y, rotacion: 1 };
      demoTareas.push(t);
    }
    ['titulo', 'fecha', 'detalle', 'escena', 'conecta_con', 'ajuste'].forEach(function (k) { t[k] = d.tarea[k]; });
    t.imagenOriginal = d.tarea.imagen;
    t.imagen = /^(https:\/\/|img\/)/.test(d.tarea.imagen) ? d.tarea.imagen : '';
    r = JSON.parse(JSON.stringify(t));
  } else if (accion === 'eliminar') {
    demoTareas = demoTareas.filter(function (k) { return k.id !== Number(d.id); }); r = true;
  }
  return new Promise(function (res) { setTimeout(function () { res(r); }, 60); });
}

function cargar() {
  return api('leer').then(function (d) {
    S.tareas = d.tareas; S.editor = d.editor; S.titulo = d.titulo; S.fechaBoda = d.fechaBoda; S.plano = d.plano || { x: 20, y: 320 };
    S.usuario = d.usuario || '';
    if (SESION && !d.usuario && !DEMO) {
      SESION = '';
      try { localStorage.removeItem('tablero_sesion'); } catch (e) {}
      mostrarLock('Tu sesión venció. Escribe el código otra vez.');
    }
    $('aviso').hidden = !DEMO;
    if (DEMO) $('aviso').textContent = 'Modo demostración: los cambios no se guardan. Para conectarlo con tu Sheets, pega la URL de Apps Script en js/config.js.';
    render();
  }).catch(function (e) {
    $('aviso').hidden = false;
    $('aviso').textContent = 'No pude leer el tablero: ' + e.message;
  });
}

/* ---------- Teclado numérico ---------- */

var LARGO_CODIGO = 6, codigo = '', codigoOk = '', enviando = false;

function necesitaCodigo() { return !SESION && !CLAVE; }

function pintarPuntos() {
  var p = $('lock_dots').children;
  for (var i = 0; i < p.length; i++) p[i].classList.toggle('on', i < codigo.length);
}

function verPaso(correo) {
  $('lock_dots').parentNode.hidden = correo;
  $('lock_pad').hidden = correo;
  $('lock_mail').hidden = !correo;
  if (correo) setTimeout(function () { $('lock_correo').focus(); }, 50);
}

function mostrarLock(msg) {
  codigo = '';
  codigoOk = '';
  verPaso(false);
  pintarPuntos();
  $('lock_msg').textContent = msg || '';
  $('led_e').classList.remove('on');
  $('lock').hidden = false;
}

function pulsar(n) {
  if (enviando || codigoOk || codigo.length >= LARGO_CODIGO) return;
  $('lock_msg').textContent = '';
  $('led_e').classList.remove('on');
  codigo += n;
  pintarPuntos();
  if (codigo.length === LARGO_CODIGO) enviarCodigo();
}

function borrarDigito() {
  if (enviando) return;
  codigo = codigo.slice(0, -1);
  pintarPuntos();
}

function errorLock(msg) {
  enviando = false;
  $('lock_msg').textContent = msg;
  $('led_e').classList.add('on');
  var d = $('lock_dots');
  d.classList.remove('sacude');
  void d.offsetWidth;
  d.classList.add('sacude');
}

/* Paso 1: el código. Si es correcto, pide el correo. */
function enviarCodigo() {
  enviando = true;
  api('entrar', { codigo: codigo }).then(function () {
    enviando = false;
    codigoOk = codigo;
    codigo = '';
    pintarPuntos();
    $('lock_msg').textContent = '';
    verPaso(true);
  }).catch(function (e) {
    codigo = '';
    pintarPuntos();
    errorLock(e.message);
  });
}

/* Paso 2: el correo. La hoja Personas decide si entra como admin o como observador. */
function enviarCorreo() {
  var correo = $('lock_correo').value.trim();
  if (enviando || !correo) return;
  enviando = true;
  api('entrar', { codigo: codigoOk, correo: correo }).then(function (r) {
    enviando = false;
    SESION = r.sesion;
    if (!DEMO) { try { localStorage.setItem('tablero_sesion', SESION); } catch (e) {} }
    toast('Hola, ' + r.nombre);
    $('led_e').classList.remove('on');
    $('led_p').classList.add('on');
    $('lock').firstElementChild.classList.add('abre');
    return new Promise(function (ok) { setTimeout(ok, 900); }).then(function () {
      $('lock').hidden = true;
      $('lock').firstElementChild.classList.remove('abre');
      $('led_p').classList.remove('on');
      codigoOk = '';
      $('lock_correo').value = '';
      return cargar();
    });
  }).catch(function (e) {
    errorLock(e.message);
  });
}

function armarTeclado() {
  var dots = $('lock_dots'), pad = $('lock_pad');
  for (var i = 0; i < LARGO_CODIGO; i++) dots.appendChild(document.createElement('i'));
  function boton(txt, cls, fn, etiqueta) {
    var b = el('button', cls, txt);
    b.type = 'button';
    if (etiqueta) b.setAttribute('aria-label', etiqueta);
    b.onclick = fn;
    pad.appendChild(b);
  }
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function (n) { boton(String(n), '', function () { pulsar(String(n)); }); });
  boton('C', 'accion', function () { if (!enviando) { codigo = ''; pintarPuntos(); } }, 'Borrar todo');
  boton('0', '', function () { pulsar('0'); });
  boton('<', 'accion', borrarDigito, 'Borrar el último número');
  $('lock_mail').onsubmit = function (ev) { ev.preventDefault(); enviarCorreo(); };
  $('lock_atras').onclick = function () { codigoOk = ''; $('lock_msg').textContent = ''; verPaso(false); };
  document.addEventListener('keydown', function (ev) {
    if ($('lock').hidden || codigoOk) return;
    if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); pulsar(ev.key); }
    else if (ev.key === 'Backspace') { ev.preventDefault(); borrarDigito(); }
  });
}

/* ---------- Tarjetas ---------- */

/* ---------- Fechas y notas ---------- */

var RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;

/** "2026-12-05 15:00" -> "vie, 5 dic, 3:00 p. m."; otro texto se muestra tal cual. */
function textoFecha(s) {
  var m = RE_FECHA.exec(String(s || ''));
  if (!m) return String(s || '');
  var d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  var t = d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  if (m[4]) t += ', ' + d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  return t;
}

var RE_MARCA = /^\[(ok|-?\d+,-?\d+)\]/;

/**
 * El detalle guarda una nota por línea: "[ok][x,y]AAAA-MM-DD HH:MM|texto".
 * [ok] = nota hecha, [x,y] = posición libre dentro de la tarjeta, la fecha es opcional.
 */
function leerNotas(detalle) {
  var salida = [];
  String(detalle || '').split('\n').forEach(function (linea) {
    var ok = false, pos = null, m;
    linea = linea.trim();
    while ((m = RE_MARCA.exec(linea))) {
      if (m[1] === 'ok') ok = true;
      else { var p = m[1].split(','); pos = { x: +p[0], y: +p[1] }; }
      linea = linea.slice(m[0].length).trim();
    }
    if (!linea) return;
    var i = linea.indexOf('|');
    if (i > 0 && RE_FECHA.test(linea.slice(0, i).trim())) {
      salida.push({ fecha: linea.slice(0, i).trim(), texto: linea.slice(i + 1).trim(), ok: ok, pos: pos });
    } else {
      salida.push({ fecha: '', texto: linea, ok: ok, pos: pos });
    }
  });
  return salida;
}

function lineaNota(n) {
  return (n.ok ? '[ok]' : '') + (n.pos ? '[' + n.pos.x + ',' + n.pos.y + ']' : '') + (n.fecha ? n.fecha + '|' : '') + n.texto;
}

function guardarNotasTarea(t) {
  t.detalle = t.notas.map(lineaNota).join('\n');
  api('notas', { id: t.id, detalle: t.detalle }).catch(fallo);
}

function limitar(v, min, max) { return Math.min(max, Math.max(min, v)); }

/** Cada nota es una notita con su círculo para marcarla como hecha; los admins pueden arrastrarla alrededor de su tarjeta. */
function crearNota(t, c, n) {
  var e = el('div', 'nota' + (n.ok ? ' ok' : ''));
  var ck = el(S.editor ? 'button' : 'span', 'ck');
  ck.setAttribute('aria-label', n.ok ? 'Nota hecha' : 'Nota pendiente');
  if (S.editor) {
    ck.type = 'button';
    ck.setAttribute('aria-pressed', n.ok ? 'true' : 'false');
    ck.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
    ck.addEventListener('click', function (ev) {
      ev.stopPropagation();
      n.ok = !n.ok;
      e.classList.toggle('ok', n.ok);
      ck.setAttribute('aria-pressed', n.ok ? 'true' : 'false');
      ck.setAttribute('aria-label', n.ok ? 'Nota hecha' : 'Nota pendiente');
      guardarNotasTarea(t);
    });
  }
  e.appendChild(ck);
  if (n.fecha) e.appendChild(el('span', 'nf', textoFecha(n.fecha)));
  e.appendChild(el('span', 'tx', n.texto));
  if (n.pos) {
    e.classList.add('libre');
    e.style.left = n.pos.x + 'px';
    e.style.top = n.pos.y + 'px';
  }
  if (S.editor) arrastrarNota(e, n, t, c);
  return e;
}

function arrastrarNota(e, n, t, c) {
  var d = null;
  e.addEventListener('pointerdown', function (ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.stopPropagation();
    d = { x0: ev.clientX, y0: ev.clientY, moved: false };
    e.setPointerCapture(ev.pointerId);
  });
  e.addEventListener('pointermove', function (ev) {
    if (!d) return;
    ev.stopPropagation();
    var dx = (ev.clientX - d.x0) / scale, dy = (ev.clientY - d.y0) / scale;
    if (!d.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      d.moved = true;
      dragNota = true;
      d.ox = e.offsetLeft;
      d.oy = e.offsetTop;
      e.classList.add('libre', 'arr');
      c.classList.add('conlibres');
      c.appendChild(e);
      e.style.left = d.ox + 'px';
      e.style.top = d.oy + 'px';
    }
    // Siempre queda pegada a su tarjeta: puede salir un poco por los lados, pero no alejarse.
    d.x = limitar(d.ox + dx, -90, c.offsetWidth - 40);
    d.y = limitar(d.oy + dy, -20, c.offsetHeight - 26);
    e.style.left = d.x + 'px';
    e.style.top = d.y + 'px';
  });
  function soltar(ev) {
    if (!d) return;
    ev.stopPropagation();
    var movida = d.moved;
    var x = d.x, y = d.y;
    d = null;
    dragNota = null;
    e.classList.remove('arr');
    if (movida) {
      n.pos = { x: Math.round(x), y: Math.round(y) };
      guardarNotasTarea(t);
    }
  }
  e.addEventListener('pointerup', soltar);
  e.addEventListener('pointercancel', function () { d = null; dragNota = null; e.classList.remove('arr'); });
}

function crearCard(t) {
  var c = el('div', 'c' + (t.estado === 'completado' ? ' done' : '') + (S.editor ? ' edit' : ''));
  c.dataset.id = t.id;
  c.style.left = t.x + 'px';
  c.style.top = t.y + 'px';
  c.style.transform = 'rotate(' + t.rotacion + 'deg)';
  c.setAttribute('role', S.editor ? 'button' : 'group');
  c.setAttribute('aria-label', t.titulo + (t.estado === 'completado' ? ', completada' : ', pendiente'));
  c.appendChild(el('span', 'pn'));

  var ph = el('div', 'ph');
  ph.innerHTML = ESCENAS[t.escena] || ESCENAS.generico;
  if (t.imagen) {
    var im = new Image();
    im.className = 'foto aj-' + (t.ajuste || 'cubrir');
    im.alt = '';
    im.referrerPolicy = 'no-referrer';
    im.onerror = function () { im.remove(); };
    im.src = t.imagen;
    ph.appendChild(im);
  }
  ph.insertAdjacentHTML('beforeend', GR);
  c.appendChild(ph);

  c.appendChild(el('p', 't', t.titulo));
  if (t.fecha) c.appendChild(el('p', 'f', textoFecha(t.fecha)));
  t.notas = leerNotas(t.detalle);
  var nts = el('div', 'nts');
  var sueltas = [];
  t.notas.forEach(function (n) {
    var e = crearNota(t, c, n);
    if (n.pos) sueltas.push(e); else nts.appendChild(e);
  });
  c.appendChild(nts);
  sueltas.forEach(function (e) { c.appendChild(e); });
  if (sueltas.length) c.classList.add('conlibres');
  c.appendChild(el('div', 'stp', 'LISTO'));

  if (S.editor) {
    c.appendChild(el('span', 'idb', '#' + t.id));
    var b = el('button', 'eb');
    b.type = 'button';
    b.setAttribute('aria-label', 'Editar ' + t.titulo);
    b.innerHTML = LAPIZ;
    b.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
    b.addEventListener('click', function (ev) { ev.stopPropagation(); abrirDialogo(t); });
    c.appendChild(b);
    activarArrastre(c, t, function () { alternar(t); }, function () {
      api('mover', { id: t.id, x: t.x, y: t.y }).catch(fallo);
    });
  }
  return c;
}

function activarArrastre(c, t, alClic, alGuardar) {
  c.tabIndex = 0;
  c.addEventListener('pointerdown', function (ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    drag = { x0: ev.clientX, y0: ev.clientY, ox: t.x, oy: t.y, moved: false };
    c.setPointerCapture(ev.pointerId);
  });
  c.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var dx = (ev.clientX - drag.x0) / scale, dy = (ev.clientY - drag.y0) / scale;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    drag.moved = true;
    c.classList.add('drag');
    t.x = Math.round(Math.min(BW - 150, Math.max(0, drag.ox + dx)));
    t.y = Math.round(Math.max(10, drag.oy + dy));
    c.style.left = t.x + 'px';
    c.style.top = t.y + 'px';
    dibujarHilos();
  });
  c.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag;
    drag = null;
    c.classList.remove('drag');
    if (d.moved) {
      alGuardar();
      ajustar();
    } else if (alClic) {
      alClic();
    }
  });
  c.addEventListener('pointercancel', function () { drag = null; c.classList.remove('drag'); });
  c.addEventListener('keydown', function (ev) {
    if (alClic && ev.target === c && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); alClic(); }
  });
}

function fallo(e) {
  toast('No se pudo guardar: ' + (e && e.message ? e.message : e));
  cargar();
}

function alternar(t) {
  var nuevo = t.estado === 'completado' ? 'pendiente' : 'completado';
  t.estado = nuevo;
  render();
  api('estado', { id: t.id, estado: nuevo }).catch(fallo);
}

function crearPlano() {
  var hechas = S.tareas.filter(function (t) { return t.estado === 'completado'; }).length;
  var total = S.tareas.length;
  var p = el('div', 'bp' + (S.editor ? ' edit' : ''));
  p.style.left = S.plano.x + 'px';
  p.style.top = S.plano.y + 'px';
  p.setAttribute('role', 'group');
  p.setAttribute('aria-label', hechas + ' de ' + total + ' pasos completados');
  p.appendChild(el('p', 'k', 'Plano de operación'));
  p.appendChild(el('p', 'n', S.titulo || 'Wedding Plan'));
  p.appendChild(el('p', 'big', hechas + ' de ' + total));
  p.appendChild(el('p', 's', 'pasos completados'));
  var br = el('div', 'br');
  var i = document.createElement('i');
  i.style.width = (total ? hechas / total * 100 : 0) + '%';
  br.appendChild(i);
  p.appendChild(br);
  if (S.editor) {
    p.appendChild(el('p', 'h', 'Clic en una tarjeta para tacharla. Arrastra este plano donde quieras.'));
    activarArrastre(p, S.plano, null, function () {
      api('plano', { x: S.plano.x, y: S.plano.y }).catch(fallo);
    });
  }
  return p;
}

function dibujarHilos() {
  var g = '';
  S.tareas.forEach(function (t) {
    String(t.conecta_con || '').split(/[,;\s]+/).forEach(function (s) {
      if (!s) return;
      var q = porId(s);
      if (!q || q.id === t.id) return;
      var x1 = t.x + 80, y1 = t.y, x2 = q.x + 80, y2 = q.y;
      var path = 'M' + x1 + ' ' + y1 + ' Q' + ((x1 + x2) / 2) + ' ' + (Math.max(y1, y2) + 90) + ' ' + x2 + ' ' + y2;
      var gris = t.estado === 'completado' && q.estado === 'completado';
      g += '<path d="' + path + '" transform="translate(2 4)" stroke="rgba(0,0,0,.3)" stroke-width="3" fill="none"/>' +
           '<path d="' + path + '" stroke="' + (gris ? '#7a7a75' : '#C0392B') + '" stroke-width="3" fill="none"/>';
    });
  });
  var sg = $('hilos');
  if (sg) sg.innerHTML = g;
}

function render() {
  var board = $('board');
  board.innerHTML = '';
  var maxY = 0;
  S.tareas.forEach(function (t) { maxY = Math.max(maxY, t.y); });
  maxY = Math.max(maxY, S.plano.y);
  BH = Math.max(520, maxY + 300);
  board.style.height = BH + 'px';

  board.insertAdjacentHTML('beforeend',
    '<svg width="' + BW + '" height="' + BH + '" style="position:absolute;left:0;top:0;z-index:0" aria-hidden="true"><defs>' +
    '<filter id="gr"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2"/><feColorMatrix type="saturate" values="0"/></filter>' +
    '<filter id="ck"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="4" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 .25 0 0 0 0 .14 0 0 0 0 .05 2.5 0 0 0 -.8"/></filter></defs>' +
    '<rect width="' + BW + '" height="' + BH + '" filter="url(#ck)" opacity=".55"/></svg>');
  board.insertAdjacentHTML('beforeend', '<svg id="hilos" width="' + BW + '" height="' + BH + '" aria-hidden="true"></svg>');
  S.tareas.forEach(function (t) { board.appendChild(crearCard(t)); });
  board.appendChild(crearPlano());
  dibujarHilos();
  ajustar();

  $('titulo').textContent = S.titulo || 'Wedding Plan';
  document.title = S.titulo || 'Wedding Plan';
  var txt = '';
  if (S.fechaBoda) {
    var dias = Math.ceil((new Date(S.fechaBoda + 'T00:00:00') - new Date()) / 86400000);
    if (dias > 0) txt = 'Faltan ' + dias + ' días para la boda';
  }
  $('cuenta').textContent = txt;
  $('modo').textContent = (S.editor ? 'Modo edición' : 'Modo observación') + (S.usuario ? ' · ' + S.usuario : '');
  $('nuevo').style.display = S.editor ? '' : 'none';
  $('salir').style.display = !necesitaCodigo() ? '' : 'none';
}

function ajustar() {
  var f = $('frame');
  scale = f.clientWidth / BW;
  $('board').style.transform = 'scale(' + scale + ')';
  f.style.height = (BH * scale) + 'px';
}
window.addEventListener('resize', ajustar);

/* ---------- Diálogo de edición ---------- */

var fechaVieja = '';

function agregarNota(n) {
  if ($('f_notas').children.length >= 10) return;
  var f = RE_FECHA.exec(n ? n.fecha : '');
  var fila = el('div', 'nrow');
  if (n && n.ok) fila.dataset.ok = '1';
  if (n && n.pos) fila.dataset.pos = n.pos.x + ',' + n.pos.y;
  var r1 = el('div', 'nr1');
  var d = document.createElement('input');
  d.type = 'date'; d.className = 'n_f'; d.setAttribute('aria-label', 'Fecha de la nota');
  d.value = f ? f[1] + '-' + f[2] + '-' + f[3] : '';
  var h = document.createElement('input');
  h.type = 'time'; h.className = 'n_h'; h.setAttribute('aria-label', 'Hora de la nota (opcional)');
  h.value = f && f[4] ? f[4] + ':' + f[5] : '';
  var x = el('button', 'x', '×');
  x.type = 'button'; x.setAttribute('aria-label', 'Quitar nota');
  x.onclick = function () { fila.remove(); };
  r1.appendChild(d); r1.appendChild(h); r1.appendChild(x);
  var r2 = el('div', 'nr2');
  var t = document.createElement('input');
  t.type = 'text'; t.className = 'n_t'; t.maxLength = 140; t.placeholder = 'Ej: Cita de Juan en la sastrería';
  t.value = n ? n.texto : '';
  r2.appendChild(t);
  fila.appendChild(r1); fila.appendChild(r2);
  $('f_notas').appendChild(fila);
}

function juntarNotas() {
  var lineas = [];
  Array.prototype.forEach.call($('f_notas').children, function (fila) {
    var f = fila.querySelector('.n_f').value, h = fila.querySelector('.n_h').value;
    var t = fila.querySelector('.n_t').value.replace(/[|\r\n]+/g, ' ').trim();
    if (!f && !t) return;
    var pp = fila.dataset.pos ? fila.dataset.pos.split(',') : null;
    lineas.push(lineaNota({ ok: !!fila.dataset.ok, pos: pp ? { x: +pp[0], y: +pp[1] } : null, fecha: f ? f + (h ? ' ' + h : '') : '', texto: t }));
  });
  return lineas.join('\n');
}

function abrirDialogo(t) {
  editando = t;
  confirmarBorrado = false;
  $('b_del').textContent = 'Eliminar';
  $('err').textContent = '';
  $('dtitulo').textContent = t ? 'Editar tarea #' + t.id : 'Nueva tarea';
  $('f_titulo').value = t ? t.titulo : '';
  var mf = RE_FECHA.exec(t ? t.fecha : '');
  $('f_fecha').value = mf ? mf[1] + '-' + mf[2] + '-' + mf[3] : '';
  $('f_hora').value = mf && mf[4] ? mf[4] + ':' + mf[5] : '';
  fechaVieja = (t && t.fecha && !mf) ? t.fecha : '';
  $('f_fvieja').textContent = fechaVieja ? 'Fecha anterior: ' + fechaVieja + '. Elige una fecha del calendario para cambiarla.' : '';
  $('f_notas').innerHTML = '';
  var lista = leerNotas(t ? t.detalle : '');
  lista.forEach(function (n) { agregarNota(n); });
  if (!lista.length) agregarNota(null);
  $('f_ajuste').value = t && t.ajuste ? t.ajuste : 'cubrir';
  $('f_imagen').value = t ? t.imagenOriginal : '';
  $('f_escena').value = t ? t.escena : 'generico';
  $('f_conecta').value = t ? t.conecta_con : '';
  $('b_del').style.display = t ? '' : 'none';
  $('dlg').showModal();
}

$('nuevo').onclick = function () { abrirDialogo(null); };
$('b_nota').onclick = function () { agregarNota(null); };
$('b_reacomodar').onclick = function () {
  Array.prototype.forEach.call($('f_notas').children, function (f) { delete f.dataset.pos; });
  toast('Las notas volverán a su lugar al guardar.');
};
$('b_qfecha').onclick = function () { $('f_fecha').value = ''; $('f_hora').value = ''; fechaVieja = ''; $('f_fvieja').textContent = ''; };
$('b_cancel').onclick = function () { $('dlg').close(); };
$('f_titulo').oninput = function () { $('err').textContent = ''; };
$('salir').onclick = function () {
  try {
    localStorage.removeItem('tablero_clave');
    localStorage.removeItem('tablero_sesion');
    localStorage.removeItem('tablero_rol');
  } catch (e) {}
  location.reload();
};
$('b_del').onclick = function () {
  if (!confirmarBorrado) {
    confirmarBorrado = true;
    $('b_del').textContent = 'Confirmar eliminación';
    return;
  }
  var id = editando.id;
  $('dlg').close();
  api('eliminar', { id: id }).then(function () {
    S.tareas = S.tareas.filter(function (t) { return t.id !== id; });
    render();
  }).catch(fallo);
};
$('frm').onsubmit = function (ev) {
  ev.preventDefault();
  var titulo = $('f_titulo').value.trim();
  if (!titulo) { $('err').textContent = 'Escribe un título.'; return; }
  var n = S.tareas.length;
  var obj = {
    id: editando ? editando.id : 0,
    titulo: titulo,
    fecha: $('f_fecha').value ? $('f_fecha').value + ($('f_hora').value ? ' ' + $('f_hora').value : '') : fechaVieja,
    detalle: juntarNotas(),
    ajuste: $('f_ajuste').value,
    imagen: $('f_imagen').value,
    escena: $('f_escena').value,
    conecta_con: $('f_conecta').value,
    x: 20 + (n % 3) * 235,
    y: 28 + Math.floor(n / 3) * 236
  };
  $('b_save').disabled = true;
  api('guardar', { tarea: obj }).then(function (g) {
    $('b_save').disabled = false;
    var i = S.tareas.findIndex(function (t) { return t.id === g.id; });
    if (i >= 0) S.tareas[i] = g; else S.tareas.push(g);
    $('dlg').close();
    render();
  }).catch(function (e) {
    $('b_save').disabled = false;
    $('err').textContent = e.message;
  });
};

Object.keys(ESCENAS).forEach(function (k) {
  var o = document.createElement('option');
  o.value = k; o.textContent = NOMBRES[k];
  $('f_escena').appendChild(o);
});

armarTeclado();
if (necesitaCodigo()) mostrarLock();
cargar();
setInterval(function () {
  if (!drag && !dragNota && !$('dlg').open && !DEMO) cargar();
}, 60000);
