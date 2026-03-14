(function () {
  'use strict';

  const STORAGE_KEY = 'landlord-ledger-state-v16';
  const CURRENT_USER_KEY = 'landlord-ledger-current-user';
  const AUTH_KEY = 'landlord-ledger-auth';
  const AUTH_ROLE_KEY = 'landlord-ledger-auth-role';
  const ACCOUNTS_KEY = 'landlord-ledger-accounts';
  const BUILDING_VIEW_KEY = 'landlord-ledger-building-view';
  const TENANT_VIEW_KEY = 'landlord-ledger-tenant-view';
  const ACTIVE_MONTH_KEY = 'landlord-ledger-active-month';
  const CONTRACT_WARNING_DAYS = 90;
  const BASELINE_BANK_RULES = Object.freeze({});
  const ADMIN_USERNAME = 'yousef';
  const ADMIN_PASSWORD = '145236';
  const HAWALI_BUILDING_TEMPLATES = Array.isArray(window.__hawaliSeedImports) ? window.__hawaliSeedImports : [];
  const SALMIYA_BUILDING_TEMPLATES = Array.isArray(window.__salmiyaSeedImports) ? window.__salmiyaSeedImports : [];
  const EXTRA_BUILDING_TEMPLATES = Array.isArray(window.__extraSeedImports) ? window.__extraSeedImports : [];
  let DB_SNAPSHOT = window.__TATRA_DB_SNAPSHOT__ && typeof window.__TATRA_DB_SNAPSHOT__ === 'object'
    ? window.__TATRA_DB_SNAPSHOT__
    : null;
  const REMOVED_BUILDING_IDS = new Set(['hawali-161-06']);
  const REMOVED_BUILDING_NAMES = new Set(['حولي 161-06']);
  const COMBINED_TEMPLATE_AREA_LABEL = 'fahaheel / shwehik / mahbola';
  const COMBINED_TEMPLATE_AREA_NAMES = new Set(['fahaheel', 'shwehik', 'mahbola']);
  function isRemovedBuilding(candidate) {
    if (!candidate) return false;
    const id = String(candidate.id || '').trim();
    const name = String(candidate.name || '').trim();
    return REMOVED_BUILDING_IDS.has(id) || REMOVED_BUILDING_NAMES.has(name);
  }
  function getExtraHawaliBuilding(id, fallbackName, fallbackTotalUnits) {
    const match = HAWALI_BUILDING_TEMPLATES.find((item) => item.id === id);
    if (!match) return { id, name: fallbackName, area: 'Hawalli', totalUnits: fallbackTotalUnits };
    return { id: match.id, name: match.name, area: 'Hawalli', totalUnits: Number(match.totalUnits || fallbackTotalUnits || 0) };
  }
  function getExtraSalmiyaBuilding(id, fallbackName, fallbackTotalUnits) {
    const match = SALMIYA_BUILDING_TEMPLATES.find((item) => item.id === id);
    if (!match) return { id, name: fallbackName, area: 'Salmiya', totalUnits: fallbackTotalUnits };
    return { id: match.id, name: match.name, area: 'Salmiya', totalUnits: Number(match.totalUnits || fallbackTotalUnits || 0) };
  }
  function normalizeTemplateAreaLabel(area) {
    const normalizedArea = String(area || '').trim();
    if (!normalizedArea) return '';
    if (COMBINED_TEMPLATE_AREA_NAMES.has(normalizedArea.toLowerCase())) return COMBINED_TEMPLATE_AREA_LABEL;
    return normalizedArea;
  }
  function getExtraTemplateBuilding(item) {
    const id = String(item && item.id || '').trim();
    const name = String(item && item.name || id).trim();
    const area = normalizeTemplateAreaLabel(item && item.area || name);
    const totalUnits = Number(item && item.totalUnits || 0);
    if (!id || !name || !area) return null;
    return { id, name, area, totalUnits };
  }
  const STATIC_BUILDINGS = [
    { id: 'salwa-247', name: 'سلوى 247', area: 'Salwa', totalUnits: 21 },
    { id: 'salwa-249', name: 'سلوى 249', area: 'Salwa', totalUnits: 23 },
    { id: 'salwa-165', name: 'سلوى 165', area: 'Salwa', totalUnits: 26 },
    getExtraSalmiyaBuilding('salmiya-26-2', 'السالمية 26-2', 36),
    getExtraSalmiyaBuilding('salmiya-28', 'السالمية 28', 53),
    getExtraSalmiyaBuilding('salmiya-102-14', 'السالمية 102-14 شمس الدين', 39),
    getExtraSalmiyaBuilding('salmiya-103-5', 'السالمية 103-5 السهلى', 31),
    getExtraSalmiyaBuilding('salmiya-201-11', 'السالمية 201-11', 44),
    getExtraHawaliBuilding('hawali-85-8-7', 'حولي 85 8+7', 26),
    getExtraHawaliBuilding('hawali-85-3-2', 'حولي 85 3+2', 27),
    { id: 'hawally-16-46', name: 'حولي 16-46', area: 'Hawalli', totalUnits: 33 },
    getExtraHawaliBuilding('hawali-174-15', 'حولي 174-15', 30),
    getExtraHawaliBuilding('hawali-175', 'حولي 175', 32),
    getExtraHawaliBuilding('hawali-161-05', 'حولي 161-05', 43),
    { id: 'hawali-06-161', name: 'حولي 06-161', area: 'Hawalli', totalUnits: 43 },
    getExtraHawaliBuilding('hawali-161-06', 'حولي 161-06', 43),
  getExtraHawaliBuilding('hawali-36-2', 'حولي 36-2', 55)
  ].filter((building) => building && !isRemovedBuilding(building));
  let BUILDINGS = getDbSnapshotBuildings().length
    ? getDbSnapshotBuildings()
    : STATIC_BUILDINGS.concat(
      EXTRA_BUILDING_TEMPLATES
        .map((item) => getExtraTemplateBuilding(item))
        .filter((item) => !!item)
        .filter((item) => !isRemovedBuilding(item))
        .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
    );
  const { FLOOR_ORDER, STATUS_META, NATIONALITY_OPTIONS, FLOOR_OPTIONS } = window.__LANDLORD_APP_CONFIG__ || {};
  if (!FLOOR_ORDER || !STATUS_META || !NATIONALITY_OPTIONS || !FLOOR_OPTIONS) {
    throw new Error('Missing app config module');
  }
  let memoryState = null;
  let renderCache = createRenderCache();

  function createRenderCache() {
    return {
      templateOrderMaps: new Map(),
      tenantViews: new Map(),
      buildingSummaries: new Map(),
      areaSummaries: new Map(),
      duePaid: new Map()
    };
  }

  function resetRenderCache() {
    renderCache = createRenderCache();
  }

  function hasDbSnapshot() {
    return !!(
      DB_SNAPSHOT
      && Array.isArray(DB_SNAPSHOT.buildings)
      && Array.isArray(DB_SNAPSHOT.units)
    );
  }

  function getDbSnapshot() {
    return hasDbSnapshot() ? DB_SNAPSHOT : null;
  }

  function getDbApiUrl(pathname) {
    const normalizedPath = String(pathname || '').trim();
    if (!normalizedPath) return '/';
    return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  }

  async function refreshDbSnapshotFromServer() {
    if (typeof fetch !== 'function') return getDbSnapshot();
    try {
      const response = await fetch(getDbApiUrl('/api/db/snapshot'), {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store'
      });
      if (!response.ok) return getDbSnapshot();
      const snapshot = await response.json();
      if (!snapshot || !Array.isArray(snapshot.buildings) || !Array.isArray(snapshot.units)) {
        return getDbSnapshot();
      }
      const existingSnapshot = getDbSnapshot() || {};
      const mergedSnapshot = Object.assign({}, existingSnapshot, snapshot, {
        buildings: Array.isArray(snapshot.buildings) ? snapshot.buildings : (existingSnapshot.buildings || []),
        units: Array.isArray(snapshot.units) ? snapshot.units : (existingSnapshot.units || []),
        activeTenancies: Array.isArray(snapshot.activeTenancies) ? snapshot.activeTenancies : (existingSnapshot.activeTenancies || []),
        tenantProfiles: Array.isArray(snapshot.tenantProfiles) ? snapshot.tenantProfiles : (existingSnapshot.tenantProfiles || []),
        tenancyHistory: Array.isArray(snapshot.tenancyHistory) ? snapshot.tenancyHistory : (existingSnapshot.tenancyHistory || []),
        vacancyStates: Array.isArray(snapshot.vacancyStates) ? snapshot.vacancyStates : (existingSnapshot.vacancyStates || []),
        rowOrder: Array.isArray(snapshot.rowOrder) ? snapshot.rowOrder : (existingSnapshot.rowOrder || []),
        payments: Array.isArray(snapshot.payments) ? snapshot.payments : (existingSnapshot.payments || []),
        activity: Array.isArray(snapshot.activity) ? snapshot.activity : (existingSnapshot.activity || [])
      });
      DB_SNAPSHOT = mergedSnapshot;
      window.__TATRA_DB_SNAPSHOT__ = mergedSnapshot;
      const snapshotBuildings = getDbSnapshotBuildings();
      if (snapshotBuildings.length) {
        BUILDINGS = snapshotBuildings;
      }
      resetRenderCache();
      return mergedSnapshot;
    } catch (_error) {
      return getDbSnapshot();
    }
  }

  function getDbSnapshotBuildings() {
    const snapshot = getDbSnapshot();
    if (!snapshot || !Array.isArray(snapshot.buildings)) return [];
    return snapshot.buildings
      .map((building) => ({
        id: String(building && building.id || '').trim(),
        name: String(building && building.name || '').trim(),
        area: String(building && building.area || '').trim(),
        totalUnits: Number(building && building.totalUnits || 0)
      }))
      .filter((building) => building.id && building.name && building.area)
      .filter((building) => !isRemovedBuilding(building));
  }

  function getDbSnapshotBuildingByName(buildingName) {
    const normalizedName = String(buildingName || '').trim();
    if (!normalizedName) return null;
    return getDbSnapshotBuildings().find((building) => building.name === normalizedName) || null;
  }

  function getDbSnapshotUnitsForBuilding(buildingName) {
    const snapshot = getDbSnapshot();
    const buildingRecord = getDbSnapshotBuildingByName(buildingName);
    if (!snapshot || !buildingRecord || !Array.isArray(snapshot.units)) return [];
    return snapshot.units.filter((unit) => String(unit && unit.buildingId || '').trim() === buildingRecord.id);
  }

  function getDbSnapshotActiveTenancyForUnit(unitId) {
    const snapshot = getDbSnapshot();
    const normalizedUnitId = String(unitId || '').trim();
    if (!snapshot || !normalizedUnitId || !Array.isArray(snapshot.activeTenancies)) return null;
    return snapshot.activeTenancies.find((tenancy) => (
      String(tenancy && tenancy.unitId || '').trim() === normalizedUnitId
      && Number(tenancy && tenancy.isActive || 0) === 1
      && Number(tenancy && tenancy.isArchived || 0) !== 1
    )) || null;
  }

  function getDbSnapshotRowOrderEntries(buildingName, monthKey) {
    const snapshot = getDbSnapshot();
    const buildingRecord = getDbSnapshotBuildingByName(buildingName);
    const normalizedMonth = String(monthKey || '').trim();
    if (!snapshot || !buildingRecord || !normalizedMonth || !Array.isArray(snapshot.rowOrder)) return [];
    return snapshot.rowOrder
      .filter((entry) => (
        String(entry && entry.buildingId || '').trim() === buildingRecord.id
        && String(entry && entry.monthKey || '').trim() === normalizedMonth
      ))
      .slice()
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0));
  }

  function getDbSnapshotTenantProfiles() {
    const snapshot = getDbSnapshot();
    if (!snapshot || !Array.isArray(snapshot.tenantProfiles)) return [];
    return snapshot.tenantProfiles.slice();
  }

  function getDbSnapshotTenancyHistory() {
    const snapshot = getDbSnapshot();
    if (!snapshot || !Array.isArray(snapshot.tenancyHistory)) return [];
    return snapshot.tenancyHistory.slice();
  }

  function getDbSnapshotPayments() {
    const snapshot = getDbSnapshot();
    if (!snapshot || !Array.isArray(snapshot.payments)) return [];
    return snapshot.payments.slice();
  }

  function getDbSnapshotActivity() {
    const snapshot = getDbSnapshot();
    if (!snapshot || !Array.isArray(snapshot.activity)) return [];
    return snapshot.activity.slice();
  }

  const {
    SALWA_TENANTS = [],
    HAWALI_TENANTS = [],
    SALWA_247_TENANTS = [],
    SALWA_249_TENANTS = []
  } = window.__LANDLORD_APP_SEEDS__ || {};
