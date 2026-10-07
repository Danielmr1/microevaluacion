// =============================================================================
// classroom-manager.js — Microevaluación A5 v3.1.31
// MÓDULO: GESTOR DE SALONES Y ALUMNOS
//
// Guardarraíles activos:
//   Regla 1  – Cero regresión Respuesta Libre: este módulo no toca el flujo
//              de corrección IA ni la geometría de fichas A5.
//   Regla 3  – Integridad del banco: NUNCA oculta preguntas por tipo.
//   Regla 5  – Prohibición de parches: validaciones separadas por type === 'mc'.
//   Regla 6  – Guardarraíl de creación: se delega a SupabaseClient.
//   Regla 9  – Falla silenciosa: try/catch/finally en todas las operaciones de red.
//   Regla 10 – Sanitización UTF-8 en exportación (SheetJS, decodeCsvBuffer).
//
// Dependencias globales: ClassroomData, SupabaseClient, XLSX,
//                        showToast, loadAndRenderClassrooms,
//                        renderClassroomSelect, wizardClassroomId, wizardEval,
//                        hideWizardSteps, renderGradeSelect, escaparHtml
// =============================================================================

/* ── GESTOR DE SALONES (FLUJO 2) ── */
function renderClassroomManager(selectedClassId = null) {
  const sel = document.getElementById('manager-classroom-select');
  const countEl = document.getElementById('manager-classrooms-count');
  const warnActive = document.getElementById('mgr-active-session-warning');
  const panelAdd = document.getElementById('manager-add-classroom-panel');
  const session = ClassroomData.getActiveSession();
  const isSessionLocked = !!(session && session.classroomId);

  if (warnActive) warnActive.style.display = isSessionLocked ? 'flex' : 'none';
  if (panelAdd) panelAdd.style.display = isSessionLocked ? 'none' : 'block';

  if (!sel) return;

  const list = ClassroomData.getClassroomList();
  if (countEl) countEl.textContent = `${list.length} salón${list.length === 1 ? '' : 'es'}`;

  const previousVal = selectedClassId || sel.value;
  sel.innerHTML = '<option value="">— Elige un salón para ver sus alumnos —</option>';
  list.forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls.id;
    opt.textContent = `${cls.name} (${cls.count} alumnos)`;
    sel.appendChild(opt);
  });

  // Si se pasa un salón específico o había uno válido seleccionado, mantenerlo
  if (previousVal && list.some(c => c.id === previousVal)) {
    sel.value = previousVal;
    onManagerClassroomSelected(previousVal);
  } else {
    sel.value = '';
    onManagerClassroomSelected('');
  }

  // Inicializar filas dinámicas de alumnos si no existen
  const rowsContainer = document.getElementById('mgr-manual-students-rows-container');
  if (rowsContainer && rowsContainer.children.length === 0) {
    resetMgrStudentRows(['']);
  }

  // Grados en el formulario manual
  const gradeSel = document.getElementById('mgr-manual-classroom-grade');
  if (gradeSel && gradeSel.options && gradeSel.options.length <= 1) {
    ClassroomData.getGradeStages().forEach(stage => {
      const group = document.createElement('optgroup');
      group.label = stage.label;
      stage.grades.forEach(level => {
        const opt = document.createElement('option');
        opt.value = stage.stage + ':' + level;
        opt.textContent = level + '° de ' + stage.label.toLowerCase();
        group.appendChild(opt);
      });
      gradeSel.appendChild(group);
    });
  }
}

function onManagerClassroomSelected(classId) {
  const emptyEl = document.getElementById('manager-students-empty');
  const tableWrap = document.getElementById('manager-students-table-wrap');
  const listEl = document.getElementById('manager-students-list');
  const gradeEl = document.getElementById('manager-selected-classroom-grade');
  const countEl = document.getElementById('manager-selected-classroom-students-count');
  const btnDelete = document.getElementById('btn-manager-delete-classroom');

  const session = ClassroomData.getActiveSession();
  const isSessionLocked = !!(session && session.classroomId);

  // Mientras no elige ningún salón, ocultar botón Borrar
  if (btnDelete) {
    btnDelete.style.display = (classId && !isSessionLocked) ? 'inline-flex' : 'none';
  }

  if (!classId) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableWrap) tableWrap.style.display = 'none';
    return;
  }

  const cls = ClassroomData.getClassroom(classId);
  if (!cls) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableWrap) tableWrap.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableWrap) tableWrap.style.display = 'block';

  const gradeText = ClassroomData.formatGrade(cls.gradeStage, cls.gradeLevel) || 'Sin grado especificado';
  if (gradeEl) gradeEl.textContent = `Grado: ${gradeText}`;
  if (countEl) countEl.textContent = `${cls.students.length} estudiante(s)`;

  if (listEl) {
    if (cls.students.length === 0) {
      listEl.innerHTML = '<div style="color:#64748b; font-size:0.75rem; padding:10px; text-align:center;">Este salón no tiene alumnos cargados aún.</div>';
    } else {
      listEl.innerHTML = cls.students.map((s, idx) => `
        <div style="display:flex; align-items:center; justify-content:space-between; background:#1e293b; border:1px solid #334155; border-radius:8px; padding:8px 12px; font-size:0.78rem; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <span style="color:#64748b; font-weight:800; font-size:0.7rem; width:24px; flex-shrink:0;">#${idx + 1}</span>
            <div style="display:flex; flex-direction:column; min-width:0;">
              <span style="color:#f8fafc; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escaparHtml(s.name)}</span>
              <span style="color:#38bdf8; font-size:0.7rem; font-weight:600; margin-top:2px;">
                📱 ${escaparHtml(s.shortName || generateShortName(s.name))}
              </span>
            </div>
          </div>
          ${!isSessionLocked ? `
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <button type="button" onclick="openEditStudentModal('${cls.id}', '${s.id}', '${escaparHtml(s.name).replace(/'/g, "\\'")}', '${escaparHtml(s.shortName || '').replace(/'/g, "\\'")}')"
              title="Editar nombre y nombre corto"
              style="background:#0f172a; border:1px solid #3b82f6; color:#93c5fd; border-radius:6px; padding:4px 8px; font-size:0.74rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s;">
              ✏️ Editar
            </button>
            <button type="button" onclick="handleDeleteStudent('${cls.id}', '${s.id}', '${escaparHtml(s.name).replace(/'/g, "\\'")}', this)"
              title="Eliminar este alumno del salón"
              style="background:#0f172a; border:1px solid #7f1d1d; color:#f87171; border-radius:6px; padding:4px 8px; font-size:0.74rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s;">
              🗑️
            </button>
          </div>` : ''}
        </div>
      `).join('');
    }
  }
}

