import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { buildBrowserSnapshotScript, readDatabaseSnapshot } from './lib/db-snapshot.mjs';
import { ensureDatabaseFileExists, findMatchingTenantProfile, getDefaultDatabasePath, openDatabase, prepareDatabase, repairMissingTenancyProfiles, upsertTenantProfile } from './lib/database.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const databasePath = getDefaultDatabasePath(root);
const browserSnapshotPath = path.join(root, 'src', 'data', 'db-state.generated.js');
const schemaPath = path.join(root, 'db', 'schema.sql');
const serverAuthUsername = String(process.env.APP_USERNAME || '').trim();
const serverAuthPassword = String(process.env.APP_PASSWORD || '').trim();
const backupToken = String(process.env.BACKUP_TOKEN || '').trim();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function getFilePath(urlPath) {
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  return path.resolve(root, `.${cleanPath}`);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(JSON.stringify(payload));
}

function parseBasicAuth(request) {
  const header = String(request && request.headers && request.headers.authorization || '').trim();
  if (!header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch (_error) {
    return null;
  }
}

function isServerAuthEnabled() {
  return !!(serverAuthUsername && serverAuthPassword);
}

function isAuthorizedRequest(request) {
  if (!isServerAuthEnabled()) return true;
  const credentials = parseBasicAuth(request);
  return !!(
    credentials
    && credentials.username === serverAuthUsername
    && credentials.password === serverAuthPassword
  );
}

function requestServerAuth(response) {
  response.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="Tatra"'
  });
  response.end('Authentication required');
}

function isAuthorizedBackupRequest(request) {
  if (!backupToken) return false;
  const requestToken = String(request && request.headers && request.headers['x-tatra-backup-token'] || '').trim();
  return !!requestToken && requestToken === backupToken;
}

function sendFile(response, filePath, filename) {
  const safeFilename = String(filename || path.basename(filePath) || 'download.bin').trim() || 'download.bin';
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${safeFilename}"`
  });
  fs.createReadStream(filePath).pipe(response);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function addMonths(monthKey, delta) {
  const normalizedMonth = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) return normalizedMonth;
  const [year, month] = normalizedMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + Number(delta || 0), 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

function compareMonthKeys(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'en');
}

const BASELINE_MONTH_KEY = '2026-01';
const ROW_55_SOURCE_TENANT_ID = 'tenant-unit-fahaheel-fresh-20260314105252-55';
const ROW_55_UNIT_ID = 'unit-fahaheel-fresh-20260314105252-55';

async function exportSnapshotToBrowserFile() {
  const snapshot = await readDatabaseSnapshot(databasePath);
  fs.writeFileSync(browserSnapshotPath, buildBrowserSnapshotScript(snapshot), 'utf8');
  return snapshot;
}

