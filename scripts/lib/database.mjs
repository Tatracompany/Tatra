import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Pool } = pg;

const poolCache = new Map();

function isPostgresTarget(target) {
  return /^postgres(ql)?:\/\//i.test(String(target || '').trim());
}

function getOrCreatePool(connectionString) {
  const key = String(connectionString || '').trim();
  if (!poolCache.has(key)) {
    poolCache.set(key, new Pool({
      connectionString: key,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    }));
  }
  return poolCache.get(key);
}

function translateSqlPlaceholders(sqlText) {
  let parameterIndex = 0;
  let output = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const previousChar = index > 0 ? sqlText[index - 1] : '';
    if (char === '\'' && !inDoubleQuote && previousChar !== '\\') {
      inSingleQuote = !inSingleQuote;
      output += char;
      continue;
    }
    if (char === '"' && !inSingleQuote && previousChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      output += char;
      continue;
    }
    if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      parameterIndex += 1;
      output += `$${parameterIndex}`;
      continue;
    }
    output += char;
  }

  return output;
}

function toPgCompatibleSql(sqlText) {
  return translateSqlPlaceholders(String(sqlText || '')
    .replace(/PRAGMA\s+foreign_keys\s*=\s*ON\s*;?/gi, '')
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bCURRENT_TIMESTAMP\b/gi, 'CURRENT_TIMESTAMP'));
}

function createSqliteAdapter(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  return {
    kind: 'sqlite',
    async exec(sqlText) {
      database.exec(sqlText);
    },
    prepare(sqlText) {
      const statement = database.prepare(sqlText);
      return {
        async get(...params) {
          return statement.get(...params);
        },
        async all(...params) {
          return statement.all(...params);
        },
        async run(...params) {
          return statement.run(...params);
        }
      };
    },
    async close() {
      database.close();
    }
  };
}

function createPostgresAdapter(connectionString) {
  const pool = getOrCreatePool(connectionString);
  let client = null;
  return {
    kind: 'postgres',
    async connect() {
      if (!client) {
        client = await pool.connect();
      }
      return client;
    },
    async exec(sqlText) {
      const dbClient = await this.connect();
      await dbClient.query(toPgCompatibleSql(sqlText));
    },
    prepare(sqlText) {
      const translatedSql = toPgCompatibleSql(sqlText);
      return {
        get: async (...params) => {
          const dbClient = await this.connect();
          const result = await dbClient.query(translatedSql, params);
          return result.rows[0] || null;
        },
        all: async (...params) => {
          const dbClient = await this.connect();
          const result = await dbClient.query(translatedSql, params);
          return result.rows;
        },
        run: async (...params) => {
          const dbClient = await this.connect();
          const result = await dbClient.query(translatedSql, params);
          return { changes: Number(result.rowCount || 0) };
        }
      };
    },
    async close() {
      if (client) {
        client.release();
        client = null;
      }
    }
  };
}

export function getDefaultDatabasePath(projectRoot) {
  const configuredUrl = String(process.env.DATABASE_URL || '').trim();
  if (configuredUrl) return configuredUrl;
  const configuredPath = String(process.env.DATABASE_PATH || '').trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(projectRoot, configuredPath);
  }
  return path.join(projectRoot, 'db', 'tatra.sqlite');
}

export function openDatabase(databaseTarget) {
  if (isPostgresTarget(databaseTarget)) {
    return createPostgresAdapter(databaseTarget);
  }
  return createSqliteAdapter(databaseTarget);
}

export function ensureDatabaseFileExists(projectRoot, databaseTarget) {
  if (isPostgresTarget(databaseTarget)) return;
  const resolvedDatabasePath = path.resolve(databaseTarget);
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

function resolveSchemaPath(schemaPath, databaseTarget) {
  if (!isPostgresTarget(databaseTarget)) return schemaPath;
  if (schemaPath.endsWith('schema.sql')) {
    const pgSchemaPath = schemaPath.replace(/schema\.sql$/i, 'schema.pg.sql');
    if (fs.existsSync(pgSchemaPath)) return pgSchemaPath;
  }
  return schemaPath;
}

export async function applySchema(database, schemaPath, databaseTarget = '') {
  const resolvedSchemaPath = resolveSchemaPath(schemaPath, databaseTarget);
  const schemaSql = fs.readFileSync(resolvedSchemaPath, 'utf8');
  await database.exec(schemaSql);
}

function normalizeProfileName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeProfilePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(-8);
  return digits;
}

