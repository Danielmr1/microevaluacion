// =============================================================================
// classroom-roster.js — Microevaluación
// MÓDULO: NÓMINA DE ALUMNOS (ALTA RÁPIDA, EDICIÓN, BORRADO Y EXPORTACIÓN EXCEL)
//
// Guardarraíles activos:
//   Regla 10 – Sanitización y Resiliencia en la Exportación a Excel:
//              Codificación UTF-8 estricta, campos nulos sanitizados con guion.
// =============================================================================

/* ── FORMULARIO INLINE: AGREGAR ALUMNO EN MODAL ── */
function handleInlineStudentFullnameInput(value) {
  const clean = cleanName(value || '');
  const countEl = document.getElementById('mgr-inline-char-count');
  if (countEl) {
    countEl.textContent = `${clean.length}/45`;
    countEl.style.color = (clean.length > 45) ? '#ef4444' : '#786C5E';
  }
  const autoShort = generateShortName(clean);
  const badgeText = document.getElementById('mgr-inline-shortname-text');
  if (badgeText) {
    badgeText.textContent = autoShort || '—';
  }
  const inShort = document.getElementById('mgr-inline-student-shortname');
  if (inShort) {
    inShort.value = autoShort || '';
  }
}

function toggleAddStudentForm(force, isEdit = false) {
  const classroomId = currentSelectedClassroomId;
  if (classroomId && typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse) {
    const inUse = ClassroomData.isClassroomInUse(classroomId);
    if (inUse.inUse) {
      showToast(`⚠️ Salón bloqueado: en uso en "${inUse.sessionTitle}".`);
      return;
    }
  }
  const box = document.getElementById('mgr-inline-add-student-box');
  if (!box) return;
  const isVisible = box.style.display !== 'none';
  const show = (force !== undefined) ? !!force : !isVisible;
  box.style.display = show ? 'block' : 'none';

  // Contraer u ocultar la barra de herramientas principal mientras se edita o crea un alumno
  const toolbar = document.getElementById('mgr-classroom-actions-toolbar');
  if (toolbar) {
    toolbar.style.display = show ? 'none' : 'flex';
  }

  // Ocultar e inhabilitar botones de editar y eliminar de cada alumno (manteniendo la nómina 100% nítida)
  const listEl = document.getElementById('mgr-modal-students-list');
  if (listEl) {
    listEl.classList.toggle('mgr-roster-editing', show);
    listEl.classList.toggle('mgr-students-dimmed', show);
    const actionBtns = listEl.querySelectorAll('.mgr-student-actions button');
    actionBtns.forEach(btn => {
      btn.disabled = show;
    });
  }

  const editIdInput = document.getElementById('mgr-inline-student-edit-id');
  const labelEl = document.getElementById('mgr-inline-student-label');
  const fnInput = document.getElementById('mgr-inline-student-fullname');

  if (show) {
    if (!isEdit) {
      if (editIdInput) editIdInput.value = '';
      if (labelEl) labelEl.textContent = 'Nombre Completo del Estudiante';
      if (fnInput) {
        fnInput.value = '';
        fnInput.focus();
      }
      handleInlineStudentFullnameInput('');
    }
  } else {
    if (editIdInput) editIdInput.value = '';
    if (labelEl) labelEl.textContent = 'Nombre Completo del Estudiante';
    if (fnInput) {
      fnInput.value = '';
    }
    handleInlineStudentFullnameInput('');
  }
}

