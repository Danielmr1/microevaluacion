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

// Sanitizador universal anti-XSS para renderizado seguro en DOM
if (typeof window !== 'undefined' && typeof window.escaparHtml !== 'function') {
  window.escaparHtml = function(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
}

//* ── GESTOR DE SALONES: PLANO ARQUITECTÓNICO DEL COLEGIO (CAMPUS BLUEPRINT) ── */
const MAX_CAMPUS_CLASSROOMS = 10;
let currentSelectedClassroomId = null;

/**
 * Devuelve los salones registrados ordenados estrictamente por grado de menor a mayor:
 * 1. Etapa: Primaria (1) antes que Secundaria (2).
 * 2. Nivel: 1° a 6° ascendente.
 * 3. Nombre alfabético como desempate.
 */
function getSortedCampusClassrooms() {
  const rawList = ClassroomData.getClassroomList();
  const fullList = rawList.map(item => {
    const cls = ClassroomData.getClassroom(item.id);
    return {
      id: item.id,
      name: (cls && cls.name) || item.name || 'Salón',
      count: (cls && cls.students) ? cls.students.length : (item.count || 0),
      gradeStage: cls?.gradeStage || null,
      gradeLevel: cls?.gradeLevel || null,
      color: (cls?.color) || ClassroomData.getClassroomColor(item.id) || '#3b82f6',
      students: (cls && cls.students) ? cls.students : []
    };
  });

  return fullList.sort((a, b) => {
    // 1. Etapa escolar
    const stageWeight = (s) => {
      if (!s) return 99;
      const str = String(s).toLowerCase();
      if (str === 'primaria') return 1;
      if (str === 'secundaria') return 2;
      return 3;
    };
    const swA = stageWeight(a.gradeStage);
    const swB = stageWeight(b.gradeStage);
    if (swA !== swB) return swA - swB;

    // 2. Grado escolar (1..6)
    const lvlA = Number(a.gradeLevel) || 99;
    const lvlB = Number(b.gradeLevel) || 99;
    if (lvlA !== lvlB) return lvlA - lvlB;

    // 3. Nombre del aula
    return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
  });
}

function renderClassroomManager(selectedClassId = null) {
  const warnActive = document.getElementById('mgr-active-session-warning');
  const badgeOccupancy = document.getElementById('campus-occupancy-badge');
  const btnAdd = document.getElementById('btn-campus-add-classroom');
  const wingLeft = document.getElementById('campus-wing-left-rooms');
  const wingRight = document.getElementById('campus-wing-right-rooms');

  const session = ClassroomData.getActiveSession();
  const isSessionLocked = !!(session && session.classroomId);

  if (warnActive) warnActive.style.display = isSessionLocked ? 'flex' : 'none';

  const classrooms = getSortedCampusClassrooms();
  const count = classrooms.length;

  if (badgeOccupancy) {
    badgeOccupancy.textContent = `${count} de ${MAX_CAMPUS_CLASSROOMS} aulas`;
  }

  if (btnAdd) {
    const isFull = count >= MAX_CAMPUS_CLASSROOMS;
    btnAdd.disabled = isSessionLocked || isFull;
    if (isFull) {
      btnAdd.title = 'Capacidad máxima de 10 aulas completada';
    } else if (isSessionLocked) {
      btnAdd.title = 'Bloqueado durante evaluación activa';
    } else {
      btnAdd.title = 'Registrar un nuevo salón';
    }
  }

  // Poblar selectores de grados en el modal de alta si no estaban listos
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

  const rowsContainer = document.getElementById('mgr-manual-students-rows-container');
  if (rowsContainer && rowsContainer.children.length === 0) {
    resetMgrStudentRows(['']);
  }

  // Si no existen los contenedores del plano en el DOM, terminar
  if (!wingLeft || !wingRight) return;

  // Renderizar 10 ranuras: 0..4 en Pabellón Oeste, 5..9 en Pabellón Este
  let htmlLeft = '';
  let htmlRight = '';

  for (let i = 0; i < MAX_CAMPUS_CLASSROOMS; i++) {
    const slotNum = String(i + 1).padStart(2, '0');
    let cardHtml = '';

    if (i < count) {
      // Aula Ocupada
      const cls = classrooms[i];
      const gradeText = ClassroomData.formatGrade(cls.gradeStage, cls.gradeLevel) || 'Sin grado asignado';
      const color = cls.color || '#3b82f6';

      const roomUsage = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse) ? ClassroomData.isClassroomInUse(cls.id) : { inUse: false };
      const lockBadge = roomUsage.inUse ? `<span style="background:rgba(255, 183, 3, 0.16); color:#FFB703; border:1px solid #FFB703; border-radius:4px; padding:2px 7px; font-size:0.65rem; font-weight:800; margin-left:auto; display:inline-flex; align-items:center; gap:2px;" title="Protegido: en uso en ${escaparHtml(roomUsage.sessionTitle)}">🔒 En Sesión</span>` : '';

      cardHtml = `
        <div class="campus-room-card is-occupied" style="border-left-color: ${color};" onclick="openClassroomModal('${cls.id}')" title="Clic para gestionar el aula y nómina de estudiantes">
          <div class="room-card-top">
            <span class="room-grade-badge">${escaparHtml(gradeText)}</span>
            ${lockBadge}
          </div>
          <div class="room-name-row">
            <span class="room-name">${escaparHtml(cls.name)}</span>
          </div>
          <div class="room-card-bottom">
            <span class="room-students-count">👥 ${cls.count} estudiante${cls.count === 1 ? '' : 's'}</span>
          </div>
        </div>
      `;
    } else {
      // Aula Disponible
      const disabledAttr = isSessionLocked ? 'style="opacity:0.55; cursor:not-allowed;"' : '';
      const clickAction = isSessionLocked
        ? `showToast('⚠️ No se pueden agregar salones durante una evaluación activa.')`
        : `openAddClassroomModal()`;

      cardHtml = `
        <div class="campus-room-card is-available" ${disabledAttr} onclick="${clickAction}" title="Agregar nuevo salón">
          <div class="room-available-plus">+</div>
        </div>
      `;
    }

    if (i < 5) {
      htmlLeft += cardHtml;
    } else {
      htmlRight += cardHtml;
    }
  }

  wingLeft.innerHTML = htmlLeft;
  wingRight.innerHTML = htmlRight;

  // Si hay un salón abierto en modal o solicitado, refrescarlo
  if (selectedClassId) {
    openClassroomModal(selectedClassId);
  } else if (currentSelectedClassroomId && document.getElementById('modal-manage-classroom')?.style.display === 'flex') {
    openClassroomModal(currentSelectedClassroomId);
  }
}