export async function findMatchingTenantProfile(database, tenant) {
  const civilId = String(tenant && tenant.civilId || '').trim();
  const fullName = String(tenant && tenant.tenantName || '').trim();
  const phone = String(tenant && tenant.phone || '').trim();
  const normalizedName = normalizeProfileName(fullName);
  const normalizedPhone = normalizeProfilePhone(phone);
  const matches = [];

  if (civilId) {
    const civilMatch = await database.prepare(`
      SELECT id, full_name AS "fullName", civil_id AS "civilId", phone, nationality
      FROM tenant_profiles
      WHERE civil_id = ?
      LIMIT 1
    `).get(civilId);
    if (civilMatch) matches.push({ matchedBy: 'civil id', profile: civilMatch });
  }

  if (normalizedPhone) {
    const phoneMatch = await database.prepare(`
      SELECT id, full_name AS "fullName", civil_id AS "civilId", phone, nationality
      FROM tenant_profiles
      WHERE normalized_phone = ?
      LIMIT 1
    `).get(normalizedPhone);
    if (phoneMatch && !matches.some((item) => String(item.profile && item.profile.id || '') === String(phoneMatch.id || ''))) {
      matches.push({ matchedBy: 'phone', profile: phoneMatch });
    }
  }

  if (normalizedName) {
    const nameMatch = await database.prepare(`
      SELECT id, full_name AS "fullName", civil_id AS "civilId", phone, nationality
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

async function ensureTenancyProfileColumn(database) {
  await database.exec(`
    ALTER TABLE tenancies
    ADD COLUMN IF NOT EXISTS profile_id TEXT REFERENCES tenant_profiles(id) ON DELETE SET NULL;
  `);
}

export async function upsertTenantProfile(database, tenant) {
  const civilId = String(tenant && tenant.civilId || '').trim();
  const fullName = String(tenant && tenant.tenantName || '').trim();
  const phone = String(tenant && tenant.phone || '').trim();
  const nationality = String(tenant && tenant.nationality || 'Not set').trim() || 'Not set';
  const normalizedName = normalizeProfileName(fullName);
  const normalizedPhone = normalizeProfilePhone(phone);

  let existing = null;
  const matches = await findMatchingTenantProfile(database, tenant);
  if (matches.length) {
    existing = { id: String(matches[0].profile && matches[0].profile.id || '').trim() };
  }
  if (!existing && normalizedName && normalizedPhone) {
    existing = await database.prepare(`
      SELECT id
      FROM tenant_profiles
      WHERE normalized_name = ? AND normalized_phone = ?
      LIMIT 1
    `).get(normalizedName, normalizedPhone);
  }

  if (existing) {
    await database.prepare(`
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
  await database.prepare(`
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

export async function ensureTenantHistorySchema(database) {
  await database.exec(`
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

  await ensureTenancyProfileColumn(database);
  await database.exec(`CREATE INDEX IF NOT EXISTS idx_tenancies_profile_id ON tenancies(profile_id);`);

  const rows = await database.prepare(`
    SELECT id, tenant_name AS "tenantName", civil_id AS "civilId", phone, nationality
    FROM tenancies
    WHERE profile_id IS NULL OR TRIM(profile_id) = ''
    ORDER BY created_at, id
  `).all();

  if (!rows.length) return;
  await database.exec('BEGIN');
  try {
    const updateTenancyProfile = database.prepare(`
      UPDATE tenancies
      SET profile_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    for (const row of rows) {
      const profileId = await upsertTenantProfile(database, row);
      await updateTenancyProfile.run(profileId, String(row.id || '').trim());
    }
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  }
}

export async function prepareDatabase(databaseTarget, schemaPath) {
  const database = openDatabase(databaseTarget);
  try {
    await applySchema(database, schemaPath, databaseTarget);
    await ensureTenantHistorySchema(database);
  } finally {
    await database.close();
  }
}

export async function repairMissingTenancyProfiles(database) {
  if (!database) return 0;
  const rows = await database.prepare(`
    SELECT
      id,
      source_tenant_id AS "sourceTenantId",
      tenant_name AS "tenantName",
      civil_id AS "civilId",
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
  for (const row of rows) {
    const profileId = await upsertTenantProfile(database, row);
    if (!profileId) continue;
    await updateTenancyProfile.run(profileId, String(row.id || '').trim());
    repaired += 1;
  }
  return repaired;
}

export async function resetTables(database) {
  await database.exec(`
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

export async function closeAllPools() {
  const pools = Array.from(poolCache.values());
  poolCache.clear();
  await Promise.all(pools.map((pool) => pool.end()));
}