async function handleSaveInlineStudent() {
  const classroomId = currentSelectedClassroomId;
  if (!classroomId) return;

  const inUse = typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse
    ? ClassroomData.isClassroomInUse(classroomId)
    : { inUse: false };
  if (inUse.inUse) {
    showToast(`⚠️ No se pueden realizar cambios en un salón con sesión activa o guardada ("${inUse.sessionTitle}").`);
    return;
  }

  const editIdEl = document.getElementById('mgr-inline-student-edit-id');
  const isEditing = !!(editIdEl && editIdEl.value);
  const studentCode = isEditing ? editIdEl.value : null;

  const fnInput = document.getElementById('mgr-inline-student-fullname');
  const btnSave = document.getElementById('btn-save-inline-student');

  const fullName = cleanName(fnInput?.value || '');
  const shortName = generateShortName(fullName);

  const val = validateStudentNames(fullName, shortName);
  if (!val.valid) {
    showToast(`⚠️ ${val.error}`);
    return;
  }

  const cls = ClassroomData.getClassroom(classroomId);
  if (!cls) return;

  // Chequeo de duplicados contra la nómina actual
  const normFull = normalizeTextForComparison(fullName);
  for (const st of (cls.students || [])) {
    if (isEditing && st.id === studentCode) continue; // Omitir el alumno en edición
    if (normalizeTextForComparison(st.name) === normFull) {
      showToast(`⚠️ Ya existe otro estudiante con el nombre "${st.name}" en este salón.`);
      return;
    }
  }

  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = '⏳';
    }

    if (isEditing) {
      showToast('⏳ Guardando cambios...');
      const ok = await SupabaseClient.updateStudent(classroomId, studentCode, fullName, shortName);
      if (!ok) {
        showToast('❌ No se pudo actualizar el alumno en la base de datos.');
        return;
      }

      if (typeof ClassroomData !== 'undefined' && ClassroomData.updateStudent) {
        ClassroomData.updateStudent(classroomId, studentCode, fullName, shortName);
      }

      toggleAddStudentForm(false);

      const user = await SupabaseClient.getCurrentUser();
      if (user) {
        await loadAndRenderClassrooms(user, classroomId);
      } else {
        renderClassroomSelect();
        renderClassroomManager();
      }

      openClassroomModal(classroomId);
      showToast('✅ Alumno actualizado con éxito');
    } else {
      showToast('⏳ Guardando alumno...');

      const currentList = (cls.students || []).map(s => ({
        fullName: s.name,
        shortName: s.shortName
      }));
      currentList.push({ fullName, shortName });

      const ok = await SupabaseClient.importStudents(classroomId, currentList);
      if (!ok) {
        showToast('❌ No se pudo guardar el alumno en la base de datos.');
        return;
      }

      const user = await SupabaseClient.getCurrentUser();
      if (user) {
        await loadAndRenderClassrooms(user, classroomId);
      }

      toggleAddStudentForm(false);
      renderClassroomManager(classroomId);
      openClassroomModal(classroomId);
      showToast(`✅ Alumno "${fullName}" agregado.`);
    }
  } catch (err) {
    console.error('[handleSaveInlineStudent Error]', err);
    showToast('❌ Error: ' + (err.message || 'error'));
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = 'Guardar';
    }
  }
}

