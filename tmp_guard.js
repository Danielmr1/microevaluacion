const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fallas = 0;
const leer = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const html = leer('index.html');

function chk(n, c) {
  try { new vm.Script(c, { filename: n }); console.log('  OK    ' + n); }
  catch (e) { fallas++; console.log('  FALLA ' + n + ' -> ' + e.message); }
}
const si = (l, c) => { if (c) console.log('  OK    ' + l); else { fallas++; console.log('  FALLA ' + l); } };
const eq = (l, a, e) => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) fallas++;
  console.log('  ' + (ok ? 'OK   ' : 'FALLA') + ' ' + l + (ok ? '' : ' -> esperado ' + JSON.stringify(e) + ', obtuvo ' + JSON.stringify(a)));
};
function extraer(src, nombre) {
  let i = src.indexOf('async function ' + nombre + '(');
  if (i < 0) i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let d = 0, k = src.indexOf('{', i);
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}

console.log('══ SINTAXIS ══');
['classroom-data.js', 'supabase-client.js', 'scanner.js', 'roi-processor.js'].forEach(f => chk(f, leer(f)));
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, n = 0;
while ((m = re.exec(html)) !== null) { n++; if (m[1].trim()) chk('index.html script #' + n, m[1]); }
[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].forEach((x, i) => {
  const a = (x[1].match(/\{/g) || []).length, c = (x[1].match(/\}/g) || []).length;
  si('CSS bloque #' + (i + 1) + ': ' + a + ' { y ' + c + ' }', a === c);
});

// ── Contexto con salones, evaluaciones y sesión simulados ────────────────────
const SALONES = {
  's4': { id: 's4', name: '4°A', gradeStage: 'primaria', gradeLevel: 4 },
  's6': { id: 's6', name: '6°B', gradeStage: 'primaria', gradeLevel: 6 },
  'ssin': { id: 'ssin', name: 'Sin grado', gradeStage: null, gradeLevel: null }
};
const EVALS = {
  'e4': { id: 'e4', prompt: 'p de 4°', expectedAnswer: '10', gradeStage: 'primaria', gradeLevel: 4, gradeText: '4° de primaria', rubric: { respuesta_canonica: '10' } },
  'e6': { id: 'e6', prompt: 'p de 6°', expectedAnswer: '20', gradeStage: 'primaria', gradeLevel: 6, gradeText: '6° de primaria', rubric: { respuesta_canonica: '20' } },
  'e6sin': { id: 'e6sin', prompt: 'p de 6° sin rúbrica', expectedAnswer: '30', gradeStage: 'primaria', gradeLevel: 6, gradeText: '6° de primaria' },
  'eng': { id: 'eng', prompt: 'p sin grado', expectedAnswer: '40', gradeStage: null, gradeLevel: null, rubric: { respuesta_canonica: '40' } }
};

