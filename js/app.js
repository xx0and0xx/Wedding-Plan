/* Tablero de corcho: lógica de la página.
   Los datos viven en el Google Sheets; aquí solo se dibujan y se envían los cambios. */

var BW = 720, BH = 560, scale = 1;
var S = { tareas: [], editor: false, titulo: '', fechaBoda: '', plano: { x: 20, y: 320 } };
var drag = null, confirmarBorrado = false, editando = null;
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
  var leerPublico = accion === 'leer' && !CLAVE;
  var pedido = leerPublico
    ? fetch(CFG.API_URL + '?accion=leer')
    : fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ accion: accion, clave: CLAVE }, datos || {}))
      });
  return pedido
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j.ok) throw new Error(j.error || 'Error desconocido');
      return j.datos;
    });
}

/* Modo demostración: datos de ejemplo en memoria, sin backend. */
var demoPlano = { x: 20, y: 320 };
var demoTareas = [
  { id: 1, titulo: 'Trajes de los caballeros de honor', responsable: 'Novio', fecha: '12 mar, 3:00 pm', detalle: 'Prueba en la sastrería', imagenOriginal: '', imagen: '', escena: 'traje', estado: 'pendiente', x: 20, y: 28, rotacion: -2, conecta_con: '' },
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
    r = { tareas: JSON.parse(JSON.stringify(demoTareas)), editor: true, titulo: 'Despedida de solteros (demostración)', fechaBoda: '', plano: JSON.parse(JSON.stringify(demoPlano)) };
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
    ['titulo', 'responsable', 'fecha', 'detalle', 'escena', 'conecta_con'].forEach(function (k) { t[k] = d.tarea[k]; });
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
    $('aviso').hidden = !DEMO;
    if (DEMO) $('aviso').textContent = 'Modo demostración: los cambios no se guardan. Para conectarlo con tu Sheets, pega la URL de Apps Script en js/config.js.';
    render();
  }).catch(function (e) {
    $('aviso').hidden = false;
    $('aviso').textContent = 'No pude leer el tablero: ' + e.message;
  });
}

/* ---------- Tarjetas ---------- */

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
    im.className = 'foto';
    im.alt = '';
    im.referrerPolicy = 'no-referrer';
    im.onerror = function () { im.remove(); };
    im.src = t.imagen;
    ph.appendChild(im);
  }
  ph.insertAdjacentHTML('beforeend', GR);
  c.appendChild(ph);

  c.appendChild(el('p', 't', t.titulo));
  if (t.fecha) c.appendChild(el('p', 'f', t.fecha));
  if (t.responsable) c.appendChild(el('p', 'w', t.responsable));
  if (t.detalle) c.appendChild(el('div', 'nt', t.detalle));
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
  p.appendChild(el('p', 'n', S.titulo || 'Tablero'));
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

  $('titulo').textContent = S.titulo || 'Tablero';
  document.title = S.titulo || 'Tablero';
  var txt = '';
  if (S.fechaBoda) {
    var dias = Math.ceil((new Date(S.fechaBoda + 'T00:00:00') - new Date()) / 86400000);
    if (dias > 0) txt = 'Faltan ' + dias + ' días para la boda';
  }
  $('cuenta').textContent = txt;
  $('modo').textContent = S.editor ? 'Modo edición' : 'Solo lectura';
  $('nuevo').style.display = S.editor ? '' : 'none';
  $('salir').style.display = (S.editor && !DEMO) ? '' : 'none';
}

function ajustar() {
  var f = $('frame');
  scale = f.clientWidth / BW;
  $('board').style.transform = 'scale(' + scale + ')';
  f.style.height = (BH * scale) + 'px';
}
window.addEventListener('resize', ajustar);

/* ---------- Diálogo de edición ---------- */

function abrirDialogo(t) {
  editando = t;
  confirmarBorrado = false;
  $('b_del').textContent = 'Eliminar';
  $('err').textContent = '';
  $('dtitulo').textContent = t ? 'Editar tarea #' + t.id : 'Nueva tarea';
  $('f_titulo').value = t ? t.titulo : '';
  $('f_responsable').value = t ? t.responsable : '';
  $('f_fecha').value = t ? t.fecha : '';
  $('f_detalle').value = t ? t.detalle : '';
  $('f_imagen').value = t ? t.imagenOriginal : '';
  $('f_escena').value = t ? t.escena : 'generico';
  $('f_conecta').value = t ? t.conecta_con : '';
  $('b_del').style.display = t ? '' : 'none';
  $('dlg').showModal();
}

$('nuevo').onclick = function () { abrirDialogo(null); };
$('b_cancel').onclick = function () { $('dlg').close(); };
$('f_titulo').oninput = function () { $('err').textContent = ''; };
$('salir').onclick = function () {
  try { localStorage.removeItem('tablero_clave'); } catch (e) {}
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
    responsable: $('f_responsable').value,
    fecha: $('f_fecha').value,
    detalle: $('f_detalle').value,
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

cargar();
setInterval(function () {
  if (!drag && !$('dlg').open && !DEMO) cargar();
}, 60000);
