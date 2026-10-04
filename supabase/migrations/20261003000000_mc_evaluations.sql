-- ============================================================================
-- PERSISTENCIA DE EVALUACIONES DE OPCIÓN MÚLTIPLE (OMR)
-- ============================================================================
-- Guarda el tipo de evaluación ('mc' | 'free'), cantidad de preguntas (1 | 2),
-- y el array jsonb de alternativas (enunciado, opciones A, B, C, D y clave).
-- Permite que las preguntas creadas en PC aparezcan inmediatamente en el celular.

alter table public.microeval_evaluations
  add column if not exists type text default 'free',
  add column if not exists question_count smallint default 1,
  add column if not exists questions jsonb;

comment on column public.microeval_evaluations.type is 'Tipo de evaluación: mc (opción múltiple) | free (respuesta libre)';
comment on column public.microeval_evaluations.question_count is 'Cantidad de preguntas de la ficha (1 o 2)';
comment on column public.microeval_evaluations.questions is 'Array jsonb con cada pregunta: [{prompt, options:{A,B,C,D}, correct}]';
