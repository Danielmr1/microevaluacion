-- ============================================================================
-- MicroEval — Migración: etapa del grado (primaria / secundaria)
-- ============================================================================
-- CÓMO SE APLICA:
--   1. Abrí  https://supabase.com/dashboard/project/bpffczohkcpoxyhzvdru/sql/new
--   2. Pegá TODO este archivo y apretá "Run".
--
-- Es IDEMPOTENTE: correrlo dos veces no rompe nada.
--
-- POR QUÉ HACE FALTA
--   El número de grado por sí solo es ambiguo: "5" puede ser 5° de primaria o
--   5° de secundaria. Hoy todo es primaria, pero si más adelante se habilita
--   secundaria SIN esta columna, las filas viejas y las nuevas quedarían con
--   el mismo 5 y ya no habría forma de distinguirlas. Con la etapa explícita,
--   habilitar secundaria es solo agregar números al catálogo del front
--   (GRADE_CATALOG en classroom-data.js): no hay que tocar la base.
--
--   Si esta migración no se aplica, la app NO se rompe: el selector de grado
--   funciona igual durante la sesión y avisa por consola que el grado no se
--   está guardando. Solo se pierde la persistencia.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ETAPA DEL GRADO
-- ────────────────────────────────────────────────────────────────────────────
alter table microeval_classrooms
  add column if not exists grade_stage text not null default 'primaria';

alter table microeval_classrooms
  drop constraint if exists microeval_classrooms_grade_stage_check;

alter table microeval_classrooms
  add constraint microeval_classrooms_grade_stage_check
  check (grade_stage in ('primaria', 'secundaria'));

comment on column microeval_classrooms.grade_stage is
  'Etapa educativa: primaria | secundaria. Junto con grade_level forma el grado (primaria + 4 = "4° de primaria").';

-- Los salones que ya existían quedan como primaria y SIN grado asignado:
-- el docente completa el número desde el selector de la app.
update microeval_classrooms
   set grade_stage = 'primaria'
 where grade_stage is null;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. LA ETAPA TAMBIÉN EN LOS RESULTADOS
-- ────────────────────────────────────────────────────────────────────────────
-- Se copia al momento de corregir, para que el dato no cambie retroactivamente
-- si después se corrige el grado del salón.
alter table microeval_results
  add column if not exists grade_stage text;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────────

-- (a) Debe devolver las dos columnas de grado.
-- select name, grade_stage, grade_level from microeval_classrooms order by created_at;

-- (b) Debe devolver grade_stage entre las columnas de resultados.
-- select column_name from information_schema.columns
--  where table_name = 'microeval_results' and column_name in ('grade_stage','grade_level');

-- (c) Cuántos salones quedaron sin grado (los que hay que completar desde la app).
-- select count(*) as salones_sin_grado from microeval_classrooms where grade_level is null;
