import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySchema, ensureTenantHistorySchema, getDefaultDatabasePath, openDatabase, resetTables } from './lib/database.mjs';

function usage() {
  console.error('Usage: node scripts/import-state-json-to-db.mjs <state-json-path> [db-path]');
  process.exit(1);
}

function normalizeFloor(value) {
  return String(value || '').trim();
}

function unitKeyFor(tenant) {
  return `${normalizeFloor(tenant.floor).toUpperCase()}::${String(tenant.unit || '').trim().toUpperCase()}`;
}

function overrideEntries(bucket, kind) {
  if (!bucket || typeof bucket !== 'object') return [];
  const rows = [];
  Object.entries(bucket).forEach(([tenantId, monthBucket]) => {
    if (!monthBucket || typeof monthBucket !== 'object') return;
    Object.entries(monthBucket).forEach(([monthKey, value]) => {
      rows.push({
        sourceTenantId: String(tenantId || '').trim(),
        monthKey: String(monthKey || '').trim(),
        overrideKind: kind,
        valueText: typeof value === 'string' ? value : JSON.stringify(value)
      });
    });
  });
  return rows;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(projectRoot, 'db', 'schema.sql');
const statePath = process.argv[2];
const databasePath = process.argv[3]
  ? path.resolve(projectRoot, process.argv[3])
  : getDefaultDatabasePath(projectRoot);

if (!statePath) usage();

const raw = fs.readFileSync(path.resolve(projectRoot, statePath), 'utf8');
const state = JSON.parse(raw);
if (!state || !Array.isArray(state.tenants) || !Array.isArray(state.buildings)) {
  throw new Error('Invalid app state JSON.');
}

async function main() {
  const database = await openDatabase(databasePath);
  await applySchema(database, schemaPath, databasePath);
  await resetTables(database);

const insertBuilding = database.prepare(`
  INSERT INTO buildings (id, name, area, total_units, source_kind)
  VALUES (?, ?, ?, ?, 'state-import')
`);
const insertUnit = database.prepare(`
  INSERT INTO units (id, building_id, unit_label, floor_label, unit_key, template_position, active_row_position, status_hint)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertTenancy = database.prepare(`
  INSERT INTO tenancies (
    id, unit_id, source_tenant_id, tenant_name, phone, civil_id, nationality, move_in_date,
    contract_start, contract_end, contract_rent, discount, actual_rent, previous_due,
    prepaid_next_month, insurance_amount, insurance_paid_month, due_day, planned_vacate_date,
    archived_on, is_active, is_archived, notes, raw_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertVacancy = database.prepare(`
  INSERT INTO unit_vacancy_state (
    unit_id, is_vacant, vacant_since, last_tenant_name, last_contract_rent,
    last_actual_rent, last_discount, old_tenant_due_paid, notes, raw_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPayment = database.prepare(`
  INSERT INTO payments (id, tenancy_id, source_tenant_id, amount, paid_on, rent_month, method, note, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertOverride = database.prepare(`
  INSERT INTO tenant_month_overrides (tenancy_id, source_tenant_id, month_key, override_kind, value_text)
  VALUES (?, ?, ?, ?, ?)
`);
const insertRowOrder = database.prepare(`
  INSERT INTO unit_row_order (building_id, month_key, position, order_key, unit_id)
  VALUES (?, ?, ?, ?, ?)
`);
const insertActivity = database.prepare(`
  INSERT INTO activity_log (id, happened_at, actor, action, detail, raw_json)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const buildingIdByName = new Map();
for (const [index, building] of state.buildings.entries()) {
  const id = String(building.id || `building-${index + 1}`).trim();
  const name = String(building.name || '').trim();
  if (!name) continue;
  buildingIdByName.set(name, id);
  await insertBuilding.run(
    id,
    name,
    String(building.area || '').trim(),
    Number(building.totalUnits || 0)
  );
}

const unitIdByCompositeKey = new Map();
const unitSeedPositionByBuilding = new Map();
for (const tenant of state.tenants) {
  const buildingName = String(tenant.building || '').trim();
  const buildingId = buildingIdByName.get(buildingName);
  if (!buildingId) continue;
  const unitKey = unitKeyFor(tenant);
  if (!unitKey || !String(tenant.unit || '').trim()) continue;
  const compositeKey = `${buildingId}::${unitKey}`;
  if (unitIdByCompositeKey.has(compositeKey)) continue;
  const nextPosition = unitSeedPositionByBuilding.get(buildingId) || 0;
  const unitId = `unit-${buildingId}-${nextPosition + 1}`;
  unitIdByCompositeKey.set(compositeKey, unitId);
  unitSeedPositionByBuilding.set(buildingId, nextPosition + 1);
  await insertUnit.run(
    unitId,
    buildingId,
    String(tenant.unit || '').trim(),
    normalizeFloor(tenant.floor),
    unitKey,
    Number(tenant.seedOrder ?? nextPosition),
    Number(tenant.seedOrder ?? nextPosition),
    tenant.isVacant ? 'vacant' : (tenant.isArchived ? 'archived' : 'occupied')
  );
}

const tenancyIdBySourceTenantId = new Map();
for (const [index, tenant] of state.tenants.entries()) {
  const buildingName = String(tenant.building || '').trim();
  const buildingId = buildingIdByName.get(buildingName);
  if (!buildingId) continue;
  const compositeKey = `${buildingId}::${unitKeyFor(tenant)}`;
  const unitId = unitIdByCompositeKey.get(compositeKey);
  if (!unitId) continue;
  const sourceTenantId = String(tenant.id || '').trim();

  if (tenant.isVacant) {
    await insertVacancy.run(
      unitId,
      1,
      String(tenant.vacatedOn || '').trim(),
      '',
      Number(tenant.lastContractRent || 0),
      Number(tenant.lastActualRent || 0),
      Number(tenant.discount || 0),
      0,
      String(tenant.notes || '').trim(),
      JSON.stringify(tenant)
    );
    continue;
  }

  const tenancyId = `tenancy-${index + 1}`;
  tenancyIdBySourceTenantId.set(sourceTenantId, tenancyId);
  await insertTenancy.run(
    tenancyId,
    unitId,
    sourceTenantId,
    String(tenant.name || '').trim(),
    String(tenant.phone || '').trim(),
    String(tenant.civilId || '').trim(),
    String(tenant.nationality || 'Not set').trim(),
    String(tenant.moveInDate || '').trim(),
    String(tenant.contractStart || '').trim(),
    String(tenant.contractEnd || '').trim(),
    Number(tenant.contractRent || 0),
    Number(tenant.discount || 0),
    Number(tenant.actualRent || 0),
    Number(tenant.previousDue || 0),
    Number(tenant.prepaidNextMonth || 0),
    Number(tenant.insuranceAmount || 0),
    String(tenant.insurancePaidMonth || '').trim(),
    Number(tenant.dueDay || 20),
    String(tenant.plannedVacateDate || '').trim(),
    String(tenant.archivedOn || '').trim(),
    tenant.isArchived ? 0 : 1,
    tenant.isArchived ? 1 : 0,
    String(tenant.notes || '').trim(),
    JSON.stringify(tenant)
  );
}

for (const payment of (state.payments || [])) {
  const sourceTenantId = String(payment.tenantId || '').trim();
  await insertPayment.run(
    String(payment.id || '').trim(),
    tenancyIdBySourceTenantId.get(sourceTenantId) || null,
    sourceTenantId,
    Number(payment.amount || 0),
    String(payment.date || '').trim(),
    String(payment.rentMonth || '').trim(),
    String(payment.method || '').trim(),
    String(payment.note || '').trim(),
    JSON.stringify(payment)
  );
}

for (const entry of [
  ...overrideEntries(state.actualRentOverrides, 'actual_rent'),
  ...overrideEntries(state.paidOverrides, 'paid'),
  ...overrideEntries(state.carryOverrides, 'carry'),
  ...overrideEntries(state.notesOverrides, 'notes'),
  ...overrideEntries(state.tenantIdentityOverrides, 'identity')
]) {
  await insertOverride.run(
    tenancyIdBySourceTenantId.get(entry.sourceTenantId) || null,
    entry.sourceTenantId,
    entry.monthKey,
    entry.overrideKind,
    entry.valueText
  );
}

for (const [buildingName, monthBucket] of Object.entries(state.tenantOrderOverrides || {})) {
  const buildingId = buildingIdByName.get(String(buildingName || '').trim());
  if (!buildingId || !monthBucket || typeof monthBucket !== 'object') continue;
  for (const [monthKey, orderedIds] of Object.entries(monthBucket)) {
    if (!Array.isArray(orderedIds)) continue;
    for (const [index, orderKey] of orderedIds.entries()) {
      await insertRowOrder.run(
        buildingId,
        String(monthKey || '').trim(),
        index,
        String(orderKey || '').trim(),
        null
      );
    }
  }
}

for (const item of (state.activity || [])) {
  await insertActivity.run(
    String(item.id || '').trim() || `activity-${Date.now()}`,
    String(item.when || '').trim(),
    String(item.actor || '').trim(),
    String(item.action || '').trim(),
    String(item.detail || '').trim(),
    JSON.stringify(item)
  );
}

await database.exec(`
  INSERT INTO app_meta(key, value) VALUES ('last_state_import_at', CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`);
await ensureTenantHistorySchema(database);
await database.close();

console.log(`Imported app state into ${databasePath}`);
}

await main();
