// =============================================================================
// classroom-manager.js — Microevaluación v3.10.34
// MÓDULO: GESTOR DE SALONES DEL CAMPUS Y BLUEPRINT ARQUITECTÓNICO
//
// Submódulos auxiliares vinculados:
//   - classroom-importer.js   : Importador Excel/CSV y corrección UTF-8 mojibake
//   - classroom-roster.js     : Nómina de alumnos, edición inline y exportación
//   - classroom-manual-form.js: Formulario clásico de alta manual en el Hub
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
    badgeOccupancy.textContent = `${count} de ${MAX_CAMPUS_CLASSROOMS} salones`;
  }

  if (btnAdd) {
    const isFull = count >= MAX_CAMPUS_CLASSROOMS;
    btnAdd.disabled = isSessionLocked || isFull;
    if (isFull) {
      btnAdd.title = 'Capacidad máxima de 10 salones completada';
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
      let gradeText = 'Sin grado asignado';
      if (cls.gradeLevel && cls.gradeStage) {
        const stageShort = String(cls.gradeStage).toLowerCase().includes('sec') ? 'secundaria' : 'primaria';
        gradeText = `${cls.gradeLevel}° ${stageShort}`;
      } else if (ClassroomData && ClassroomData.formatGrade) {
        gradeText = ClassroomData.formatGrade(cls.gradeStage, cls.gradeLevel) || 'Sin grado asignado';
      }
      const color = cls.color || '#3b82f6';

      const roomUsage = (typeof ClassroomData !== 'undefined' && ClassroomData.isClassroomInUse) ? ClassroomData.isClassroomInUse(cls.id) : { inUse: false };
      const lockBadge = roomUsage.inUse ? `<span style="background:rgba(255, 183, 3, 0.16); color:#FFB703; border:1px solid #FFB703; border-radius:4px; padding:2px 7px; font-size:0.65rem; font-weight:800; display:inline-flex; align-items:center; gap:3px;" title="Protegido: en uso en ${escaparHtml(roomUsage.sessionTitle)}">🔒 En Sesión</span>` : '';

      cardHtml = `
        <div class="campus-room-card is-occupied" style="border-left-color: ${color};" onclick="openClassroomModal('${cls.id}')" title="Clic para gestionar el aula y nómina de estudiantes">
          <div class="room-card-top">
            <span class="room-students-count" style="display:inline-flex; align-items:center; gap:4px; font-weight:700; color:#dcd8ce; font-size:0.75rem;">👥 ${cls.count}</span>
            <span class="room-grade-badge">${escaparHtml(gradeText)}</span>
          </div>
          <div class="room-name-row">
            <span class="room-name">${escaparHtml(cls.name)}</span>
          </div>
          <div class="room-card-bottom" style="min-height:20px;">
            ${lockBadge}
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

  if (nameEl) nameEl.textContent = `Salón: ${cls.name}`;

  let gradeText = 'Sin grado asignado';
  if (cls.gradeLevel && cls.gradeStage) {
    const stageShort = String(cls.gradeStage).toLowerCase().includes('sec') ? 'secundaria' : 'primaria';
    gradeText = `${cls.gradeLevel}° ${stageShort}`;
  } else if (ClassroomData && ClassroomData.formatGrade) {
    gradeText = ClassroomData.formatGrade(cls.gradeStage, cls.gradeLevel) || 'Sin grado asignado';
  }
  if (gradeEl) gradeEl.textContent = gradeText;

  const students = cls.students || [];
  const studentWord = students.length === 1 ? 'alumno' : 'alumnos';
  if (countEl) countEl.textContent = `${students.length} ${studentWord}`;

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
        <div class="mgr-student-item ${isRoomLocked ? 'mgr-student-card-locked' : ''}" style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #EAE3D6; border-left:3.5px solid #00B4D8; border-radius:10px; padding:10px 14px; font-size:0.78rem; gap:10px; box-shadow:0 1px 3px rgba(44,34,25,0.05); transition:all 0.15s;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <span style="color:#8C7D6B; font-weight:800; font-size:0.74rem; width:24px; flex-shrink:0;">#${idx + 1}</span>
            <div style="display:flex; flex-direction:column; min-width:0; flex:1;">
              <span style="color:#1E1B18; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.88rem;">${escaparHtml(s.name)}</span>
              <div style="display:flex; align-items:center; gap:8px; margin-top:3px; flex-wrap:nowrap; min-width:0;">
                <span style="display:inline-flex; align-items:center; gap:5px; color:#0369A1; font-size:0.73rem; font-weight:800; background:#E0F2FE; border:1px solid #BAE6FD; padding:2px 8px; border-radius:5px; width:fit-content; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  ${escaparHtml(s.shortName || generateShortName(s.name))}
                </span>
                ${isRoomLocked ? `
                <span class="mgr-student-lock-badge-mobile" style="background:#fef3c7; border:1px solid #fde68a; color:#92400e; border-radius:6px; padding:2px 8px; font-size:0.72rem; font-weight:700; align-items:center; gap:4px; flex-shrink:0; white-space:nowrap;" title="Bloqueado: salón en sesión">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  En sesión
                </span>` : ''}
              </div>
            </div>
          </div>
          <div class="mgr-student-actions" style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${isRoomLocked ? `
            <span class="mgr-student-lock-badge-desktop" style="background:#fef3c7; border:1px solid #fde68a; color:#92400e; border-radius:6px; padding:5px 10px; font-size:0.72rem; font-weight:700; align-items:center; gap:5px;" title="Bloqueado: salón en sesión">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              En sesión
            </span>` : `
            <button type="button" onclick="openEditStudentModal('${cls.id}', '${s.id}', '${escaparHtml(s.name).replace(/'/g, "\\'")}', '${escaparHtml(s.shortName || '').replace(/'/g, "\\'")}')"
              title="Editar nombre"
              style="background:#E0F2FE; border:1.5px solid #38BDF8; color:#0369A1; border-radius:6px; padding:5px 11px; font-size:0.75rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 2px rgba(2,132,199,0.15); transition:all 0.15s;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar
            </button>
            <button type="button" onclick="handleDeleteStudent('${cls.id}', '${s.id}', '${escaparHtml(s.name).replace(/'/g, "\\'")}', this)"
              title="Eliminar este alumno del salón"
              style="background:#FFF1F2; border:1.5px solid #FDA4AF; color:#E11D48; border-radius:6px; padding:5px 9px; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:all 0.15s;">
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