/* ── FUNCIONES DE EDICIÓN Y BORRADO DE ALUMNOS (FLUJO 2) ── */
function openEditStudentModal(classroomId, studentCode, currentFullName, currentShortName) {
  const activeSession = ClassroomData.getActiveSession();
  if (activeSession && activeSession.classroomId) {
    showToast('⚠️ No se pueden editar estudiantes mientras haya una evaluación en marcha.');
    return;
  }
  const inClassId = document.getElementById('edit-student-class-id');
  const inCode = document.getElementById('edit-student-code');
  const inFull = document.getElementById('edit-student-fullname');
  const inShort = document.getElementById('edit-student-shortname');
  const modal = document.getElementById('modal-edit-student');

  if (inClassId) inClassId.value = classroomId || '';
  if (inCode) inCode.value = studentCode || '';
  if (inFull) inFull.value = currentFullName || '';
  if (inShort) inShort.value = currentShortName || '';

  if (modal) modal.style.display = 'flex';
  setTimeout(() => { if (inFull) inFull.focus(); }, 50);
}

function closeEditStudentModal() {
  const modal = document.getElementById('modal-edit-student');
  if (modal) modal.style.display = 'none';
}

async function saveEditStudent() {
  const activeSession = ClassroomData.getActiveSession();
  if (activeSession && activeSession.classroomId) {
    showToast('⚠️ No se pueden editar estudiantes mientras haya una evaluación en marcha.');
    return;
  }

  const classroomId = document.getElementById('edit-student-class-id')?.value;
  const studentCode = document.getElementById('edit-student-code')?.value;
  const fullName = cleanName(document.getElementById('edit-student-fullname')?.value || '');
  let shortName = cleanName(document.getElementById('edit-student-shortname')?.value || '');

  const val = validateStudentNames(fullName, shortName);
  if (!val.valid) {
    showToast(`⚠️ ${val.error}`);
    return;
  }

  if (!shortName) {
    shortName = generateShortName(fullName);
  }

  // Validar duplicados contra el resto de alumnos del mismo salón
  const cls = ClassroomData.getClassroom(classroomId);
  if (cls && cls.students) {
    const normFull = normalizeTextForComparison(fullName);
    const normShort = normalizeTextForComparison(shortName);

    for (const st of cls.students) {
      if (st.id === studentCode) continue; // Mismo alumno que se está editando

      if (normalizeTextForComparison(st.name) === normFull) {
        showToast(`⚠️ Ya existe otro estudiante con el nombre "${st.name}" en este salón.`);
        return;
      }
      if (normalizeTextForComparison(st.shortName) === normShort) {
        showToast(`⚠️ El nombre corto "${shortName}" ya pertenece a otro estudiante (${st.name}). Elige uno diferente.`);
        return;
      }
    }
  }

  const btnSave = document.getElementById('btn-save-edit-student');
  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = '⏳ Guardando...';
    }
    showToast('⏳ Guardando cambios...');
    const ok = await SupabaseClient.updateStudent(classroomId, studentCode, fullName, shortName);
    if (!ok) {
      showToast('❌ No se pudo actualizar el alumno en la base de datos.');
      return;
    }

    if (typeof ClassroomData !== 'undefined' && ClassroomData.updateStudent) {
      ClassroomData.updateStudent(classroomId, studentCode, fullName, shortName);
    }

    closeEditStudentModal();

    const user = await SupabaseClient.getCurrentUser();
    if (user) {
      await loadAndRenderClassrooms(user, classroomId);
    } else {
      renderClassroomSelect();
      renderClassroomManager();
    }

    const mgrSel = document.getElementById('manager-classroom-select');
    if (mgrSel) {
      mgrSel.value = classroomId;
      onManagerClassroomSelected(classroomId);
    }

    showToast('✅ Alumno actualizado con éxito');
  } catch (err) {
    console.error('[saveEditStudent Error]', err);
    showToast('❌ Error al guardar cambios: ' + (err.message || 'error de red'));
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = '💾 Guardar Cambios';
    }
  }
}

