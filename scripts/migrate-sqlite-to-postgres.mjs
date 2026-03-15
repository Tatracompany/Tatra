import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getDefaultDatabasePath, openDatabase, prepareDatabase, resetTables } from './lib/database.mjs';

function usage() {
  console.error('Usage: node scripts/migrate-sqlite-to-postgres.mjs [sqlite-path]');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const sqlitePath = process.argv[2]
  ? path.resolve(projectRoot, process.argv[2])
  : path.join(projectRoot, 'db', 'tatra.sqlite');
const postgresTarget = getDefaultDatabasePath(projectRoot);
const schemaPath = path.join(projectRoot, 'db', 'schema.sql');

if (!/^postgres(ql)?:\/\//i.test(String(postgresTarget || '').trim())) {
  usage();
}

function all(sqlText) {
  return sqliteDb.prepare(sqlText).all();
}

const sqliteDb = new DatabaseSync(sqlitePath, { readOnly: true });

async function main() {
  const pgDb = openDatabase(postgresTarget);
  try {
    await prepareDatabase(postgresTarget, schemaPath);
    await resetTables(pgDb);

    const insertMeta = pgDb.prepare(`
      INSERT INTO app_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);
    for (const row of all(`SELECT key, value FROM app_meta`)) {
      await insertMeta.run(row.key, row.value);
    }

    const insertBuilding = pgDb.prepare(`
      INSERT INTO buildings (id, name, area, total_units, source_kind, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, name, area, total_units, source_kind, created_at, updated_at FROM buildings`)) {
      await insertBuilding.run(row.id, row.name, row.area, row.total_units, row.source_kind, row.created_at, row.updated_at);
    }

    const insertUnit = pgDb.prepare(`
      INSERT INTO units (
        id, building_id, unit_label, floor_label, unit_key, template_position,
        active_row_position, status_hint, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, building_id, unit_label, floor_label, unit_key, template_position, active_row_position, status_hint, created_at, updated_at FROM units`)) {
      await insertUnit.run(
        row.id, row.building_id, row.unit_label, row.floor_label, row.unit_key,
        row.template_position, row.active_row_position, row.status_hint, row.created_at, row.updated_at
      );
    }

    const insertProfile = pgDb.prepare(`
      INSERT INTO tenant_profiles (
        id, full_name, civil_id, phone, nationality, normalized_name, normalized_phone,
        created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, full_name, civil_id, phone, nationality, normalized_name, normalized_phone, created_at, updated_at, last_seen_at FROM tenant_profiles`)) {
      await insertProfile.run(
        row.id, row.full_name, row.civil_id, row.phone, row.nationality,
        row.normalized_name, row.normalized_phone, row.created_at, row.updated_at, row.last_seen_at
      );
    }

    const insertTenancy = pgDb.prepare(`
      INSERT INTO tenancies (
        id, profile_id, unit_id, source_tenant_id, tenant_name, phone, civil_id, nationality,
        move_in_date, contract_start, contract_end, contract_rent, discount, actual_rent,
        previous_due, prepaid_next_month, insurance_amount, insurance_paid_month, due_day,
        planned_vacate_date, archived_on, is_active, is_archived, notes, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, profile_id, unit_id, source_tenant_id, tenant_name, phone, civil_id, nationality, move_in_date, contract_start, contract_end, contract_rent, discount, actual_rent, previous_due, prepaid_next_month, insurance_amount, insurance_paid_month, due_day, planned_vacate_date, archived_on, is_active, is_archived, notes, raw_json, created_at, updated_at FROM tenancies`)) {
      await insertTenancy.run(
        row.id, row.profile_id, row.unit_id, row.source_tenant_id, row.tenant_name, row.phone, row.civil_id, row.nationality,
        row.move_in_date, row.contract_start, row.contract_end, row.contract_rent, row.discount, row.actual_rent,
        row.previous_due, row.prepaid_next_month, row.insurance_amount, row.insurance_paid_month, row.due_day,
        row.planned_vacate_date, row.archived_on, row.is_active, row.is_archived, row.notes, row.raw_json, row.created_at, row.updated_at
      );
    }

    const insertVacancy = pgDb.prepare(`
      INSERT INTO unit_vacancy_state (
        unit_id, is_vacant, vacant_since, last_tenant_name, last_contract_rent,
        last_actual_rent, last_discount, old_tenant_due_paid, notes, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT unit_id, is_vacant, vacant_since, last_tenant_name, last_contract_rent, last_actual_rent, last_discount, old_tenant_due_paid, notes, raw_json, updated_at FROM unit_vacancy_state`)) {
      await insertVacancy.run(
        row.unit_id, row.is_vacant, row.vacant_since, row.last_tenant_name, row.last_contract_rent,
        row.last_actual_rent, row.last_discount, row.old_tenant_due_paid, row.notes, row.raw_json, row.updated_at
      );
    }

    const insertPayment = pgDb.prepare(`
      INSERT INTO payments (
        id, tenancy_id, source_tenant_id, amount, paid_on, rent_month, method, note, raw_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, tenancy_id, source_tenant_id, amount, paid_on, rent_month, method, note, raw_json, created_at FROM payments`)) {
      await insertPayment.run(
        row.id, row.tenancy_id, row.source_tenant_id, row.amount, row.paid_on,
        row.rent_month, row.method, row.note, row.raw_json, row.created_at
      );
    }

    const insertOverride = pgDb.prepare(`
      INSERT INTO tenant_month_overrides (
        id, tenancy_id, source_tenant_id, month_key, override_kind, value_text, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, tenancy_id, source_tenant_id, month_key, override_kind, value_text, created_at FROM tenant_month_overrides`)) {
      await insertOverride.run(
        row.id, row.tenancy_id, row.source_tenant_id, row.month_key, row.override_kind, row.value_text, row.created_at
      );
    }

    const insertOrder = pgDb.prepare(`
      INSERT INTO unit_row_order (
        id, building_id, month_key, position, order_key, unit_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, building_id, month_key, position, order_key, unit_id, created_at FROM unit_row_order`)) {
      await insertOrder.run(
        row.id, row.building_id, row.month_key, row.position, row.order_key, row.unit_id, row.created_at
      );
    }

    const insertActivity = pgDb.prepare(`
      INSERT INTO activity_log (id, happened_at, actor, action, detail, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const row of all(`SELECT id, happened_at, actor, action, detail, raw_json FROM activity_log`)) {
      await insertActivity.run(row.id, row.happened_at, row.actor, row.action, row.detail, row.raw_json);
    }

    console.log(`Migrated SQLite ${sqlitePath} into Postgres ${postgresTarget}`);
  } finally {
    sqliteDb.close();
    await pgDb.close();
  }
}

await main();