// ── EXPOSICIÓN GLOBAL DE FUNCIONES DEL GESTOR DEL CAMPUS ──
if (typeof window !== 'undefined') {
  window.renderClassroomManager = renderClassroomManager;
  window.openClassroomModal = openClassroomModal;
  window.closeClassroomModal = closeClassroomModal;
  window.openAddClassroomModal = openAddClassroomModal;
  window.closeAddClassroomModal = closeAddClassroomModal;
  window.switchClassroomManagerTab = switchClassroomManagerTab;
  window.switchManagerCreateTab = switchManagerCreateTab;
  window.handleDeleteClassroomFromManager = handleDeleteClassroomFromManager;
  window.handleCreateClassroomManualFromManager = handleCreateClassroomManualFromManager;
  window.resetMgrStudentRows = resetMgrStudentRows;
  window.addMgrStudentRowElement = addMgrStudentRowElement;
  window.handleMgrStudentRowKeydown = handleMgrStudentRowKeydown;
  window.updateMgrStudentRowsCount = updateMgrStudentRowsCount;
  window.getMgrManualStudentsList = getMgrManualStudentsList;
  window.toggleMgrPasteBox = toggleMgrPasteBox;
  window.applyMgrPastedStudents = applyMgrPastedStudents;
  window.navigateToClassroomSession = navigateToClassroomSession;
}