async function handleDeleteStudent(classroomId, studentCode, studentName, triggerBtn = null) {
  const activeSession = ClassroomData.getActiveSession();
  if (activeSession && activeSession.classroomId) {
    showToast('⚠️ No se pueden eliminar estudiantes mientras haya una evaluación en marcha.');
    return;
  }

  const seguro = confirm(
    `¿Eliminar al estudiante "${studentName}" de este salón?\n\nEsta acción quitará al alumno de la nómina.`
  );
  if (!seguro) return;

  try {
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = '⏳';
    }
    showToast('⏳ Eliminando alumno...');
    const ok = await SupabaseClient.deleteStudent(classroomId, studentCode);
    if (!ok) {
      showToast('❌ No se pudo eliminar el alumno.');
      return;
    }

    if (typeof ClassroomData !== 'undefined' && ClassroomData.deleteStudent) {
      ClassroomData.deleteStudent(classroomId, studentCode);
    }

    const user = await SupabaseClient.getCurrentUser();
    if (user) {
      await loadAndRenderClassrooms(user, classroomId);
    } else {
      renderClassroomSelect();
      renderClassroomManager();
    }

    const mgrSel = document.getElementById('manager-classroom-select');
    if (mgrSel) {
      mgrSel.value = classroomId;
      onManagerClassroomSelected(classroomId);
    }

    showToast('🗑️ Alumno eliminado');
  } catch (err) {
    console.error('[handleDeleteStudent Error]', err);
    showToast('❌ Error al eliminar alumno: ' + (err.message || 'error de red'));
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = '🗑️';
    }
  }
}

function switchManagerCreateTab(tab) {
  const isImport = tab === 'import';
  const btnImport = document.getElementById('btn-tab-import');
  const btnManual = document.getElementById('btn-tab-manual');
  const contentImport = document.getElementById('manager-tab-import-content');
  const contentManual = document.getElementById('manager-tab-manual-content');

  if (btnImport) {
    btnImport.style.border = isImport ? '1.5px solid #3b82f6' : '1.5px solid #334155';
    btnImport.style.background = isImport ? '#3b82f620' : '#0f172a';
    btnImport.style.color = isImport ? '#60a5fa' : '#94a3b8';
  }
  if (btnManual) {
    btnManual.style.border = !isImport ? '1.5px solid #3b82f6' : '1.5px solid #334155';
    btnManual.style.background = !isImport ? '#3b82f620' : '#0f172a';
    btnManual.style.color = !isImport ? '#60a5fa' : '#94a3b8';
  }
  if (contentImport) contentImport.style.display = isImport ? 'block' : 'none';
  if (contentManual) contentManual.style.display = !isImport ? 'block' : 'none';
}

/* ── GESTIÓN DE FILAS DINÁMICAS NUMERADAS DE ALUMNOS (v3.1.28) ── */
function resetMgrStudentRows(initialNames = []) {
  const container = document.getElementById('mgr-manual-students-rows-container');
  if (!container) return;
  container.innerHTML = '';

  const list = initialNames.length > 0 ? initialNames : [''];
  list.forEach((name, idx) => {
    addMgrStudentRowElement(container, name, idx + 1);
  });
  updateMgrStudentRowsCount();
}

function addMgrStudentRowElement(container, value = '', num = null) {
  const rowCount = container.children.length;
  const rowNum = num || (rowCount + 1);

  const row = document.createElement('div');
  row.className = 'mgr-student-row';
  row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:8px; width:100%;';

  row.innerHTML = `
    <span class="mgr-student-idx" style="font-size:0.8rem; font-weight:800; color:#64748b; width:28px; text-align:right; flex-shrink:0;">${rowNum}.</span>
    <input type="text" class="mgr-student-input form-control" maxlength="60" value="${escaparHtml(value)}"
      placeholder="Apellidos, Nombres"
      style="flex:1; min-width:0; font-size:0.9rem; font-weight:600; padding:10px 12px; background:#0f172a; border:1.5px solid #334155; color:#f8fafc; border-radius:8px;"
      onkeydown="handleMgrStudentRowKeydown(event, this)"
      oninput="updateMgrStudentRowsCount()">
    <button type="button" onclick="removeMgrStudentRow(this)" title="Quitar este alumno"
      style="background:transparent; border:none; color:#64748b; font-size:1.1rem; cursor:pointer; padding:6px 10px; border-radius:6px; flex-shrink:0; transition:color 0.15s;"
      onmouseenter="this.style.color='#f87171'" onmouseleave="this.style.color='#64748b'">
      ✕
    </button>
  `;

  container.appendChild(row);
  return row;
}

