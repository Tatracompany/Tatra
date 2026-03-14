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

function exportSnapshotToBrowserFile() {
  const snapshot = readDatabaseSnapshot(databasePath);
  fs.writeFileSync(browserSnapshotPath, buildBrowserSnapshotScript(snapshot), 'utf8');
  return snapshot;
}

function restoreDatabaseFromUpload(databaseBuffer) {
  if (!Buffer.isBuffer(databaseBuffer) || !databaseBuffer.length) {
    throw new Error('Uploaded database content is empty.');
  }

  const tempRestorePath = `${databasePath}.restore-${Date.now()}.tmp`;
  fs.writeFileSync(tempRestorePath, databaseBuffer);

  try {
    prepareDatabase(tempRestorePath, schemaPath);
    const restoredDatabase = openDatabase(tempRestorePath);
    restoredDatabase.close();
    fs.copyFileSync(tempRestorePath, databasePath);
  } finally {
    if (fs.existsSync(tempRestorePath)) {
      fs.unlinkSync(tempRestorePath);
    }
  }

  return exportSnapshotToBrowserFile();
}

function syncStateExtrasToDatabase(payload) {
  const payments = Array.isArray(payload && payload.payments) ? payload.payments : [];
  const activity = Array.isArray(payload && payload.activity) ? payload.activity : [];
  const database = openDatabase(databasePath);
  try {
    database.exec('BEGIN');
    database.exec('DELETE FROM payments;');
    database.exec('DELETE FROM activity_log;');

    const insertPayment = database.prepare(`
      INSERT INTO payments (
        id, tenancy_id, source_tenant_id, amount, paid_on, rent_month, method, note, raw_json
      ) VALUES (
        ?,
        (SELECT id FROM tenancies WHERE source_tenant_id = ? LIMIT 1),
        ?, ?, ?, ?, ?, ?, ?
      )
    `);
    payments.forEach((payment) => {
      const paymentId = String(payment && payment.id || '').trim();
      const tenantId = String(payment && payment.tenantId || '').trim();
      if (!paymentId) return;
      insertPayment.run(
        paymentId,
        tenantId,
        tenantId,
        Number(payment && payment.amount || 0),
        String(payment && payment.date || '').trim(),
        String(payment && payment.rentMonth || '').trim(),
        String(payment && payment.method || '').trim(),
        String(payment && payment.note || '').trim(),
        JSON.stringify(payment || {})
      );
    });

    const insertActivity = database.prepare(`
      INSERT INTO activity_log (id, happened_at, actor, action, detail, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    activity.forEach((entry) => {
      const activityId = String(entry && entry.id || '').trim();
      if (!activityId) return;
      insertActivity.run(
        activityId,
        String(entry && entry.when || '').trim() || new Date().toISOString(),
        String(entry && entry.actor || '').trim(),
        String(entry && entry.action || '').trim(),
        String(entry && entry.detail || '').trim(),
        JSON.stringify(entry || {})
      );
    });

    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_state_extras_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function syncTenantProfileForTenancy(database, tenancyId, profile) {
  const profileId = upsertTenantProfile(database, {
    tenantName: String(profile && profile.name || profile && profile.tenantName || '').trim(),
    civilId: String(profile && profile.civilId || '').trim(),
    phone: String(profile && profile.phone || '').trim(),
    nationality: String(profile && profile.nationality || 'Not set').trim() || 'Not set'
  });
  if (!profileId || !tenancyId) return '';
  database.prepare(`
    UPDATE tenancies
    SET profile_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(profileId, tenancyId);
  return profileId;
}

function resolveRowOrderUnitId(database, buildingId, buildingName, orderKey) {
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
  const match = database.prepare(`
    SELECT id
    FROM units
    WHERE building_id = ? AND unit_key = ?
    LIMIT 1
  `).get(buildingId, lookupKey);
  return match ? String(match.id || '').trim() : null;
}

function saveUnitRowOrderToDatabase(buildingName, monthKey, orderedIds) {
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
    const building = database.prepare(`
      SELECT id, name
      FROM buildings
      WHERE name = ?
      LIMIT 1
    `).get(normalizedBuildingName);
    if (!building) {
      throw new Error(`Unknown building: ${normalizedBuildingName}`);
    }
    database.exec('BEGIN');
    database.prepare(`
      DELETE FROM unit_row_order
      WHERE building_id = ? AND month_key = ?
    `).run(building.id, normalizedMonthKey);
    const insertRowOrder = database.prepare(`
      INSERT INTO unit_row_order (building_id, month_key, position, order_key, unit_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    ids.forEach((orderKey, index) => {
      insertRowOrder.run(
        building.id,
        normalizedMonthKey,
        index,
        orderKey,
        resolveRowOrderUnitId(database, building.id, normalizedBuildingName, orderKey)
      );
    });
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_row_order_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function savePlannedVacateToDatabase(sourceTenantId, plannedVacateDate) {
  const normalizedSourceTenantId = String(sourceTenantId || '').trim();
  const normalizedPlannedVacateDate = String(plannedVacateDate || '').trim();
  if (!normalizedSourceTenantId) {
    throw new Error('sourceTenantId is required.');
  }
  const database = openDatabase(databasePath);
  try {
    const result = database.prepare(`
      UPDATE tenancies
      SET planned_vacate_date = ?
      WHERE source_tenant_id = ?
    `).run(normalizedPlannedVacateDate, normalizedSourceTenantId);
    if (!result || Number(result.changes || 0) < 1) {
      throw new Error(`No tenancy found for sourceTenantId ${normalizedSourceTenantId}`);
    }
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_planned_vacate_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function saveTenantProfileToDatabase(profile) {
  const sourceTenantId = String(profile && profile.sourceTenantId || '').trim();
  if (!sourceTenantId) {
    throw new Error('sourceTenantId is required.');
  }
  const database = openDatabase(databasePath);
  try {
    const tenancy = database.prepare(`
      SELECT id
      FROM tenancies
      WHERE source_tenant_id = ?
      LIMIT 1
    `).get(sourceTenantId);
    if (!tenancy) {
      throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    }
    const result = database.prepare(`
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
    syncTenantProfileForTenancy(database, String(tenancy.id || '').trim(), profile);
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_tenant_profile_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function saveUnitIdentityToDatabase(payload) {
  const unitId = String(payload && payload.unitId || '').trim();
  const unitLabel = String(payload && payload.unit || '').trim();
  const floorLabel = String(payload && payload.floor || '').trim();
  if (!unitId || !unitLabel) {
    throw new Error('unitId and unit are required.');
  }
  const unitKey = `${floorLabel.toUpperCase()}::${unitLabel.toUpperCase()}`;
  const database = openDatabase(databasePath);
  try {
    const result = database.prepare(`
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
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_unit_identity_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function upsertTenantMonthOverride(database, sourceTenantId, monthKey, overrideKind, valueText) {
  database.prepare(`
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

function saveBuildingInlineEditToDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const monthKey = String(payload && payload.monthKey || '').trim();
  if (!sourceTenantId || !monthKey) {
    throw new Error('sourceTenantId and monthKey are required.');
  }
  const database = openDatabase(databasePath);
  try {
    const result = database.prepare(`
      UPDATE tenancies
      SET
        contract_rent = ?,
        discount = ?,
        actual_rent = ?,
        insurance_amount = ?,
        insurance_paid_month = ?,
        planned_vacate_date = ?,
        notes = ?
      WHERE source_tenant_id = ?
    `).run(
      Number(payload && payload.contractRent || 0),
      Number(payload && payload.discount || 0),
      Number(payload && payload.baseActualRent || 0),
      Number(payload && payload.insuranceAmount || 0),
      String(payload && payload.insurancePaidMonth || '').trim(),
      String(payload && payload.plannedVacateDate || '').trim(),
      String(payload && payload.notes || '').trim(),
      sourceTenantId
    );
    if (!result || Number(result.changes || 0) < 1) {
      throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    }
    database.exec('BEGIN');
    upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'carry', String(Number(payload && payload.carryOverride || 0)));
    upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'paid', String(Number(payload && payload.paidOverride || 0)));
    upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'actual_rent', String(Number(payload && payload.actualRentOverride || 0)));
    upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'vacant_amount', String(Number(payload && payload.vacantAmount || 0)));
    upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'notes', String(payload && payload.notes || '').trim());
    upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'prepaid_next', String(Number(payload && payload.prepaidAmount || 0)));
    upsertTenantMonthOverride(database, sourceTenantId, monthKey, 'old_tenant_due_paid', String(Number(payload && payload.oldTenantDuePaid || 0)));
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_building_inline_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function vacateTenantInDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  const vacateDate = String(payload && payload.vacateDate || '').trim();
  if (!sourceTenantId || !vacateDate) {
    throw new Error('sourceTenantId and vacateDate are required.');
  }
  const database = openDatabase(databasePath);
  try {
    const tenancy = database.prepare(`
      SELECT id, unit_id AS unitId, tenant_name AS tenantName
      FROM tenancies
      WHERE source_tenant_id = ?
      LIMIT 1
    `).get(sourceTenantId);
    if (!tenancy) {
      throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    }
    database.exec('BEGIN');
    database.prepare(`
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
    database.prepare(`
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
      tenancy.unitId,
      vacateDate,
      String(payload && payload.lastTenantName || tenancy.tenantName || '').trim(),
      Number(payload && payload.lastContractRent || 0),
      Number(payload && payload.lastActualRent || 0),
      Number(payload && payload.lastDiscount || 0),
      String(payload && payload.vacancyNotes || '').trim(),
      JSON.stringify(payload || {})
    );
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_vacate_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function createTenantInDatabase(payload) {
  const buildingName = String(payload && payload.buildingName || '').trim();
  const unit = String(payload && payload.unit || '').trim();
  const floor = String(payload && payload.floor || '').trim();
  const existingProfileId = String(payload && payload.existingProfileId || '').trim();
  const tenantName = String(payload && payload.name || '').trim();
  const phone = String(payload && payload.phone || '').trim();
  const civilId = String(payload && payload.civilId || '').trim();
  const contractStart = String(payload && payload.contractStart || '').trim();
  const contractEnd = String(payload && payload.contractEnd || '').trim();
  if (!buildingName || !unit || !tenantName || !contractStart || !contractEnd) {
    throw new Error('buildingName, unit, name, contractStart, and contractEnd are required.');
  }
  const database = openDatabase(databasePath);
  try {
    const building = database.prepare(`
      SELECT id
      FROM buildings
      WHERE name = ?
      LIMIT 1
    `).get(buildingName);
    if (!building) {
      throw new Error(`Unknown building: ${buildingName}`);
    }
    const unitKey = `${String(floor || '').trim().toUpperCase()}::${String(unit || '').trim().toUpperCase()}`;
    const unitRecord = database.prepare(`
      SELECT id
      FROM units
      WHERE building_id = ? AND unit_key = ?
      LIMIT 1
    `).get(building.id, unitKey);
    if (!unitRecord) {
      throw new Error(`No unit found for ${buildingName} ${unit}`);
    }
    const duplicateMatches = findMatchingTenantProfile(database, {
      tenantName,
      phone,
      civilId
    });
    if (duplicateMatches.length) {
      const allowedReturn = existingProfileId
        && duplicateMatches.every((item) => String(item && item.profile && item.profile.id || '').trim() === existingProfileId);
      if (!allowedReturn) {
      const duplicateReasons = duplicateMatches.map((item) => String(item && item.matchedBy || '').trim()).filter(Boolean).join(', ');
      throw new Error(`Tenant already exists in history. Match found by ${duplicateReasons}.`);
      }
    }
    if (existingProfileId) {
      const existingProfile = database.prepare(`
        SELECT id
        FROM tenant_profiles
        WHERE id = ?
        LIMIT 1
      `).get(existingProfileId);
      if (!existingProfile) {
        throw new Error(`Saved tenant profile not found for ${existingProfileId}`);
      }
    }
    const resolvedProfileId = existingProfileId || upsertTenantProfile(database, {
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
    database.exec('BEGIN');
    database.prepare(`
      DELETE FROM unit_vacancy_state
      WHERE unit_id = ?
    `).run(unitRecord.id);
    database.prepare(`
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
      database.prepare(`
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
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_tenant_create_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
}

function repairTenantProfilesInDatabase() {
  const database = openDatabase(databasePath);
  try {
    database.exec('BEGIN');
    const repaired = repairMissingTenancyProfiles(database);
    if (repaired > 0) {
      database.exec(`
        INSERT INTO app_meta(key, value)
        VALUES ('last_tenant_profile_repair_at', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      `);
    }
    database.exec('COMMIT');
    return repaired;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    database.close();
  }
}

function undoVacateTenantInDatabase(payload) {
  const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
  if (!sourceTenantId) {
    throw new Error('sourceTenantId is required.');
  }
  const database = openDatabase(databasePath);
  try {
    const tenancy = database.prepare(`
      SELECT unit_id AS unitId
      FROM tenancies
      WHERE source_tenant_id = ?
      LIMIT 1
    `).get(sourceTenantId);
    if (!tenancy) {
      throw new Error(`No tenancy found for sourceTenantId ${sourceTenantId}`);
    }
    database.exec('BEGIN');
    database.prepare(`
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
    database.prepare(`
      DELETE FROM unit_vacancy_state
      WHERE unit_id = ?
    `).run(tenancy.unitId);
    database.exec(`
      INSERT INTO app_meta(key, value)
      VALUES ('last_undo_vacate_sync_at', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    database.close();
  }
  return exportSnapshotToBrowserFile();
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
      repairTenantProfilesInDatabase();
      const snapshot = readDatabaseSnapshot(databasePath);
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
      const snapshot = restoreDatabaseFromUpload(body);
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
      const snapshot = exportSnapshotToBrowserFile();
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

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/state-extras') {
    try {
      const body = await readJsonBody(request);
      const snapshot = syncStateExtrasToDatabase(body);
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
      const snapshot = saveUnitRowOrderToDatabase(body.buildingName, body.monthKey, body.orderedIds);
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
      const snapshot = savePlannedVacateToDatabase(body.sourceTenantId, body.plannedVacateDate);
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
      const snapshot = saveTenantProfileToDatabase(body);
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
      const snapshot = saveUnitIdentityToDatabase(body);
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
      const snapshot = vacateTenantInDatabase(body);
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
      const snapshot = saveBuildingInlineEditToDatabase(body);
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
      const snapshot = createTenantInDatabase(body);
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

  if (request.method === 'POST' && requestUrl.pathname === '/api/db/undo-vacate') {
    try {
      const body = await readJsonBody(request);
      const snapshot = undoVacateTenantInDatabase(body);
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
prepareDatabase(databasePath, schemaPath);

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
