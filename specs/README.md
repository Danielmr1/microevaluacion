# Matriz de Especificaciones y Trazabilidad (SDD)

Este directorio es la **Fuente Canónica de Especificaciones (Single Source of Specifications)** de **Microevaluación**.
Cualquier desarrollo, refactorización o nueva característica DEBE partir de una especificación en esta carpeta antes de modificar el código fuente.

---

## 1. Índice de Especificaciones por Dominio

| Código | Dominio Funcional | Archivo de Especificación | Módulos de Código Primarios | Estado |
| :--- | :--- | :--- | :--- | :---: |
| **SPEC-01** | **Gestión de Salones y Nóminas** | [`01_salones/SPEC-01-SALONES.md`](./01_salones/SPEC-01-SALONES.md) | `classroom-data.js`, `classroom-manager.js` | **Aprobada** |
| **SPEC-02** | **Geometría Física y Fichas Imprimibles** | [`02_fichas_geometria/SPEC-02-GEOMETRIA.md`](./02_fichas_geometria/SPEC-02-GEOMETRIA.md) | `card-generator.js`, `card-simulator.js`, `styles.css` | **Aprobada** |
| **SPEC-03** | **Modalidades de Evaluación (Ramas 1, 2 y 3)** | [`03_modalidades/SPEC-03-MODALIDADES.md`](./03_modalidades/SPEC-03-MODALIDADES.md) | `card-formativa.js`, `card-focalizada.js`, `card-cartilla.js` | **Aprobada** |
| **SPEC-04** | **Banco de Preguntas y Rúbricas IA** | [`04_banco_preguntas/SPEC-04-BANCO.md`](./04_banco_preguntas/SPEC-04-BANCO.md) | `question-bank.js`, `supabase-client.js` | **Aprobada** |
| **SPEC-05** | **Escáner Óptico y Visión Computacional** | [`05_escaner_vision/SPEC-05-ESCANER.md`](./05_escaner_vision/SPEC-05-ESCANER.md) | `scanner.js`, `roi-processor.js`, `aruco.bundle.js` | **Aprobada** |
| **SPEC-06** | **Asistente EVA y Guardarraíles Copilot** | [`06_copilot_eva/SPEC-06-COPILOT.md`](./06_copilot_eva/SPEC-06-COPILOT.md) | `copilot-command.js`, `daily-quota.js` | **Aprobada** |

---

## 2. Reglas del Ciclo Spec-Driven Development (SDD)

1. **Spec First:** No se crea código nuevo ni se altera un comportamiento existente sin que esté respaldado por una especificación (`SPEC-XX`).
2. **Criterios Verificables (CRIT):** Cada requerimiento contiene criterios de aceptación identificados como `CRIT-[DOMINIO]-[NUM]` que pueden ser validados por pruebas automatizadas o de inspección dimensional.
3. **Cero Regresión:** La regla de oro del proyecto (Cero regresión en Respuesta Libre) se verifica con los criterios del dominio `SPEC-03`.
4. **Tolerancia Cero en Geometría:** Todo cambio visual o de maquetación en fichas debe respetar la tolerancia milimétrica descrita en `SPEC-02`.
