// =============================================================================
// classroom-manual-form.js — Microevaluación A5
// MÓDULO: FORMULARIO DE ALTA MANUAL Y BORRADO DE SALÓN (HUB PRINCIPAL)
//
// Responsabilidad única:
//   - Gestión del formulario desplegable de alta manual en el Hub (#manual-classroom-form).
//   - Parseo de líneas de alumnos pegadas o escritas manualmente (parseStudentLines).
//   - Validación de nombres de salón y alumnos con grado obligatorio.
//   - Borrado de salón desde el selector principal del Hub (handleDeleteClassroom).
// =============================================================================

/* ── ALTA MANUAL DE SALÓN ────────────────────────────────────────── */

/**
 * Abre o cierra el formulario de alta de salón.
 * @param {boolean} [forzar] true abre, false cierra, sin valor alterna
 * @param {string} [titulo] título a mostrar; sirve para distinguir el alta
 *        a mano de una nómina que viene de un archivo importado
 */
function toggleManualClassroomForm(forzar, titulo) {
  const form = document.getElementById('manual-classroom-form');
  if (!form) return;
  const mostrar = (forzar === undefined) ? (form.style.display === 'none') : !!forzar;

  // Si se llama como toggle para cerrar (sin forzar), ejecutar la lógica completa de cancelación
  if (!mostrar && forzar === undefined) {
    cancelManualClassroomForm();
    return;
  }

  form.style.display = mostrar ? 'block' : 'none';
  const sel = document.getElementById('builder-classroom');

  if (mostrar) {
    const t = document.getElementById('manual-form-title');
    if (t) t.textContent = titulo || '➕ Nuevo salón';
    renderManualGradeSelect();
    // Limpiar los bordes rojos de una validación anterior
    ['manual-classroom-name', 'manual-classroom-grade', 'manual-classroom-students'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.borderColor = '';
    });

    // 1. Bloquear selector de salón superior para evitar saltos prematuros a pasos 2 y 3
    if (sel) {
      sel.value = '';
      sel.disabled = true;
      sel.style.opacity = '0.55';
      sel.style.cursor = 'not-allowed';
      sel.style.borderColor = '';
      sel.style.color = '';
    }

    // 2. Ocultar grado y pasos siguientes mientras se crea/importa el salón
    const gradeBlock = document.getElementById('grade-block');
    if (gradeBlock) gradeBlock.style.display = 'none';
    const gradeReadonly = document.getElementById('grade-readonly');
    if (gradeReadonly) gradeReadonly.style.display = 'none';
    const stepType = document.getElementById('step-eval-type');
    if (stepType) stepType.style.display = 'none';
    const stepSumm = document.getElementById('step-summary');
    if (stepSumm) stepSumm.style.display = 'none';

    // 3. Desaparecer inmediatamente el holograma (especialmente en celular donde queda de fondo)
    if (typeof window !== 'undefined' && window.EvaluationHologram) {
      if (typeof window.EvaluationHologram.stop === 'function') {
        window.EvaluationHologram.stop();
      }
      const hCanvas = document.getElementById('eval-hologram-canvas');
      if (hCanvas) {
        hCanvas.style.opacity = '0';
        hCanvas.style.display = 'none';
      }
    }

    const nameInput = document.getElementById('manual-classroom-name');
    if (nameInput && !nameInput.value) nameInput.focus();
  } else {
    // Al cerrar normalmente (ej: alta exitosa), rehabilitar el selector superior
    if (sel) {
      sel.disabled = false;
      sel.style.opacity = '1';
      sel.style.cursor = '';
    }

    // Limpiar campos del formulario
    const nameInput = document.getElementById('manual-classroom-name');
    if (nameInput) nameInput.value = '';
    const studentsInput = document.getElementById('manual-classroom-students');
    if (studentsInput) studentsInput.value = '';
    const gradeInput = document.getElementById('manual-classroom-grade');
    if (gradeInput) gradeInput.value = '';
    if (typeof updateManualStudentCount === 'function') updateManualStudentCount();
  }
}

/**
 * Cancela la creación/importación manual del salón:
 * Cierra el formulario, limpia campos, rehabilita el selector superior en blanco
 * y reactiva el holograma en la pantalla inicial de espera.
 */