async function ensureRow55OccupiedTenancy() {
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    await database.prepare(`
      UPDATE units
      SET floor_label = CASE WHEN COALESCE(TRIM(floor_label), '') = '' THEN ? ELSE floor_label END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run('سطح', ROW_55_UNIT_ID);
    const existing = await database.prepare(`
      SELECT id
      FROM tenancies
      WHERE source_tenant_id = ? OR unit_id = ?
      LIMIT 1
    `).get(ROW_55_SOURCE_TENANT_ID, ROW_55_UNIT_ID);
    if (!existing) {
      const profileId = await upsertTenantProfile(database, {
        tenantName: 'شبكة',
        civilId: '',
        phone: '',
        nationality: 'Not set'
      });
      await database.prepare(`
        INSERT INTO tenancies (
          id, profile_id, unit_id, source_tenant_id, tenant_name, phone, civil_id, nationality, move_in_date,
          contract_start, contract_end, contract_rent, discount, actual_rent, previous_due,
          prepaid_next_month, insurance_amount, insurance_paid_month, due_day, planned_vacate_date,
          archived_on, is_active, is_archived, notes, raw_json
        ) VALUES (?, ?, ?, ?, ?, '', '', 'Not set', ?, ?, ?, ?, 0, ?, 0, 0, 0, '', 20, '', '', 1, 0, '', ?)
      `).run(
        'tenancy-restored-row-55',
        profileId,
        ROW_55_UNIT_ID,
        ROW_55_SOURCE_TENANT_ID,
        'شبكة',
        '2025-12-31',
        '2025-12-31',
        '2026-12-30',
        416.67,
        416.67,
        JSON.stringify({
          source: 'row-55-restore',
          sourceTenantId: ROW_55_SOURCE_TENANT_ID,
          unitId: ROW_55_UNIT_ID,
          tenantName: 'شبكة',
          moveInDate: '2025-12-31',
          contractStart: '2025-12-31',
          contractEnd: '2026-12-30',
          contractRent: 416.67,
          actualRent: 416.67
        })
      );
    }
    await database.prepare(`
      DELETE FROM unit_vacancy_state
      WHERE unit_id = ?
    `).run(ROW_55_UNIT_ID);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
}

async function restoreDatabaseFromUpload(databaseBuffer) {
  if (!Buffer.isBuffer(databaseBuffer) || !databaseBuffer.length) {
    throw new Error('Uploaded database content is empty.');
  }

  if (!String(databasePath || '').trim().toLowerCase().endsWith('.sqlite')) {
    throw new Error('Binary database restore is only available for SQLite targets. Use Postgres migration/cutover tools for DATABASE_URL deployments.');
  }

  const tempRestorePath = `${databasePath}.restore-${Date.now()}.tmp`;
  fs.writeFileSync(tempRestorePath, databaseBuffer);

  try {
    await prepareDatabase(tempRestorePath, schemaPath);
    const restoredDatabase = openDatabase(tempRestorePath);
    await restoredDatabase.close();
    fs.copyFileSync(tempRestorePath, databasePath);
  } finally {
    if (fs.existsSync(tempRestorePath)) {
      fs.unlinkSync(tempRestorePath);
    }
  }

  return await exportSnapshotToBrowserFile();
}

async function syncTenantProfileForTenancy(database, tenancyId, profile) {
  const profileId = await upsertTenantProfile(database, {
    tenantName: String(profile && profile.name || profile && profile.tenantName || '').trim(),
    civilId: String(profile && profile.civilId || '').trim(),
    phone: String(profile && profile.phone || '').trim(),
    nationality: String(profile && profile.nationality || 'Not set').trim() || 'Not set'
  });
  if (!profileId || !tenancyId) return '';
  await database.prepare(`
    UPDATE tenancies
    SET profile_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(profileId, tenancyId);
  return profileId;
}

async function resolveRowOrderUnitId(database, buildingId, buildingName, orderKey) {
  const normalizedOrderKey = String(orderKey || '').trim();
  const normalizedBuildingName = String(buildingName || '').trim();
  const prefix = `${normalizedBuildingName}::`;
  const lookupKey = normalizedOrderKey.startsWith(prefix)
    ? normalizedOrderKey.slice(prefix.length)
    : normalizedOrderKey;
  if (lookupKey.startsWith('ROW::')) {
    const rowUnitId = lookupKey.slice('ROW::'.length).trim();
    return rowUnitId || null;
  }
  if (!lookupKey || lookupKey.startsWith('UNIT::')) return null;
  const match = await database.prepare(`
    SELECT id
    FROM units
    WHERE building_id = ? AND unit_key = ?
    LIMIT 1
  `).get(buildingId, lookupKey);
  return match ? String(match.id || '').trim() : null;
}

async function saveUnitRowOrderToDatabase(buildingName, monthKey, orderedIds) {
  const normalizedBuildingName = String(buildingName || '').trim();
  const normalizedMonthKey = String(monthKey || '').trim();
  const ids = Array.isArray(orderedIds)
    ? orderedIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (!normalizedBuildingName || !normalizedMonthKey || !ids.length) {
    throw new Error('buildingName, monthKey, and orderedIds are required.');
  }
  const database = openDatabase(databasePath);
  try {
    const building = await database.prepare(`
      SELECT id, name
      FROM buildings
      WHERE name = ?
      LIMIT 1
    `).get(normalizedBuildingName);
    if (!building) {
      throw new Error(`Unknown building: ${normalizedBuildingName}`);
    }
    await database.exec('BEGIN');
    await database.prepare(`
      DELETE FROM unit_row_order
      WHERE building_id = ? AND month_key = ?
    `).run(building.id, normalizedMonthKey);
    const insertRowOrder = database.prepare(`
      INSERT INTO unit_row_order (building_id, month_key, position, order_key, unit_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const [index, orderKey] of ids.entries()) {
      await insertRowOrder.run(
        building.id,
        normalizedMonthKey,
        index,
        orderKey,
        await resolveRowOrderUnitId(database, building.id, normalizedBuildingName, orderKey)
      );
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_row_order_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function savePlannedVacateToDatabase(sourceTenantId, plannedVacateDate) {
  const normalizedSourceTenantId = String(sourceTenantId || '').trim();
  const normalizedPlannedVacateDate = String(plannedVacateDate || '').trim();
  if (!normalizedSourceTenantId) {
    throw new Error('sourceTenantId is required.');
  }
  const database = openDatabase(databasePath);
  try {
    const result = await database.prepare(`
      UPDATE tenancies
      SET planned_vacate_date = ?
      WHERE source_tenant_id = ?
    `).run(normalizedPlannedVacateDate, normalizedSourceTenantId);
    if (!result || Number(result.changes || 0) < 1) {
      throw new Error(`No tenancy found for sourceTenantId ${normalizedSourceTenantId}`);
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_planned_vacate_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function saveTenantProfileToDatabase(profile) {
  const sourceTenantId = String(profile && profile.sourceTenantId || '').trim();
  if (!sourceTenantId) {
    throw new Error('sourceTenantId is required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    await ensureFrozenMonthBaseline(database, sourceTenantId, '2026-02');
    const tenancy = await database.prepare(`
      SELECT id
      FROM tenancies
      WHERE source_tenant_id = ?
      LIMIT 1
    `).get(sourceTenantId);
    if (!tenancy) {
      throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    }
    const result = await database.prepare(`
      UPDATE tenancies
      SET
        tenant_name = ?,
        phone = ?,
        civil_id = ?,
        nationality = ?,
        move_in_date = ?,
        contract_start = ?,
        contract_end = ?
      WHERE source_tenant_id = ?
    `).run(
      String(profile && profile.name || '').trim(),
      String(profile && profile.phone || '').trim(),
      String(profile && profile.civilId || '').trim(),
      String(profile && profile.nationality || 'Not set').trim() || 'Not set',
      String(profile && profile.moveInDate || '').trim(),
      String(profile && profile.contractStart || '').trim(),
      String(profile && profile.contractEnd || '').trim(),
      sourceTenantId
    );
    if (!result || Number(result.changes || 0) < 1) throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    await syncTenantProfileForTenancy(database, String(tenancy.id || '').trim(), profile);
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_tenant_profile_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function saveUnitIdentityToDatabase(payload) {
  const unitId = String(payload && payload.unitId || '').trim();
  const unitLabel = String(payload && payload.unit || '').trim();
  const floorLabel = String(payload && payload.floor || '').trim();
  if (!unitId || !unitLabel) {
    throw new Error('unitId and unit are required.');
  }
  const unitKey = `${floorLabel.toUpperCase()}::${unitLabel.toUpperCase()}`;
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    const linkedTenancies = await database.prepare(`
      SELECT source_tenant_id AS sourceTenantId
      FROM tenancies
      WHERE unit_id = ? AND is_active = 1 AND is_archived = 0
    `).all(unitId);
    for (const tenancy of linkedTenancies) {
      await ensureFrozenMonthBaseline(database, String(tenancy && tenancy.sourceTenantId || '').trim(), '2026-02');
    }
    const result = await database.prepare(`
      UPDATE units
      SET
        unit_label = ?,
        floor_label = ?,
        unit_key = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      unitLabel,
      floorLabel,
      unitKey,
      unitId
    );
    if (!result || Number(result.changes || 0) < 1) {
      throw new Error(`No unit found for unitId ${unitId}`);
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_unit_identity_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function upsertTenantMonthOverride(database, sourceTenantId, monthKey, overrideKind, valueText) {
  await database.prepare(`
    INSERT INTO tenant_month_overrides (tenancy_id, source_tenant_id, month_key, override_kind, value_text)
    VALUES (
      (SELECT id FROM tenancies WHERE source_tenant_id = ? LIMIT 1),
      ?, ?, ?, ?
    )
    ON CONFLICT(source_tenant_id, month_key, override_kind)
    DO UPDATE SET
      tenancy_id = (SELECT id FROM tenancies WHERE source_tenant_id = excluded.source_tenant_id LIMIT 1),
      value_text = excluded.value_text
  `).run(sourceTenantId, sourceTenantId, monthKey, overrideKind, valueText);
}

async function freezeTenantMonthBaseline(database, sourceTenantId, monthKey) {
  const normalizedSourceTenantId = String(sourceTenantId || '').trim();
  const normalizedMonthKey = String(monthKey || '').trim();
  if (!normalizedSourceTenantId || !normalizedMonthKey || normalizedMonthKey <= BASELINE_MONTH_KEY) return;
  const tenancy = await database.prepare(`
    SELECT
      tenancies.source_tenant_id AS sourceTenantId,
      tenancies.tenant_name AS name,
      tenancies.phone,
      tenancies.civil_id AS civilId,
      tenancies.nationality,
      tenancies.move_in_date AS moveInDate,
      tenancies.contract_start AS contractStart,
      tenancies.contract_end AS contractEnd,
      tenancies.contract_rent AS contractRent,
      tenancies.discount,
      tenancies.actual_rent AS actualRent,
      tenancies.prepaid_next_month AS prepaidNextMonth,
      tenancies.insurance_amount AS insuranceAmount,
      tenancies.insurance_paid_month AS insurancePaidMonth,
      tenancies.planned_vacate_date AS plannedVacateDate,
      tenancies.notes,
      units.unit_label AS unit,
      units.floor_label AS floor
    FROM tenancies
    LEFT JOIN units ON units.id = tenancies.unit_id
    WHERE tenancies.source_tenant_id = ?
    LIMIT 1
  `).get(normalizedSourceTenantId);
  if (!tenancy) return;
  const frozenOpeningCredit = Number(tenancy.prepaidNextMonth || 0);
  const overrideEntries = [
    ['name', String(tenancy.name || '').trim()],
    ['unit', String(tenancy.unit || '').trim()],
    ['floor', String(tenancy.floor || '').trim()],
    ['moveInDate', String(tenancy.moveInDate || '').trim()],
    ['contractStart', String(tenancy.contractStart || '').trim()],
    ['contractEnd', String(tenancy.contractEnd || '').trim()],
    ['phone', String(tenancy.phone || '').trim()],
    ['civilId', String(tenancy.civilId || '').trim()],
    ['nationality', String(tenancy.nationality || 'Not set').trim() || 'Not set'],
    ['contract_rent', String(Number(tenancy.contractRent || 0))],
    ['discount', String(Number(tenancy.discount || 0))],
    ['actual_rent', String(Number(tenancy.actualRent || 0))],
    ['opening_credit', String(frozenOpeningCredit)],
    ['paid', '0'],
    ['carry', '0'],
    ['prepaid_next', String(Number(tenancy.prepaidNextMonth || 0))],
    ['vacant_amount', '0'],
    ['old_tenant_due_paid', '0'],
    ['insurance_amount', String(Number(tenancy.insuranceAmount || 0))],
    ['insurance_paid_month', String(tenancy.insurancePaidMonth || '').trim()],
    ['planned_vacate_date', String(tenancy.plannedVacateDate || '').trim()],
    ['notes', String(tenancy.notes || '').trim()]
  ];
  for (const [overrideKind, valueText] of overrideEntries) {
    await upsertTenantMonthOverride(database, normalizedSourceTenantId, normalizedMonthKey, overrideKind, valueText);
  }
}

async function freezeMonthBaselineForAllTenants(database, monthKey) {
  const normalizedMonthKey = String(monthKey || '').trim();
  if (!normalizedMonthKey || normalizedMonthKey <= BASELINE_MONTH_KEY) return;
  const rows = await database.prepare(`
    SELECT source_tenant_id AS sourceTenantId
    FROM tenancies
    WHERE is_active = 1 AND is_archived = 0
    ORDER BY source_tenant_id
  `).all();
  for (const row of rows) {
    await freezeTenantMonthBaseline(database, String(row && row.sourceTenantId || '').trim(), normalizedMonthKey);
  }
}

async function cloneMonthForwardForAllTenants(database, fromMonthKey, toMonthKey) {
  const normalizedFromMonthKey = String(fromMonthKey || '').trim();
  const normalizedToMonthKey = String(toMonthKey || '').trim();
  if (!normalizedFromMonthKey || !normalizedToMonthKey || normalizedToMonthKey <= BASELINE_MONTH_KEY) return;
  await freezeMonthBaselineForAllTenants(database, normalizedToMonthKey);
  const tenancies = await database.prepare(`
    SELECT
      source_tenant_id AS sourceTenantId,
      prepaid_next_month AS prepaidNextMonth
    FROM tenancies
    WHERE is_active = 1 AND is_archived = 0
    ORDER BY source_tenant_id
  `).all();
  const rows = await database.prepare(`
    SELECT source_tenant_id AS sourceTenantId, override_kind AS overrideKind, value_text AS valueText
    FROM tenant_month_overrides
    WHERE month_key = ?
    ORDER BY source_tenant_id, override_kind
  `).all(normalizedFromMonthKey);
  const advanceRows = await database.prepare(`
    SELECT
      source_tenant_id AS sourceTenantId,
      amount
    FROM payments
    WHERE rent_month = ?
      AND method = 'Advance'
  `).all(normalizedToMonthKey);
  const copiedOverrideKindsByTenant = new Map();
  const advanceAmountByTenant = new Map();
  advanceRows.forEach((row) => {
    const sourceTenantId = String(row && row.sourceTenantId || '').trim();
    if (!sourceTenantId) return;
    advanceAmountByTenant.set(sourceTenantId, Number(advanceAmountByTenant.get(sourceTenantId) || 0) + Number(row && row.amount || 0));
  });
  for (const row of rows) {
    const sourceTenantId = String(row && row.sourceTenantId || '').trim();
    const overrideKind = String(row && row.overrideKind || '').trim();
    if (!sourceTenantId || !overrideKind) continue;
    const valueText = overrideKind === 'paid'
      ? '0'
      : overrideKind === 'carry'
        ? '0'
      : String(row && row.valueText || '').trim();
    if (!copiedOverrideKindsByTenant.has(sourceTenantId)) copiedOverrideKindsByTenant.set(sourceTenantId, new Set());
    copiedOverrideKindsByTenant.get(sourceTenantId).add(overrideKind);
    await upsertTenantMonthOverride(database, sourceTenantId, normalizedToMonthKey, overrideKind, valueText);
  }
  for (const tenancy of tenancies) {
    const sourceTenantId = String(tenancy && tenancy.sourceTenantId || '').trim();
    if (!sourceTenantId) continue;
    const copiedKinds = copiedOverrideKindsByTenant.get(sourceTenantId) || new Set();
    if (!copiedKinds.has('prepaid_next')) {
      const effectivePrepaidNext = Number(advanceAmountByTenant.get(sourceTenantId) || tenancy && tenancy.prepaidNextMonth || 0);
      await upsertTenantMonthOverride(database, sourceTenantId, normalizedToMonthKey, 'prepaid_next', String(effectivePrepaidNext));
    }
  }
}

async function hasFrozenMonthSnapshot(database, sourceTenantId, monthKey) {
  const normalizedSourceTenantId = String(sourceTenantId || '').trim();
  const normalizedMonthKey = String(monthKey || '').trim();
  if (!normalizedSourceTenantId || !normalizedMonthKey || normalizedMonthKey <= BASELINE_MONTH_KEY) return false;
  const existing = await database.prepare(`
    SELECT 1 AS found
    FROM tenant_month_overrides
    WHERE source_tenant_id = ?
      AND month_key = ?
    LIMIT 1
  `).get(normalizedSourceTenantId, normalizedMonthKey);
  return !!existing;
}

async function ensureFrozenMonthBaseline(database, sourceTenantId, monthKey) {
  const normalizedSourceTenantId = String(sourceTenantId || '').trim();
  const normalizedMonthKey = String(monthKey || '').trim();
  if (!normalizedSourceTenantId || !normalizedMonthKey || normalizedMonthKey <= BASELINE_MONTH_KEY) return;
  if (await hasFrozenMonthSnapshot(database, normalizedSourceTenantId, normalizedMonthKey)) return;
  await freezeTenantMonthBaseline(database, normalizedSourceTenantId, normalizedMonthKey);
}

async function saveTenantMonthIdentityToDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const monthKey = String(payload && payload.monthKey || '').trim();
  if (!sourceTenantId || !monthKey) {
    throw new Error('sourceTenantId and monthKey are required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    for (const [overrideKind, valueText] of [
      ['name', String(payload && payload.name || '').trim()],
      ['unit', String(payload && payload.unit || '').trim()],
      ['floor', String(payload && payload.floor || '').trim()],
      ['moveInDate', String(payload && payload.moveInDate || '').trim()],
      ['contractStart', String(payload && payload.contractStart || '').trim()],
      ['contractEnd', String(payload && payload.contractEnd || '').trim()],
      ['phone', String(payload && payload.phone || '').trim()],
      ['civilId', String(payload && payload.civilId || '').trim()],
      ['nationality', String(payload && payload.nationality || 'Not set').trim() || 'Not set']
    ]) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, overrideKind, valueText);
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_tenant_month_identity_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function saveTenantMonthIdentityBulkToDatabase(payload) {
  const monthKey = String(payload && payload.monthKey || '').trim();
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  if (!monthKey || !rows.length) {
    throw new Error('monthKey and rows are required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    for (const row of rows) {
      const sourceTenantId = String(row && row.sourceTenantId || '').trim();
      if (!sourceTenantId) continue;
      for (const [overrideKind, valueText] of [
        ['name', String(row && row.name || '').trim()],
        ['unit', String(row && row.unit || '').trim()],
        ['floor', String(row && row.floor || '').trim()],
        ['moveInDate', String(row && row.moveInDate || '').trim()],
        ['contractStart', String(row && row.contractStart || '').trim()],
        ['contractEnd', String(row && row.contractEnd || '').trim()],
        ['phone', String(row && row.phone || '').trim()],
        ['civilId', String(row && row.civilId || '').trim()],
        ['nationality', String(row && row.nationality || 'Not set').trim() || 'Not set']
      ]) {
        await upsertTenantMonthOverride(database, sourceTenantId, monthKey, overrideKind, valueText);
      }
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_tenant_month_identity_bulk_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function resetMonthDataInDatabase(payload) {
  const monthKey = String(payload && payload.monthKey || '').trim();
  if (!monthKey) {
    throw new Error('monthKey is required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    await database.prepare(`
      DELETE FROM tenant_month_overrides
      WHERE month_key = ?
    `).run(monthKey);
    await database.prepare(`
      DELETE FROM unit_row_order
      WHERE month_key = ?
    `).run(monthKey);
    await database.prepare(`
      DELETE FROM payments
      WHERE rent_month = ?
        AND COALESCE(method, '') <> 'Advance'
    `).run(monthKey);
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_month_reset_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    const previousMonthKey = addMonths(monthKey, -1);
    if (previousMonthKey && compareMonthKeys(previousMonthKey, BASELINE_MONTH_KEY) >= 0) {
      await cloneMonthForwardForAllTenants(database, previousMonthKey, monthKey);
    } else {
      await freezeMonthBaselineForAllTenants(database, monthKey);
    }
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function deleteMonthDataInDatabase(payload) {
  const monthKey = String(payload && payload.monthKey || '').trim();
  if (!monthKey || monthKey <= BASELINE_MONTH_KEY) {
    throw new Error('A future monthKey is required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    await database.prepare(`
      DELETE FROM tenant_month_overrides
      WHERE month_key = ?
    `).run(monthKey);
    await database.prepare(`
      DELETE FROM unit_row_order
      WHERE month_key = ?
    `).run(monthKey);
    await database.prepare(`
      DELETE FROM payments
      WHERE rent_month = ?
    `).run(monthKey);
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_month_delete_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function createMonthTabInDatabase(payload) {
  const monthKey = String(payload && payload.monthKey || '').trim();
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  if (!monthKey || monthKey <= BASELINE_MONTH_KEY) {
    throw new Error('A future monthKey is required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    await database.prepare(`
      DELETE FROM tenant_month_overrides
      WHERE month_key = ?
    `).run(monthKey);
    await database.prepare(`
      DELETE FROM unit_row_order
      WHERE month_key = ?
    `).run(monthKey);
    await database.prepare(`
      DELETE FROM payments
      WHERE rent_month = ?
    `).run(monthKey);
    await freezeMonthBaselineForAllTenants(database, monthKey);
    for (const row of rows) {
      const sourceTenantId = String(row && row.sourceTenantId || '').trim();
      if (!sourceTenantId) continue;
      const entries = [
        ['contract_rent', String(Number(row && row.contractRent || 0))],
        ['discount', String(Number(row && row.discount || 0))],
        ['actual_rent', String(Number(row && row.actualRent || 0))],
        ['opening_credit', String(Number(row && row.prepaidFromBefore || 0))],
        ['carry', String(Number((row && row.previousDue || 0) + (row && row.paidPrevious || 0) || 0))],
        ['paid_previous', String(Number(row && row.paidPrevious || 0))],
        ['paid', String(Number(row && row.paidCurrent || 0))],
        ['prepaid_next', String(Number((row && (row.prepaidNext ?? row.prepaidAmount)) || 0))],
        ['insurance_amount', String(Number(row && row.insuranceAmount || 0))],
        ['insurance_paid_month', String(row && row.insurancePaidMonth || '').trim()],
        ['planned_vacate_date', String(row && row.plannedVacateDate || '').trim()],
        ['notes', String(row && row.notes || '').trim()],
        ['vacant_amount', String(Number(row && row.vacantAmount || 0))],
        ['old_tenant_due_paid', String(Number(row && row.oldTenantDuePaid || 0))]
      ];
      for (const [overrideKind, valueText] of entries) {
        await upsertTenantMonthOverride(database, sourceTenantId, monthKey, overrideKind, valueText);
      }
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_month_create_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function saveBuildingInlineEditToDatabase(payload) {
  let sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const unitId = String(payload && payload.unitId || '').trim();
  const monthKey = String(payload && payload.monthKey || '').trim();
  const hasPayloadField = (fieldName) => Object.prototype.hasOwnProperty.call(payload || {}, fieldName);
  const shouldUpdateBaseTenancy = monthKey && monthKey <= BASELINE_MONTH_KEY;
  if ((!sourceTenantId && !unitId) || !monthKey) {
    throw new Error('sourceTenantId or unitId, and monthKey are required.');
  }
  const database = openDatabase(databasePath);
  try {
    if (!sourceTenantId && unitId) {
      const matchedTenancy = await database.prepare(`
        SELECT source_tenant_id AS sourceTenantId
        FROM tenancies
        WHERE unit_id = ? AND is_active = 1
        ORDER BY updated_at DESC, created_at DESC, id DESC
        LIMIT 1
      `).get(unitId);
      sourceTenantId = String(matchedTenancy && matchedTenancy.sourceTenantId || '').trim();
    }
    if (!sourceTenantId) {
      throw new Error('No tenancy found for this row.');
    }
    const existingTenancy = await database.prepare(`
      SELECT
        contract_rent AS contractRent,
        discount,
        actual_rent AS actualRent,
        prepaid_next_month AS prepaidNextMonth,
        insurance_amount AS insuranceAmount,
        insurance_paid_month AS insurancePaidMonth,
        planned_vacate_date AS plannedVacateDate,
        notes
      FROM tenancies
      WHERE source_tenant_id = ?
      LIMIT 1
    `).get(sourceTenantId);
    await database.exec('BEGIN');
    if (shouldUpdateBaseTenancy) {
      await ensureFrozenMonthBaseline(database, sourceTenantId, '2026-02');
      const result = await database.prepare(`
        UPDATE tenancies
        SET
          contract_rent = ?,
          discount = ?,
          actual_rent = ?,
          prepaid_next_month = ?,
          insurance_amount = ?,
          insurance_paid_month = ?,
          planned_vacate_date = ?,
          notes = ?
        WHERE source_tenant_id = ?
      `).run(
        hasPayloadField('contractRent') ? Number(payload && payload.contractRent || 0) : Number(existingTenancy && existingTenancy.contractRent || 0),
        hasPayloadField('discount') ? Number(payload && payload.discount || 0) : Number(existingTenancy && existingTenancy.discount || 0),
        hasPayloadField('baseActualRent') ? Number(payload && payload.baseActualRent || 0) : Number(existingTenancy && existingTenancy.actualRent || 0),
        hasPayloadField('prepaidAmount') ? Number(payload && payload.prepaidAmount || 0) : Number(existingTenancy && existingTenancy.prepaidNextMonth || 0),
        hasPayloadField('insuranceAmount') ? Number(payload && payload.insuranceAmount || 0) : Number(existingTenancy && existingTenancy.insuranceAmount || 0),
        hasPayloadField('insurancePaidMonth') ? String(payload && payload.insurancePaidMonth || '').trim() : String(existingTenancy && existingTenancy.insurancePaidMonth || '').trim(),
        hasPayloadField('plannedVacateDate') ? String(payload && payload.plannedVacateDate || '').trim() : String(existingTenancy && existingTenancy.plannedVacateDate || '').trim(),
        hasPayloadField('notes') ? String(payload && payload.notes || '').trim() : String(existingTenancy && existingTenancy.notes || '').trim(),
        sourceTenantId
      );
      if (!result || Number(result.changes || 0) < 1) {
        throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
      }
    }
    if (!shouldUpdateBaseTenancy && hasPayloadField('contractRent')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'contract_rent', String(Number(payload && payload.contractRent || 0)));
    }
    if (!shouldUpdateBaseTenancy && hasPayloadField('discount')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'discount', String(Number(payload && payload.discount || 0)));
    }
    if (hasPayloadField('carryOverride')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'carry', String(Number(payload && payload.carryOverride || 0)));
    }
    if (hasPayloadField('paidPreviousAmount')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'paid_previous', String(Number(payload && payload.paidPreviousAmount || 0)));
    }
    if (hasPayloadField('paidOverride')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'paid', String(Number(payload && payload.paidOverride || 0)));
    }
    if (hasPayloadField('actualRentOverride')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'actual_rent', String(Number(payload && payload.actualRentOverride || 0)));
    }
    if (!shouldUpdateBaseTenancy && hasPayloadField('insuranceAmount')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'insurance_amount', String(Number(payload && payload.insuranceAmount || 0)));
    }
    if (!shouldUpdateBaseTenancy && hasPayloadField('insurancePaidMonth')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'insurance_paid_month', String(payload && payload.insurancePaidMonth || '').trim());
    }
    if (!shouldUpdateBaseTenancy && hasPayloadField('plannedVacateDate')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'planned_vacate_date', String(payload && payload.plannedVacateDate || '').trim());
    }
    if (hasPayloadField('vacantAmount')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'vacant_amount', String(Number(payload && payload.vacantAmount || 0)));
    }
    if (hasPayloadField('notes')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'notes', String(payload && payload.notes || '').trim());
    }
    if (hasPayloadField('prepaidAmount')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'prepaid_next', String(Number(payload && payload.prepaidAmount || 0)));
    }
    if (hasPayloadField('openingCreditAmount')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'opening_credit', String(Number(payload && payload.openingCreditAmount || 0)));
    }
    if (hasPayloadField('oldTenantDuePaid')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'old_tenant_due_paid', String(Number(payload && payload.oldTenantDuePaid || 0)));
    }
    if (hasPayloadField('prepaidLastMonthAmount')) {
      await upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'prepaid_last_month', String(Number(payload && payload.prepaidLastMonthAmount || 0)));
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_building_inline_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function setTenantPaymentInDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const rentMonth = String(payload && payload.rentMonth || '').trim();
  const method = String(payload && payload.method || '').trim();
  if (!sourceTenantId || !rentMonth || !method) {
    throw new Error('sourceTenantId, rentMonth, and method are required.');
  }
  const amount = Number(payload && payload.amount || 0);
  const paymentId = String(payload && payload.paymentId || '').trim() || `payment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const paidOn = String(payload && payload.paidOn || '').trim() || new Date().toISOString().slice(0, 10);
  const note = String(payload && payload.note || '').trim();
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    await database.prepare(`
      DELETE FROM payments
      WHERE source_tenant_id = ?
        AND rent_month = ?
        AND method = ?
    `).run(sourceTenantId, rentMonth, method);
    if (amount > 0) {
      await database.prepare(`
        INSERT INTO payments (
          id, tenancy_id, source_tenant_id, amount, paid_on, rent_month, method, note, raw_json
        ) VALUES (
          ?,
          (SELECT id FROM tenancies WHERE source_tenant_id = ? LIMIT 1),
          ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        paymentId,
        sourceTenantId,
        sourceTenantId,
        amount,
        paidOn,
        rentMonth,
        method,
        note,
        JSON.stringify({
          id: paymentId,
          tenantId: sourceTenantId,
          amount,
          date: paidOn,
          rentMonth,
          method,
          note
        })
      );
    }
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function deleteTenantPaymentInDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const rentMonth = String(payload && payload.rentMonth || '').trim();
  const method = String(payload && payload.method || '').trim();
  if (!sourceTenantId || !rentMonth || !method) {
    throw new Error('sourceTenantId, rentMonth, and method are required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.prepare(`
      DELETE FROM payments
      WHERE id IN (
        SELECT id
        FROM payments
        WHERE source_tenant_id = ?
          AND rent_month = ?
          AND method = ?
        ORDER BY paid_on DESC, id DESC
        LIMIT 1
      )
    `).run(sourceTenantId, rentMonth, method);
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function appendActivityEntryToDatabase(payload) {
  const activityId = String(payload && payload.id || '').trim() || `activity-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const happenedAt = String(payload && payload.when || '').trim() || new Date().toISOString();
  const actor = String(payload && payload.actor || '').trim();
  const action = String(payload && payload.action || '').trim();
  const detail = String(payload && payload.detail || '').trim();
  if (!action) {
    throw new Error('action is required.');
  }
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    await database.prepare(`
      INSERT INTO activity_log (id, happened_at, actor, action, detail, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      activityId,
      happenedAt,
      actor,
      action,
      detail,
      JSON.stringify({
        id: activityId,
        when: happenedAt,
        actor,
        action,
        detail
      })
    );
    await database.prepare(`
      DELETE FROM activity_log
      WHERE id IN (
        SELECT id
        FROM activity_log
        ORDER BY happened_at DESC, id DESC
        LIMIT -1 OFFSET 100
      )
    `).run();
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function saveVacantUnitMetaToDatabase(payload) {
  const unitId = String(payload && payload.unitId || '').trim();
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const buildingName = String(payload && payload.buildingName || '').trim();
  const unitLabel = String(payload && payload.unit || '').trim();
  const floorLabel = String(payload && payload.floor || '').trim();
  const monthKey = String(payload && payload.monthKey || '').trim();
  if ((!unitId && !sourceTenantId && (!buildingName || !unitLabel)) || !monthKey) {
    throw new Error('unitId or sourceTenantId or building/unit, and monthKey are required.');
  }
  const database = openDatabase(databasePath);
  try {
    let resolvedUnit = unitId
      ? await database.prepare(`
          SELECT id
          FROM units
          WHERE id = ?
          LIMIT 1
        `).get(unitId)
      : null;
    if (!resolvedUnit && sourceTenantId) {
      resolvedUnit = await database.prepare(`
          SELECT unit_id AS id
          FROM tenancies
          WHERE source_tenant_id = ?
          LIMIT 1
        `).get(sourceTenantId);
    }
    if (!resolvedUnit) {
      resolvedUnit = await database.prepare(`
          SELECT units.id AS id
          FROM units
          INNER JOIN buildings ON buildings.id = units.building_id
          WHERE LOWER(buildings.name) = LOWER(?)
            AND units.unit_label = ?
            AND COALESCE(units.floor_label, '') = ?
          LIMIT 1
        `).get(buildingName, unitLabel, floorLabel);
    }
    const resolvedUnitId = String(resolvedUnit && resolvedUnit.id || '').trim();
    if (!resolvedUnitId) {
      throw new Error('No unit found for vacant row.');
    }
    await database.exec('BEGIN');
    await database.prepare(`
      INSERT INTO unit_vacancy_state (
        unit_id, is_vacant, vacant_since, last_tenant_name, last_contract_rent,
        last_actual_rent, last_discount, old_tenant_due_paid, notes, raw_json, updated_at
      ) VALUES (?, 1, ?, '', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(unit_id) DO UPDATE SET
        is_vacant = 1,
        vacant_since = excluded.vacant_since,
        last_contract_rent = excluded.last_contract_rent,
        last_actual_rent = excluded.last_actual_rent,
        last_discount = excluded.last_discount,
        old_tenant_due_paid = excluded.old_tenant_due_paid,
        notes = excluded.notes,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      resolvedUnitId,
      String(payload && payload.vacantSince || '').trim(),
      Number(payload && payload.lastContractRent || 0),
      Number(payload && payload.lastActualRent || 0),
      Number(payload && payload.discount || 0),
      Number(payload && payload.oldTenantDuePaid || 0),
      String(payload && payload.notes || '').trim(),
      JSON.stringify(payload || {})
    );
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_vacant_meta_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function vacateTenantInDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const payloadUnitId = String(payload && payload.unitId || '').trim();
  const buildingName = String(payload && payload.buildingName || '').trim();
  const unitLabel = String(payload && payload.unit || '').trim();
  const floorLabel = String(payload && payload.floor || '').trim();
  const vacateDate = String(payload && payload.vacateDate || '').trim();
  if (!sourceTenantId || !vacateDate) {
    throw new Error('sourceTenantId and vacateDate are required.');
  }
  const database = openDatabase(databasePath);
  try {
    const tenancy = await database.prepare(`
      SELECT id, unit_id AS unitId, tenant_name AS tenantName
      FROM tenancies
      WHERE source_tenant_id = ?
      LIMIT 1
    `).get(sourceTenantId);
    if (!tenancy) {
      throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    }
    let resolvedUnitId = String(tenancy && tenancy.unitId || '').trim();
    if (!resolvedUnitId && payloadUnitId) {
      const matchedUnit = await database.prepare(`
        SELECT id
        FROM units
        WHERE id = ?
        LIMIT 1
      `).get(payloadUnitId);
      resolvedUnitId = String(matchedUnit && matchedUnit.id || '').trim();
    }
    if (!resolvedUnitId && buildingName && unitLabel) {
      const matchedUnit = await database.prepare(`
        SELECT units.id AS id
        FROM units
        INNER JOIN buildings ON buildings.id = units.building_id
        WHERE LOWER(buildings.name) = LOWER(?)
          AND units.unit_label = ?
          AND COALESCE(units.floor_label, '') = ?
        LIMIT 1
      `).get(buildingName, unitLabel, floorLabel);
      resolvedUnitId = String(matchedUnit && matchedUnit.id || '').trim();
    }
    if (!resolvedUnitId) {
      throw new Error('No unit found for vacate action.');
    }
    await database.exec('BEGIN');
    await database.prepare(`
      UPDATE tenancies
      SET unit_id = COALESCE(NULLIF(unit_id, ''), ?)
      WHERE source_tenant_id = ?
    `).run(
      resolvedUnitId,
      sourceTenantId
    );
    await database.prepare(`
      UPDATE tenancies
      SET
        is_active = 0,
        is_archived = 1,
        archived_on = ?,
        planned_vacate_date = '',
        notes = ?
      WHERE source_tenant_id = ?
    `).run(
      vacateDate,
      String(payload && payload.archivedNotes || '').trim(),
      sourceTenantId
    );
    await database.prepare(`
      INSERT INTO unit_vacancy_state (
        unit_id, is_vacant, vacant_since, last_tenant_name, last_contract_rent,
        last_actual_rent, last_discount, old_tenant_due_paid, notes, raw_json, updated_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(unit_id) DO UPDATE SET
        is_vacant = excluded.is_vacant,
        vacant_since = excluded.vacant_since,
        last_tenant_name = excluded.last_tenant_name,
        last_contract_rent = excluded.last_contract_rent,
        last_actual_rent = excluded.last_actual_rent,
        last_discount = excluded.last_discount,
        old_tenant_due_paid = excluded.old_tenant_due_paid,
        notes = excluded.notes,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      resolvedUnitId,
      vacateDate,
      String(payload && payload.lastTenantName || tenancy.tenantName || '').trim(),
      Number(payload && payload.lastContractRent || 0),
      Number(payload && payload.lastActualRent || 0),
      Number(payload && payload.lastDiscount || 0),
      String(payload && payload.vacancyNotes || '').trim(),
      JSON.stringify(payload || {})
    );
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_vacate_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function createTenantInDatabase(payload) {
  const buildingName = String(payload && payload.buildingName || '').trim();
  const unit = String(payload && payload.unit || '').trim();
  const floor = String(payload && payload.floor || '').trim();
  const existingProfileId = String(payload && payload.existingProfileId || '').trim();
  const tenantName = String(payload && payload.name || '').trim();
  const phone = String(payload && payload.phone || '').trim();
  const civilId = String(payload && payload.civilId || '').trim();
  const contractStart = String(payload && payload.contractStart || '').trim();
  const contractEnd = String(payload && payload.contractEnd || '').trim();
  let duplicateWarning = '';
  if (!buildingName || !unit || !tenantName || !contractStart || !contractEnd) {
    throw new Error('buildingName, unit, name, contractStart, and contractEnd are required.');
  }
  const database = openDatabase(databasePath);
  try {
    const building = await database.prepare(`
      SELECT id
      FROM buildings
      WHERE name = ?
      LIMIT 1
    `).get(buildingName);
    if (!building) {
      throw new Error(`Unknown building: ${buildingName}`);
    }
    const unitKey = `${String(floor || '').trim().toUpperCase()}::${String(unit || '').trim().toUpperCase()}`;
    const unitRecord = await database.prepare(`
      SELECT id
      FROM units
      WHERE building_id = ? AND unit_key = ?
      LIMIT 1
    `).get(building.id, unitKey);
    if (!unitRecord) {
      throw new Error(`No unit found for ${buildingName} ${unit}`);
    }
    const duplicateMatches = await findMatchingTenantProfile(database, {
      tenantName,
      phone,
      civilId
    });
    if (duplicateMatches.length) {
      const duplicateReasons = duplicateMatches
        .map((item) => String(item && item.matchedBy || '').trim())
        .filter(Boolean);
      duplicateWarning = `There is saved data about this tenant by ${duplicateReasons.join(', ')}.`;
    }
    if (existingProfileId) {
      const existingProfile = await database.prepare(`
        SELECT id
        FROM tenant_profiles
        WHERE id = ?
        LIMIT 1
      `).get(existingProfileId);
      if (!existingProfile) {
        throw new Error(`Saved tenant profile not found for ${existingProfileId}`);
      }
    }
    const resolvedProfileId = existingProfileId || await upsertTenantProfile(database, {
      tenantName,
      civilId,
      phone,
      nationality: String(payload && payload.nationality || 'Not set').trim() || 'Not set'
    });
    if (!resolvedProfileId) {
      throw new Error('Tenant profile could not be created.');
    }
    const sourceTenantId = String(payload && payload.sourceTenantId || '').trim() || `db-created-${Date.now()}`;
    const tenancyId = `tenancy-db-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    await database.exec('BEGIN');
    await database.prepare(`
      DELETE FROM unit_vacancy_state
      WHERE unit_id = ?
    `).run(unitRecord.id);
    await database.prepare(`
      INSERT INTO tenancies (
        id, profile_id, unit_id, source_tenant_id, tenant_name, phone, civil_id, nationality, move_in_date,
        contract_start, contract_end, contract_rent, discount, actual_rent, previous_due,
        prepaid_next_month, insurance_amount, insurance_paid_month, due_day, planned_vacate_date,
        archived_on, is_active, is_archived, notes, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 1, 0, ?, ?)
    `).run(
      tenancyId,
      resolvedProfileId,
      unitRecord.id,
      sourceTenantId,
      tenantName,
      phone,
      civilId,
      String(payload && payload.nationality || 'Not set').trim() || 'Not set',
      String(payload && payload.moveInDate || '').trim(),
      contractStart,
      contractEnd,
      Number(payload && payload.contractRent || 0),
      Number(payload && payload.discount || 0),
      Number(payload && payload.actualRent || 0),
      0,
      0,
      Number(payload && payload.insuranceAmount || 0),
      String(payload && payload.insurancePaidMonth || '').trim(),
      Number(payload && payload.dueDay || 20),
      '',
      String(payload && payload.notes || '').trim(),
      JSON.stringify(payload || {})
    );
    if (existingProfileId) {
      await database.prepare(`
        UPDATE tenant_profiles
        SET
          full_name = CASE WHEN ? <> '' THEN ? ELSE full_name END,
          civil_id = CASE WHEN ? <> '' THEN ? ELSE civil_id END,
          phone = CASE WHEN ? <> '' THEN ? ELSE phone END,
          nationality = CASE WHEN ? <> '' THEN ? ELSE nationality END,
          last_seen_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        tenantName, tenantName,
        civilId, civilId,
        phone, phone,
        String(payload && payload.nationality || 'Not set').trim() || 'Not set',
        String(payload && payload.nationality || 'Not set').trim() || 'Not set',
        resolvedProfileId
      );
    }
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_tenant_create_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return {
    snapshot: await exportSnapshotToBrowserFile(),
    warning: duplicateWarning
  };
}

async function repairTenantProfilesInDatabase() {
  const database = openDatabase(databasePath);
  try {
    await database.exec('BEGIN');
    const repaired = await repairMissingTenancyProfiles(database);
    if (repaired > 0) {
      await database.exec(`
        INSERT INTO app_meta(key, value)
        VALUES ('last_tenant_profile_repair_at', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      `);
    }
    await database.exec('COMMIT');
    return repaired;
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
}

async function undoVacateTenantInDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  if (!sourceTenantId) {
    throw new Error('sourceTenantId is required.');
  }
  const database = openDatabase(databasePath);
  try {
    const tenancy = await database.prepare(`
      SELECT unit_id AS unitId
      FROM tenancies
      WHERE source_tenant_id = ?
      LIMIT 1
    `).get(sourceTenantId);
    if (!tenancy) {
      throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    }
    await database.exec('BEGIN');
    await database.prepare(`
      UPDATE tenancies
      SET
        is_active = 1,
        is_archived = 0,
        archived_on = '',
        planned_vacate_date = '',
        notes = ?
      WHERE source_tenant_id = ?
    `).run(
      String(payload && payload.notes || '').trim(),
      sourceTenantId
    );
    await database.prepare(`
      DELETE FROM unit_vacancy_state
      WHERE unit_id = ?
    `).run(tenancy.unitId);
    await database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_undo_vacate_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    await database.exec('COMMIT');
  } catch (error) {
    try {
      await database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await database.close();
  }
  return await exportSnapshotToBrowserFile();
}

async function handleApiRequest(request, response, requestUrl) {
  if (request.method === 'OPTIONS' && requestUrl.pathname.startsWith('/api/')) {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end();
    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'tatra-local-api',
      databasePath
    });
    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/db/snapshot') {
    try {
      await repairTenantProfilesInDatabase();
      const snapshot = await readDatabaseSnapshot(databasePath);
      sendJson(response, 200, snapshot);
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/db/backup-download') {
    if (!isAuthorizedBackupRequest(request)) {
      sendJson(response, 403, {
        ok: false,
        error: 'Backup token is missing or invalid.'
      });
      return true;
    }
    if (!fs.existsSync(databasePath)) {
      sendJson(response, 404, {
        ok: false,
        error: 'Database file was not found.'
      });
      return true;
    }
    sendFile(response, databasePath, `tatra-online-${new Date().toISOString().slice(0, 10)}.sqlite`);
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/backup-restore') {
    if (!isAuthorizedBackupRequest(request)) {
      sendJson(response, 403, {
        ok: false,
        error: 'Backup token is missing or invalid.'
      });
      return true;
    }
    try {
      const body = await readRawBody(request);
      const snapshot = await restoreDatabaseFromUpload(body);
      sendJson(response, 200, {
        ok: true,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/export-snapshot') {
    try {
      const snapshot = await exportSnapshotToBrowserFile();
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/payment-set') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await setTenantPaymentInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/payment-delete') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await deleteTenantPaymentInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/activity-log') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await appendActivityEntryToDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/row-order') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await saveUnitRowOrderToDatabase(body.buildingName, body.monthKey, body.orderedIds);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/planned-vacate') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await savePlannedVacateToDatabase(body.sourceTenantId, body.plannedVacateDate);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/tenant-profile') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await saveTenantProfileToDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/tenant-month-identity') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await saveTenantMonthIdentityToDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/tenant-month-identity-bulk') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await saveTenantMonthIdentityBulkToDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/reset-month-data') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await resetMonthDataInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/unit-identity') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await saveUnitIdentityToDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/vacate-tenant') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await vacateTenantInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/delete-month-data') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await deleteMonthDataInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/create-month-tab') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await createMonthTabInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/building-inline-save') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await saveBuildingInlineEditToDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/vacant-unit-meta') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await saveVacantUnitMetaToDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/create-tenant') {
    try {
      const body = await readJsonBody(request);
      const result = await createTenantInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: result && result.snapshot ? result.snapshot.counts : null,
        warning: result && result.warning ? result.warning : ''
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/undo-vacate') {
    try {
      const body = await readJsonBody(request);
      const snapshot = await undoVacateTenantInDatabase(body);
      sendJson(response, 200, {
        ok: true,
        outputPath: browserSnapshotPath,
        counts: snapshot.counts
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: String(error && error.message || error)
      });
    }
    return true;
  }

  return false;
}

ensureDatabaseFileExists(root, databasePath);
await prepareDatabase(databasePath, schemaPath);
await ensureRow55OccupiedTenancy();
await exportSnapshotToBrowserFile();

const server = http.createServer(async (request, response) => {
  if (!isAuthorizedRequest(request)) {
    requestServerAuth(response);
    return;
  }
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (await handleApiRequest(request, response, requestUrl)) {
    return;
  }
  const filePath = getFilePath(requestUrl.pathname);
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, file) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(file);
  });
});

server.listen(port, host, () => {
  console.log(`Tatra dashboard available at http://${host}:${port}`);
});