function exportClassroomRosterToExcel() {
  const classroomId = currentSelectedClassroomId;
  if (!classroomId) return;
  const cls = ClassroomData.getClassroom(classroomId);
  if (!cls || !cls.students || cls.students.length === 0) {
    showToast('⚠️ No hay alumnos para exportar en este salón.');
    return;
  }

  try {
    const data = cls.students.map((s, idx) => ({
      'N°': idx + 1,
      'Nombre Completo': s.name,
      'Nombre Corto': s.shortName || generateShortName(s.name)
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nomina');

    const cleanRoomName = cls.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    XLSX.writeFile(wb, `Nomina_${cleanRoomName}.xlsx`);
    showToast('📥 Nómina exportada a Excel.');
  } catch (err) {
    console.error('[exportClassroomRosterToExcel Error]', err);
    showToast('❌ Error al exportar: ' + (err.message || err));
  }
}

/* ── FUNCIONES DE EDICIÓN Y BORRADO DE ALUMNOS (FLUJO 2) ── */
function handleEditStudentFullnameInput(value) {
  const clean = cleanName(value || '');
  const countEl = document.getElementById('edit-student-char-count');
  if (countEl) {
    countEl.textContent = `${clean.length}/45`;
    countEl.style.color = (clean.length > 45) ? '#ef4444' : '#786C5E';
  }
  const autoShort = generateShortName(clean);
  const badgeText = document.getElementById('edit-student-shortname-text');
  if (badgeText) {
    badgeText.textContent = autoShort || '—';
  }
  const inShort = document.getElementById('edit-student-shortname');
  if (inShort) {
    inShort.value = autoShort || '';
  }
}

function openEditStudentModal(classroomId, studentCode, currentFullName, currentShortName) {
  const roomUsage = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
    ? ClassroomData.isClassroomInUse(classroomId)
    : { inUse: false };
  if (roomUsage && roomUsage.inUse) {
    showToast(`⚠️ No se pueden editar estudiantes mientras este salón esté en uso en: "${roomUsage.sessionTitle}".`);
    return;
  }

  // Activar la barra superior unificada en modo edición
  toggleAddStudentForm(true, true);

  const editIdInput = document.getElementById('mgr-inline-student-edit-id');
  if (editIdInput) editIdInput.value = studentCode || '';

  const labelEl = document.getElementById('mgr-inline-student-label');
  if (labelEl) labelEl.textContent = 'Editar Nombre del Estudiante';

  const fnInput = document.getElementById('mgr-inline-student-fullname');
  if (fnInput) {
    fnInput.value = currentFullName || '';
    handleInlineStudentFullnameInput(currentFullName || '');
    fnInput.focus();
    fnInput.select();
  }

  const box = document.getElementById('mgr-inline-add-student-box');
  if (box) {
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function closeEditStudentModal() {
  const modal = document.getElementById('modal-edit-student');
  if (modal) modal.style.display = 'none';
}

async function saveEditStudent() {
  const classroomId = document.getElementById('edit-student-class-id')?.value;
  const roomUsage = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
    ? ClassroomData.isClassroomInUse(classroomId)
    : { inUse: false };
  if (roomUsage && roomUsage.inUse) {
    showToast(`⚠️ No se pueden editar estudiantes mientras este salón esté en uso en: "${roomUsage.sessionTitle}".`);
    return;
  }
  const studentCode = document.getElementById('edit-student-code')?.value;
  const fullName = cleanName(document.getElementById('edit-student-fullname')?.value || '');
  const shortName = generateShortName(fullName);

  const val = validateStudentNames(fullName, shortName);
  if (!val.valid) {
    showToast(`⚠️ ${val.error}`);
    return;
  }

  // Validar duplicados contra el resto de alumnos del mismo salón
  const cls = ClassroomData.getClassroom(classroomId);
  if (cls && cls.students) {
    const normFull = normalizeTextForComparison(fullName);

    for (const st of cls.students) {
      if (st.id === studentCode) continue; // Mismo alumno que se está editando

      if (normalizeTextForComparison(st.name) === normFull) {
        showToast(`⚠️ Ya existe otro estudiante con el nombre "${st.name}" en este salón.`);
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
  const inUse = typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse
    ? ClassroomData.isClassroomInUse(classroomId)
    : (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInSavedSession ? ClassroomData.isClassroomInSavedSession(classroomId) : { inUse: false });
  if (inUse && inUse.inUse) {
    showToast(`⚠️ No se puede eliminar a "${studentName}" porque el salón está en uso en: "${inUse.sessionTitle}".`);
    alert(`⚠️ Acción Bloqueada por Seguridad:\n\nNo puedes eliminar a "${studentName}" mientras el salón esté vinculado a la sesión:\n"${inUse.sessionTitle}".\n\nEliminar a este alumno invalidaría las fichas impresas y los resultados registrados.\n\nSi deseas modificar la nómina, elimina primero la sesión en "Sesiones Guardadas" o finaliza la evaluación activa.`);
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


// Exposición global
if (typeof window !== "undefined") {
  window.handleInlineStudentFullnameInput = handleInlineStudentFullnameInput;
  window.toggleAddStudentForm = toggleAddStudentForm;
  window.handleSaveInlineStudent = handleSaveInlineStudent;
  window.exportClassroomRosterToExcel = exportClassroomRosterToExcel;
  window.handleEditStudentFullnameInput = handleEditStudentFullnameInput;
  window.openEditStudentModal = openEditStudentModal;
  window.closeEditStudentModal = closeEditStudentModal;
  window.saveEditStudent = saveEditStudent;
  window.handleDeleteStudent = handleDeleteStudent;
}