function handleMgrStudentRowKeydown(event, input) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const container = document.getElementById('mgr-manual-students-rows-container');
    if (!container) return;

    const row = input.closest('.mgr-student-row');
    const isLast = row === container.lastElementChild;

    if (isLast) {
      const newRow = addMgrStudentRowElement(container);
      renumberMgrStudentRows();
      updateMgrStudentRowsCount();
      const nextInput = newRow.querySelector('.mgr-student-input');
      if (nextInput) nextInput.focus();
    } else {
      const nextRow = row.nextElementSibling;
      const nextInput = nextRow ? nextRow.querySelector('.mgr-student-input') : null;
      if (nextInput) nextInput.focus();
    }
  }
}

function addMgrStudentRow() {
  const container = document.getElementById('mgr-manual-students-rows-container');
  if (!container) return;
  const newRow = addMgrStudentRowElement(container);
  renumberMgrStudentRows();
  updateMgrStudentRowsCount();
  const nextInput = newRow.querySelector('.mgr-student-input');
  if (nextInput) nextInput.focus();
}

function removeMgrStudentRow(btn) {
  const container = document.getElementById('mgr-manual-students-rows-container');
  if (!container) return;
  const row = btn.closest('.mgr-student-row');
  if (!row) return;

  if (container.children.length <= 1) {
    const input = row.querySelector('.mgr-student-input');
    if (input) { input.value = ''; input.focus(); }
  } else {
    row.remove();
  }
  renumberMgrStudentRows();
  updateMgrStudentRowsCount();
}

function renumberMgrStudentRows() {
  const container = document.getElementById('mgr-manual-students-rows-container');
  if (!container) return;
  const rows = container.querySelectorAll('.mgr-student-row');
  rows.forEach((r, idx) => {
    const span = r.querySelector('.mgr-student-idx');
    if (span) span.textContent = `${idx + 1}.`;
  });
}

function updateMgrStudentRowsCount() {
  const container = document.getElementById('mgr-manual-students-rows-container');
  const countEl = document.getElementById('mgr-manual-student-count');
  if (!container || !countEl) return;

  const inputs = container.querySelectorAll('.mgr-student-input');
  let count = 0;
  inputs.forEach(inp => {
    if (inp.value.trim().length > 0) count++;
  });
  countEl.textContent = `${count} alumno${count === 1 ? '' : 's'}`;
  countEl.style.color = count === 0 ? '#64748b' : '#38bdf8';
}

function getMgrManualStudentsList() {
  const container = document.getElementById('mgr-manual-students-rows-container');
  if (!container) return [];
  const inputs = container.querySelectorAll('.mgr-student-input');
  const students = [];

  inputs.forEach(inp => {
    const raw = (inp.value || '').trim();
    if (raw.length > 0) {
      // El texto íntegro ingresado en la fila es el nombre completo del estudiante (formato Apellidos, Nombres)
      const fullName = cleanName(raw);
      const shortName = generateShortName(fullName);
      if (fullName) {
        students.push({ fullName, shortName });
      }
    }
  });

  return students;
}

function toggleMgrPasteBox() {
  const box = document.getElementById('mgr-paste-box');
  if (!box) return;
  const isOpen = box.style.display !== 'none';
  box.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    const ta = document.getElementById('mgr-paste-textarea');
    if (ta) { ta.value = ''; ta.focus(); }
  }
}

function applyMgrPastedStudents() {
  const ta = document.getElementById('mgr-paste-textarea');
  if (!ta) return;
  const parsed = parseStudentLines(ta.value);
  if (parsed.length === 0) {
    showToast('⚠️ No se encontraron nombres válidos en el texto pegado.');
    return;
  }
  const names = parsed.map(s => (s.shortName && s.shortName !== s.fullName) ? `${s.fullName}, ${s.shortName}` : s.fullName);
  resetMgrStudentRows(names);
  toggleMgrPasteBox();
  showToast(`✅ Se cargaron ${names.length} alumnos en la lista.`);
}

function updateMgrManualStudentCount() {
  updateMgrStudentRowsCount();
}

async function handleDeleteClassroomFromManager() {
  const btnDel = document.getElementById('btn-manager-delete-classroom');
  try {
    const activeSession = ClassroomData.getActiveSession();
    if (activeSession && activeSession.classroomId) {
      showToast('⚠️ No se pueden eliminar salones mientras haya una evaluación en marcha.');
      return;
    }
    const sel = document.getElementById('manager-classroom-select');
    const classroomId = sel ? sel.value : '';
    if (!classroomId) {
      showToast('⚠️ Elige primero el salón que quieres borrar.');
      return;
    }
    const cls = ClassroomData.getClassroom(classroomId);
    const nombre = cls ? cls.name : 'este salón';
    const alumnos = (cls && cls.students) ? cls.students.length : 0;

    const seguro = confirm(
      '¿Borrar el salón "' + nombre + '"?\n\n' +
      'Se eliminan también sus ' + alumnos + ' alumno(s) y TODOS los resultados guardados.\n\n' +
      'No se puede deshacer.'
    );
    if (!seguro) return;

    if (btnDel) {
      btnDel.disabled = true;
      btnDel.textContent = '⏳ Borrando...';
    }
    showToast('⏳ Borrando salón...');
    const borrado = await SupabaseClient.deleteClassroom(classroomId);
    if (!borrado) {
      showToast('❌ No se pudo borrar el salón.');
      return;
    }

    const session = ClassroomData.getActiveSession();
    if (session && session.classroomId === classroomId) {
      ClassroomData.setActiveSession(null);
    }

    wizardClassroomId = null;
    wizardEval = null;

    const user = await SupabaseClient.getCurrentUser();
    if (user) {
      await loadAndRenderClassrooms(user);
    } else {
      renderClassroomSelect();
    }
    renderClassroomManager();
    showToast('🗑️ Salón borrado');
  } catch (err) {
    console.error('[handleDeleteClassroomFromManager Error]', err);
    showToast('❌ Error al borrar el salón: ' + (err.message || 'error de red'));
  } finally {
    if (btnDel) {
      btnDel.disabled = false;
      btnDel.textContent = '🗑️ Borrar Salón';
    }
  }
}

