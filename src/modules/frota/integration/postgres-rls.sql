-- ============================================================================
-- ÓRION / CONECTA — SCHEMA POSTGRESQL + RLS POR PAPEL (LOVABLE CLOUD)
-- Módulo: Gestão e Controle de Frota (src/modules/frota)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  plate VARCHAR(10) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  model VARCHAR(120) NOT NULL,
  year INTEGER NOT NULL CHECK (year >= 1980),
  fuel_type VARCHAR(20) NOT NULL CHECK (fuel_type IN ('GASOLINA','ETANOL','DIESEL','GNV','ELETRICO','FLEX')),
  current_odometer NUMERIC(12,1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO','MANUTENCAO','INATIVO')),
  assigned_driver_id UUID,
  renavam VARCHAR(20),
  state_uf CHAR(2),
  tank_capacity_liters NUMERIC(8,2),
  fipe_value NUMERIC(12,2),
  monthly_fixed_cost NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name VARCHAR(150) NOT NULL,
  cnh_number VARCHAR(20) NOT NULL,
  cnh_category VARCHAR(10) NOT NULL,
  cnh_expiry DATE NOT NULL,
  phone VARCHAR(30),
  allowed_vehicle_ids UUID[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_fuelings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.fleet_drivers(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  odometer NUMERIC(12,1) NOT NULL,
  fuel_type VARCHAR(20) NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  unit_price NUMERIC(10,3) NOT NULL,
  total_cost NUMERIC(12,2) NOT NULL,
  full_tank BOOLEAN NOT NULL DEFAULT true,
  station_name VARCHAR(150),
  calculated_avg NUMERIC(8,2),
  nfce_key VARCHAR(120),
  odometer_photo_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_maintenances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('PREVENTIVA','CORRETIVA')),
  status VARCHAR(20) NOT NULL DEFAULT 'CONCLUIDA' CHECK (status IN ('ABERTA','EM_EXECUCAO','CONCLUIDA')),
  origin_checklist_id UUID,
  date DATE NOT NULL,
  odometer NUMERIC(12,1) NOT NULL,
  category VARCHAR(120) NOT NULL,
  provider_name VARCHAR(150),
  parts_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL,
  notes TEXT,
  attachment_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,
  kind VARCHAR(15) NOT NULL CHECK (kind IN ('DESPESA','RECEITA')),
  category VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  bank_reference_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  time VARCHAR(8),
  infraction_code VARCHAR(30) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(180),
  points INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL,
  sne_discount_applied BOOLEAN NOT NULL DEFAULT false,
  driver_indication_deadline DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','INDICADO','PAGA','RECORRIDA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.fleet_drivers(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  odometer NUMERIC(12,1) NOT NULL,
  items JSONB NOT NULL,
  has_issues BOOLEAN NOT NULL DEFAULT false,
  generated_maintenance_id UUID,
  general_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.fleet_drivers(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  origin VARCHAR(180) NOT NULL,
  destination VARCHAR(180) NOT NULL,
  start_odometer NUMERIC(12,1) NOT NULL,
  end_odometer NUMERIC(12,1) NOT NULL,
  distance_km NUMERIC(12,1) GENERATED ALWAYS AS (end_odometer - start_odometer) STORED,
  estimated_km NUMERIC(12,1),
  purpose TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('MANUTENCAO','DOCUMENTACAO','SEGURO','OUTRO')),
  due_date DATE,
  due_odometer NUMERIC(12,1),
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  doc_type VARCHAR(20) NOT NULL CHECK (doc_type IN ('CRLV','IPVA','SEGURO','VISTORIA')),
  reference_year INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  state_uf CHAR(2),
  provider_or_authority VARCHAR(150),
  policy_or_code VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','PAGO','ISENTO')),
  paid_at TIMESTAMPTZ,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_fuelings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_reminders ENABLE ROW LEVEL SECURITY;

-- Política RLS por Papel:
-- Gestor/Admin acessa toda a frota da organização;
-- Motorista acessa apenas veículos em allowed_vehicle_ids.
CREATE POLICY "rbac_select_vehicles" ON public.fleet_vehicles
  FOR SELECT USING (
    organization_id = (auth.jwt() ->> 'organization_id')::uuid
    AND (
      (auth.jwt() ->> 'role') IN ('GESTOR', 'ADMIN')
      OR id = ANY (
        SELECT unnest(allowed_vehicle_ids)
        FROM public.fleet_drivers
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "rbac_manage_vehicles_gestor" ON public.fleet_vehicles
  FOR ALL USING (
    organization_id = (auth.jwt() ->> 'organization_id')::uuid
    AND (auth.jwt() ->> 'role') IN ('GESTOR', 'ADMIN')
  );
