// @ts-check
// =============================================================================
// aula-bridge.js — Microevaluación
// PUENTE DE INTEROPERABILIDAD: MICROEVALUACIÓN ⇄ AULA EN VIVO (OFFLINE)
// =============================================================================
// Permite exportar preguntas y nóminas de salones de Microevaluación directamente
// a los formatos nativos (.aulaexam y .csv) requeridos por Aula en Vivo.
// Cero dependencias externas, 100% compatible con arquitectura offline.

(function (global) {
  'use strict';

  const ClassroomData = global.ClassroomData || {};

  /**
   * Sanitiza un nombre para usarlo de forma segura en nombres de archivo descargables.
   * @param {string} name 
   * @returns {string}
   */
  function sanitizeFilename(name) {
    return (name || 'archivo')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40);
  }

  /**
   * Dispara la descarga de un archivo de texto o JSON en el navegador del docente.
   * @param {string} content - Contenido del archivo
   * @param {string} filename - Nombre de archivo con extensión
   * @param {string} mimeType - Tipo MIME
   */
  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /**
   * Exporta las preguntas del grado actual (o del banco filtrado) al formato .aulaexam
   * @param {string} [gradeFilter] - Grado opcional (ej. "secundaria:3")
   */
  function exportBankToAulaExam(gradeFilter) {
    const bank = ClassroomData.EVALUATIONS || {};
    const grade = gradeFilter || global.bankManagerActiveGrade?.value || 'primaria:4';
    
    // Obtener preguntas asociadas al grado
    const evaluations = [];
    for (const id in bank) {
      const ev = bank[id];
      if (!ev) continue;
      // Excluir casilleros temporales de cartilla
      if (ev.isSessionPlaceholder || (ev.prompt && ev.prompt.startsWith('Pregunta '))) continue;
      
      const evGrade = ev.gradeValue || (ev.stage && ev.level ? `${ev.stage}:${ev.level}` : null);
      if (evGrade === grade || !evGrade) {
        evaluations.push(ev);
      }
    }

    if (evaluations.length === 0) {
      // Fallback: Si no hay en memoria para ese grado, buscar cualquiera del banco docente
      for (const id in bank) {
        const ev = bank[id];
        if (ev && !ev.isSessionPlaceholder) evaluations.push(ev);
      }
    }

    if (evaluations.length === 0) {
      if (typeof global.showToast === 'function') {
        global.showToast('⚠️ No hay preguntas registradas para exportar.');
      } else {
        alert('⚠️ No hay preguntas en el banco para exportar.');
      }
      return;
    }

    const title = `Evaluacion_${grade.replace(':', '_')}`;
    const keyMap = {};
    const formattedQuestions = [];

    evaluations.forEach((ev, idx) => {
      const num = idx + 1;
      const enunciado = ev.prompt || `Pregunta ${num}`;
      
      // Opciones
      const opts = {};
      if (ev.options) {
        opts.A = ev.options.A || '';
        opts.B = ev.options.B || '';
        opts.C = ev.options.C || '';
        opts.D = ev.options.D || '';
      } else {
        opts.A = 'Opción A';
        opts.B = 'Opción B';
        opts.C = 'Opción C';
        opts.D = 'Opción D';
      }

      const correcta = (ev.correctAnswer || ev.correct || 'A').toUpperCase();
      keyMap[num] = correcta;

      formattedQuestions.push({
        enunciado: enunciado,
        opciones: opts,
        correcta: correcta
      });
    });

    const aulaExamData = {
      app: 'AulaDigital',
      schemaVersion: 1,
      tipo: 'BANCO_EXAMEN',
      exportadoEn: new Date().toISOString(),
      titulo: `Examen ${grade.replace(':', ' ').toUpperCase()}`,
      duracionMinutos: Math.min(90, Math.max(15, formattedQuestions.length * 5)),
      modoOrigen: 'ESCRITO',
      permitirEscritura: true,
      formatoOpcionesEscrito: 'ABCD',
      preguntas: formattedQuestions,
      cartilla: {
        activa: true,
        numPreguntas: formattedQuestions.length,
        formatoOpciones: 'ABCD',
        distribucion: 'ALL',
        claveUnica: keyMap,
        claveTemaA: {},
        claveTemaB: {}
      }
    };

    const filename = `${sanitizeFilename(title)}_aula.aulaexam`;
    triggerDownload(JSON.stringify(aulaExamData, null, 2), filename, 'application/json;charset=utf-8');

    if (typeof global.showToast === 'function') {
      global.showToast(`💾 ${formattedQuestions.length} preguntas exportadas para Aula en Vivo.`);
    }
  }

  /**
   * Exporta la nómina del salón actual al formato CSV nativo de Aula en Vivo.
   */
  function exportClassroomRosterToAulaVivo() {
    const roomId = global.currentSelectedClassroomId || ClassroomData.activeClassroom?.id;
    let cls = null;
    if (ClassroomData.getClassroom && roomId) {
      cls = ClassroomData.getClassroom(roomId);
    }
    if (!cls && ClassroomData.activeClassroom) {
      cls = ClassroomData.activeClassroom;
    }
    if (!cls && ClassroomData.classrooms && Array.isArray(ClassroomData.classrooms) && ClassroomData.classrooms.length > 0) {
      cls = ClassroomData.classrooms[0];
    }

    if (!cls || !cls.students || cls.students.length === 0) {
      if (typeof global.showToast === 'function') {
        global.showToast('⚠️ El salón seleccionado no tiene alumnos registrados.');
      } else {
        alert('⚠️ El salón seleccionado no tiene alumnos registrados.');
      }
      return;
    }

    // Formato CSV canónico de Aula en Vivo: "Asiento, Nombre, PIN"
    const maxCapacity = 30; // Tope físico Wi-Fi en Aula en Vivo
    const rows = ['Asiento, Nombre, PIN'];

    cls.students.slice(0, maxCapacity).forEach((student, index) => {
      const seat = index + 1;
      const cleanName = (student.name || `Alumno ${seat}`).replace(/,/g, ' ').slice(0, 30).trim();
      const pin = student.pin || student.code || '';
      rows.push(`${seat}, ${cleanName}, ${pin}`);
    });

    const csvContent = rows.join('\r\n');
    const safeName = sanitizeFilename(cls.name || 'salon');
    triggerDownload(csvContent, `Nomina_${safeName}_AulaVivo.csv`, 'text/csv;charset=utf-8');

    if (typeof global.showToast === 'function') {
      global.showToast(`📥 Nómina de ${cls.students.length} alumnos exportada para Aula en Vivo.`);
    }
  }

  /**
   * Abre el modal informativo y lanzador de Aula en Vivo.
   */
  function openAulaVivoModal() {
    injectAulaVivoModal();
    const m = document.getElementById('modal-aula-vivo-suite');
    if (m) m.style.display = 'flex';
  }

  function closeAulaVivoModal() {
    const m = document.getElementById('modal-aula-vivo-suite');
    if (m) m.style.display = 'none';
  }

  function injectAulaVivoModal() {
    if (document.getElementById('modal-aula-vivo-suite')) return;

    const markup = `
    <!-- Modal: Suite Aula en Vivo (Red Local y Proyector) -->
    <div id="modal-aula-vivo-suite" class="classroom-glass-backdrop"
      onclick="if(event.target === this) closeAulaVivoModal()"
      style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.72); backdrop-filter:blur(8px); z-index:10060; align-items:center; justify-content:center; padding:16px;">
      <div class="classroom-glass-card"
        style="border-radius:20px; max-width:540px; width:100%; max-height:92vh; background:#FFFFFF; border:2px solid #2B2118; box-shadow:0 25px 60px -15px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden;">

        <!-- Cabecera -->
        <div style="background:linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding:16px 20px; border-bottom:3px solid #0284C7; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:10px; background:rgba(56,189,248,0.18); border:1.5px solid #38BDF8; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">
              🖥️
            </div>
            <div>
              <h2 style="font-size:1.05rem; font-weight:900; color:#FFFFFF; margin:0; line-height:1.2;">Aula en Vivo · Red Local</h2>
              <p style="font-size:0.72rem; color:#94A3B8; margin:2px 0 0; font-weight:600;">Pizarra interactiva, tablets y proyector 100% sin internet</p>
            </div>
          </div>
          <button type="button" onclick="closeAulaVivoModal()"
            style="background:transparent; border:none; color:#94A3B8; font-size:1.4rem; cursor:pointer; line-height:1; padding:4px;" title="Cerrar">✕</button>
        </div>

        <!-- Contenido -->
        <div style="padding:18px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">

          <!-- Accesos Directos si ya corre en la laptop -->
          <div style="background:#F0F9FF; border:1.5px solid #BAE6FD; border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:10px;">
            <div style="font-size:0.72rem; font-weight:900; color:#0369A1; text-transform:uppercase; letter-spacing:0.04em;">
              🚀 Lanzadores Rápidos (En tu Laptop)
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <a href="http://localhost:3000/docente.html" target="_blank" rel="noopener noreferrer"
                style="background:#FFFFFF; border:1.5px solid #0284C7; color:#0369A1; text-decoration:none; border-radius:10px; padding:10px; text-align:center; font-size:0.78rem; font-weight:800; display:flex; flex-direction:column; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
                <span style="font-size:1.2rem;">🖥️</span>
                <span>Panel Docente</span>
              </a>
              <a href="http://localhost:3000/mando.html" target="_blank" rel="noopener noreferrer"
                style="background:#FFFFFF; border:1.5px solid #0284C7; color:#0369A1; text-decoration:none; border-radius:10px; padding:10px; text-align:center; font-size:0.78rem; font-weight:800; display:flex; flex-direction:column; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
                <span style="font-size:1.2rem;">📱</span>
                <span>Mando Móvil</span>
              </a>
            </div>
            <a href="http://localhost:3000/proyector.html" target="_blank" rel="noopener noreferrer"
              style="background:#FFFFFF; border:1.5px solid #CBD5E1; color:#334155; text-decoration:none; border-radius:10px; padding:8px; text-align:center; font-size:0.75rem; font-weight:800; display:flex; align-items:center; justify-content:center; gap:6px;">
              <span>📽️</span>
              <span>Abrir Pantalla de Pared (Proyector)</span>
            </a>
          </div>

          <!-- Instrucciones de Uso en el Aula -->
          <div style="background:#FAF8F5; border:1.2px solid #E2D9CC; border-radius:14px; padding:14px;">
            <div style="font-size:0.72rem; font-weight:900; color:#78350F; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px;">
              📋 ¿Cómo usarlo en el colegio sin internet?
            </div>
            <ol style="margin:0; padding-left:18px; font-size:0.76rem; color:#334155; line-height:1.6; font-weight:600;">
              <li><strong>Enchufa el router Wi-Fi</strong> en el salón (no requiere cable de internet).</li>
              <li>En tu laptop, abre la carpeta y haz doble clic en <strong>INICIAR_SERVIDOR.bat</strong>.</li>
              <li>Los alumnos conectan sus tablets al Wi-Fi del salón y abren el navegador.</li>
              <li>Usa tu celular con <strong>mando.html</strong> para dirigir la clase y pasar preguntas caminando por el aula.</li>
            </ol>
          </div>

          <!-- Beneficio PRO -->
          <div style="background:#FFFBEB; border:1.5px solid #F59E0B; border-radius:12px; padding:10px 14px; display:flex; align-items:center; gap:10px;">
            <div style="font-size:1.4rem;">👑</div>
            <div style="font-size:0.74rem; color:#92400E; font-weight:600; line-height:1.4;">
              <strong>Licencia PRO Unificada:</strong><br>
              Tu suscripción PRO en Microevaluación incluye hasta 30 tablets simultáneas y salones ilimitados para Aula en Vivo.
            </div>
          </div>

        </div>

      </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', markup);
  }

  // Exponer API global
  global.exportBankToAulaExam = exportBankToAulaExam;
  global.exportClassroomRosterToAulaVivo = exportClassroomRosterToAulaVivo;
  global.openAulaVivoModal = openAulaVivoModal;
  global.closeAulaVivoModal = closeAulaVivoModal;

  if (document.body) {
    injectAulaVivoModal();
  } else {
    document.addEventListener('DOMContentLoaded', injectAulaVivoModal);
  }

})(window);
