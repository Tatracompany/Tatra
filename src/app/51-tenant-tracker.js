  function getSelectedTrackerMonth() {
    return clampMonthToVisible(window.__selectedTrackerMonth || getLatestCreatedMonthKey());
  }

  function renderTrackerMonthTabs() {
    const container = document.getElementById('trackerMonthTabs');
    if (!container) return;
    const selectedMonth = getSelectedTrackerMonth();
    window.__selectedTrackerMonth = selectedMonth;
    const year = monthStart(selectedMonth).getFullYear();
    container.innerHTML = getVisibleYearMonthKeys(year).map((monthKey) => {
      const active = monthKey === selectedMonth ? ' active' : '';
      return `<button type="button" class="month-tab${active}" data-tracker-month="${escapeHtml(monthKey)}">${escapeHtml(formatMonth(monthKey).replace(` ${year}`, ''))}</button>`;
    }).join('');
    container.querySelectorAll('[data-tracker-month]').forEach((button) => {
      button.addEventListener('click', () => {
        window.__selectedTrackerMonth = button.getAttribute('data-tracker-month') || getActiveMonthKey();
        renderTrackerMonthTabs();
        renderTenantTracker(window.__appState);
      });
    });
  }

  function getTrackerOccupantsMetaKey(unitId, monthKey) {
    const normalizedUnitId = String(unitId || '').trim();
    const normalizedMonthKey = String(monthKey || '').trim();
    if (!normalizedUnitId || !normalizedMonthKey) return '';
    return `tenant_tracker_occupants::${normalizedUnitId}::${normalizedMonthKey}`;
  }

  function getTrackerAppMetaEntries() {
    const snapshot = typeof getDbSnapshot === 'function' ? getDbSnapshot() : null;
    if (!snapshot || !Array.isArray(snapshot.appMeta)) return [];
    return snapshot.appMeta;
  }

  function getTrackerMetaValue(metaKey) {
    const normalizedKey = String(metaKey || '').trim();
    if (!normalizedKey) return '';
    const entry = getTrackerAppMetaEntries().find((item) => String(item && item.key || '').trim() === normalizedKey);
    return entry ? String(itemValue(entry.value)) : '';
  }

  function itemValue(value) {
    return value == null ? '' : value;
  }

  function setTrackerMetaValue(metaKey, valueText) {
    const normalizedKey = String(metaKey || '').trim();
    if (!normalizedKey) return;
    const snapshot = typeof getDbSnapshot === 'function' ? getDbSnapshot() : null;
    if (!snapshot) return;
    if (!Array.isArray(snapshot.appMeta)) snapshot.appMeta = [];
    const existingEntry = snapshot.appMeta.find((item) => String(item && item.key || '').trim() === normalizedKey);
    if (existingEntry) {
      existingEntry.value = String(valueText || '');
      return;
    }
    snapshot.appMeta.push({
      key: normalizedKey,
      value: String(valueText || '')
    });
  }

  function parseTrackerNames(valueText) {
    return String(valueText || '')
      .replace(/[;,]/g, '\n')
      .split(/\r?\n/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function normalizeTrackerNameSlots(names, tenantName) {
    const slots = new Array(8).fill('');
    const normalizedNames = Array.isArray(names)
      ? names.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (normalizedNames.length) {
      normalizedNames.slice(0, 8).forEach((name, index) => {
        slots[index] = name;
      });
    }
    return slots;
  }

  function serializeTrackerNameSlots(slots) {
    return (Array.isArray(slots) ? slots : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join('\n');
  }

  function getTrackerStoredNamesText(unitId, monthKey, fallbackText) {
    const metaKey = getTrackerOccupantsMetaKey(unitId, monthKey);
    if (!metaKey) return String(fallbackText || '').trim();
    const storedValue = getTrackerMetaValue(metaKey);
    if (String(storedValue || '').trim()) return String(storedValue || '').trim();
    return String(fallbackText || '').trim();
  }

  function buildTenantTrackerRows(state, selectedMonth) {
    const rows = typeof getTenantViews === 'function' ? getTenantViews(state, selectedMonth) : [];
    return rows
      .slice()
      .sort((left, right) => {
        if (left.building !== right.building) return String(left.building || '').localeCompare(String(right.building || ''), 'ar');
        const seedDiff = Number(left.seedOrder ?? Number.MAX_SAFE_INTEGER) - Number(right.seedOrder ?? Number.MAX_SAFE_INTEGER);
        if (seedDiff !== 0) return seedDiff;
        return unitSortValue(String(left.unit || '')).localeCompare(unitSortValue(String(right.unit || '')), 'en', { numeric: true });
      })
      .map((tenant) => {
        const namesText = getTrackerStoredNamesText(tenant.unitId, selectedMonth, '');
        const names = parseTrackerNames(namesText);
        const trackerNameSlots = normalizeTrackerNameSlots(names, tenant.isVacant ? '' : tenant.name);
        return Object.assign({}, tenant, {
          trackerNamesText: namesText,
          trackerNames: names,
          trackerNameSlots,
          trackerCount: trackerNameSlots.filter(Boolean).length
        });
      });
  }

  function getTrackerNameSlotsFromContainer(container) {
    return Array.from((container && container.querySelectorAll('[data-tracker-name-slot]')) || [])
      .map((node) => String(node.value || '').trim());
  }

  function getTrackerRowByUnitId(container, unitId) {
    const normalizedUnitId = String(unitId || '').trim();
    if (!container || !normalizedUnitId) return null;
    const saveMarker = container.querySelector(`[data-tracker-names="${CSS.escape(normalizedUnitId)}"]`);
    return saveMarker ? saveMarker.closest('tr') : null;
  }

  function unitIdFromTrackerInput(input) {
    return String(input && input.getAttribute('data-tracker-names') || '').trim();
  }

  function renderTenantTracker(state) {
    const container = document.getElementById('tenantTrackerList');
    if (!container) return;
    const selectedMonth = getSelectedTrackerMonth();
    const buildingFilter = String(((document.getElementById('trackerBuildingFilter') || {}).value) || 'all').trim() || 'all';
    const searchValue = String(((document.getElementById('trackerSearch') || {}).value) || '').trim().toLowerCase();
    const rows = buildTenantTrackerRows(state, selectedMonth)
      .filter((tenant) => buildingFilter === 'all' || tenant.building === buildingFilter)
      .filter((tenant) => {
        if (!searchValue) return true;
        const haystack = [
          tenant.building,
          tenant.unit,
          tenant.floor,
          tenant.name,
          tenant.trackerNamesText
        ].join(' ').toLowerCase();
        return haystack.includes(searchValue);
      });
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">No tracker rows found for the selected month.</div>';
      return;
    }
    const totalPeople = rows.reduce((sum, row) => sum + Number(row.trackerCount || 0), 0);
    const nameHeaders = Array.from({ length: 8 }, (_, index) => `<th class="center">Name ${index + 1}</th>`).join('');
    container.innerHTML = `<div class="table-scroll"><table class="building-table tracker-table"><thead><tr><th>Building</th><th>Unit</th><th>Floor</th><th>Tenant</th><th>Status</th><th class="center">People</th>${nameHeaders}<th class="center">Save</th></tr></thead><tbody>${rows.map((tenant) => {
      const namesValue = escapeHtml(String(tenant.trackerNamesText || '').trim());
      const slotInputs = tenant.trackerNameSlots.map((nameValue, index) => {
        const escapedValue = escapeHtml(String(nameValue || '').trim());
        const placeholder = `Name ${index + 1}`;
        return `<td class="tracker-name-cell"><input type="text" class="tracker-name-field" data-tracker-name-slot="${escapeHtml(tenant.unitId || '')}" data-slot-index="${escapeHtml(String(index))}" value="${escapedValue}" placeholder="${escapeHtml(placeholder)}"></td>`;
      }).join('');
      return `<tr>
        <td>${escapeHtml(getBuildingDisplayLabel(tenant.building))}</td>
        <td>${escapeHtml(tenant.unit || '-')}</td>
        <td>${escapeHtml(tenant.floor || '-')}</td>
        <td>${escapeHtml(tenant.name || 'Available unit')}</td>
        <td><span class="badge ${(STATUS_META[tenant.status] || STATUS_META.upcoming).className}">${escapeHtml((STATUS_META[tenant.status] || STATUS_META.upcoming).label)}</span></td>
        <td class="center"><strong data-tracker-count="${escapeHtml(tenant.unitId || '')}">${escapeHtml(String(tenant.trackerCount || 0))}</strong></td>
        ${slotInputs}
        <td class="tracker-save-cell center"><div data-tracker-names="${escapeHtml(tenant.unitId || '')}" data-month-key="${escapeHtml(selectedMonth)}" data-building-name="${escapeHtml(tenant.building || '')}" data-initial-value="${namesValue}"></div><button type="button" class="secondary-action" data-save-tracker-row="${escapeHtml(tenant.unitId || '')}">Save</button></td>
      </tr>`;
    }).join('')}</tbody><tfoot><tr class="totals-row"><td colspan="5"><strong>Total</strong></td><td class="center"><strong>${escapeHtml(String(totalPeople))}</strong></td><td colspan="8"><strong>${escapeHtml(String(rows.length))} units tracked</strong></td><td></td></tr></tfoot></table></div>`;

    container.querySelectorAll('[data-tracker-name-slot]').forEach((field) => {
      field.addEventListener('input', () => {
        const unitId = String(field.getAttribute('data-tracker-name-slot') || '').trim();
        const countNode = unitId ? container.querySelector(`[data-tracker-count="${CSS.escape(unitId)}"]`) : null;
        const row = getTrackerRowByUnitId(container, unitId);
        if (countNode) {
          countNode.textContent = String(getTrackerNameSlotsFromContainer(row).filter(Boolean).length);
        }
      });
      field.addEventListener('keydown', async (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          await saveTenantTrackerRow(state, String(field.getAttribute('data-tracker-name-slot') || '').trim(), selectedMonth);
        }
      });
    });

    container.querySelectorAll('[data-save-tracker-row]').forEach((button) => {
      button.addEventListener('click', async () => {
        await saveTenantTrackerRow(state, String(button.getAttribute('data-save-tracker-row') || '').trim(), selectedMonth);
      });
    });
  }

  async function saveTenantTrackerRow(state, unitId, monthKey) {
    const normalizedUnitId = String(unitId || '').trim();
    const normalizedMonthKey = String(monthKey || '').trim();
    if (!normalizedUnitId || !normalizedMonthKey) return;
    const container = document.getElementById('tenantTrackerList');
    const input = Array.from(document.querySelectorAll('[data-tracker-names]'))
      .find((node) => unitIdFromTrackerInput(node) === normalizedUnitId);
    const row = getTrackerRowByUnitId(container, normalizedUnitId);
    if (!input || !row) return;
    const namesText = serializeTrackerNameSlots(getTrackerNameSlotsFromContainer(row));
    const initialValue = String(input.getAttribute('data-initial-value') || '').trim();
    if (namesText === initialValue) return;
    if (typeof syncTenantTrackerToDb !== 'function') return;
    await syncTenantTrackerToDb({
      unitId: normalizedUnitId,
      monthKey: normalizedMonthKey,
      namesText
    });
    setTrackerMetaValue(getTrackerOccupantsMetaKey(normalizedUnitId, normalizedMonthKey), namesText);
    input.setAttribute('data-initial-value', namesText);
    renderTenantTracker(state);
    if (typeof showFlashMessage === 'function') {
      showFlashMessage('Tenant tracker saved.');
    }
  }
