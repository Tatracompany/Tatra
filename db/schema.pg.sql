CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL,
  total_units INTEGER NOT NULL DEFAULT 0,
  source_kind TEXT NOT NULL DEFAULT 'template',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_label TEXT NOT NULL,
  floor_label TEXT NOT NULL DEFAULT '',
  unit_key TEXT NOT NULL,
  template_position INTEGER NOT NULL DEFAULT 0,
  active_row_position INTEGER,
  status_hint TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (building_id, unit_key)
);

CREATE TABLE IF NOT EXISTS tenancies (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES tenant_profiles(id) ON DELETE SET NULL,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  source_tenant_id TEXT,
  tenant_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  civil_id TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT 'Not set',
  move_in_date TEXT NOT NULL DEFAULT '',
  contract_start TEXT NOT NULL DEFAULT '',
  contract_end TEXT NOT NULL DEFAULT '',
  contract_rent DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  actual_rent DOUBLE PRECISION NOT NULL DEFAULT 0,
  previous_due DOUBLE PRECISION NOT NULL DEFAULT 0,
  prepaid_next_month DOUBLE PRECISION NOT NULL DEFAULT 0,
  insurance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  insurance_paid_month TEXT NOT NULL DEFAULT '',
  due_day INTEGER NOT NULL DEFAULT 20,
  planned_vacate_date TEXT NOT NULL DEFAULT '',
  archived_on TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_archived INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  raw_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unit_vacancy_state (
  unit_id TEXT PRIMARY KEY REFERENCES units(id) ON DELETE CASCADE,
  is_vacant INTEGER NOT NULL DEFAULT 0,
  vacant_since TEXT NOT NULL DEFAULT '',
  last_tenant_name TEXT NOT NULL DEFAULT '',
  last_contract_rent DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_actual_rent DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_discount DOUBLE PRECISION NOT NULL DEFAULT 0,
  old_tenant_due_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  raw_json TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT REFERENCES tenancies(id) ON DELETE SET NULL,
  source_tenant_id TEXT,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid_on TEXT NOT NULL DEFAULT '',
  rent_month TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  raw_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_month_overrides (
  id BIGSERIAL PRIMARY KEY,
  tenancy_id TEXT REFERENCES tenancies(id) ON DELETE CASCADE,
  source_tenant_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  override_kind TEXT NOT NULL,
  value_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_tenant_id, month_key, override_kind)
);

CREATE TABLE IF NOT EXISTS unit_row_order (
  id BIGSERIAL PRIMARY KEY,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  order_key TEXT NOT NULL,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (building_id, month_key, position)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  happened_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS tenant_profiles (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  civil_id TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT 'Not set',
  normalized_name TEXT NOT NULL DEFAULT '',
  normalized_phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_units_building_position ON units(building_id, template_position, active_row_position);
CREATE INDEX IF NOT EXISTS idx_tenancies_unit_active ON tenancies(unit_id, is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_payments_rent_month ON payments(rent_month, source_tenant_id);
CREATE INDEX IF NOT EXISTS idx_overrides_month ON tenant_month_overrides(month_key, source_tenant_id);
CREATE INDEX IF NOT EXISTS idx_row_order_month ON unit_row_order(building_id, month_key, position);
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_name_phone ON tenant_profiles(normalized_name, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_tenant_profiles_civil_id ON tenant_profiles(civil_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_profile_id ON tenancies(profile_id);