async function handleCreateClassroomManualFromManager() {
  const btnSave = document.getElementById('btn-mgr-save-classroom');
  try {
    const activeSession = ClassroomData.getActiveSession();
    if (activeSession && activeSession.classroomId) {
      showToast('⚠️ No se pueden crear salones mientras haya una evaluación en marcha.');
      return;
    }
    const nameEl = document.getElementById('mgr-manual-classroom-name');
    const gradeEl = document.getElementById('mgr-manual-classroom-grade');

    const name = cleanName(nameEl && nameEl.value);
    const students = getMgrManualStudentsList();

    const nameVal = validateClassroomName(name);
    if (!nameVal.valid) {
      if (nameEl) { nameEl.style.borderColor = '#ef4444'; nameEl.focus(); }
      showToast(`⚠️ ${nameVal.error}`);
      return;
    }
    if (nameEl) nameEl.style.borderColor = '';

    if (!gradeEl || !gradeEl.value) {
      if (gradeEl) { gradeEl.style.borderColor = '#ef4444'; gradeEl.focus(); }
      showToast('⚠️ Elige el grado obligatorio del salón.');
      return;
    }
    if (gradeEl) gradeEl.style.borderColor = '';

    if (students.length === 0) {
      showToast('⚠️ Agrega al menos un alumno a la lista.');
      return;
    }

    const dupCheck = validateClassroomStudents(students);
    if (!dupCheck.valid) {
      showToast(dupCheck.error);
      return;
    }

    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = '⏳ Guardando salón...';
    }
    showToast('⏳ Guardando salón...');

    const partes = gradeEl.value.split(':');
    const stage = partes[0];
    const level = parseInt(partes[1], 10) || null;

    const gradeCode = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'S1';
    const color = (typeof ClassroomData !== 'undefined' && typeof ClassroomData.pickColorForNewClassroom === 'function')
      ? ClassroomData.pickColorForNewClassroom()
      : null;

    const res = await SupabaseClient.createClassroom(name, gradeCode, color, stage, level);
    const newClassroomId = (res && res.id) || (res && res.data && res.data.id) || (typeof res === 'string' ? res : null);

    if (!newClassroomId) {
      showToast('❌ No se pudo crear el salón en la base de datos.');
      return;
    }

    const okStudents = await SupabaseClient.importStudents(newClassroomId, students);
    if (!okStudents) {
      showToast('❌ Salón creado pero ocurrió un problema al guardar los alumnos.');
      return;
    }

    if (nameEl) nameEl.value = '';
    if (gradeEl) gradeEl.value = '';
    resetMgrStudentRows(['']);

    const user = await SupabaseClient.getCurrentUser();
    if (user) {
      await loadAndRenderClassrooms(user, newClassroomId);
    } else {
      renderClassroomSelect();
    }
    renderClassroomManager(newClassroomId);

    showToast(`✅ Salón "${name}" creado con éxito con ${students.length} alumnos`);
  } catch (err) {
    console.error('[Error creando salón]:', err);
    showToast('❌ Error al guardar salón: ' + (err.message || err));
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = '✓ Guardar Salón';
    }
  }
}

/* ── CODIFICACIÓN DE TEXTO ────────────────────────────────────────
   Un CSV en UTF-8 sin BOM se leía como Windows-1252, porque es lo que
   SheetJS asume por defecto. Así, cada palabra con acento llegaba rota:
   "café" terminaba guardado como "cafÃ©", porque los dos bytes del
   acento se interpretaban como dos caracteres Latin-1.
   La solución de raíz es decodificar el CSV nosotros con UTF-8, y dejar
   fixMojibake() como red de seguridad para archivos que ya vengan mal. */

/**
 * Decodifica un CSV respetando su codificación real.
 * Intenta UTF-8 primero; si aparecen caracteres de reemplazo (U+FFFD),
 * prueba Windows-1252, que es la otra codificación habitual en planillas.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function decodeCsvBuffer(buffer) {
  const bytes = new Uint8Array(buffer);

  // Quitar el BOM UTF-8 si está, porque si no aparece en el primer nombre.
  let start = 0;
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    start = 3;
  }
  const cuerpo = bytes.subarray(start);

  let texto = new TextDecoder('utf-8').decode(cuerpo);
  if (texto.indexOf('\uFFFD') !== -1) {
    try {
      const alterno = new TextDecoder('windows-1252').decode(cuerpo);
      // Solo se queda el alterno si de verdad mejora (menos reemplazos).
      if (alterno.indexOf('\uFFFD') === -1) texto = alterno;
    } catch (e) { /* el navegador no soporta windows-1252: se deja UTF-8 */ }
  }
  return texto;
}

