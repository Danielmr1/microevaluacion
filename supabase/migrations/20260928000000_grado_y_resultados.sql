-- ============================================================================
-- MicroEval — Migración: grado del salón + resultados por alumno
-- ============================================================================
-- CÓMO SE APLICA (2 minutos, no hay que instalar nada):
--   1. Abrí  https://supabase.com/dashboard/project/bpffczohkcpoxyhzvdru/sql/new
--   2. Pegá TODO este archivo en el editor.
--   3. Apretá el botón "Run".
--
-- Es IDEMPOTENTE: si lo corrés dos veces, la segunda no rompe nada.
--
-- POR QUÉ HACE FALTA:
--   El grado del salón es contexto para el prompt de la IA (decide si un
--   método de resolución es válido en 4° o en 5°), y los resultados de cada
--   alumno tienen que persistir entre recargas y dispositivos. Hoy ninguna de
--   las dos cosas existe: el grado no está en la base y no hay ninguna tabla
--   de resultados.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. GRADO DEL SALÓN
-- ────────────────────────────────────────────────────────────────────────────
-- 1..6 = grado de primaria.  NULL = sin especificar (salones ya creados).
-- Se guarda como entero y no como texto para poder comparar 4° contra 5°
-- en la analítica más adelante.
alter table microeval_classrooms
  add column if not exists grade_level smallint;

alter table microeval_classrooms
  drop constraint if exists microeval_classrooms_grade_level_check;

alter table microeval_classrooms
  add constraint microeval_classrooms_grade_level_check
  check (grade_level is null or grade_level between 1 and 6);

comment on column microeval_classrooms.grade_level is
  'Grado de primaria (1-6). Contexto del prompt de la IA y dato de la ficha impresa.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. RESULTADOS POR ALUMNO
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists microeval_results (
  id uuid primary key default gen_random_uuid(),

  -- Quién y de qué salón
  teacher_id   uuid not null references auth.users(id) on delete cascade,
  classroom_id uuid references microeval_classrooms(id) on delete cascade,
  student_code text not null,            -- 'ALUM_01', tal como viene en el QR
  student_name text,
  grade_level  smallint,                 -- copiado al momento de corregir

  -- Identificación de la sesión y de la evaluación.
  -- evaluation_ref es TEXT a propósito: las evaluaciones viven en localStorage
  -- con ids tipo 'EVA_DOC_1727...' y todavía no tienen UUID en la base.
  session_ref      text,
  evaluation_ref   text,
  evaluation_title text,
  prompt           text,
  expected_answer  text,

  captured_at timestamptz not null default now(),

  -- Imágenes: quedan en NULL por ahora. Si más adelante se activa Supabase
  -- Storage, acá va la ruta del objeto y NO hace falta otra migración.
  answer_image_path text,
  grid_image_path   text,

  -- ── Veredicto de la IA ──
  ai_legible          boolean,
  ai_answer_read      text,      -- lo que el modelo dice que leyó en la caja
  ai_expected_match   boolean,
  ai_procedure        text,      -- correcto | correcto_alternativo | parcial | incorrecto | no_evaluable
  ai_error_type       text,      -- ninguno | calculo | procedimiento | concepto | copia_datos | unidad | transcripcion
  ai_error_step       integer,   -- en qué paso se equivocó
  ai_error_detail     text,
  ai_confidence       numeric(4,3),
  ai_student_feedback text,
  ai_teacher_feedback text,
  ai_needs_review     boolean,

  -- ── Contraste determinista, calculado en el servidor ──
  -- La comparación del número final NO la hace el modelo: la hace código, para
  -- que una alucinación no contamine el veredicto numérico. Si el modelo dice
  -- una cosa y el código otra, ai_disagrees queda en true y el docente lo ve.
  deterministic_match boolean,
  ai_disagrees        boolean,

  -- ── Trazabilidad del modelo ──
  -- prompt_version y ai_raw son lo que después permite mejorar el prompt con
  -- datos reales y medir cuántas veces el docente corrige a la IA.
  ai_model       text,
  prompt_version text,
  ai_raw         jsonb,
  ai_error       text,           -- mensaje si la llamada al modelo falló

  -- ── Veredicto humano ──
  teacher_verdict  text,         -- null | confirmado | corregido
  teacher_override text,
  reviewed_at      timestamptz,

  created_at timestamptz not null default now()
);

-- Un alumno no puede tener dos resultados en la misma sesión: reescanear
-- actualiza la fila en vez de duplicarla. Con esto el cliente puede usar
-- upsert con onConflict: 'teacher_id,session_ref,student_code'.
-- OJO: session_ref tiene que venir siempre; si es NULL, Postgres considera
-- cada fila distinta y el índice único no protege.
create unique index if not exists microeval_results_session_student_uniq
  on microeval_results (teacher_id, session_ref, student_code);

create index if not exists microeval_results_teacher_session_idx
  on microeval_results (teacher_id, session_ref);

-- Índice parcial para la pantalla de revisión: solo los que la IA marcó.
create index if not exists microeval_results_pending_idx
  on microeval_results (teacher_id, session_ref)
  where ai_needs_review is true;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. SEGURIDAD: cada docente ve únicamente sus propios resultados
-- ────────────────────────────────────────────────────────────────────────────
-- RLS es lo que hace que la anon key pública del navegador sea segura: sin
-- políticas que la autoricen, la llave no devuelve ni una fila de otro docente.
alter table microeval_results enable row level security;

drop policy if exists "results_select_own" on microeval_results;
create policy "results_select_own" on microeval_results
  for select using (teacher_id = auth.uid());

drop policy if exists "results_insert_own" on microeval_results;
create policy "results_insert_own" on microeval_results
  for insert with check (teacher_id = auth.uid());

drop policy if exists "results_update_own" on microeval_results;
create policy "results_update_own" on microeval_results
  for update using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "results_delete_own" on microeval_results;
create policy "results_delete_own" on microeval_results
  for delete using (teacher_id = auth.uid());


-- ────────────────────────────────────────────────────────────────────────────
-- 4. VERIFICACIÓN — corré estas consultas después del Run
-- ────────────────────────────────────────────────────────────────────────────

-- (a) Tiene que devolver 1 fila: la columna del grado existe.
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'microeval_classrooms' and column_name = 'grade_level';

-- (b) Tiene que devolver 0 y sin error: la tabla de resultados existe.
-- select count(*) from microeval_results;

-- (c) Comprobación de que las tablas VIEJAS tienen RLS activo.
--     Las tres deben decir rls_activo = true. Si alguna dice false, esa tabla
--     es visible para cualquier docente y hay que escribir sus políticas.
-- select relname as tabla, relrowsecurity as rls_activo
--   from pg_class
--  where relname in ('microeval_classrooms','microeval_students','microeval_evaluations');
