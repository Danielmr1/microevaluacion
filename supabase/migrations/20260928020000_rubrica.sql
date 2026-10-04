-- ============================================================================
-- RÚBRICA DE CORRECCIÓN
-- ============================================================================
-- Guarda la solución canónica y el criterio de corrección que la IA genera a
-- partir del enunciado del problema.
--
-- Por qué se guarda: la rúbrica se genera UNA vez por evaluación y después la
-- usan las 30 correcciones de esa misma ficha. Guardarla es lo que garantiza
-- que los 30 veredictos se juzguen con el mismo criterio y sean comparables
-- entre sí, en lugar de que cada llamada derive el criterio de nuevo.
--
-- Por qué jsonb y no seis columnas: la forma de una rúbrica todavía va a
-- cambiar (van a aparecer campos nuevos). Con jsonb se agregan campos sin
-- migrar nada.
--
-- Es idempotente: se puede correr dos veces sin error.

alter table public.microeval_evaluations
  add column if not exists rubric jsonb;

alter table public.microeval_evaluations
  add column if not exists grade_text text;

comment on column public.microeval_evaluations.rubric is
  'Rúbrica generada por IA. Forma: {respuesta_canonica, unidad, solucion_pasos[], procedimiento_esperado, variantes_aceptables[], respuestas_aceptables[], supuestos[], errores_previsibles[{tipo,descripcion}], avisos[], confianza}';

comment on column public.microeval_evaluations.grade_text is
  'Grado del salón al momento de redactar la evaluación, como texto legible (ej: "4° de primaria"). Permite mostrar la rúbrica fuera del contexto del salón.';

-- Comprobación: cuántas evaluaciones ya tienen rúbrica.
select
  count(*) filter (where rubric is not null) as con_rubrica,
  count(*) as total
from public.microeval_evaluations;