/**
 * Repara texto con mojibake (UTF-8 leído como Latin-1/Windows-1252):
 * "cafÃ©" -> "café".
 *
 * Es conservador a propósito: solo actúa si el texto tiene las secuencias
 * típicas (Ã, Â, Ð, Ñ) Y todos sus caracteres caben en un byte, Y el
 * resultado de reinterpretarlos como UTF-8 es válido. Un texto bien
 * codificado no se toca: por ejemplo "SÃO PAULO" queda igual, porque
 * C3 4F no es UTF-8 válido y la decodificación estricta falla.
 *
 * @param {string} valor
 * @returns {string} el texto corregido, o el original si no era mojibake
 */
function fixMojibake(valor) {
  if (!valor || typeof valor !== 'string') return valor;
  if (!/[ÃÂÐÑ]/.test(valor)) return valor;

  const bytes = new Uint8Array(valor.length);
  for (let i = 0; i < valor.length; i++) {
    const code = valor.charCodeAt(i);
    if (code > 255) return valor;      // hay caracteres fuera de Latin-1
    bytes[i] = code;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return valor;                       // no era mojibake recuperable
  }
}


/* ── VALIDACIÓN Y REGLAS DE NOMBRES (v3.1.28) ─────────────────────────
   - Longitud de salón: 3 a 50 caracteres.
   - Longitud de alumno: 3 a 60 caracteres.
   - Longitud de nombre corto: 2 a 20 caracteres.
   - Caracteres estrictamente prohibidos: %, $, # y símbolos especiales.
   - No permite duplicados o similitudes de nombres completos ni cortos en el mismo salón. */

const RE_PROHIBITED_CHARS = /[%$#@!?*+=<>\\/|^&{}[\]";:~'’`]/;
const RE_ALLOWED_STUDENT_CHARS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.,-]+$/;
const RE_ALLOWED_CLASSROOM_CHARS = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ°º\s.,-]+$/;

function validateClassroomName(name) {
  const clean = cleanName(name);
  if (!clean || clean.length < 3 || clean.length > 50) {
    return { valid: false, error: 'El nombre del salón debe tener entre 3 y 50 letras o caracteres.' };
  }
  if (RE_PROHIBITED_CHARS.test(clean) || !RE_ALLOWED_CLASSROOM_CHARS.test(clean)) {
    return { valid: false, error: 'El nombre del salón contiene caracteres no permitidos (no se permiten %, $, # ni símbolos especiales).' };
  }
  return { valid: true, clean };
}

function validateStudentNames(fullName, shortName) {
  const cleanFull = cleanName(fullName);
  const cleanShort = cleanName(shortName);

  if (!cleanFull || cleanFull.length < 3 || cleanFull.length > 60) {
    return { valid: false, error: 'El nombre completo debe tener entre 3 y 60 letras.' };
  }
  if (RE_PROHIBITED_CHARS.test(cleanFull) || !RE_ALLOWED_STUDENT_CHARS.test(cleanFull)) {
    return { valid: false, error: `El nombre "${cleanFull}" contiene caracteres no permitidos (no se permiten %, $, #, números ni símbolos especiales).` };
  }

  if (cleanShort) {
    if (cleanShort.length < 2 || cleanShort.length > 20) {
      return { valid: false, error: 'El nombre corto debe tener entre 2 y 20 caracteres.' };
    }
    if (RE_PROHIBITED_CHARS.test(cleanShort) || !RE_ALLOWED_STUDENT_CHARS.test(cleanShort)) {
      return { valid: false, error: `El nombre corto "${cleanShort}" contiene caracteres no permitidos (no se permiten %, $, # ni símbolos especiales).` };
    }
  }

  return { valid: true, fullName: cleanFull, shortName: cleanShort };
}

function normalizeTextForComparison(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateClassroomStudents(students) {
  const seenFullName = new Map();
  const seenShortName = new Map();

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const val = validateStudentNames(s.fullName, s.shortName);
    if (!val.valid) {
      return { valid: false, error: `Fila #${i + 1}: ${val.error}` };
    }

    const normFull = normalizeTextForComparison(val.fullName);
    if (seenFullName.has(normFull)) {
      const prevIdx = seenFullName.get(normFull);
      return {
        valid: false,
        error: `⚠️ Alumno duplicado o muy similar: "${val.fullName}" (fila #${i + 1}) ya existe en la fila #${prevIdx + 1}.`
      };
    }
    seenFullName.set(normFull, i);

    const effectiveShort = val.shortName || generateShortName(val.fullName);
    const normShort = normalizeTextForComparison(effectiveShort);
    if (seenShortName.has(normShort)) {
      const prevIdx = seenShortName.get(normShort);
      return {
        valid: false,
        error: `⚠️ Nombre corto duplicado: "${effectiveShort}" (fila #${i + 1}) coincide con el de la fila #${prevIdx + 1}. Asígnales nombres cortos distintos para distinguirlos en la ficha.`
      };
    }
    seenShortName.set(normShort, i);
  }

  return { valid: true };
}

