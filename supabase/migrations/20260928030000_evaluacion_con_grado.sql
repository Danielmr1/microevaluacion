-- ============================================================================
-- EL GRADO VIAJA CON LA EVALUACIÓN
-- ============================================================================
-- Decisión del docente: una pregunta del banco nace CON su rúbrica y CON su
-- grado, a medida que se van cargando. Así el banco es una lista de
-- evaluaciones listas para usar y nunca hay dudas de qué rúbrica corresponde.
--
-- Por qué hacen falta dos columnas nuevas: la rúbrica se genera tomando el grado
-- como contexto (en 4° y en 5° el mismo problema puede tener distinto criterio),
-- así que el grado que se usó al generarla tiene que quedar guardado CON ella.
-- `grade_text` guarda el texto legible ("4° de primaria"); estas dos columnas
-- guardan el dato comparable, igual que en salones y resultados.
--
-- Es idempotente: se puede correr dos veces sin error.

alter table public.microeval_evaluations
  add column if not exists grade_stage text;

alter table public.microeval_evaluations
  add column if not exists grade_level smallint;

-- Nulo permitido a propósito: las evaluaciones viejas no tienen grado, y forzar
-- un NOT NULL rompería cualquier limpieza posterior.
alter table public.microeval_evaluations
  drop constraint if exists microeval_evaluations_grade_stage_check;
alter table public.microeval_evaluations
  add constraint microeval_evaluations_grade_stage_check
  check (grade_stage is null or grade_stage in ('primaria', 'secundaria'));

comment on column public.microeval_evaluations.grade_stage is
  'Etapa con la que se generó la rúbrica: primaria | secundaria (o NULL si se generó sin grado).';
comment on column public.microeval_evaluations.grade_level is
  'Número de grado con el que se generó la rúbrica (4, 5, 6...).';

-- ── RELLENO DE LAS EVALUACIONES QUE YA EXISTEN ──────────────────────────────
-- Las que ya tienen rúbrica y grade_text ("4° de primaria") recuperan el dato
-- comparable. Así no hay que volver a generarlas.
update public.microeval_evaluations
   set grade_stage = 'primaria',
       grade_level = nullif(regexp_replace(coalesce(grade_text, ''), '\D', '', 'g'), '')::smallint
 where grade_stage is null
   and grade_text is not null
   and regexp_replace(coalesce(grade_text, ''), '\D', '', 'g') <> '';

-- ── COMPROBACIÓN ────────────────────────────────────────────────────────────
-- Cuántas evaluaciones quedaron completas (con rúbrica Y con grado).
select
  count(*) filter (where rubric is not null)                        as con_rubrica,
  count(*) filter (where grade_level is not null)                   as con_grado,
  count(*) filter (where rubric is not null and grade_level is not null) as listas_para_corregir,
  count(*)                                                          as total
from public.microeval_evaluations;