function cancelManualClassroomForm() {
  const form = document.getElementById('manual-classroom-form');
  if (form) form.style.display = 'none';

  // Limpiar campos
  const nameInput = document.getElementById('manual-classroom-name');
  if (nameInput) nameInput.value = '';
  const studentsInput = document.getElementById('manual-classroom-students');
  if (studentsInput) studentsInput.value = '';
  const gradeInput = document.getElementById('manual-classroom-grade');
  if (gradeInput) gradeInput.value = '';
  if (typeof updateManualStudentCount === 'function') updateManualStudentCount();

  // Rehabilita selector superior y lo deja en "Elige un salón"
  const sel = document.getElementById('builder-classroom');
  if (sel) {
    sel.disabled = false;
    sel.style.opacity = '1';
    sel.style.cursor = '';
    sel.value = '';
  }

  // Notificar reseteo de salón
  if (typeof onClassroomSelectChanged === 'function') {
    onClassroomSelectChanged('');
  }

  // Reactivar el holograma inicial
  if (typeof window !== 'undefined' && window.EvaluationHologram && typeof window.EvaluationHologram.start === 'function') {
    window.EvaluationHologram.start();
  }
}
window.cancelManualClassroomForm = cancelManualClassroomForm;

/**
 * Abre el formulario de alta con el nombre y la nómina ya cargados.
 *
 * Lo usa la importación: en vez de crear el salón a ciegas con un prompt(),
 * el docente ve qué se leyó del archivo, elige el GRADO y confirma. De este
 * modo todo salón nace con grado, sin un paso posterior para completarlo.
 */