function getExportTimestamp() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}_${hours}-${mins}`;
}

function sanitizeExportFileName(name) {
  return (name || 'Salon')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '');
}

/** Limpia y repara un nombre que viene de un archivo o del formulario. */
function cleanName(valor) {
  return fixMojibake((valor == null ? '' : String(valor)).trim());
}

/**
 * Genera un nombre corto optimizado para chips de pantalla móvil (máx. 18 caracteres).
 * Si el docente ingresó un nombre corto personalizado, lo respeta.
 * Si no, extrae el primer nombre e inicial del apellido (ej. 'Mateo G.').
 */
function generateShortName(fullName, customShort = '') {
  const cleanCustom = cleanName(customShort || '');
  if (cleanCustom) {
    return cleanCustom.slice(0, 18).trim();
  }
  const cleanFull = cleanName(fullName || '');
  if (!cleanFull) return '';

  // Formato: "APELLIDOS, NOMBRES" (con coma)
  if (cleanFull.includes(',')) {
    const parts = cleanFull.split(',');
    const lastNamePart = (parts[0] || '').trim();
    const firstNamePart = (parts[1] || '').trim();
    const firstNames = firstNamePart.split(/\s+/).filter(Boolean);
    const lastNames = lastNamePart.split(/\s+/).filter(Boolean);
    const firstName = firstNames[0] || '';
    const lastInitial = lastNames[0] ? (lastNames[0][0].toUpperCase() + '.') : '';
    const res = (firstName + ' ' + lastInitial).trim();
    return (res || cleanFull).slice(0, 18).trim();
  }

  // Formato: "Nombres Apellidos" (sin coma)
  const tokens = cleanFull.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return cleanFull.slice(0, 18).trim();
  }
  if (tokens.length === 2) {
    return (tokens[0] + ' ' + tokens[1][0].toUpperCase() + '.').slice(0, 18).trim();
  }
  const firstName = tokens[0];
  const lastInitial = tokens.length >= 4 ? tokens[2][0].toUpperCase() + '.' : tokens[1][0].toUpperCase() + '.';
  return (firstName + ' ' + lastInitial).slice(0, 18).trim();
}

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
  form.style.display = mostrar ? 'block' : 'none';
  if (mostrar) {
    const t = document.getElementById('manual-form-title');
    if (t) t.textContent = titulo || '➕ Nuevo salón';
    renderManualGradeSelect();
    // Limpiar los bordes rojos de una validación anterior
    ['manual-classroom-name', 'manual-classroom-grade', 'manual-classroom-students'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.borderColor = '';
    });
    const nameInput = document.getElementById('manual-classroom-name');
    if (nameInput && !nameInput.value) nameInput.focus();
  }
}

/**
 * Abre el formulario de alta con el nombre y la nómina ya cargados.
 *
 * Lo usa la importación: en vez de crear el salón a ciegas con un prompt(),
 * el docente ve qué se leyó del archivo, elige el GRADO y confirma. De este
 * modo todo salón nace con grado, sin un paso posterior para completarlo.
 */
function prefillManualClassroomForm(nombre, students) {
  const isManagerActive = document.getElementById('view-classrooms')?.classList.contains('active');
  if (isManagerActive) {
    switchManagerCreateTab('manual');
    const mgrName = document.getElementById('mgr-manual-classroom-name');
    if (mgrName) mgrName.value = nombre || '';
    const names = (students || []).map(s =>
      (s.shortName && s.shortName !== s.fullName)
        ? s.fullName + ', ' + s.shortName
        : s.fullName
    );
    resetMgrStudentRows(names.length > 0 ? names : ['']);
    return;
  }

  const nameEl = document.getElementById('manual-classroom-name');
  if (nameEl) nameEl.value = nombre || '';

  const ta = document.getElementById('manual-classroom-students');
  if (ta) {
    ta.value = (students || []).map(s =>
      (s.shortName && s.shortName !== s.fullName)
        ? s.fullName + ', ' + s.shortName
        : s.fullName
    ).join('\n');
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
    .filter(l => l.length > 0 && !/^nombre\s+completo/i.test(l))
    .map(linea => {
      const partes = linea.split(/[|,;\t]/).map(p => p.trim()).filter(Boolean);
      const fullName = cleanName(partes[0] || '');
      const shortName = generateShortName(fullName, partes[1] || '');
      return { fullName: fullName, shortName: shortName };
    })
    .filter(s => s.fullName.length > 0);
}

/**
 * Descarga una plantilla CSV vacía: solo los encabezados, sin un solo
 * alumno.
 *
 * Se arma en el navegador a propósito. Antes la plantilla era un archivo
 * del repositorio con 10 nombres de alumnos dentro, y eso no puede estar
 * en un repositorio público.
 *
 * Lleva BOM UTF-8 porque Excel, sin él, abre el archivo como Latin-1 y
 * rompe los acentos al guardarlo. Nuestro importador descarta el BOM, así
 * que la plantilla se puede exportar, completar y volver a importar sin
 * que se degrade.
 */
function downloadEmptyRosterTemplate() {
  const contenido = '\uFEFFNombre Completo,Nombre Corto\n';
  try {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_nomina.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('⬇️ Plantilla descargada. Completa una fila por alumno.');
  } catch (e) {
    console.error('[Plantilla] No se pudo generar la descarga:', e);
    showToast('❌ No se pudo descargar la plantilla.');
  }
}

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

/**
 * Lee el archivo Excel/CSV seleccionado y lo importa como un nuevo salón o actualiza el seleccionado.
 */
async function handleExcelImport(input) {
  const activeSession = ClassroomData.getActiveSession();
  if (activeSession && activeSession.classroomId) {
    showToast('⚠️ No se pueden importar ni modificar nóminas mientras haya una evaluación en marcha.');
    input.value = '';
    return;
  }
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('excel-import-status');
  const sel = document.getElementById('builder-classroom');
  let classroomId = sel ? sel.value : '';

  if (statusEl) { statusEl.textContent = '⏳ Leyendo archivo...'; statusEl.style.color = '#94a3b8'; }

  try {
    // Los CSV se decodifican a mano en UTF-8. Si se deja que SheetJS lo
    // haga, asume Windows-1252 y los acentos se rompen ("SofÃ a").
    // Los .xlsx/.xls traen su propia codificación y se leen como binario.
    const esCsv = /\.csv$/i.test(file.name);
    let wb;
    if (esCsv) {
      const texto = decodeCsvBuffer(await file.arrayBuffer());
      wb = XLSX.read(texto, { type: 'string' });
    } else {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Detectar si la primera fila es encabezado
    let startIndex = 0;
    if (rows.length > 0) {
      const firstCol = cleanName(rows[0][0]).toLowerCase();
      if (firstCol.includes('nombre') || firstCol.includes('alumno') || firstCol.includes('estudiante')) {
        startIndex = 1;
      }
    }

    const dataRows = rows.slice(startIndex).filter(r => r[0] && String(r[0]).trim());
    if (dataRows.length === 0) {
      if (statusEl) { statusEl.textContent = '⚠️ No se encontraron alumnos en el archivo'; statusEl.style.color = '#f87171'; }
      input.value = '';
      return;
    }

    // cleanName() repara el mojibake de archivos que ya vienen mal y de
    // paso saca espacios sobrantes.
    const students = dataRows.map(r => {
      const fullName = cleanName(r[0]);
      const shortName = generateShortName(fullName, r[1]);
      return { fullName: fullName, shortName: shortName };
    }).filter(s => s.fullName);

    // Validar reglas de nombres y no duplicados
    const dupCheck = validateClassroomStudents(students);
    if (!dupCheck.valid) {
      if (statusEl) {
        statusEl.textContent = dupCheck.error;
        statusEl.style.color = '#f87171';
      }
      showToast(dupCheck.error);
      input.value = '';
      return;
    }

    let targetClassroomId = classroomId;

    // Si ya había un salón elegido, preguntar si se actualiza ese o se crea
    // uno nuevo. Ya no se pide nada por prompt(): la creación siempre pasa
    // por el formulario de alta.
    if (targetClassroomId) {
      const selectedText = sel.options[sel.selectedIndex]?.textContent || 'este salón';
      const wantUpdate = confirm(
        `¿Actualizar la lista de alumnos de:\n"${selectedText}"?\n\n` +
        `(Aceptar = actualizar ese salón / Cancelar = crear un salón nuevo)`
      );
      if (!wantUpdate) targetClassroomId = null;
    }

    // Sin salón destino: se abre el formulario de alta con el nombre y la
    // nómina YA cargados, para que el docente revise qué se leyó del
    // archivo, elija el GRADO y confirme.
    //
    // Esto es lo que garantiza que ningún salón nazca sin grado: la
    // importación ya no crea salones por su cuenta, solo prepara el alta.
    if (!targetClassroomId) {
      if (statusEl) {
        statusEl.textContent = `📋 ${students.length} alumnos leídos — elige el grado y confirma`;
        statusEl.style.color = '#38bdf8';
      }
      prefillManualClassroomForm(nombreSugeridoDeArchivo(file.name), students);
      input.value = '';
      return;
    }

    const importRes = await SupabaseClient.importStudents(targetClassroomId, students);
    const importOk = importRes === true || (importRes && importRes.success === true);
    if (importOk) {
      if (statusEl) { statusEl.textContent = `✅ ${students.length} alumnos guardados`; statusEl.style.color = '#4ade80'; }
      const user = await SupabaseClient.getCurrentUser();
      if (user) await loadAndRenderClassrooms(user, targetClassroomId);
      showToast(`✅ Salón y nómina guardados: ${students.length} alumnos`);
    } else {
      if (statusEl) { statusEl.textContent = '❌ Error al guardar alumnos'; statusEl.style.color = '#f87171'; }
    }
  } catch (e) {
    console.error('[ExcelImport]', e);
    if (statusEl) { statusEl.textContent = '❌ Archivo inválido o error al procesar'; statusEl.style.color = '#f87171'; }
  }
  input.value = '';  // Resetear el input para permitir reimportar el mismo archivo
}
