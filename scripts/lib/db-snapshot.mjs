import { DatabaseSync } from 'node:sqlite';

export function readDatabaseSnapshot(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });

  const buildings = db.prepare(`
    SELECT id, name, area, total_units AS totalUnits, source_kind AS sourceKind
    FROM buildings
    ORDER BY area, name
  `).all();

  const units = db.prepare(`
    SELECT
      u.id,
      u.building_id AS buildingId,
      b.name AS buildingName,
      u.unit_label AS unit,
      u.floor_label AS floor,
      u.unit_key AS unitKey,
      u.template_position AS templatePosition,
      u.active_row_position AS activeRowPosition,
      u.status_hint AS statusHint
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    ORDER BY b.name, COALESCE(u.active_row_position, u.template_position), u.template_position, u.unit_label
  `).all();

  const activeTenancies = db.prepare(`
    SELECT
      t.id,
      t.profile_id AS profileId,
      t.unit_id AS unitId,
      t.source_tenant_id AS sourceTenantId,
      t.tenant_name AS tenantName,
      t.phone,
      t.civil_id AS civilId,
      t.nationality,
      t.move_in_date AS moveInDate,
      t.contract_start AS contractStart,
      t.contract_end AS contractEnd,
      t.contract_rent AS contractRent,
      t.discount,
      t.actual_rent AS actualRent,
      t.previous_due AS previousDue,
      t.prepaid_next_month AS prepaidNextMonth,
      t.insurance_amount AS insuranceAmount,
      t.insurance_paid_month AS insurancePaidMonth,
      t.due_day AS dueDay,
      t.planned_vacate_date AS plannedVacateDate,
      t.notes,
      t.is_active AS isActive,
      t.is_archived AS isArchived
    FROM tenancies t
    WHERE t.is_active = 1
    ORDER BY t.unit_id
  `).all();

  const tenantProfiles = db.prepare(`
    SELECT
      id,
      full_name AS fullName,
      civil_id AS civilId,
      phone,
      nationality,
      created_at AS createdAt,
      updated_at AS updatedAt,
      last_seen_at AS lastSeenAt
    FROM tenant_profiles
    ORDER BY full_name, created_at
  `).all();

  const tenancyHistory = db.prepare(`
    SELECT
      t.id,
      t.profile_id AS profileId,
      t.unit_id AS unitId,
      u.unit_label AS unit,
      u.floor_label AS floor,
      b.id AS buildingId,
      b.name AS buildingName,
      t.source_tenant_id AS sourceTenantId,
      t.tenant_name AS tenantName,
      t.phone,
      t.civil_id AS civilId,
      t.nationality,
      t.move_in_date AS moveInDate,
      t.contract_start AS contractStart,
      t.contract_end AS contractEnd,
      t.contract_rent AS contractRent,
      t.discount,
      t.actual_rent AS actualRent,
      t.previous_due AS previousDue,
      t.prepaid_next_month AS prepaidNextMonth,
      t.insurance_amount AS insuranceAmount,
      t.insurance_paid_month AS insurancePaidMonth,
      t.due_day AS dueDay,
      t.planned_vacate_date AS plannedVacateDate,
      t.archived_on AS archivedOn,
      t.is_active AS isActive,
      t.is_archived AS isArchived,
      t.notes,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt
    FROM tenancies t
    JOIN units u ON u.id = t.unit_id
    JOIN buildings b ON b.id = u.building_id
    ORDER BY COALESCE(t.profile_id, t.source_tenant_id, t.id), t.created_at DESC, t.id DESC
  `).all();

  const vacancyStates = db.prepare(`
    SELECT
      unit_id AS unitId,
      is_vacant AS isVacant,
      vacant_since AS vacantSince,
      last_tenant_name AS lastTenantName,
      last_contract_rent AS lastContractRent,
      last_actual_rent AS lastActualRent,
      last_discount AS lastDiscount,
      old_tenant_due_paid AS oldTenantDuePaid,
      notes
    FROM unit_vacancy_state
    ORDER BY unit_id
  `).all();

  const rowOrder = db.prepare(`
    SELECT
      building_id AS buildingId,
      month_key AS monthKey,
      position,
      order_key AS orderKey,
      unit_id AS unitId
    FROM unit_row_order
    ORDER BY building_id, month_key, position
  `).all();

  const tenantMonthOverrides = db.prepare(`
    SELECT
      source_tenant_id AS sourceTenantId,
      month_key AS monthKey,
      override_kind AS overrideKind,
      value_text AS valueText
    FROM tenant_month_overrides
    ORDER BY source_tenant_id, month_key, override_kind
  `).all();

  const tenantMonthState = db.prepare(`
    SELECT
      source_tenant_id AS sourceTenantId,
      month_key AS monthKey,
      MAX(CASE WHEN override_kind = 'paid' THEN value_text END) AS paid,
      MAX(CASE WHEN override_kind = 'carry' THEN value_text END) AS carry,
      MAX(CASE WHEN override_kind = 'actual_rent' THEN value_text END) AS actualRent,
      MAX(CASE WHEN override_kind = 'vacant_amount' THEN value_text END) AS vacantAmount,
      MAX(CASE WHEN override_kind = 'notes' THEN value_text END) AS notes,
      MAX(CASE WHEN override_kind = 'prepaid_next' THEN value_text END) AS prepaidNext,
      MAX(CASE WHEN override_kind = 'opening_credit' THEN value_text END) AS openingCredit,
      MAX(CASE WHEN override_kind = 'old_tenant_due_paid' THEN value_text END) AS oldTenantDuePaid
    FROM tenant_month_overrides
    GROUP BY source_tenant_id, month_key
    ORDER BY source_tenant_id, month_key
  `).all();

  const payments = db.prepare(`
    SELECT
      id,
      tenancy_id AS tenancyId,
      source_tenant_id AS tenantId,
      amount,
      paid_on AS date,
      rent_month AS rentMonth,
      method,
      note,
      created_at AS createdAt
    FROM payments
    ORDER BY COALESCE(paid_on, ''), created_at, id
  `).all();

  const activity = db.prepare(`
    SELECT
      id,
      happened_at AS "when",
      actor,
      action,
      detail
    FROM activity_log
    ORDER BY happened_at DESC, id DESC
  `).all();

  db.close();

  return {
    generatedAt: new Date().toISOString(),
    databasePath,
    counts: {
      buildings: buildings.length,
      units: units.length,
      activeTenancies: activeTenancies.length,
      vacancyStates: vacancyStates.length,
      rowOrder: rowOrder.length,
      tenantMonthOverrides: tenantMonthOverrides.length,
      tenantMonthState: tenantMonthState.length,
      tenantProfiles: tenantProfiles.length,
      tenancyHistory: tenancyHistory.length,
      payments: payments.length,
      activity: activity.length
    },
    buildings,
    units,
    activeTenancies,
    tenantProfiles,
    tenancyHistory,
    vacancyStates,
    rowOrder,
    tenantMonthOverrides,
    tenantMonthState,
    payments,
    activity
  };
}

export function buildBrowserSnapshotScript(snapshot) {
  return `// Generated by scripts/export-db-snapshot.mjs
(function () {
  window.__TATRA_DB_SNAPSHOT__ = ${JSON.stringify(snapshot, null, 2)};
})();
`;
}