function montar(sesion, salonSeleccionado) {
  const ctx = {
    console,
    wizardClassroomId: salonSeleccionado || null,
    wizardEval: null,
    document: { getElementById: (id) => id === 'builder-classroom' ? { value: salonSeleccionado || '' } : null },
    ClassroomData: {
      getActiveSession: () => sesion,
      getClassroom: (id) => SALONES[id] || null,
      getEvaluation: (id) => EVALS[id] || null,
      getClassroomGrade: (id) => {
        const c = SALONES[id];
        return (c && c.gradeStage && c.gradeLevel) ? c.gradeLevel + '° de ' + c.gradeStage : null;
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['gradoDelSalon', 'gradoDelSalonSeleccionado', 'gradoDeLaSesion', 'claveDeGrado', 'estadoParaEscanear'].forEach(f => {
    const c = extraer(html, f);
    if (!c) { fallas++; console.log('  FALLA no se encontró ' + f); return; }
    vm.runInContext(c + '\nglobalThis.' + f + ' = ' + f + ';', ctx);
  });
  return ctx;
}
const ses = (classroomId, evalId) => ({ classroomId, evalId, prompt: 'un problema', expectedAnswer: '10', sessionRef: classroomId + '::' + evalId });

console.log('\n══ GUARDARRAÍL: UN SOLO LUGAR DECIDE SI SE PUEDE ESCANEAR ══');
let ctx = montar(null, 's4');
let r = ctx.estadoParaEscanear();
si('sin sesión: NO', r.ok === false);
eq('y el motivo es claro', r.motivo, 'sin-sesion');
si('no ofrece generar', r.puedeGenerar === false);

ctx = montar(ses('salon-borrado', 'e4'), 's4');
r = ctx.estadoParaEscanear();
si('salón borrado: NO', r.ok === false);
eq('motivo', r.motivo, 'sin-salon');
si('y lo explica', /ya no existe/.test(r.detalle));

ctx = montar(ses('s4', 'eval-borrada'), 's4');
r = ctx.estadoParaEscanear();
si('evaluación borrada: NO', r.ok === false);
eq('motivo', r.motivo, 'sin-evaluacion');
si('y lo explica', /ya no está en el banco/.test(r.detalle));

ctx = montar(ses('s4', 'e6'), 's4');
r = ctx.estadoParaEscanear();
si('pregunta de OTRO grado: NO', r.ok === false);
eq('motivo', r.motivo, 'grado-distinto');
si('dice de qué grado es la pregunta', /6° de primaria/.test(r.detalle));
si('y de qué grado es el salón', /4° de primaria/.test(r.detalle));
si('y esto NO se arregla generando nada', r.puedeGenerar === false);

ctx = montar(ses('s6', 'e6sin'), 's6');
r = ctx.estadoParaEscanear();
si('falta la rúbrica: NO, pero se puede generar', r.ok === false && r.puedeGenerar === true);
eq('motivo', r.motivo, 'sin-rubrica');

ctx = montar(ses('s6', 'e6'), 's6');
r = ctx.estadoParaEscanear();
si('todo en orden: SÍ', r.ok === true);
eq('motivo', r.motivo, 'listo');
si('y dice qué hacer', /Iniciar Cámara/.test(r.detalle));

ctx = montar(ses('s4', 'e4'), 's6');
r = ctx.estadoParaEscanear();
si('el salón SELECCIONADO no manda: manda el de la sesión', r.ok === true);

console.log('\n══ EL GRADO SALE DE LA SESIÓN, NO DEL ASISTENTE ══');
ctx = montar(ses('s6', 'e6'), 's4');
let g = ctx.gradoDeLaSesion();
eq('con sesión de 6° y asistente en 4°, el grado es 6°', g.texto, '6° de primaria');
eq('y la etapa', g.stage, 'primaria');
eq('y el número', g.level, 6);

g = ctx.gradoDelSalonSeleccionado();
eq('el del asistente sigue siendo 4°', g.texto, '4° de primaria');

g = ctx.gradoDelSalon('ssin');
si('un salón sin grado devuelve vacío', g.texto === '' && g.stage === null);

console.log('\n══ LAS CLAVES DE GRADO COMPARAN BIEN ══');
ctx = montar(null, null);
eq('primaria 4', ctx.claveDeGrado({ stage: 'primaria', level: 4 }), 'primaria:4');
eq('secundaria 4 (distinta etapa)', ctx.claveDeGrado({ stage: 'secundaria', level: 4 }), 'secundaria:4');
si('un grado incompleto no tiene clave', ctx.claveDeGrado({ stage: 'primaria', level: null }) === null);
si('y sin grado tampoco', ctx.claveDeGrado({}) === null);

console.log('\n══ EL BOTÓN DE LA CÁMARA RESPETA EL CONTROL ══');
const reg = { camara: 0, toasts: [], confirmaciones: 0, generadas: 0 };
function montarCamara(estado, respuestaConfirm) {
  const ctx2 = {
    console,
    showToast: (t) => reg.toasts.push(t),
    renderBankCards: () => {},
    window: { confirm: () => { reg.confirmaciones++; return respuestaConfirm; } },
    document: { body: { classList: { contains: () => false } }, getElementById: () => ({ value: 's4' }) },
    Scanner: { toggleCamera: () => { reg.camara++; } },
    estadoParaEscanear: () => estado,
    generarRubricaDeLaSesion: async () => { reg.generadas++; return reg.generaOk; },
    ClassroomData: { getActiveSession: () => null }
  };
  ctx2.globalThis = ctx2;
  vm.createContext(ctx2);
  vm.runInContext(extraer(html, 'intentarIniciarCamara') + '\nglobalThis.probar = intentarIniciarCamara;', ctx2);
  return ctx2;
}
(async () => {
  // Sin sesión: NO enciende (ni siquiera deja pasar)
  reg.camara = 0; reg.toasts = [];
  await montarCamara({ ok: false, motivo: 'sin-sesion', puedeGenerar: false, detalle: 'Primero configurá la sesión en la pestaña 1.' }).probar();
  eq('sin sesión NO enciende la cámara', reg.camara, 0);
  si('y avisa', reg.toasts.some(t => /configurá la sesión/.test(t)));

  // Grado distinto: NO enciende y no ofrece generar
  reg.camara = 0; reg.toasts = []; reg.confirmaciones = 0;
  await montarCamara({ ok: false, motivo: 'grado-distinto', puedeGenerar: false, detalle: 'Esta pregunta es de 6° de primaria y el salón es de 4° de primaria.' }).probar();
  eq('grado distinto: NO enciende', reg.camara, 0);
  eq('y no pregunta nada', reg.confirmaciones, 0);
  si('explica el motivo', reg.toasts.some(t => /6° de primaria/.test(t)));

  // Sin rúbrica y el docente acepta
  reg.camara = 0; reg.generadas = 0; reg.generaOk = true; reg.confirmaciones = 0;
  await montarCamara({ ok: false, motivo: 'sin-rubrica', puedeGenerar: true, detalle: 'falta' }, true).probar();
  eq('ofrece generarla', reg.confirmaciones, 1);
  eq('la genera', reg.generadas, 1);
  eq('y enciende', reg.camara, 1);

  // Sin rúbrica y el docente rechaza
  reg.camara = 0; reg.generadas = 0; reg.confirmaciones = 0;
  await montarCamara({ ok: false, motivo: 'sin-rubrica', puedeGenerar: true, detalle: 'falta' }, false).probar();
  eq('si dice que no, no genera', reg.generadas, 0);
  eq('ni enciende', reg.camara, 0);

  // Todo en orden
  reg.camara = 0; reg.confirmaciones = 0;
  await montarCamara({ ok: true, motivo: 'listo', puedeGenerar: false, detalle: 'dale' }).probar();
  eq('con todo en orden enciende directo', reg.camara, 1);
  eq('sin preguntar nada', reg.confirmaciones, 0);

  console.log('\n══ EL VISOR Y EL BOTÓN USAN EL MISMO CONTROL ══');
  si('el visor delega en estadoParaEscanear', /function updatePlaceholderHint\(\)[\s\S]{0,260}estadoParaEscanear\(\)/.test(html));
  si('el aviso del visor avisa de los problemas', /hint\.textContent = estado\.ok \? estado\.detalle : \('⚠️ ' \+ estado\.detalle\)/.test(html));
  si('el botón delega en el mismo control', /async function intentarIniciarCamara\(\)[\s\S]{0,300}estadoParaEscanear\(\)/.test(html));
  si('ya no queda la comprobación vieja suelta', !/rubricaDeLaSesion/.test(html));
  si('el generador usa el grado de la sesión', /function generarRubricaDeLaSesion\(\)[\s\S]{0,700}gradoDeLaSesion\(session\)/.test(html));

  console.log('\n══ SIN GRADO NO SE CREA NI SE GENERA NADA ══');
  const cuerpoConfirmar = extraer(html, 'confirmNewEval') || '';
  const cuerpoGenerar = extraer(html, 'handleGenerateRubric') || '';
  si('confirmar exige grado',
    /gradoDelSalonSeleccionado\(\)/.test(cuerpoConfirmar) && /Este salón no tiene grado/.test(cuerpoConfirmar));
  si('y ese control está antes de guardar',
    cuerpoConfirmar.indexOf('Este salón no tiene grado') < cuerpoConfirmar.indexOf('saveCustomEvaluation'));
  si('generar la rúbrica también exige grado',
    /gradoDelSalonSeleccionado\(\)/.test(cuerpoGenerar) && /Completá el grado del salón/.test(cuerpoGenerar));
  si('y no llama a la IA si falta el grado',
    cuerpoGenerar.indexOf('Este salón no tiene grado') < cuerpoGenerar.indexOf('generateRubric('));
  si('ninguno de los dos generó un texto de rúbrica sin grado', !/sin grado: es menos precisa/.test(html));

  console.log('\n' + (fallas === 0 ? 'RESULTADO: los guardarraíles quedaron puestos.' : 'RESULTADO: ' + fallas + ' problema(s).'));
  process.exit(fallas === 0 ? 0 : 1);
})();
