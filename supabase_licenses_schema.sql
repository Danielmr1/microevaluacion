-- =============================================================================
-- TABLA DE LICENCIAS Y ACTIVACIONES PRO (MICROEVALUACIÓN PERÚ)
-- =============================================================================
-- Ejecuta este script en el SQL Editor de tu panel de Supabase (https://supabase.com)

CREATE TABLE IF NOT EXISTS public.microeval_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'pro', -- 'pro', 'institutional'
    duration_days INTEGER NOT NULL DEFAULT 365,
    is_claimed BOOLEAN NOT NULL DEFAULT false,
    claimed_by_email TEXT,
    claimed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.microeval_licenses ENABLE ROW LEVEL SECURITY;

-- Política de lectura para usuarios autenticados
CREATE POLICY "Permitir consultar y canjear licencias" 
ON public.microeval_licenses 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- =============================================================================
-- CÓDIGOS DE EJEMPLO INICIALES (Listos para entregar a los primeros docentes)
-- =============================================================================
INSERT INTO public.microeval_licenses (code, duration_days) VALUES
    ('PRO-PERU-2026-A1B2', 365),
    ('PRO-PERU-2026-C3D4', 365),
    ('PRO-PERU-2026-E5F6', 365),
    ('PRO-PERU-2026-G7H8', 365),
    ('PRO-PERU-2026-J9K0', 365),
    ('PRO-PERU-MES-M1N2', 30),
    ('PRO-PERU-MES-P3Q4', 30)
ON CONFLICT (code) DO NOTHING;

