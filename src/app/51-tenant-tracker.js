  function getSelectedTrackerMonth() {
    return clampMonthToVisible(window.__selectedTrackerMonth || getActiveMonthKey());
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
    return entry ? String(entry.value || '') : '';
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
      .replace(/[،;]/g, '\n')
      .split(/\r?\n|,/)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
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
        const defaultNames = tenant.isVacant ? '' : String(tenant.name || '').trim();
        const namesText = getTrackerStoredNamesText(tenant.unitId, selectedMonth, defaultNames);
        const names = parseTrackerNames(namesText);
        return Object.assign({}, tenant, {
          trackerNamesText: namesText,
          trackerNames: names,
          trackerCount: names.length
        });
      });
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
    container.innerHTML = `<div class="table-scroll"><table class="building-table tracker-table"><thead><tr><th>Building</th><th>Unit</th><th>Floor</th><th>Tenant</th><th>Status</th><th class="center">People</th><th>Names</th><th class="center">Save</th></tr></thead><tbody>${rows.map((tenant) => {
      const namesValue = escapeHtml(String(tenant.trackerNamesText || '').trim());
      return `<tr>
        <td>${escapeHtml(getBuildingDisplayLabel(tenant.building))}</td>
        <td>${escapeHtml(tenant.unit || '-')}</td>
        <td>${escapeHtml(tenant.floor || '-')}</td>
        <td>${escapeHtml(tenant.name || 'Available unit')}</td>
        <td><span class="badge ${(STATUS_META[tenant.status] || STATUS_META.upcoming).className}">${escapeHtml((STATUS_META[tenant.status] || STATUS_META.upcoming).label)}</span></td>
        <td class="center"><strong data-tracker-count="${escapeHtml(tenant.unitId || '')}">${escapeHtml(String(tenant.trackerCount || 0))}</strong></td>
        <td><textarea class="tracker-names-input" rows="3" data-tracker-names="${escapeHtml(tenant.unitId || '')}" data-month-key="${escapeHtml(selectedMonth)}" data-building-name="${escapeHtml(tenant.building || '')}" data-initial-value="${namesValue}" placeholder="One name per line">${namesValue}</textarea></td>
        <td class="center"><button type="button" class="secondary-action" data-save-tracker-row="${escapeHtml(tenant.unitId || '')}">Save</button></td>
      </tr>`;
    }).join('')}</tbody><tfoot><tr class="totals-row"><td colspan="5"><strong>Total</strong></td><td class="center"><strong>${escapeHtml(String(totalPeople))}</strong></td><td><strong>${escapeHtml(String(rows.length))} units tracked</strong></td><td></td></tr></tfoot></table></div>`;

    container.querySelectorAll('[data-tracker-names]').forEach((input) => {
      input.addEventListener('input', () => {
        const unitId = String(input.getAttribute('data-tracker-names') || '').trim();
        const countNode = unitId ? container.querySelector(`[data-tracker-count="${CSS.escape(unitId)}"]`) : null;
        if (countNode) {
          countNode.textContent = String(parseTrackerNames(input.value).length);
        }
      });
      input.addEventListener('keydown', async (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          await saveTenantTrackerRow(state, unitIdFromTrackerInput(input), selectedMonth);
        }
      });
    });

    container.querySelectorAll('[data-save-tracker-row]').forEach((button) => {
      button.addEventListener('click', async () => {
        await saveTenantTrackerRow(state, String(button.getAttribute('data-save-tracker-row') || '').trim(), selectedMonth);
      });
    });
  }

  function unitIdFromTrackerInput(input) {
    return String(input && input.getAttribute('data-tracker-names') || '').trim();
  }

  async function saveTenantTrackerRow(state, unitId, monthKey) {
    const normalizedUnitId = String(unitId || '').trim();
    const normalizedMonthKey = String(monthKey || '').trim();
    if (!normalizedUnitId || !normalizedMonthKey) return;
    const input = Array.from(document.querySelectorAll('[data-tracker-names]'))
      .find((node) => unitIdFromTrackerInput(node) === normalizedUnitId);
    if (!input) return;
    const namesText = String(input.value || '').trim();
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
