# SPEC-04: Banco de Preguntas y Rúbricas Pedagógicas IA

* **Versión:** 1.0.0
* **Estado:** Aprobada
* **Módulos de Código:** `question-bank.js`, `supabase-client.js`, `index.html`
* **Fuente Canónica:** `MANUAL_SISTEMA.md` (Sección 3), `AGENTS.md` (Reglas 3 y 6)

---

## 1. Propósito Pedagógico y Técnico

El Banco de Preguntas es el repositorio curricular del docente. Permite reutilizar reactivos matemáticos alineados con el Currículo Nacional de Educación Básica (CNEB) para Primaria (4° a 6°) y Secundaria (1° a 5°). Para asegurar que toda evaluación formativa mantenga rigor pedagógico, cada pregunta que resida en el banco debe contar con su correspondiente análisis de resolución y rúbrica ponderada generada por IA.

---

## 2. Reglas Inmutables y Guardarraíles

1. **Guardarraíl de Integridad Total (Regla 6):**
   * Toda pregunta que ingrese al banco DEBE contener de forma obligatoria:
     1. Enunciado claro y conciso del problema.
     2. Sus 4 alternativas completas (A, B, C, D) con la clave correcta seleccionada.
     3. Su análisis pedagógico y rúbrica completa generada por IA (Gemini): solución canónica, procedimiento de resolución, criterios de evaluación ponderados (*Logro Esperado*, *En Proceso*, *En Inicio*) y errores conceptuales previsibles.
   * **Prohibición Absoluta de Bypass:** Queda terminantemente prohibido guardar preguntas incompletas, sin alternativas o sin rúbrica. Si la IA falla o hay un error de red, la pregunta **no se guarda**: el docente solo puede reintentar, editar o cancelar.
2. **Integridad del Banco de Respuesta Libre (Regla 3):**
   * El banco de preguntas NUNCA debe ocultar una pregunta basándose en si tiene `questionCount: 1`.
   * Para excluir alternativas del banco libre, la única comprobación válida es:
     ```javascript
     if (ev.type === 'mc') return false;
     ```
3. **Aislamiento de Cartillas OMR:** Las cartillas masivas (Rama 3) o placeholders ficticios nunca deben contaminar el banco de preguntas del grado.

---

## 3. Contrato de Datos

### Objeto Pregunta de Banco (`Question`)
```typescript
interface Question {
  id: string;              // ej. "eval_1729600000_1"
  gradeStage: string;      // "primaria" | "secundaria"
  gradeLevel: number;      // Grado oficial (4-6 primaria, 1-5 secundaria)
  prompt: string;          // Enunciado del problema
  options: {               // Obligatorio: exactamente 4 opciones
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correct: "A" | "B" | "C" | "D"; // Clave correcta obligatoria
  rubric: {                // Análisis pedagógico completo de IA
    canonicalSolution: string;
    steps: string[];
    criteria: {
      logroEsperado: string;
      enProceso: string;
      enInicio: string;
    };
    typicalErrors: string[];
  };
  createdAt: string;
}
```

---

## 4. Criterios de Aceptación (Verificables)

* `CRIT-BNK-01`: **Validación de Alternativas Completas**
  * *Dado* el formulario de creación de una nueva pregunta
  * *Cuando* falte cualquiera de las 4 alternativas (A, B, C o D) o no haya clave elegida
  * *Entonces* el sistema debe deshabilitar el botón de guardado y alertar al docente.

* `CRIT-BNK-02`: **Bloqueo sin Rúbrica de IA**
  * *Dado* un docente intentando guardar una pregunta en el banco
  * *Cuando* la IA no haya generado con éxito el análisis pedagógico (o falle la conexión)
  * *Entonces* el sistema no debe guardar el registro en la base de datos ni en LocalStorage; únicamente debe ofrecer «Reintentar con IA» o «Editar».

* `CRIT-BNK-03`: **Aislamiento de Cartillas OMR (Rama 3)**
  * *Dado* el visor del banco de preguntas de cualquier grado
  * *Cuando* se renderiza la lista de preguntas disponibles
  * *Entonces* ninguna cartilla OMR (Rama 3) ni placeholders numéricos (`Pregunta 1`, `30+25`) deben ser visibles en el banco.
