import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function getDefaultDatabasePath(projectRoot) {
  const configuredPath = String(process.env.DATABASE_PATH || '').trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(projectRoot, configuredPath);
  }
  return path.join(projectRoot, 'db', 'tatra.sqlite');
}

export function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  return new DatabaseSync(databasePath);
}

export function ensureDatabaseFileExists(projectRoot, databasePath) {
  const resolvedDatabasePath = path.resolve(databasePath);
  if (fs.existsSync(resolvedDatabasePath)) return;
  fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });

  const bundledDatabasePath = path.join(projectRoot, 'db', 'tatra.sqlite');
  if (
    fs.existsSync(bundledDatabasePath)
    && path.resolve(bundledDatabasePath) !== resolvedDatabasePath
  ) {
    fs.copyFileSync(bundledDatabasePath, resolvedDatabasePath);
    return;
  }

  const database = new DatabaseSync(resolvedDatabasePath);
  database.close();
}

export function applySchema(database, schemaPath) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  database.exec(schemaSql);
}

function normalizeProfileName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeProfilePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(-8);
  return digits;
}

export function findMatchingTenantProfile(database, tenant) {
  const civilId = String(tenant && tenant.civilId || '').trim();
  const fullName = String(tenant && tenant.tenantName || '').trim();
  const phone = String(tenant && tenant.phone || '').trim();
  const normalizedName = normalizeProfileName(fullName);
  const normalizedPhone = normalizeProfilePhone(phone);
  const matches = [];

  if (civilId) {
    const civilMatch = database.prepare(`
      SELECT id, full_name AS fullName, civil_id AS civilId, phone, nationality
      FROM tenant_profiles
      WHERE civil_id = ?
      LIMIT 1
    `).get(civilId);
    if (civilMatch) matches.push({ matchedBy: 'civil id', profile: civilMatch });
  }

  if (normalizedPhone) {
    const phoneMatch = database.prepare(`
      SELECT id, full_name AS fullName, civil_id AS civilId, phone, nationality
      FROM tenant_profiles
      WHERE normalized_phone = ?
      LIMIT 1
    `).get(normalizedPhone);
    if (phoneMatch && !matches.some((item) => String(item.profile && item.profile.id || '') === String(phoneMatch.id || ''))) {
      matches.push({ matchedBy: 'phone', profile: phoneMatch });
    }
  }

  if (normalizedName) {
    const nameMatch = database.prepare(`
      SELECT id, full_name AS fullName, civil_id AS civilId, phone, nationality
      FROM tenant_profiles
      WHERE normalized_name = ?
      LIMIT 1
    `).get(normalizedName);
    if (nameMatch && !matches.some((item) => String(item.profile && item.profile.id || '') === String(nameMatch.id || ''))) {
      matches.push({ matchedBy: 'name', profile: nameMatch });
    }
  }

  return matches;
}

function ensureTenancyProfileColumn(database) {
  const columns = database.prepare(`PRAGMA table_info(tenancies)`).all();
  const hasProfileId = columns.some((column) => String(column && column.name || '').trim() === 'profile_id');
  if (!hasProfileId) {
    database.exec(`ALTER TABLE tenancies ADD COLUMN profile_id TEXT REFERENCES tenant_profiles(id) ON DELETE SET NULL;`);
  }
}

