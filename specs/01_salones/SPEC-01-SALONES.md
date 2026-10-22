# SPEC-01: Gestión de Salones, Nóminas y Alumnos

* **Versión:** 1.0.0
* **Estado:** Aprobada
* **Módulos de Código:** `classroom-data.js`, `classroom-manager.js`, `index.html`
* **Fuente Canónica:** `MANUAL_SISTEMA.md` (Sección 1), `AGENTS.md` (Regla 8 y 10)

---

## 1. Propósito Pedagógico y Técnico

El sistema genera fichas de evaluación impresas **nominales y personalizadas**. Cada hoja física impresa en el aula lleva el nombre y número de orden del estudiante, además de un código QR individual que codifica su ID único. Por esta razón, el salón de clases es el átomo operativo del sistema: sin alumnos registrados, el generador de fichas no tiene destinatarios y el escáner no puede asociar resultados.

---

## 2. Reglas Inmutables (Guardarraíles)

1. **Regla «No existe salón sin alumnos»:** Queda terminantemente prohibido crear, guardar o registrar en la base de datos un salón con 0 estudiantes.
2. **Protección de Sesión Activa:** No se permite eliminar ni editar salones o nóminas mientras haya una evaluación en marcha para ese salón.
3. **Persistencia y Resiliencia en Excel:** La importación y exportación de nóminas vía SheetJS debe manejar caracteres especiales (`Ñ`, tildes, símbolos) con codificación UTF-8 estricta.
4. **Sincronización Total de Borrado (Regla 8):** Todo borrado de alumnos o resultados debe actualizar en tiempo real Supabase, la memoria del escáner (`evaluatedStudentIds`) y los contadores en pantalla.

---

## 3. Contrato de Datos

### Objeto Estudiante (`Student`)
```typescript
interface Student {
  id: string;        // ej. "alu_1729600000_1"
  name: string;      // Nombre completo en mayúsculas (ej. "VALERIA FLORES")
  shortName: string; // Primer nombre o alias corto para encabezado (ej. "VALERIA")
  position: number;  // Número de orden en la nómina (1, 2, 3...)
}
```

### Objeto Salón (`Classroom`)
```typescript
interface Classroom {
  id: string;          // ej. "cls_4a_pri"
  name: string;        // ej. "4° A - Primaria"
  gradeStage: string;  // "primaria" | "secundaria"
  gradeLevel: number;  // 1 a 6 (Primaria: 4-6, Secundaria: 1-5)
  gradeText: string;   // ej. "4° de primaria"
  section: string;     // "A", "B", "C", "D"
  students: Student[]; // Obligatorio: students.length >= 1
}
```

---

## 4. Criterios de Aceptación (Verificables)

* `CRIT-SAL-01`: **Bloqueo de Salón Vacío**
  * *Dado* un docente o asistente intentando crear un nuevo salón
  * *Cuando* la lista de estudiantes esté vacía o contenga 0 nombres válidos
  * *Entonces* el sistema debe bloquear el registro, mostrar advertencia y exigir al menos un (1) alumno antes de avanzar.

* `CRIT-SAL-02`: **Generación de ID y ShortName**
  * *Dado* un texto plano o lista de nombres importados
  * *Cuando* se procesa la nómina
  * *Entonces* cada alumno debe recibir un `id` único, un `position` correlativo (1..N) y un `shortName` derivado del primer término para usar en la cabecera compacta de la ficha.

* `CRIT-SAL-03`: **Bloqueo de Eliminación con Sesión Activa**
  * *Dado* un salón que tiene una evaluación en curso o activa
  * *Cuando* el docente pulsa el botón de eliminar salón
  * *Entonces* el sistema debe abortar la eliminación e informar que se debe finalizar la sesión primero.

* `CRIT-SAL-04`: **Sanitización de Excel/CSV**
  * *Dado* un archivo de Excel o CSV con caracteres especiales (`Ñ`, acentos, apóstrofes)
  * *Cuando* se importe a la nómina
  * *Entonces* los caracteres deben preservarse intactos sin corromperse en símbolos extraños (`?`, ``).