/* ── COMPATIBILIDAD CON LLAMADORES EXTERNOS ── */
function switchClassroomManagerTab(tab) {
  if (tab === 'add') {
    openAddClassroomModal();
  } else {
    closeAddClassroomModal();
  }
}

function onManagerClassroomSelected(classId) {
  if (classId) {
    openClassroomModal(classId);
  } else {
    closeClassroomModal();
  }
}

/* ── MODAL: GESTIÓN DE AULA Y ALUMNOS ── */
function openClassroomModal(classroomId) {
  if (!classroomId) return;
  const cls = ClassroomData.getClassroom(classroomId);
  if (!cls) return;

  currentSelectedClassroomId = classroomId;

  const modal = document.getElementById('modal-manage-classroom');
  const badgeEl = document.getElementById('mgr-modal-room-badge');
  const nameEl = document.getElementById('mgr-modal-room-name');
  const gradeEl = document.getElementById('mgr-modal-room-grade');
  const countEl = document.getElementById('mgr-modal-room-students-count');
  const listEl = document.getElementById('mgr-modal-students-list');
  const emptyEl = document.getElementById('mgr-modal-students-empty');
  const btnDelete = document.getElementById('btn-manager-delete-classroom');

  const session = ClassroomData.getActiveSession();
  const roomUsage = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
  // Obtener todas las sesiones donde este salón esté en uso (activa o guardadas)
  const sessionsInUse = [];
  const targetId = String(classroomId).trim().toLowerCase();
  const clsName = cls?.name ? String(cls.name).trim().toLowerCase() : null;

  // 1. Sesión activa en memoria
  const activeSess = (typeof ClassroomData !== 'undefined' && ClassroomData.getActiveSession)
    ? ClassroomData.getActiveSession()
    : null;
  if (activeSess && (
    (activeSess.classroomId && String(activeSess.classroomId).trim().toLowerCase() === targetId) ||
    (clsName && activeSess.classroomName && String(activeSess.classroomName).trim().toLowerCase() === clsName)
  )) {
    const title = activeSess.title || (activeSess.classroomName ? `Evaluación activa (${activeSess.classroomName})` : 'Evaluación activa');
    sessionsInUse.push({
      title: title,
      id: activeSess.id || null,
      isActive: true
    });
  }

  // 2. Sesiones guardadas
  const savedSessions = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions)
    ? ClassroomData.getSavedSessions()
    : [];
  savedSessions.forEach(s => {
    const matchId = s.classroomId && String(s.classroomId).trim().toLowerCase() === targetId;
    const matchName = clsName && s.classroomName && String(s.classroomName).trim().toLowerCase() === clsName;
    if (matchId || matchName) {
      if (!sessionsInUse.some(item => item.id && item.id === s.id)) {
        const title = s.title || (s.branchTitle ? `${s.branchTitle}` : (s.classroomName || 'Sesión guardada'));
        sessionsInUse.push({
          title: title,
          id: s.id,
          isSaved: true
        });
      }
    }
  });

  const isSessionLocked = !!(session && session.classroomId);
  const isRoomLocked = roomUsage.inUse || sessionsInUse.length > 0;

  // Banner informativo simplificado con hipervínculo a la sesión
  const bannerEl = document.getElementById('mgr-modal-room-lock-banner');
  if (bannerEl) {
    if (isRoomLocked && sessionsInUse.length > 0) {
      const badgesHtml = sessionsInUse.map(sess => `
        <button type="button" class="classroom-session-badge" onclick="navigateToClassroomSession('${cls.id}', '${sess.id || ''}')"
          style="background:#0284c7; color:#ffffff; border:none; border-radius:6px; padding:4px 11px; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 3px rgba(2,132,199,0.3); transition:all 0.15s;"
          title="Ir a esta evaluación en curso">
          ${escaparHtml(sess.title)} <span style="font-size:0.85rem;">→</span>
        </button>
      `).join(' ');

      bannerEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:0.82rem; color:#92400e; width:100%;">
          <span style="font-size:1.1rem; flex-shrink:0;">🔒</span>
          <b style="color:#78350f; white-space:nowrap;">Salón en uso en:</b>
          <div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
            ${badgesHtml}
          </div>
        </div>
      `;
      bannerEl.style.display = 'flex';
      bannerEl.style.alignItems = 'center';
    } else {
      bannerEl.style.display = 'none';
      bannerEl.innerHTML = '';
    }
  }

  const btnAddStudent = document.getElementById('btn-toggle-add-student');
  if (btnAddStudent) {
    btnAddStudent.disabled = isRoomLocked;
    btnAddStudent.style.opacity = isRoomLocked ? '0.5' : '1';
    btnAddStudent.style.cursor = isRoomLocked ? 'not-allowed' : 'pointer';
    btnAddStudent.title = isRoomLocked ? `Bloqueado: salón en uso en "${roomUsage.sessionTitle || 'evaluación'}"` : 'Agregar nuevo alumno';
  }

  if (badgeEl) badgeEl.style.background = cls.color || '#3b82f6';
  if (nameEl) nameEl.textContent = `Aula: ${cls.name}`;

  const gradeText = ClassroomData.formatGrade(cls.gradeStage, cls.gradeLevel) || 'Sin grado asignado';
  if (gradeEl) gradeEl.textContent = gradeText;

  const students = cls.students || [];
  if (countEl) countEl.textContent = `${students.length} estudiante(s) registrado(s)`;

  if (btnDelete) {
    btnDelete.style.display = 'inline-flex';
    btnDelete.disabled = isRoomLocked;
    btnDelete.style.opacity = isRoomLocked ? '0.45' : '1';
    btnDelete.style.cursor = isRoomLocked ? 'not-allowed' : 'pointer';
    btnDelete.title = isRoomLocked ? `Bloqueado: salón en uso en "${roomUsage.sessionTitle || 'evaluación'}"` : 'Eliminar este salón';
  }

  // Ocultar formulario inline de agregar alumno si estaba abierto
  toggleAddStudentForm(false);

  if (listEl) {
    if (students.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
    } else {
      if (emptyEl) emptyEl.style.display = 'none';
      listEl.innerHTML = students.map((s, idx) => `
        <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #E4DCD0; border-radius:10px; padding:9px 14px; font-size:0.78rem; gap:10px; box-shadow:0 1px 3px rgba(44,34,25,0.04); transition:all 0.15s;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <span style="color:#786C5E; font-weight:800; font-size:0.72rem; width:24px; flex-shrink:0;">#${idx + 1}</span>
            <div style="display:flex; flex-direction:column; min-width:0;">
              <span style="color:#1E1B18; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.86rem;">${escaparHtml(s.name)}</span>
              <span style="display:inline-flex; align-items:center; gap:4px; color:#0284c7; font-size:0.72rem; font-weight:700; margin-top:2px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${escaparHtml(s.shortName || generateShortName(s.name))}
              </span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${isRoomLocked ? `
            <span style="background:#fef3c7; border:1px solid #fde68a; color:#92400e; border-radius:6px; padding:5px 10px; font-size:0.72rem; font-weight:700; display:inline-flex; align-items:center; gap:5px;" title="Bloqueado: salón en sesión">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              En sesión
            </span>` : `
            <button type="button" onclick="openEditStudentModal('${cls.id}', '${s.id}', '${escaparHtml(s.name).replace(/'/g, "\\'")}', '${escaparHtml(s.shortName || '').replace(/'/g, "\\'")}')"
              title="Editar nombre"
              style="background:#E0F2FE; border:1px solid #7DD3FC; color:#0369A1; border-radius:6px; padding:5px 10px; font-size:0.74rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar
            </button>
            <button type="button" onclick="handleDeleteStudent('${cls.id}', '${s.id}', '${escaparHtml(s.name).replace(/'/g, "\\'")}', this)"
              title="Eliminar este alumno del salón"
              style="background:#fef2f2; border:1px solid #fca5a5; color:#dc2626; border-radius:6px; padding:5px 9px; font-size:0.74rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:all 0.15s;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>`}
          </div>
        </div>
      `).join('');
    }
  }

  if (modal) modal.style.display = 'flex';
}

function closeClassroomModal() {
  const modal = document.getElementById('modal-manage-classroom');
  if (modal) modal.style.display = 'none';
  currentSelectedClassroomId = null;
}

/* ── MODAL: ALTA DE NUEVO SALÓN ── */
function openAddClassroomModal() {
  const session = ClassroomData.getActiveSession();
  const isSessionLocked = !!(session && session.classroomId);
  if (isSessionLocked) {
    showToast('⚠️ Hay una evaluación en marcha. Finaliza o reinicia la sesión antes de agregar salones.');
    return;
  }

  const classrooms = ClassroomData.getClassroomList();
  if (classrooms.length >= MAX_CAMPUS_CLASSROOMS) {
    showToast(`⚠️ Has alcanzado el límite máximo de ${MAX_CAMPUS_CLASSROOMS} salones para el colegio.`);
    return;
  }

  const modal = document.getElementById('modal-add-classroom');
  if (modal) modal.style.display = 'flex';

  const ta = document.getElementById('mgr-manual-classroom-students');
  if (ta) ta.value = '';
  const count = document.getElementById('mgr-manual-student-count');
  if (count) { count.textContent = '0 alumnos'; count.style.color = '#64748b'; }

  switchManagerCreateTab('import');
  const nameInput = document.getElementById('mgr-manual-classroom-name');
  if (nameInput) setTimeout(() => nameInput.focus(), 80);
}

function closeAddClassroomModal() {
  const modal = document.getElementById('modal-add-classroom');
  if (modal) modal.style.display = 'none';
  const ta = document.getElementById('mgr-manual-classroom-students');
  if (ta) ta.value = '';
}

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

function toggleAddStudentForm(force) {
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
  if (show) {
    const fnInput = document.getElementById('mgr-inline-student-fullname');
    if (fnInput) {
      fnInput.value = '';
      fnInput.focus();
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
    showToast(`⚠️ No se pueden agregar alumnos a un salón con sesión activa o guardada ("${inUse.sessionTitle}").`);
    return;
  }

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
  } catch (err) {
    console.error('[handleSaveInlineStudent Error]', err);
    showToast('❌ Error al agregar alumno: ' + (err.message || 'error'));
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
  const inClassId = document.getElementById('edit-student-class-id');
  const inCode = document.getElementById('edit-student-code');
  const inFull = document.getElementById('edit-student-fullname');
  const inShort = document.getElementById('edit-student-shortname');
  const modal = document.getElementById('modal-edit-student');

  if (inClassId) inClassId.value = classroomId || '';
  if (inCode) inCode.value = studentCode || '';
  if (inFull) inFull.value = currentFullName || '';
  if (inShort) inShort.value = currentShortName || '';

  handleEditStudentFullnameInput(currentFullName || '');

  if (modal) modal.style.display = 'flex';
  setTimeout(() => { if (inFull) inFull.focus(); }, 50);
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

function switchManagerCreateTab(tab) {
  const isImport = tab === 'import';
  const btnImport = document.getElementById('btn-tab-import');
  const btnManual = document.getElementById('btn-tab-manual');
  const contentImport = document.getElementById('manager-tab-import-content');
  const contentManual = document.getElementById('manager-tab-manual-content');

  if (btnImport) {
    btnImport.style.border = isImport ? '1.5px solid #2563eb' : '1.5px solid #cbd5e1';
    btnImport.style.background = isImport ? '#eff6ff' : '#ffffff';
    btnImport.style.color = isImport ? '#1d4ed8' : '#64748b';
  }
  if (btnManual) {
    btnManual.style.border = !isImport ? '1.5px solid #2563eb' : '1.5px solid #cbd5e1';
    btnManual.style.background = !isImport ? '#eff6ff' : '#ffffff';
    btnManual.style.color = !isImport ? '#1d4ed8' : '#64748b';
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
      style="flex:1; min-width:0; font-size:0.9rem; font-weight:600; padding:10px 12px; background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; border-radius:8px;"
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
  const ta = document.getElementById('mgr-manual-classroom-students');
  const countEl = document.getElementById('mgr-manual-student-count');
  if (!countEl) return;
  if (ta) {
    const n = parseStudentLines(ta.value).length;
    countEl.textContent = `${n} alumno${n === 1 ? '' : 's'}`;
    countEl.style.color = n === 0 ? '#64748b' : '#38bdf8';
    return;
  }

  const container = document.getElementById('mgr-manual-students-rows-container');
  if (!container) return;

  const inputs = container.querySelectorAll('.mgr-student-input');
  let count = 0;
  inputs.forEach(inp => {
    if (inp.value.trim().length > 0) count++;
  });
  countEl.textContent = `${count} alumno${count === 1 ? '' : 's'}`;
  countEl.style.color = count === 0 ? '#64748b' : '#38bdf8';
}
const updateMgrStudentCount = updateMgrStudentRowsCount;

function getMgrManualStudentsList() {
  const ta = document.getElementById('mgr-manual-classroom-students');
  if (ta) {
    return parseStudentLines(ta.value);
  }
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

async function handleDeleteClassroomFromManager() {
  const btnDel = document.getElementById('btn-manager-delete-classroom');
  try {
    const activeSession = ClassroomData.getActiveSession();
    if (activeSession && activeSession.classroomId) {
      showToast('⚠️ No se pueden eliminar salones mientras haya una evaluación en marcha.');
      return;
    }
    const sel = document.getElementById('manager-classroom-select');
    const classroomId = currentSelectedClassroomId || (sel ? sel.value : '');
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

    closeClassroomModal();

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
    closeAddClassroomModal();
    renderClassroomManager(newClassroomId);
    openClassroomModal(newClassroomId);

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
  if (!clean || clean.length < 3 || clean.length > 15) {
    return { valid: false, error: 'El nombre del salón debe tener entre 3 y 15 letras o caracteres.' };
  }
  if (RE_PROHIBITED_CHARS.test(clean) || !RE_ALLOWED_CLASSROOM_CHARS.test(clean)) {
    return { valid: false, error: 'El nombre del salón contiene caracteres no permitidos (no se permiten %, $, # ni símbolos especiales).' };
  }
  return { valid: true, clean };
}

function validateStudentNames(fullName, shortName) {
  const cleanFull = cleanName(fullName);
  const cleanShort = cleanName(shortName);

  if (!cleanFull || cleanFull.length < 3 || cleanFull.length > 45) {
    return { valid: false, error: 'El nombre completo debe tener entre 3 y 45 letras.' };
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
function downloadEmptyRosterTemplate() {
  const contenido = '\uFEFF"Apellidos, Nombres"\n';
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
      const inUse = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse)
        ? ClassroomData.isClassroomInUse(targetClassroomId)
        : (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInSavedSession ? ClassroomData.isClassroomInSavedSession(targetClassroomId) : { inUse: false });
      if (inUse && inUse.inUse) {
        showToast(`⚠️ No puedes sobrescribir la nómina de "${selectedText}" porque está en uso en: "${inUse.sessionTitle}".`);
        alert(`⚠️ Reemplazo de Nómina Bloqueado:\n\nEl salón "${selectedText}" está siendo utilizado en la sesión:\n"${inUse.sessionTitle}".\n\nSobrescribir la nómina invalidaría las fichas impresas y los resultados existentes.\n\nPor favor, crea un salón nuevo con este archivo o elimina primero la sesión asociada en "Sesiones Guardadas".`);
        input.value = '';
        return;
      }
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
      closeAddClassroomModal();
      renderClassroomManager(targetClassroomId);
      openClassroomModal(targetClassroomId);
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

/**
 * Navega desde el visor de aula protegida directamente a la evaluación en curso,
 * cerrando el modal de salones y mostrando la pantalla confirmada (resumen y fichas listas).
 */
function navigateToClassroomSession(classroomId, sessionId) {
  closeClassroomModal();
  closeAddClassroomModal();

  // 1. Si coincide con una sesión guardada en almacenamiento
  const savedList = (typeof ClassroomData !== 'undefined' && ClassroomData.getSavedSessions) ? ClassroomData.getSavedSessions() : [];
  const savedMatch = savedList.find(s => (sessionId && s.id === sessionId) || (s.classroomId === classroomId));
  if (savedMatch && typeof loadAndActivateSavedSession === 'function') {
    loadAndActivateSavedSession(savedMatch.id, { asDirectModalityView: true });
    return;
  }

  // 2. Si es la sesión activa actual en memoria
  const active = (typeof ClassroomData !== 'undefined' && ClassroomData.getActiveSession)
    ? ClassroomData.getActiveSession()
    : null;
  if (active && (
    (active.classroomId && active.classroomId === classroomId) ||
    (sessionId && active.id === sessionId)
  )) {
    if (typeof openFlow === 'function') {
      openFlow('eval');
    } else if (typeof showView === 'function') {
      showView('eval');
    }
    if (typeof updateTopbarModeTitle === 'function') {
      updateTopbarModeTitle(active.branch || 'rama1');
    }
    if (typeof showSummary === 'function') {
      showSummary();
    }
    return;
  }

  // 3. Fallback directo a evaluación
  if (typeof openFlow === 'function') openFlow('eval');
  else if (typeof showView === 'function') showView('eval');
  if (typeof showSummary === 'function') showSummary();
}

if (typeof window !== 'undefined') {
  window.renderClassroomManager = renderClassroomManager;
  window.openClassroomModal = openClassroomModal;
  window.closeClassroomModal = closeClassroomModal;
  window.openAddClassroomModal = openAddClassroomModal;
  window.closeAddClassroomModal = closeAddClassroomModal;
  window.toggleAddStudentForm = toggleAddStudentForm;
  window.handleSaveInlineStudent = handleSaveInlineStudent;
  window.exportClassroomRosterToExcel = exportClassroomRosterToExcel;
  window.switchClassroomManagerTab = switchClassroomManagerTab;
  window.navigateToClassroomSession = navigateToClassroomSession;
  window.openEditStudentModal = openEditStudentModal;
  window.closeEditStudentModal = closeEditStudentModal;
  window.saveEditStudent = saveEditStudent;
  window.handleEditStudentFullnameInput = handleEditStudentFullnameInput;
  window.handleInlineStudentFullnameInput = handleInlineStudentFullnameInput;
}
