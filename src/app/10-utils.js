  function today() {
    return new Date();
  }

  function getDefaultActiveMonthKey() {
    return '2026-01';
  }

  function getPreviewMonthKey() {
    return '2026-02';
  }

  function getCreatedMonthsStorageKey() {
    return 'tatra-created-months-v2';
  }

  function getCreatedMonthKeys() {
    const minMonth = getDefaultActiveMonthKey();
    const maxMonth = getPreviewMonthKey();
    let stored = [];
    try {
      stored = JSON.parse(window.localStorage.getItem(getCreatedMonthsStorageKey()) || '[]');
    } catch (_error) {
      stored = [];
    }
    const monthKeys = new Set([minMonth]);
    if (Array.isArray(stored)) {
      stored.forEach((monthKey) => {
        const normalizedMonth = String(monthKey || '').trim();
        if (!normalizedMonth) return;
        if (compareMonthKeys(normalizedMonth, minMonth) < 0) return;
        if (compareMonthKeys(normalizedMonth, maxMonth) > 0) return;
        monthKeys.add(normalizedMonth);
      });
    }
    return Array.from(monthKeys).sort(compareMonthKeys);
  }

  function saveCreatedMonthKeys(monthKeys) {
    const normalized = Array.from(new Set((monthKeys || []).map((monthKey) => String(monthKey || '').trim()).filter(Boolean))).sort(compareMonthKeys);
    window.localStorage.setItem(getCreatedMonthsStorageKey(), JSON.stringify(normalized));
  }

  function markMonthAsCreated(monthKey) {
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth) return;
    const createdMonths = getCreatedMonthKeys();
    if (createdMonths.includes(normalizedMonth)) return;
    createdMonths.push(normalizedMonth);
    saveCreatedMonthKeys(createdMonths);
  }

  function unmarkMonthAsCreated(monthKey) {
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth || normalizedMonth === getDefaultActiveMonthKey()) return;
    const createdMonths = getCreatedMonthKeys().filter((entry) => entry !== normalizedMonth);
    saveCreatedMonthKeys(createdMonths);
  }

  function getLatestCreatedMonthKey() {
    const createdMonths = getCreatedMonthKeys();
    return createdMonths[createdMonths.length - 1] || getDefaultActiveMonthKey();
  }

  function getNextCreatableMonthKey() {
    const nextMonth = addMonths(getLatestCreatedMonthKey(), 1);
    return compareMonthKeys(nextMonth, getPreviewMonthKey()) <= 0 ? nextMonth : '';
  }

  function normalizeMonthSelectionMode(monthKey, mode) {
    const normalizedMonth = String(monthKey || '').trim();
    if (normalizedMonth !== getPreviewMonthKey()) return 'saved';
    return String(mode || '').trim() === 'live-preview' ? 'live-preview' : 'saved';
  }

  function isLivePreviewSelection(monthKey, mode) {
    return normalizeMonthSelectionMode(monthKey, mode) === 'live-preview';
  }

  function getSelectedBuildingMonthMode() {
    return normalizeMonthSelectionMode(window.__selectedBuildingMonth || getActiveMonthKey(), window.__selectedBuildingMonthMode || 'saved');
  }

  function getSelectedTenantMonthMode() {
    return normalizeMonthSelectionMode(window.__selectedTenantMonth || getActiveMonthKey(), window.__selectedTenantMonthMode || 'saved');
  }

  function isCurrentPageLivePreviewMonth(monthKey) {
    const normalizedMonth = String(monthKey || '').trim();
    const currentPage = String((document.body && document.body.dataset.page) || '').trim();
    if (normalizedMonth !== getPreviewMonthKey()) return false;
    if (currentPage === 'buildings') return isLivePreviewSelection(normalizedMonth, getSelectedBuildingMonthMode());
    if (currentPage === 'tenants') return isLivePreviewSelection(normalizedMonth, getSelectedTenantMonthMode());
    return false;
  }

  function getVisibleUpperMonthKey() {
    return getLatestCreatedMonthKey();
  }

  function getBuildingPreviewUpperMonthKey(buildingName) {
    return getVisibleUpperMonthKey();
  }

  function getEditableUpperMonthKey() {
    return getVisibleUpperMonthKey();
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function getCurrentMonthKey() {
    const d = today();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  function monthStart(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  function addMonths(monthKey, offset) {
    const base = monthStart(monthKey);
    base.setMonth(base.getMonth() + offset);
    return `${base.getFullYear()}-${pad(base.getMonth() + 1)}`;
  }

  function compareMonthKeys(left, right) {
    return String(left || '').localeCompare(String(right || ''), 'en');
  }

  function getMonthKeyFromDate(dateString) {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function getTenantVisibleFromMonth(tenant) {
    return getMonthKeyFromDate(tenant && (tenant.moveInDate || tenant.contractStart) || '');
  }

  function getInsuranceDisplayAmounts(tenant, selectedMonth) {
    const paidMonth = String(tenant && tenant.insurancePaidMonth || '').trim();
    const amount = normalizeAmount(Number(tenant && tenant.insuranceAmount || 0));
    if (paidMonth && amount > 0) {
      return {
        current: compareMonthKeys(paidMonth, selectedMonth) === 0 ? amount : 0,
        previous: compareMonthKeys(paidMonth, selectedMonth) < 0 ? amount : 0
      };
    }
    return {
      current: normalizeAmount(Number(tenant && tenant.insuranceCurrentAmount || 0)),
      previous: normalizeAmount(Number(tenant && tenant.insurancePreviousAmount || 0))
    };
  }

  function formatMonth(monthKey) {
    const date = monthStart(monthKey);
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date);
  }

  function getMonthTabShortLabel(monthKey) {
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth) return '';
    return formatMonth(normalizedMonth).replace(` ${monthStart(normalizedMonth).getFullYear()}`, '');
  }

  function getYearMonthKeys(year) {
    return Array.from({ length: 12 }, (_, index) => `${year}-${pad(index + 1)}`);
  }

  function clampMonthToCurrent(monthKey) {
    const requestedMonth = String(monthKey || '').trim();
    const visibleThroughMonth = addMonths(getCurrentMonthKey(), 1);
    if (!requestedMonth) return getCurrentMonthKey();
    return compareMonthKeys(requestedMonth, visibleThroughMonth) > 0 ? visibleThroughMonth : requestedMonth;
  }

  function clampMonthToVisible(monthKey) {
    const requestedMonth = String(monthKey || '').trim();
    const minMonth = getDefaultActiveMonthKey();
    const maxMonth = getVisibleUpperMonthKey();
    if (!requestedMonth) return minMonth;
    if (compareMonthKeys(requestedMonth, minMonth) < 0) return minMonth;
    if (compareMonthKeys(requestedMonth, maxMonth) > 0) return maxMonth;
    return requestedMonth;
  }

  function clampMonthToVisibleForBuilding(monthKey, buildingName) {
    const requestedMonth = String(monthKey || '').trim();
    const minMonth = getDefaultActiveMonthKey();
    const maxMonth = getBuildingPreviewUpperMonthKey(buildingName);
    if (!requestedMonth) return minMonth;
    if (compareMonthKeys(requestedMonth, minMonth) < 0) return minMonth;
    if (compareMonthKeys(requestedMonth, maxMonth) > 0) return maxMonth;
    return requestedMonth;
  }

  function getVisibleYearMonthKeys(year) {
    return getCreatedMonthKeys().filter((monthKey) => monthStart(monthKey).getFullYear() === year);
  }

  function getVisibleYearMonthKeysForBuilding(year, buildingName) {
    return getVisibleYearMonthKeys(year);
  }

  function ensureCarriedMonthSnapshotsState(state) {
    if (!state.carriedMonthSnapshots || typeof state.carriedMonthSnapshots !== 'object') {
      state.carriedMonthSnapshots = {};
    }
  }

  function buildCarryForwardPreviewRows(state, fromMonth, toMonth) {
    return [];
  }

  function getCarriedMonthSnapshotRows(state, monthKey, buildingName) {
    return null;
  }

  function seedCarryForwardIdentityOverrides(state, rows, monthKey) {
    return false;
  }

  function ensureCarryForwardMonth(state, fromMonth, toMonth) {
    return false;
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function getContractEndFromPreset(startDate, years) {
    if (!startDate || !(years > 0)) return '';
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return '';
    start.setFullYear(start.getFullYear() + years);
    start.setDate(start.getDate() - 1);
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  }

  function formatCurrency(value) {
    const number = Number(value || 0);
    return `K.D ${number.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}`;
  }

  function normalizeFloorLabel(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (['Ø§Ù„Ø±ÙˆÙˆÙ', 'Ø§Ù„Ø±ÙˆÙ', 'Ø±ÙˆÙ', 'Ù…Ù„Ø§Ø­Ù‚'].includes(text)) return 'Ù…Ù„Ø§Ø­Ù‚';
    if (['ØªØ§Ù†ÙŠ', 'Ø«Ø§Ù†ÙŠ'].includes(text)) return 'Ø«Ø§Ù†ÙŠ';
    if (['Ø§ÙˆÙ„', 'Ø§Ù„Ø£ÙˆÙ„', 'Ø§ÙˆÙ„ '].includes(text)) return 'Ø§ÙˆÙ„';
    if (['Ø§Ø±Ø¶ÙŠ', 'Ø§Ù„Ø£Ø±Ø¶ÙŠ'].includes(text)) return 'Ø§Ø±Ø¶ÙŠ';
    if (['Ø³Ø±Ø¯Ø§Ø¨', 'Ø§Ù„Ø³Ø±Ø¯Ø§Ø¨', 'Ø§Ù„Ø¨Ø¯Ø±ÙˆÙ…'].includes(text)) return 'Ø³Ø±Ø¯Ø§Ø¨';
    return text;
  }

  function getBuildingDisplayName(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text === 'حولي 161-05' || text === '161-05 حولي') return 'حولي 05-161';
    if (text === 'حولي 161-06' || text === '161-06 حولي') return 'حولي 06-161';
    return text;
  }

  function getBuildingDisplayLabel(value) {
    const text = getBuildingDisplayName(value);
    if (!text) return '';
    if (text === 'حولي 05-161') return 'حولي 05-161';
    if (text === 'حولي 06-161') return 'حولي 06-161';
    return text;
  }

  function renderBuildingDisplayNameHtml(value) {
    const text = getBuildingDisplayName(value);
    if (text === 'حولي 05-161') {
      return `<span class="building-name-full">حولي 05-161</span>`;
    }
    if (text === 'حولي 06-161') {
      return `<span class="building-name-full">حولي 06-161</span>`;
    }
    return escapeHtml(text);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function applyResponsiveTableLabels(tableNode) {
    if (!tableNode || typeof tableNode.querySelectorAll !== 'function') return;
    const headers = Array.from(tableNode.querySelectorAll('thead th')).map((header) => String(header && header.textContent || '').trim());
    if (!headers.length) return;
    tableNode.querySelectorAll('tbody tr').forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        if (!cell || typeof cell.setAttribute !== 'function') return;
        cell.setAttribute('data-cell-label', headers[index] || '');
      });
    });
  }

  function isSummaryRowLike(value) {
    const text = String(value || '').replace(/\s+/g, '').toLowerCase();
    return text === 'Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ' || text === 'Ø§Ù„Ø§Ø¬Ù…Ø§Ù„ÙŠ' || text === 'Ù…Ø¬Ù…ÙˆØ¹' || text === 'total';
  }

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 8) return `+965${digits}`;
    if (digits.length === 11 && digits.startsWith('965')) return `+${digits}`;
    if (digits.length === 12 && digits.startsWith('965')) return `+${digits}`;
    return value.trim();
  }

  function safeStorageGet(key) {
    if (key === STORAGE_KEY) {
      try {
        const legacyValue = localStorage.getItem(key);
        if (legacyValue != null) {
          localStorage.removeItem(key);
        }
      } catch (error) {
        // Ignore storage cleanup failures.
      }
      memoryState = null;
      return null;
    }
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    if (key === STORAGE_KEY) {
      memoryState = null;
      try {
        localStorage.removeItem(key);
      } catch (error) {
        // Ignore storage cleanup failures for live state.
      }
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Ignore preference storage failures.
    }
  }

  function getTabSessionId() {
    if (window.__tatraTabSessionId) return window.__tatraTabSessionId;
    let sessionId = '';
    try {
      sessionId = String(sessionStorage.getItem('landlord-ledger-tab-session') || '').trim();
      if (!sessionId) {
        sessionId = `tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        sessionStorage.setItem('landlord-ledger-tab-session', sessionId);
      }
    } catch (error) {
      sessionId = `tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }
    window.__tatraTabSessionId = sessionId;
    return sessionId;
  }

  function ensureStateMeta(state) {
    if (!state || typeof state !== 'object') return null;
    if (!state.__meta || typeof state.__meta !== 'object') {
      state.__meta = {};
    }
    return state.__meta;
  }

  function getDbSnapshotVersion() {
    const snapshot = typeof getDbSnapshot === 'function' ? getDbSnapshot() : null;
    if (!snapshot || typeof snapshot !== 'object') return '';
    return String(snapshot.generatedAt || '').trim();
  }

  function stampStateMeta(state, saveKind) {
    const meta = ensureStateMeta(state);
    if (!meta) return;
    meta.lastSavedAt = Date.now();
    meta.lastSavedSessionId = getTabSessionId();
    meta.lastSaveKind = String(saveKind || 'user').trim() || 'user';
    meta.dbSnapshotVersion = getDbSnapshotVersion();
  }

  function getStateLastSavedAt(state) {
    return Math.max(0, Number(state && state.__meta && state.__meta.lastSavedAt || 0));
  }

  function getStateLastSavedSessionId(state) {
    return String(state && state.__meta && state.__meta.lastSavedSessionId || '').trim();
  }

  function getStateLastSaveKind(state) {
    return String(state && state.__meta && state.__meta.lastSaveKind || 'user').trim() || 'user';
  }

  function rememberLoadedStateMeta(state) {
    window.__tatraKnownStateSavedAt = getStateLastSavedAt(state);
    window.__tatraKnownStateSavedSessionId = getStateLastSavedSessionId(state);
    window.__tatraKnownDbSnapshotVersion = String(state && state.__meta && state.__meta.dbSnapshotVersion || '').trim();
  }

  function isStateBehindCurrentDbSnapshot(state) {
    const stateVersion = String(state && state.__meta && state.__meta.dbSnapshotVersion || '').trim();
    const currentVersion = getDbSnapshotVersion();
    return !!currentVersion && stateVersion !== currentVersion;
  }

  function getActiveMonthKey() {
    const stored = String(safeStorageGet(ACTIVE_MONTH_KEY) || '').trim();
    return clampMonthToVisible(stored || getDefaultActiveMonthKey());
  }

  function setActiveMonthKey(monthKey) {
    const normalized = clampMonthToVisible(monthKey || getDefaultActiveMonthKey());
    safeStorageSet(ACTIVE_MONTH_KEY, normalized);
    return normalized;
  }

  function isMonthVisible(monthKey) {
    const normalized = String(monthKey || '').trim();
    if (!normalized) return false;
    return normalized === clampMonthToVisible(normalized);
  }

  function isPreviewOnlyMonth(monthKey) {
    return compareMonthKeys(clampMonthToVisible(monthKey), getPreviewMonthKey()) === 0;
  }

  function getLockedBuildingMonthRules() {
    return {};
  }

  function isBuildingMonthLocked(buildingName, monthKey) {
    const normalizedBuilding = String(buildingName || '').trim();
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedBuilding || !normalizedMonth) return false;
    if (isCurrentPageLivePreviewMonth(normalizedMonth)) return true;
    const lockedBuildings = getLockedBuildingMonthRules()[normalizedMonth] || [];
    return lockedBuildings.includes(normalizedBuilding);
  }

  function isTenantMonthLocked(tenant, monthKey) {
    return isBuildingMonthLocked(tenant && tenant.building, monthKey);
  }

  function isMonthEditable(monthKey) {
    return compareMonthKeys(clampMonthToVisible(monthKey), getEditableUpperMonthKey()) <= 0;
  }

  function getMonthAccessMessage(monthKey) {
    if (isPreviewOnlyMonth(monthKey)) {
      return `${formatMonth(clampMonthToVisible(monthKey))} was carried forward from January. It now stands on its own and later January edits will not rewrite it automatically.`;
    }
    return `${formatMonth(clampMonthToVisible(monthKey))} is not open for editing yet.`;
  }

  function getBuildingMonthLockMessage(buildingName, monthKey) {
    if (isCurrentPageLivePreviewMonth(monthKey)) {
      return `${formatMonth(clampMonthToVisible(monthKey))} live preview is read-only. Use the saved February tab to edit data.`;
    }
    return `${String(buildingName || '').trim()} ${formatMonth(clampMonthToVisible(monthKey))} is locked as the baseline and cannot be changed.`;
  }

  function canEditBuildingMonth(buildingName, monthKey) {
    const normalizedMonth = clampMonthToVisible(monthKey);
    if (!isMonthEditable(normalizedMonth)) {
      showFlashMessage(getMonthAccessMessage(normalizedMonth));
      return false;
    }
    if (isBuildingMonthLocked(buildingName, normalizedMonth)) {
      showFlashMessage(getBuildingMonthLockMessage(buildingName, normalizedMonth));
      return false;
    }
    return true;
  }

  function loadBuildingViewPreference() {
    try {
      const raw = safeStorageGet(BUILDING_VIEW_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const lastByArea = parsed.lastByArea && typeof parsed.lastByArea === 'object' ? parsed.lastByArea : {};
      return {
        area: String(parsed.area || '').trim(),
        building: String(parsed.building || '').trim(),
        month: String(parsed.month || '').trim(),
        lastByArea: Object.keys(lastByArea).reduce((acc, key) => {
          acc[key] = String(lastByArea[key] || '').trim();
          return acc;
        }, {})
      };
    } catch (error) {
      return null;
    }
  }

  function saveBuildingViewPreference() {
    const current = loadBuildingViewPreference() || { lastByArea: {} };
    const lastByArea = Object.assign({}, current.lastByArea || {});
    if (window.__selectedAreaName && window.__selectedBuildingName) {
      lastByArea[window.__selectedAreaName] = window.__selectedBuildingName;
    }
    safeStorageSet(BUILDING_VIEW_KEY, JSON.stringify({
      area: String(window.__selectedAreaName || ''),
      building: String(window.__selectedBuildingName || ''),
      month: String(window.__selectedBuildingMonth || ''),
      lastByArea
    }));
  }

  function loadTenantViewPreference() {
    try {
      const raw = safeStorageGet(TENANT_VIEW_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        building: String(parsed.building || 'all').trim() || 'all'
      };
    } catch (error) {
      return null;
    }
  }

  function saveTenantViewPreference(buildingName) {
    const normalizedBuilding = String(buildingName || 'all').trim() || 'all';
    safeStorageSet(TENANT_VIEW_KEY, JSON.stringify({
      building: normalizedBuilding
    }));
  }

  function getPreferredTenantBuildingFilter(state) {
    const savedView = loadTenantViewPreference();
    const preferredBuilding = savedView ? String(savedView.building || 'all').trim() || 'all' : 'all';
    if (preferredBuilding === 'all') return 'all';
    return state.buildings.some((building) => building.name === preferredBuilding) ? preferredBuilding : 'all';
  }

  function getPreferredBuildingForArea(state, areaName) {
    if (!areaName) return '';
    const savedView = loadBuildingViewPreference();
    const preferredBuilding = savedView && savedView.lastByArea ? String(savedView.lastByArea[areaName] || '') : '';
    const preferredMatch = state.buildings.find((building) => building.area === areaName && building.name === preferredBuilding);
    if (preferredMatch) return preferredMatch.name;
    const firstMatch = state.buildings.find((building) => building.area === areaName);
    return firstMatch ? firstMatch.name : '';
  }

  function ensureTenantOrderOverridesState(state) {
    if (!state.tenantOrderOverrides || typeof state.tenantOrderOverrides !== 'object') {
      state.tenantOrderOverrides = {};
    }
  }

  function ensureAppliedFixesState(state) {
    if (!state.appliedFixes || typeof state.appliedFixes !== 'object') {
      state.appliedFixes = {};
    }
  }

  function isCanonicalTenantOrderKey(value) {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue || normalizedValue.includes('::UNIT::')) return false;
    const parts = normalizedValue.split('::');
    return parts.length >= 3 && parts.every((part) => !!String(part || '').trim());
  }

  function getBuildingTenantOrderOverride(state, buildingName, monthKey) {
    ensureTenantOrderOverridesState(state);
    const normalizedBuildingName = String(buildingName || '').trim();
    const buildingBucket = state.tenantOrderOverrides[normalizedBuildingName];
    const requestedMonth = String(monthKey || '').trim();
    if (!requestedMonth) return null;
    const candidateMonths = buildingBucket && typeof buildingBucket === 'object'
      ? Object.keys(buildingBucket)
        .filter((key) => compareMonthKeys(key, requestedMonth) <= 0)
        .sort(compareMonthKeys)
      : [];
    let chosenMonth = candidateMonths.length ? candidateMonths[candidateMonths.length - 1] : '';
    let orderedIds = chosenMonth && Array.isArray(buildingBucket[chosenMonth]) ? buildingBucket[chosenMonth] : null;
    if ((!orderedIds || !orderedIds.length) && typeof getDbSnapshotRowOrderEntries === 'function') {
      const snapshotRows = getDbSnapshotRowOrderEntries(normalizedBuildingName, requestedMonth);
      if (snapshotRows.length) {
        orderedIds = snapshotRows.map((entry) => String(entry && entry.orderKey || '').trim()).filter(Boolean);
        chosenMonth = requestedMonth;
      }
    }
    if (!orderedIds || !orderedIds.length) return null;
    const allowUnitOnlyFallback = canUseUnitOnlyOrderFallback(normalizedBuildingName);
    const monthViews = typeof getBuildingUnitRows === 'function'
      ? getBuildingUnitRows(state, normalizedBuildingName, requestedMonth)
      : (typeof getTenantViews === 'function'
        ? getTenantViews(state, requestedMonth).filter((tenant) => tenant.building === normalizedBuildingName)
        : []);
    const unitOnlyKeys = new Set();
    monthViews.forEach((tenant) => {
      if (allowUnitOnlyFallback) {
        const unitOnlyKey = typeof getTenantUnitOnlyOrderKey === 'function'
          ? getTenantUnitOnlyOrderKey(tenant)
          : `${String(tenant.building || '').trim()}::UNIT::${String(tenant.unit || '').trim().toUpperCase()}`;
        if (unitOnlyKey) unitOnlyKeys.add(unitOnlyKey);
      }
    });
    const normalizedIds = orderedIds
      .map((id) => {
        const normalizedId = String(id || '').trim();
        if (!normalizedId) return '';
        if (normalizedId.includes('::')) {
          if (!allowUnitOnlyFallback) {
            return normalizedId.includes('::UNIT::') ? '' : normalizedId;
          }
          if (unitOnlyKeys.has(normalizedId)) return normalizedId;
          const parts = normalizedId.split('::');
          if (parts.length >= 3) {
            const unitOnlyId = `${parts[0]}::UNIT::${parts[parts.length - 1]}`;
            if (unitOnlyKeys.has(unitOnlyId)) return unitOnlyId;
          }
          return normalizedId;
        }
        return '';
      })
      .filter(Boolean)
      .filter((id, index, list) => list.indexOf(id) === index);
    if (
      buildingBucket
      && typeof buildingBucket === 'object'
      && normalizedIds.length
      && normalizedIds.some((id, index) => id !== orderedIds[index])
    ) {
      buildingBucket[chosenMonth] = normalizedIds.slice();
    }
    return normalizedIds.length ? normalizedIds : null;
  }

  function setBuildingTenantOrderOverride(state, buildingName, monthKey, orderedIds) {
    ensureTenantOrderOverridesState(state);
    const buildingKey = String(buildingName || '').trim();
    const month = String(monthKey || '').trim();
    const allowUnitOnlyFallback = canUseUnitOnlyOrderFallback(buildingKey);
    const monthViews = typeof getBuildingUnitRows === 'function'
      ? getBuildingUnitRows(state, buildingKey, month)
      : (typeof getTenantViews === 'function'
        ? getTenantViews(state, month).filter((tenant) => tenant.building === buildingKey)
        : []);
    const fullToUnitOnlyKey = new Map();
    if (allowUnitOnlyFallback) {
      monthViews.forEach((tenant) => {
        const fullKey = typeof getTenantOrderKey === 'function'
          ? getTenantOrderKey(tenant)
          : '';
        const unitOnlyKey = typeof getTenantUnitOnlyOrderKey === 'function'
          ? getTenantUnitOnlyOrderKey(tenant)
          : '';
        if (fullKey && unitOnlyKey) fullToUnitOnlyKey.set(fullKey, unitOnlyKey);
      });
    }
    const ids = Array.isArray(orderedIds)
      ? orderedIds
        .map((id) => {
          const normalizedId = String(id || '').trim();
          if (!normalizedId) return '';
          if (allowUnitOnlyFallback && fullToUnitOnlyKey.has(normalizedId)) {
            return fullToUnitOnlyKey.get(normalizedId);
          }
          return normalizedId;
        })
        .filter(Boolean)
        .filter((id, index, list) => list.indexOf(id) === index)
      : [];
    if (!buildingKey || !month || !ids.length) return;
    if (!state.tenantOrderOverrides[buildingKey]) state.tenantOrderOverrides[buildingKey] = {};
    state.tenantOrderOverrides[buildingKey][month] = ids;
    if (typeof syncBuildingTenantOrderOverrideToDb === 'function') {
      syncBuildingTenantOrderOverrideToDb(buildingKey, month, ids);
    }
  }

  function syncBuildingTenantOrderOverrideToDb(buildingName, monthKey, orderedIds) {
    const buildingKey = String(buildingName || '').trim();
    const month = String(monthKey || '').trim();
    const ids = Array.isArray(orderedIds) ? orderedIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
    if (!buildingKey || !month || !ids.length) return;
    postToLocalDbApi('/api/db/row-order', {
      buildingName: buildingKey,
      monthKey: month,
      orderedIds: ids
    });
  }

  function postToLocalDbApi(pathname, payload) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    const normalizedPath = String(pathname || '').trim();
    if (!normalizedPath) return Promise.resolve(null);
    const requestUrl = typeof getDbApiUrl === 'function'
      ? getDbApiUrl(normalizedPath)
      : normalizedPath;
    return fetch(requestUrl, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
      })
      .then(async (response) => {
        if (!response.ok) {
          let message = `Local DB sync failed (${response.status}).`;
          try {
            const payload = await response.json();
            if (payload && payload.error) message = String(payload.error);
          } catch (_error) {
            // Ignore malformed JSON responses.
          }
          throw new Error(message);
        }
        try {
          const result = await response.json();
          if (typeof refreshDbSnapshotFromServer === 'function') {
            await refreshDbSnapshotFromServer();
          }
          return result;
        } catch (_error) {
          if (typeof refreshDbSnapshotFromServer === 'function') {
            await refreshDbSnapshotFromServer();
          }
          return null;
        }
      })
      .catch((error) => {
        throw error;
      });
  }

  function syncPlannedVacateToDb(sourceTenantId, plannedVacateDate) {
      const sourceId = String(sourceTenantId || '').trim();
      if (!sourceId) return Promise.resolve(null);
      return postToLocalDbApi('/api/db/planned-vacate', {
        sourceTenantId: sourceId,
        plannedVacateDate: String(plannedVacateDate || '').trim()
      });
    }
  
  function syncTenantProfileToDb(profile) {
      const sourceTenantId = String(profile && profile.sourceTenantId || '').trim();
      if (!sourceTenantId) return Promise.resolve(null);
      return postToLocalDbApi('/api/db/tenant-profile', {
        sourceTenantId,
        name: String(profile && profile.name || '').trim(),
        phone: String(profile && profile.phone || '').trim(),
      civilId: String(profile && profile.civilId || '').trim(),
      nationality: String(profile && profile.nationality || 'Not set').trim() || 'Not set',
      moveInDate: String(profile && profile.moveInDate || '').trim(),
      contractStart: String(profile && profile.contractStart || '').trim(),
      contractEnd: String(profile && profile.contractEnd || '').trim()
    });
  }

  function syncTenantMonthIdentityToDb(payload) {
      const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
      const monthKey = String(payload && payload.monthKey || '').trim();
      if (!sourceTenantId || !monthKey) return Promise.resolve(null);
      return postToLocalDbApi('/api/db/tenant-month-identity', {
        sourceTenantId,
        monthKey,
        name: String(payload && payload.name || '').trim(),
        unit: String(payload && payload.unit || '').trim(),
        floor: String(payload && payload.floor || '').trim(),
        moveInDate: String(payload && payload.moveInDate || '').trim(),
        contractStart: String(payload && payload.contractStart || '').trim(),
        contractEnd: String(payload && payload.contractEnd || '').trim(),
        phone: String(payload && payload.phone || '').trim(),
        civilId: String(payload && payload.civilId || '').trim(),
        nationality: String(payload && payload.nationality || 'Not set').trim() || 'Not set'
      });
  }

  function syncTenantMonthIdentityBulkToDb(monthKey, rows) {
    const normalizedMonthKey = String(monthKey || '').trim();
    const normalizedRows = Array.isArray(rows) ? rows.map((row) => ({
      sourceTenantId: String(row && row.sourceTenantId || '').trim(),
      name: String(row && row.name || '').trim(),
      unit: String(row && row.unit || '').trim(),
      floor: String(row && row.floor || '').trim(),
      moveInDate: String(row && row.moveInDate || '').trim(),
      contractStart: String(row && row.contractStart || '').trim(),
      contractEnd: String(row && row.contractEnd || '').trim(),
      phone: String(row && row.phone || '').trim(),
      civilId: String(row && row.civilId || '').trim(),
      nationality: String(row && row.nationality || 'Not set').trim() || 'Not set'
    })).filter((row) => row.sourceTenantId) : [];
    if (!normalizedMonthKey || !normalizedRows.length) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/tenant-month-identity-bulk', {
      monthKey: normalizedMonthKey,
      rows: normalizedRows
    });
  }

  function syncResetMonthDataToDb(monthKey) {
    const normalizedMonthKey = String(monthKey || '').trim();
    if (!normalizedMonthKey) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/reset-month-data', {
      monthKey: normalizedMonthKey
    });
  }

  async function createMonthTab(monthKey) {
    const normalizedMonthKey = String(monthKey || '').trim();
    if (!normalizedMonthKey) return null;
    await syncResetMonthDataToDb(normalizedMonthKey);
    markMonthAsCreated(normalizedMonthKey);
    return normalizedMonthKey;
  }

  function syncDeleteMonthDataToDb(monthKey) {
    const normalizedMonthKey = String(monthKey || '').trim();
    if (!normalizedMonthKey) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/delete-month-data', {
      monthKey: normalizedMonthKey
    });
  }

  async function deleteMonthTab(monthKey) {
    const normalizedMonthKey = String(monthKey || '').trim();
    if (!normalizedMonthKey || normalizedMonthKey === getDefaultActiveMonthKey()) return null;
    await syncDeleteMonthDataToDb(normalizedMonthKey);
    unmarkMonthAsCreated(normalizedMonthKey);
    return normalizedMonthKey;
  }

  function syncUnitIdentityToDb(payload) {
      const unitId = String(payload && payload.unitId || '').trim();
      const unit = String(payload && payload.unit || '').trim();
      if (!unitId || !unit) return Promise.resolve(null);
      return postToLocalDbApi('/api/db/unit-identity', {
        unitId,
        unit,
        floor: String(payload && payload.floor || '').trim()
      });
  }

  function syncVacateTenantToDb(payload) {
    const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
    const vacateDate = String(payload && payload.vacateDate || '').trim();
    if (!sourceTenantId || !vacateDate) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/vacate-tenant', {
      sourceTenantId,
      vacateDate,
      lastTenantName: String(payload && payload.lastTenantName || '').trim(),
      lastContractRent: Number(payload && payload.lastContractRent || 0),
      lastActualRent: Number(payload && payload.lastActualRent || 0),
      lastDiscount: Number(payload && payload.lastDiscount || 0),
      archivedNotes: String(payload && payload.archivedNotes || '').trim(),
      vacancyNotes: String(payload && payload.vacancyNotes || '').trim()
    });
  }

  function syncBuildingInlineEditToDb(payload) {
    const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
    const unitId = String(payload && payload.unitId || '').trim();
    const monthKey = String(payload && payload.monthKey || '').trim();
    if ((!sourceTenantId && !unitId) || !monthKey) return Promise.resolve(null);
    const requestBody = {
      sourceTenantId,
      unitId,
      monthKey
    };
    const hasPayloadField = (fieldName) => Object.prototype.hasOwnProperty.call(payload || {}, fieldName);
    if (hasPayloadField('contractRent')) requestBody.contractRent = Number(payload && payload.contractRent || 0);
    if (hasPayloadField('discount')) requestBody.discount = Number(payload && payload.discount || 0);
    if (hasPayloadField('baseActualRent')) requestBody.baseActualRent = Number(payload && payload.baseActualRent || 0);
    if (hasPayloadField('actualRentOverride')) requestBody.actualRentOverride = Number(payload && payload.actualRentOverride || 0);
    if (hasPayloadField('vacantAmount')) requestBody.vacantAmount = Number(payload && payload.vacantAmount || 0);
    if (hasPayloadField('carryOverride')) requestBody.carryOverride = Number(payload && payload.carryOverride || 0);
    if (hasPayloadField('paidOverride')) requestBody.paidOverride = Number(payload && payload.paidOverride || 0);
    if (hasPayloadField('insuranceAmount')) requestBody.insuranceAmount = Number(payload && payload.insuranceAmount || 0);
    if (hasPayloadField('insurancePaidMonth')) requestBody.insurancePaidMonth = String(payload && payload.insurancePaidMonth || '').trim();
    if (hasPayloadField('oldTenantDuePaid')) requestBody.oldTenantDuePaid = Number(payload && payload.oldTenantDuePaid || 0);
    if (hasPayloadField('prepaidAmount')) requestBody.prepaidAmount = Number(payload && payload.prepaidAmount || 0);
    if (hasPayloadField('plannedVacateDate')) requestBody.plannedVacateDate = String(payload && payload.plannedVacateDate || '').trim();
    if (hasPayloadField('notes')) requestBody.notes = String(payload && payload.notes || '').trim();
    return postToLocalDbApi('/api/db/building-inline-save', requestBody);
  }

  function syncTenantPaymentToDb(payload) {
    const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
    const rentMonth = String(payload && payload.rentMonth || '').trim();
    const method = String(payload && payload.method || '').trim();
    if (!sourceTenantId || !rentMonth || !method) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/payment-set', {
      sourceTenantId,
      paymentId: String(payload && payload.paymentId || '').trim(),
      amount: Number(payload && payload.amount || 0),
      paidOn: String(payload && payload.paidOn || '').trim(),
      rentMonth,
      method,
      note: String(payload && payload.note || '').trim()
    });
  }

  function deleteTenantPaymentFromDb(payload) {
    const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
    const rentMonth = String(payload && payload.rentMonth || '').trim();
    const method = String(payload && payload.method || '').trim();
    if (!sourceTenantId || !rentMonth || !method) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/payment-delete', {
      sourceTenantId,
      rentMonth,
      method
    });
  }

  function syncActivityEntryToDb(payload) {
    const action = String(payload && payload.action || '').trim();
    const detail = String(payload && payload.detail || '').trim();
    if (!action) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/activity-log', {
      id: String(payload && payload.id || '').trim(),
      when: String(payload && payload.when || '').trim(),
      actor: String(payload && payload.actor || '').trim(),
      action,
      detail
    });
  }

  function syncVacantUnitMetaToDb(payload) {
    const unitId = String(payload && payload.unitId || '').trim();
    const buildingName = String(payload && payload.buildingName || '').trim();
    const unit = String(payload && payload.unit || '').trim();
    const monthKey = String(payload && payload.monthKey || '').trim();
    if ((!unitId && (!buildingName || !unit)) || !monthKey) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/vacant-unit-meta', {
      unitId,
      buildingName,
      unit,
      floor: String(payload && payload.floor || '').trim(),
      monthKey,
      vacantSince: String(payload && payload.vacantSince || '').trim(),
      lastContractRent: Number(payload && payload.lastContractRent || 0),
      lastActualRent: Number(payload && payload.lastActualRent || 0),
      discount: Number(payload && payload.discount || 0),
      oldTenantDuePaid: Number(payload && payload.oldTenantDuePaid || 0),
      notes: String(payload && payload.notes || '').trim()
    });
  }

  function syncCreateTenantToDb(payload) {
    const buildingName = String(payload && payload.buildingName || '').trim();
    const unit = String(payload && payload.unit || '').trim();
    if (!buildingName || !unit) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/create-tenant', {
      buildingName,
      unit,
      floor: String(payload && payload.floor || '').trim(),
      existingProfileId: String(payload && payload.existingProfileId || '').trim(),
      sourceTenantId: String(payload && payload.sourceTenantId || '').trim(),
      name: String(payload && payload.name || '').trim(),
      phone: String(payload && payload.phone || '').trim(),
      civilId: String(payload && payload.civilId || '').trim(),
      nationality: String(payload && payload.nationality || 'Not set').trim() || 'Not set',
      moveInDate: String(payload && payload.moveInDate || '').trim(),
      contractStart: String(payload && payload.contractStart || '').trim(),
      contractEnd: String(payload && payload.contractEnd || '').trim(),
      contractRent: Number(payload && payload.contractRent || 0),
      discount: Number(payload && payload.discount || 0),
      actualRent: Number(payload && payload.actualRent || 0),
      dueDay: Number(payload && payload.dueDay || 20),
      insuranceAmount: Number(payload && payload.insuranceAmount || 0),
      insurancePaidMonth: String(payload && payload.insurancePaidMonth || '').trim(),
      notes: String(payload && payload.notes || '').trim()
    });
  }

  function syncUndoVacateToDb(payload) {
    const sourceTenantId = String(payload && payload.sourceTenantId || '').trim();
    if (!sourceTenantId) return Promise.resolve(null);
    return postToLocalDbApi('/api/db/undo-vacate', {
      sourceTenantId,
      notes: String(payload && payload.notes || '').trim()
    });
  }

  function syncStateExtrasNow(state) {
    if (!state || typeof refreshDbSnapshotFromServer !== 'function') return Promise.resolve(null);
    return refreshDbSnapshotFromServer();
  }

  function replaceBuildingTenantOrderOverrideId(state, buildingName, previousId, nextId) {
    ensureTenantOrderOverridesState(state);
    const buildingKey = String(buildingName || '').trim();
    const fromId = String(previousId || '').trim();
    const toId = String(nextId || '').trim();
    const buildingBucket = state.tenantOrderOverrides[buildingKey];
    if (!buildingKey || !fromId || !toId || !buildingBucket || typeof buildingBucket !== 'object') return false;
    let changed = false;
    Object.keys(buildingBucket).forEach((monthKey) => {
      const orderedIds = Array.isArray(buildingBucket[monthKey]) ? buildingBucket[monthKey] : [];
      const nextOrderedIds = orderedIds.map((id) => String(id || '').trim() === fromId ? toId : String(id || '').trim());
      if (nextOrderedIds.some((id, index) => id !== orderedIds[index])) {
        buildingBucket[monthKey] = nextOrderedIds;
        changed = true;
      }
    });
    return changed;
  }

  function replaceBuildingTenantOrderOverrideKey(state, buildingName, previousKey, nextKey) {
    ensureTenantOrderOverridesState(state);
    const buildingKey = String(buildingName || '').trim();
    const fromKey = String(previousKey || '').trim();
    const toKey = String(nextKey || '').trim();
    const buildingBucket = state.tenantOrderOverrides[buildingKey];
    if (!buildingKey || !fromKey || !toKey || !buildingBucket || typeof buildingBucket !== 'object') return false;
    let changed = false;
    Object.keys(buildingBucket).forEach((monthKey) => {
      const orderedIds = Array.isArray(buildingBucket[monthKey]) ? buildingBucket[monthKey] : [];
      let replacementIds = orderedIds.map((id) => String(id || '').trim() === fromKey ? toKey : String(id || '').trim());
      let replaced = replacementIds.some((id, index) => id !== orderedIds[index]);
      if (!replaced) {
        const fromParts = fromKey.split('::');
        const toParts = toKey.split('::');
        const fromUnit = fromParts.length ? fromParts[fromParts.length - 1] : '';
        const toUnit = toParts.length ? toParts[toParts.length - 1] : '';
        if (fromUnit && toUnit && fromUnit === toUnit) {
          replacementIds = orderedIds.map((id) => {
            const normalizedId = String(id || '').trim();
            const idParts = normalizedId.split('::');
            const idUnit = idParts.length ? idParts[idParts.length - 1] : '';
            return idUnit && idUnit === fromUnit ? toKey : normalizedId;
          });
          replaced = replacementIds.some((id, index) => id !== orderedIds[index]);
        }
      }
      if (replaced) {
        buildingBucket[monthKey] = replacementIds;
        changed = true;
      }
    });
    return changed;
  }

  function getTenantUnitLookupKey(tenant) {
    if (!tenant) return '';
    const unit = String(tenant.unit || '').trim().toUpperCase();
    if (!unit) return '';
    const normalizedFloor = normalizeFloorLabel(tenant.floor);
    const floor = String(normalizedFloor || '').trim().toUpperCase();
    return `${floor}::${unit}`;
  }

  function getTenantUnitOnlyOrderKey(tenant) {
    if (!tenant) return '';
    const buildingName = String(tenant.building || '').trim();
    const unit = String(tenant.unit || '').trim().toUpperCase();
    if (!buildingName || !unit) return '';
    return `${buildingName}::UNIT::${unit}`;
  }

  function canUseUnitOnlyOrderFallback(buildingName) {
    return false;
  }

  function getTenantOrderKey(tenant) {
    if (!tenant) return '';
    const buildingName = String(tenant.building || '').trim();
    const unitId = String(tenant.unitId || '').trim();
    if (buildingName && unitId) return `${buildingName}::ROW::${unitId}`;
    const lookupKey = getTenantUnitLookupKey(tenant);
    if (!buildingName || !lookupKey) return '';
    return `${buildingName}::${lookupKey}`;
  }