export function upsertTenantProfile(database, tenant) {
  const civilId = String(tenant && tenant.civilId || '').trim();
  const fullName = String(tenant && tenant.tenantName || '').trim();
  const phone = String(tenant && tenant.phone || '').trim();
  const nationality = String(tenant && tenant.nationality || 'Not set').trim() || 'Not set';
  const normalizedName = normalizeProfileName(fullName);
  const normalizedPhone = normalizeProfilePhone(phone);

  let existing = null;
  const matches = findMatchingTenantProfile(database, tenant);
  if (matches.length) {
    existing = { id: String(matches[0].profile && matches[0].profile.id || '').trim() };
  }
  if (!existing && normalizedName && normalizedPhone) {
    existing = database.prepare(`
      SELECT id
      FROM tenant_profiles
      WHERE normalized_name = ? AND normalized_phone = ?
      LIMIT 1
    `).get(normalizedName, normalizedPhone);
  }

  if (existing) {
    database.prepare(`
      UPDATE tenant_profiles
      SET
        full_name = CASE WHEN ? <> '' THEN ? ELSE full_name END,
        civil_id = CASE WHEN ? <> '' THEN ? ELSE civil_id END,
        phone = CASE WHEN ? <> '' THEN ? ELSE phone END,
        nationality = CASE WHEN ? <> '' THEN ? ELSE nationality END,
        normalized_name = CASE WHEN ? <> '' THEN ? ELSE normalized_name END,
        normalized_phone = CASE WHEN ? <> '' THEN ? ELSE normalized_phone END,
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      fullName, fullName,
      civilId, civilId,
      phone, phone,
      nationality, nationality,
      normalizedName, normalizedName,
      normalizedPhone, normalizedPhone,
      String(existing.id || '').trim()
    );
    return String(existing.id || '').trim();
  }

  const profileId = `profile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  database.prepare(`
    INSERT INTO tenant_profiles (
      id, full_name, civil_id, phone, nationality, normalized_name, normalized_phone,
      created_at, updated_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    profileId,
    fullName,
    civilId,
    phone,
    nationality,
    normalizedName,
    normalizedPhone
  );
  return profileId;
}

export function ensureTenantHistorySchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tenant_profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL DEFAULT '',
      civil_id TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      nationality TEXT NOT NULL DEFAULT 'Not set',
      normalized_name TEXT NOT NULL DEFAULT '',
      normalized_phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_profiles_name_phone ON tenant_profiles(normalized_name, normalized_phone);
    CREATE INDEX IF NOT EXISTS idx_tenant_profiles_civil_id ON tenant_profiles(civil_id);
  `);

  ensureTenancyProfileColumn(database);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_tenancies_profile_id ON tenancies(profile_id);`);

  const rows = database.prepare(`
    SELECT id, tenant_name AS tenantName, civil_id AS civilId, phone, nationality
    FROM tenancies
    WHERE profile_id IS NULL OR TRIM(profile_id) = ''
    ORDER BY created_at, id
  `).all();

  if (!rows.length) return;
  database.exec('BEGIN');
  try {
    const updateTenancyProfile = database.prepare(`
      UPDATE tenancies
      SET profile_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    rows.forEach((row) => {
      const profileId = upsertTenantProfile(database, row);
      updateTenancyProfile.run(profileId, String(row.id || '').trim());
    });
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  }
}

export function prepareDatabase(databasePath, schemaPath) {
  const database = openDatabase(databasePath);
  try {
    applySchema(database, schemaPath);
    ensureTenantHistorySchema(database);
  } finally {
    database.close();
  }
}

export function repairMissingTenancyProfiles(database) {
  if (!database) return 0;
  const rows = database.prepare(`
    SELECT
      id,
      source_tenant_id AS sourceTenantId,
      tenant_name AS tenantName,
      civil_id AS civilId,
      phone,
      nationality
    FROM tenancies
    WHERE profile_id IS NULL OR TRIM(profile_id) = ''
    ORDER BY updated_at, created_at, id
  `).all();
  if (!rows.length) return 0;

  const updateTenancyProfile = database.prepare(`
    UPDATE tenancies
    SET profile_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  let repaired = 0;
  rows.forEach((row) => {
    const profileId = upsertTenantProfile(database, row);
    if (!profileId) return;
    updateTenancyProfile.run(profileId, String(row.id || '').trim());
    repaired += 1;
  });
  return repaired;
}

export function resetTables(database) {
  database.exec(`
    DELETE FROM unit_row_order;
    DELETE FROM tenant_month_overrides;
    DELETE FROM payments;
    DELETE FROM unit_vacancy_state;
    DELETE FROM tenancies;
    DELETE FROM tenant_profiles;
    DELETE FROM units;
    DELETE FROM buildings;
    DELETE FROM activity_log;
  `);
}