function prefillManualClassroomForm(nombre, students) {
  const safeName = (nombre || '').slice(0, 15);
  const isManagerActive = document.getElementById('view-classrooms')?.classList.contains('active');
  if (isManagerActive) {
    openAddClassroomModal();
    switchManagerCreateTab('manual');
    const mgrName = document.getElementById('mgr-manual-classroom-name');
    if (mgrName) mgrName.value = safeName;
    const mgrTa = document.getElementById('mgr-manual-classroom-students');
    if (mgrTa) {
      mgrTa.value = (students || []).map(s => s.fullName || s.name || '').filter(Boolean).join('\n');
      updateMgrStudentCount();
    }
    return;
  }

  const nameEl = document.getElementById('manual-classroom-name');
  if (nameEl) nameEl.value = safeName;

  const ta = document.getElementById('manual-classroom-students');
  if (ta) {
    ta.value = (students || []).map(s => s.fullName || s.name || '').filter(Boolean).join('\n');
  }

  updateManualStudentCount();
  toggleManualClassroomForm(true, '📋 Salón importado — revisa la nómina y elige el grado');

  const form = document.getElementById('manual-classroom-form');
  if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Nombre de salón sugerido a partir del nombre del archivo. */
function nombreSugeridoDeArchivo(nombreArchivo) {
  const base = (nombreArchivo || '').replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

/** Puebla el selector de grado del alta manual con el mismo catálogo. */
function renderManualGradeSelect() {
  const sel = document.getElementById('manual-classroom-grade');
  if (!sel || sel.dataset.lleno === '1') return;
  ClassroomData.getGradeStages().forEach(stage => {
    const group = document.createElement('optgroup');
    group.label = stage.label;
    stage.grades.forEach(level => {
      const opt = document.createElement('option');
      opt.value = stage.stage + ':' + level;
      opt.textContent = level + '° de ' + stage.label.toLowerCase();
      group.appendChild(opt);
    });
    sel.appendChild(group);
  });
  sel.dataset.lleno = '1';
}

/**
 * Convierte el textarea en una nómina.
 * Una línea por alumno. El nombre corto es opcional y va después de una
 * coma, barra, punto y coma o tabulación: "Nombre completo, Nombre corto".
 * La tabulación está incluida para que se pueda PEGAR directo desde Excel
 * (que copia las columnas separadas por tab).
 *
 * El BOM UTF-8 al inicio se descarta, porque si no quedaría pegado al
 * primer nombre (pasa al importar una plantilla descargada de acá).
 *
 * @param {string} texto
 * @returns {Array<{fullName: string, shortName: string}>}
 */
function parseStudentLines(texto) {
  const limpio = (texto || '').replace(/^\uFEFF/, '');
  return limpio.split('\n')
    .map(l => l.trim())
    // Se descarta una fila de encabezado, por si alguien pega la plantilla
    // entera en el cuadro en vez de escribir solo los nombres.
    .filter(l => l.length > 0 && !/^"?nombre\s+completo/i.test(l) && !/^"?apellidos\s*,\s*nombres/i.test(l))
    .map(linea => {
      let fullName = '';
      if (linea.includes('\t')) {
        const parts = linea.split('\t').map(p => p.trim()).filter(Boolean);
        fullName = cleanName(parts[0] || '');
      } else if (linea.includes('|')) {
        const parts = linea.split('|').map(p => p.trim()).filter(Boolean);
        fullName = cleanName(parts[0] || '');
      } else if (linea.includes(';')) {
        const parts = linea.split(';').map(p => p.trim()).filter(Boolean);
        fullName = cleanName(parts[0] || '');
      } else {
        // Formato estándar: "Apellidos, Nombres" o "Nombres Apellidos"
        // Si tuviera una 2da coma accidental (ej. "Mejia Prado, Mateo, Mateo M.")
        const partesComa = linea.split(',').map(p => p.trim()).filter(Boolean);
        if (partesComa.length >= 3) {
          // Si tiene 3 partes con coma, las 2 primeras componen Apellidos, Nombres
          fullName = cleanName(partesComa[0] + ', ' + partesComa[1]);
        } else {
          fullName = cleanName(linea);
        }
      }
      const shortName = generateShortName(fullName);
      return { fullName: fullName, shortName: shortName };
    })
    .filter(s => s.fullName.length > 0);
}

/**
 * Descarga una plantilla CSV vacía: solo el encabezado de Apellidos, Nombres.
 *
 * Lleva BOM UTF-8 porque Excel, sin él, abre el archivo como Latin-1 y
 * rompe los acentos al guardarlo. Nuestro importador descarta el BOM, así
 * que la plantilla se puede exportar, completar y volver a importar sin
 * que se degrade.
 */

function updateManualStudentCount() {
  const ta = document.getElementById('manual-classroom-students');
  const out = document.getElementById('manual-student-count');
  if (!ta || !out) return;
  const n = parseStudentLines(ta.value).length;
  out.textContent = n + (n === 1 ? ' alumno' : ' alumnos');
  out.style.color = n === 0 ? '#64748b' : '#38bdf8';
}

async function handleCreateClassroomManual() {
  const btn = document.getElementById('btn-manual-classroom-save');
  try {
    const nameEl = document.getElementById('manual-classroom-name');
    const gradeEl = document.getElementById('manual-classroom-grade');
    const taEl = document.getElementById('manual-classroom-students');

    const name = cleanName(nameEl && nameEl.value);
    const students = parseStudentLines(taEl && taEl.value);

    const nameVal = validateClassroomName(name);
    if (!nameVal.valid) {
      if (nameEl) { nameEl.style.borderColor = '#ef4444'; nameEl.focus(); }
      showToast(`⚠️ ${nameVal.error}`);
      return;
    }
    if (students.length === 0) {
      if (taEl) { taEl.style.borderColor = '#ef4444'; taEl.focus(); }
      showToast('⚠️ Carga al menos un alumno, uno por línea.');
      return;
    }

    const dupCheck = validateClassroomStudents(students);
    if (!dupCheck.valid) {
      if (taEl) { taEl.style.borderColor = '#ef4444'; taEl.focus(); }
      showToast(dupCheck.error);
      return;
    }

    let stage = null, level = null;
    if (gradeEl && gradeEl.value) {
      const partes = gradeEl.value.split(':');
      stage = partes[0];
      level = parseInt(partes[1], 10) || null;
    }

    // El grado es OBLIGATORIO al crear: es el contexto con el que la IA
    // decide qué procedimiento de resolución es válido.
    if (!stage || !level) {
      if (gradeEl) { gradeEl.style.borderColor = '#ef4444'; gradeEl.focus(); }
      showToast('⚠️ Elige el grado del salón: define qué procedimiento se considera correcto.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Creando salón...';
    }
    showToast('⏳ Creando el salón...');

    const gradeCode = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'S1';
    const res = await SupabaseClient.createClassroom(name, gradeCode, null, stage, level);
    const newId = (res && res.id) || (res && res.data && res.data.id);

    if (!newId) {
      showToast('❌ No se pudo crear el salón. Revisa la consola.');
      return;
    }

    const ok = await SupabaseClient.importStudents(newId, students);
    if (!ok) {
      showToast('❌ El salón se creó pero no se pudieron guardar los alumnos.');
      return;
    }

    // Limpiar el formulario y recargar la lista, dejando el salón nuevo elegido
    if (nameEl) nameEl.value = '';
    if (taEl) taEl.value = '';
    if (gradeEl) gradeEl.value = '';
    updateManualStudentCount();
    toggleManualClassroomForm(false);

    const user = await SupabaseClient.getCurrentUser();
    if (user) {
      await loadAndRenderClassrooms(user, newId);
    } else {
      renderClassroomSelect();
    }
    showToast('✅ Salón creado con ' + students.length + ' alumnos');
  } catch (err) {
    console.error('[handleCreateClassroomManual Error]', err);
    showToast('❌ Error al crear salón: ' + (err.message || 'error de red'));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✓ Crear salón';
    }
  }
}

/* ── BORRAR SALÓN ────────────────────────────────────────────────── */

async function handleDeleteClassroom() {
  try {
    const sel = document.getElementById('builder-classroom');
    const classroomId = sel ? sel.value : '';
    if (!classroomId) {
      showToast('⚠️ Elige primero el salón que quieres borrar.');
      return;
    }

    const cls = ClassroomData.getClassroom(classroomId);
    const nombre = cls ? cls.name : 'este salón';
    const alumnos = (cls && cls.students) ? cls.students.length : 0;

    // Guardarraíl: Protección si el salón está en uso (sesión activa o guardada)
    const inUse = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
      ? ClassroomData.isClassroomInUse(classroomId)
      : (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInSavedSession ? ClassroomData.isClassroomInSavedSession(classroomId) : { inUse: false });
    if (inUse && inUse.inUse) {
      showToast(`⚠️ No puedes eliminar el salón "${nombre}" porque está en la sesión "${inUse.sessionTitle}".`);
      alert(`⚠️ Acción Bloqueada por Seguridad:\n\nEl salón "${nombre}" está siendo utilizado en:\n"${inUse.sessionTitle}".\n\nPara eliminar este salón, elimina primero esa sesión en "Sesiones Guardadas" o finaliza la evaluación activa.`);
      return;
    }

    // Aviso explícito: por CASCADE se van los alumnos Y los resultados.
    const seguro = confirm(
      '¿Borrar el salón "' + nombre + '"?\n\n' +
      'Se eliminan también sus ' + alumnos + ' alumno(s) y TODOS los resultados ' +
      'guardados de ese salón.\n\n' +
      'No se puede deshacer.'
    );
    if (!seguro) return;

    showToast('⏳ Borrando salón...');
    const borrado = await SupabaseClient.deleteClassroom(classroomId);
    if (!borrado) {
      showToast('❌ No se pudo borrar el salón. Revisa la consola.');
      return;
    }

    // Si era la sesión activa, se descarta: ya no existe ese salón.
    const session = ClassroomData.getActiveSession();
    if (session && session.classroomId === classroomId) {
      ClassroomData.setActiveSession(null);
    }

    wizardClassroomId = null;
    wizardEval = null;
    hideWizardSteps();

    const user = await SupabaseClient.getCurrentUser();
    if (user) {
      await loadAndRenderClassrooms(user);
    } else {
      renderClassroomSelect();
    }
    renderGradeSelect(null);
    showToast('🗑️ Salón borrado');
  } catch (err) {
    console.error('[handleDeleteClassroom Error]', err);
    showToast('❌ Error al borrar el salón: ' + (err.message || 'error de red'));
  }
}


// ── EXPOSICIÓN GLOBAL DE FUNCIONES DEL FORMULARIO MANUAL ──
if (typeof window !== 'undefined') {
  window.toggleManualClassroomForm = toggleManualClassroomForm;
  window.cancelManualClassroomForm = cancelManualClassroomForm;
  window.prefillManualClassroomForm = prefillManualClassroomForm;
  window.nombreSugeridoDeArchivo = nombreSugeridoDeArchivo;
  window.renderManualGradeSelect = renderManualGradeSelect;
  window.parseStudentLines = parseStudentLines;
  window.updateManualStudentCount = updateManualStudentCount;
  window.handleCreateClassroomManual = handleCreateClassroomManual;
  window.handleDeleteClassroom = handleDeleteClassroom;
}
