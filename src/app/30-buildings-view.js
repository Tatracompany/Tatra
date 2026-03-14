  const BUILDING_TABLE_COLUMN_COUNT = 16;

  function getDefaultBuildingName(state) {
    return (state.buildings[0] && state.buildings[0].name) || '';
  }

  function getDefaultAreaName(state) {
    return (state.buildings[0] && state.buildings[0].area) || '';
  }

  function renderBuildingsEmptyState(message) {
    const buildingGrid = document.getElementById('buildingGrid');
    const areaBuildingGrid = document.getElementById('areaBuildingGrid');
    const buildingDetailsTitle = document.getElementById('buildingDetailsTitle');
    const buildingDetailsMeta = document.getElementById('buildingDetailsMeta');
    const buildingDetails = document.getElementById('buildingDetails');
    const monthTabs = document.getElementById('buildingMonthTabs');

    if (buildingGrid) buildingGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    if (areaBuildingGrid) areaBuildingGrid.innerHTML = '';
    if (buildingDetailsTitle) buildingDetailsTitle.textContent = 'No building selected';
    if (buildingDetailsMeta) buildingDetailsMeta.textContent = '';
    if (buildingDetails) buildingDetails.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    if (monthTabs) monthTabs.innerHTML = '';
  }

  function renderAreaGrid(state, selectedArea, monthKey) {
    const container = document.getElementById('buildingGrid');
    if (!container) return;
    container.innerHTML = getAreaSummaries(state, monthKey).map((areaSummary) => {
      const active = selectedArea === areaSummary.area ? ' active' : '';
      return `<article class="stat-card building-card${active}" data-area-card="${escapeHtml(areaSummary.area)}">
        <span class="stat-label">Area</span>
        <strong class="building-card-title">${escapeHtml(areaSummary.area)}</strong>
        <small class="stat-note building-card-note">${areaSummary.occupied}/${areaSummary.totalUnits} occupied · ${areaSummary.late} late · ${formatCurrency(areaSummary.totalDue)} due</small>
      </article>`;
    }).join('');
  }

  function renderAreaBuildingsGrid(state, selectedArea, selectedBuilding, monthKey) {
    const container = document.getElementById('areaBuildingGrid');
    if (!container) return;
    const buildings = state.buildings.filter((building) => building.area === selectedArea);
    container.innerHTML = buildings.map((building) => {
      const summary = getBuildingSummary(state, building.name, monthKey);
      const active = selectedBuilding === building.name ? ' active' : '';
      return `<article class="stat-card building-card${active}" data-building-card="${escapeHtml(building.name)}">
        <span class="stat-label">Building</span>
        <strong class="building-card-title">${renderBuildingDisplayNameHtml(building.name)}</strong>
        <small class="stat-note building-card-note">${summary.occupied}/${summary.totalUnits} occupied · ${summary.late} late · ${formatCurrency(summary.totalDue)} due</small>
      </article>`;
    }).join('');
  }

  function unitSortValue(unit) {
    return unit.replace(/\s+/g, '').toUpperCase();
  }

  function formatBuildingAmountCell(value) {
    const numericValue = Number(value || 0);
    return Math.abs(numericValue) < 0.0005 ? '-' : formatCurrency(numericValue);
  }

  function getBuildingVacantAmount(tenant) {
    if (!tenant) return 0;
    if (tenant.displayVacantAmount != null && Number(tenant.displayVacantAmount || 0) > 0) {
      return Number(tenant.displayVacantAmount || 0);
    }
    if (tenant.isVacant || tenant.isPreContractOccupancy) {
      return Number(tenant.displayVacantAmount != null ? tenant.displayVacantAmount : (tenant.lastActualRent || 0));
    }
    return 0;
  }

  function getBuildingActualAmount(tenant) {
    if (!tenant || tenant.isVacant) return 0;
    return Number(tenant.displayActualRent != null ? tenant.displayActualRent : (tenant.rentDue || 0));
  }

  function statusRank(status) {
    return { overdue: 0, upcoming: 1, partial: 2, paid: 3 }[status] ?? 4;
  }

  function getBuildingDisplayOrderIndexMap(state, buildingName, monthKey) {
    const orderedIds = getBuildingTenantOrderOverride(state, buildingName, monthKey);
    if (!orderedIds || !orderedIds.length) return null;
    const orderIndexMap = new Map();
    orderedIds.forEach((id, index) => {
      const normalizedId = String(id || '').trim();
      if (!normalizedId) return;
      orderIndexMap.set(normalizedId, index);
    });
    const buildingTenants = typeof getBuildingUnitRows === 'function'
      ? getBuildingUnitRows(state, String(buildingName || '').trim(), monthKey)
      : getTenantViews(state, monthKey).filter((tenant) => tenant.building === String(buildingName || '').trim());
    buildingTenants.forEach((tenant) => {
      const fullKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(tenant) : '';
      const unitOnlyKey = typeof getTenantUnitOnlyOrderKey === 'function' ? getTenantUnitOnlyOrderKey(tenant) : '';
      if (fullKey && unitOnlyKey && orderIndexMap.has(unitOnlyKey) && !orderIndexMap.has(fullKey)) {
        orderIndexMap.set(fullKey, orderIndexMap.get(unitOnlyKey));
      }
      if (fullKey && unitOnlyKey && orderIndexMap.has(fullKey) && !orderIndexMap.has(unitOnlyKey)) {
        orderIndexMap.set(unitOnlyKey, orderIndexMap.get(fullKey));
      }
    });
    return orderIndexMap;
  }

  function preserveVisibleBuildingOrderForBuilding(state, buildingName, monthKey) {
    const buildingKey = String(buildingName || '').trim();
    const selectedMonth = String(monthKey || getSelectedBuildingMonth() || '').trim();
    if (!buildingKey || !selectedMonth) return;

    const rowIds = Array.from(document.querySelectorAll('[data-building-row-order]'))
      .map((row) => String(row.getAttribute('data-building-row-order') || '').trim())
      .filter(Boolean);
    if (!rowIds.length) return;

    const visibleIds = [];
    const seenVisible = new Set();
    rowIds.forEach((id) => {
      if (seenVisible.has(id)) return;
      seenVisible.add(id);
      visibleIds.push(id);
    });
    if (!visibleIds.length) return;

    const remainingIds = getBuildingDisplayTenants(state, buildingKey, selectedMonth)
      .map((tenant) => typeof getTenantOrderKey === 'function' ? getTenantOrderKey(tenant) : String(tenant.id || '').trim())
      .filter(Boolean)
      .filter((id) => !seenVisible.has(id));

    const orderedIds = [];
    const seenOrdered = new Set();
    visibleIds.concat(remainingIds).forEach((id) => {
      if (seenOrdered.has(id)) return;
      seenOrdered.add(id);
      orderedIds.push(id);
    });
    if (!orderedIds.length) return;

    setBuildingTenantOrderOverride(state, buildingKey, selectedMonth, orderedIds);
  }

  function getBuildingFilters() {
    return {
      search: (document.getElementById('buildingSearch') || {}).value || '',
      unit: (document.getElementById('buildingUnitFilter') || {}).value || 'all',
      status: (document.getElementById('buildingStatusFilter') || {}).value || 'all',
      unitSort: (window.__buildingUnitSortState || 'reset'),
      statusSort: (window.__buildingStatusSortState || 'reset')
    };
  }

  function getSelectedBuildingMonth() {
    return clampMonthToVisibleForBuilding(window.__selectedBuildingMonth || getActiveMonthKey(), window.__selectedBuildingName || '');
  }

  function renderBuildingMonthTabs() {
    const container = document.getElementById('buildingMonthTabs');
    if (!container) return;
    const selectedMonth = getSelectedBuildingMonth();
    window.__selectedBuildingMonth = selectedMonth;
    const year = monthStart(selectedMonth).getFullYear();
    container.innerHTML = getVisibleYearMonthKeysForBuilding(year, window.__selectedBuildingName || '').map((monthKey) => {
      const active = monthKey === selectedMonth ? ' active' : '';
      return `<button type="button" class="month-tab${active}" data-building-month="${escapeHtml(monthKey)}">${escapeHtml(formatMonth(monthKey).replace(` ${year}`, ''))}</button>`;
    }).join('');
    container.querySelectorAll('[data-building-month]').forEach((button) => {
      button.addEventListener('click', () => {
        window.__selectedBuildingMonth = button.getAttribute('data-building-month') || getActiveMonthKey();
        saveBuildingViewPreference();
        renderAll(window.__appState, window.__selectedBuildingName || '');
      });
    });
  }

  function renderBuildingDetails(state, buildingName) {
    const title = document.getElementById('buildingDetailsTitle');
    const meta = document.getElementById('buildingDetailsMeta');
    const container = document.getElementById('buildingDetails');
    const unitFilter = document.getElementById('buildingUnitFilter');
    if (!container || !buildingName) return;

    const selectedMonth = getSelectedBuildingMonth();
    const summary = getBuildingSummary(state, buildingName, selectedMonth);
    const filters = getBuildingFilters();
    const templateOrderMap = getBuildingTemplateOrderMap(buildingName);
    const orderIndexMap = getBuildingDisplayOrderIndexMap(state, buildingName, selectedMonth);
    const source = getBuildingDisplayTenants(state, buildingName, selectedMonth)
      .slice()
      .sort((a, b) => {
        if (orderIndexMap) {
          const aOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(a) : String(a.id || '').trim();
          const bOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(b) : String(b.id || '').trim();
          const aOverrideIndex = orderIndexMap.has(aOrderKey) ? orderIndexMap.get(aOrderKey) : Number.MAX_SAFE_INTEGER;
          const bOverrideIndex = orderIndexMap.has(bOrderKey) ? orderIndexMap.get(bOrderKey) : Number.MAX_SAFE_INTEGER;
          if (aOverrideIndex !== bOverrideIndex) return aOverrideIndex - bOverrideIndex;
        }
        const seedDiff = Number(a.seedOrder ?? Number.MAX_SAFE_INTEGER) - Number(b.seedOrder ?? Number.MAX_SAFE_INTEGER);
        if (seedDiff !== 0) return seedDiff;
        if (templateOrderMap) {
          const aLookupKey = getTenantUnitLookupKey(a);
          const bLookupKey = getTenantUnitLookupKey(b);
          const aTemplateIndex = templateOrderMap.has(aLookupKey)
            ? templateOrderMap.get(aLookupKey)
            : Number.MAX_SAFE_INTEGER;
          const bTemplateIndex = templateOrderMap.has(bLookupKey)
            ? templateOrderMap.get(bLookupKey)
            : Number.MAX_SAFE_INTEGER;
          if (aTemplateIndex !== bTemplateIndex) return aTemplateIndex - bTemplateIndex;
        }
        if (String(a.unit || '').trim().toUpperCase() === String(b.unit || '').trim().toUpperCase()) {
          if (!!a.isVacant !== !!b.isVacant) return a.isVacant ? -1 : 1;
          if (!!a.isArchivedSnapshot !== !!b.isArchivedSnapshot) return a.isArchivedSnapshot ? -1 : 1;
        }
        return unitSortValue(String(a.unit || '')).localeCompare(unitSortValue(String(b.unit || '')), 'en', { numeric: true });
      });

    if (unitFilter) {
      unitFilter.innerHTML = '<option value="all">All units</option>' + source.map((tenant) => `<option value="${escapeHtml(tenant.unit)}">${escapeHtml(tenant.unit)}</option>`).join('');
      unitFilter.value = source.some((tenant) => tenant.unit === filters.unit) ? filters.unit : 'all';
      filters.unit = unitFilter.value;
    }

    let tenants = source.filter((tenant) => {
      const matchesSearch = !filters.search || `${tenant.name} ${tenant.unit}`.toLowerCase().includes(filters.search.toLowerCase());
      const matchesUnit = filters.unit === 'all' || tenant.unit === filters.unit;
      const matchesStatus = filters.status === 'all' || tenant.status === filters.status;
      return matchesSearch && matchesUnit && matchesStatus;
    });

    if (filters.unitSort === 'asc') tenants.sort((a, b) => unitSortValue(a.unit).localeCompare(unitSortValue(b.unit), 'en'));
    if (filters.unitSort === 'desc') tenants.sort((a, b) => unitSortValue(b.unit).localeCompare(unitSortValue(a.unit), 'en'));
    if (filters.statusSort === 'asc') tenants.sort((a, b) => statusRank(a.status) - statusRank(b.status));
    if (filters.statusSort === 'desc') tenants.sort((a, b) => statusRank(b.status) - statusRank(a.status));

    if (title) title.innerHTML = renderBuildingDisplayNameHtml(buildingName);
    if (meta) meta.textContent = `${formatMonth(selectedMonth)} · ${summary.occupied} tenants · ${summary.late} late · ${summary.unpaid} unpaid · ${formatCurrency(summary.totalDue)} due`;

    if (!tenants.length) {
      container.innerHTML = '<div class="empty-state">No matching tenants.</div>';
      return;
    }

    window.__buildingVisibleColumnCount = BUILDING_TABLE_COLUMN_COUNT;

    const rows = tenants.map((tenant) => renderBuildingRow(state, tenant, selectedMonth)).join('');
    const totals = renderBuildingTotalsRow(state, tenants, selectedMonth, summary);
    container.innerHTML = `<div class="table-scroll"><table class="building-table"><colgroup><col class="screen-col-floor"><col class="screen-col-unit"><col class="screen-col-tenant"><col class="screen-col-status"><col class="screen-col-discount"><col class="screen-col-vacant"><col class="screen-col-actual"><col class="screen-col-prepaid-before"><col class="screen-col-current"><col class="screen-col-paid-previous"><col class="screen-col-prepaid"><col class="screen-col-unpaid"><col class="screen-col-ins-current"><col class="screen-col-ins-previous"><col class="screen-col-old-due"><col class="screen-col-notes"></colgroup><thead><tr><th>Floor</th><th>Unit</th><th>Tenant</th><th>Status</th><th class="amount">Discount</th><th class="amount">Vacant</th><th class="amount"><span class="header-stack"><span>Actual</span><span>rent</span></span></th><th class="amount"><span class="header-stack"><span>Prepaid</span><span>from before</span></span></th><th class="center"><span class="header-stack"><span>Current</span><span>month</span></span></th><th class="amount"><span class="header-stack"><span>Paid</span><span>previous</span></span></th><th class="amount">Prepaid</th><th class="amount">Unpaid</th><th class="amount"><span class="header-stack"><span>Insurance</span><span>current</span></span></th><th class="amount"><span class="header-stack"><span>Insurance</span><span>previous</span></span></th><th class="amount"><span class="header-stack"><span>Old tenant</span><span>due paid</span></span></th><th>Notes</th></tr></thead><tbody>${rows}</tbody><tfoot>${totals}</tfoot></table></div>`;

    container.querySelectorAll('[data-tenant-row]').forEach((row) => {
      row.addEventListener('click', () => toggleTenantRowDetail(state, row.dataset.tenantRow, row));
    });
  }

  function getPrintableBuildingDensity(rowCount) {
    if (rowCount >= 40) return 'dense';
    if (rowCount >= 28) return 'medium';
    return 'roomy';
  }

  function buildPrintableBuildingTable(state, buildingName, selectedMonth) {
    const filters = getBuildingFilters();
    const templateOrderMap = getBuildingTemplateOrderMap(buildingName);
    const orderIndexMap = getBuildingDisplayOrderIndexMap(state, buildingName, selectedMonth);
    const tenants = getBuildingDisplayTenants(state, buildingName, selectedMonth)
      .slice()
      .sort((a, b) => {
        if (orderIndexMap) {
          const aOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(a) : String(a.id || '').trim();
          const bOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(b) : String(b.id || '').trim();
          const aOverrideIndex = orderIndexMap.has(aOrderKey) ? orderIndexMap.get(aOrderKey) : Number.MAX_SAFE_INTEGER;
          const bOverrideIndex = orderIndexMap.has(bOrderKey) ? orderIndexMap.get(bOrderKey) : Number.MAX_SAFE_INTEGER;
          if (aOverrideIndex !== bOverrideIndex) return aOverrideIndex - bOverrideIndex;
        }
        const seedDiff = Number(a.seedOrder ?? Number.MAX_SAFE_INTEGER) - Number(b.seedOrder ?? Number.MAX_SAFE_INTEGER);
        if (seedDiff !== 0) return seedDiff;
        if (templateOrderMap) {
          const aLookupKey = getTenantUnitLookupKey(a);
          const bLookupKey = getTenantUnitLookupKey(b);
          const aTemplateIndex = templateOrderMap.has(aLookupKey)
            ? templateOrderMap.get(aLookupKey)
            : Number.MAX_SAFE_INTEGER;
          const bTemplateIndex = templateOrderMap.has(bLookupKey)
            ? templateOrderMap.get(bLookupKey)
            : Number.MAX_SAFE_INTEGER;
          if (aTemplateIndex !== bTemplateIndex) return aTemplateIndex - bTemplateIndex;
        }
        return unitSortValue(String(a.unit || '')).localeCompare(unitSortValue(String(b.unit || '')), 'en', { numeric: true });
      })
      .filter((tenant) => {
        const matchesSearch = !filters.search || `${tenant.name} ${tenant.unit}`.toLowerCase().includes(filters.search.toLowerCase());
        const matchesUnit = filters.unit === 'all' || tenant.unit === filters.unit;
        const matchesStatus = filters.status === 'all' || tenant.status === filters.status;
        return matchesSearch && matchesUnit && matchesStatus;
      });

    const rows = tenants.map((tenant) => {
      const previousPaid = getTenantDuePaidAmount(state, tenant.id, selectedMonth);
      const oldTenantDuePaid = getOldTenantDuePaidNote(state, tenant.building, tenant.unit, selectedMonth);
      const printRowClasses = [];
      if (tenant.status === 'overdue') printRowClasses.push('print-row-late');
      if (tenant.isVacant) printRowClasses.push('print-row-vacant');
      return `<tr class="${printRowClasses.join(' ')}">
        <td><span class="floor-chip">${escapeHtml(tenant.floor || '-')}</span></td>
        <td>${escapeHtml(tenant.unit)}</td>
        <td>${escapeHtml(tenant.name)}</td>
        <td>${escapeHtml((STATUS_META[tenant.status] || STATUS_META.upcoming).label)}</td>
        <td class="amount">${formatBuildingAmountCell(Number(tenant.discount || 0))}</td>
        <td class="amount">${formatBuildingAmountCell(getBuildingVacantAmount(tenant))}</td>
        <td class="amount">${formatBuildingAmountCell(getBuildingActualAmount(tenant))}</td>
        <td class="amount">${formatBuildingAmountCell(tenant.prepaidFromBefore)}</td>
        <td class="amount">${formatBuildingAmountCell(tenant.paidCurrent)}</td>
        <td class="amount">${formatBuildingAmountCell(previousPaid)}</td>
        <td class="amount">${formatBuildingAmountCell(tenant.prepaidNext)}</td>
        <td class="amount">${formatBuildingAmountCell(tenant.totalDue)}</td>
        <td class="amount">${formatBuildingAmountCell(tenant.insuranceCurrentAmount)}</td>
        <td class="amount">${formatBuildingAmountCell(tenant.insurancePreviousAmount)}</td>
        <td class="amount">${formatBuildingAmountCell(oldTenantDuePaid)}</td>
        <td>${escapeHtml(getTenantNotesDisplay(tenant))}</td>
      </tr>`;
    }).join('');

    const summary = getBuildingSummary(state, buildingName, selectedMonth);
    const totals = renderBuildingTotalsRow(state, tenants, selectedMonth, summary);
    return {
      density: getPrintableBuildingDensity(tenants.length),
      html: `<table class="building-table print-building-table">
      <colgroup>
        <col class="print-col-unit">
        <col class="print-col-unit">
        <col class="print-col-tenant">
        <col class="print-col-status">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-money">
        <col class="print-col-notes">
      </colgroup>
      <thead><tr>
        <th>Floor</th>
        <th>Unit</th>
        <th>Tenant</th>
        <th>Status</th>
        <th class="amount">Discount</th>
        <th class="amount">Vacant</th>
        <th class="amount"><span class="print-header-stack"><span>Actual</span><span>rent</span></span></th>
        <th class="amount"><span class="print-header-stack"><span>Prepaid</span><span>before</span></span></th>
        <th class="amount"><span class="print-header-stack"><span>Current</span><span>month</span></span></th>
        <th class="amount"><span class="print-header-stack"><span>Paid</span><span>previous</span></span></th>
        <th class="amount">Prepaid</th>
        <th class="amount">Unpaid</th>
        <th class="amount"><span class="print-header-stack"><span>Ins.</span><span>current</span></span></th>
        <th class="amount"><span class="print-header-stack"><span>Ins.</span><span>previous</span></span></th>
        <th class="amount"><span class="print-header-stack"><span>Old due</span><span>paid</span></span></th>
        <th>Notes</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>${totals}</tfoot>
    </table>`
    };
  }

  function printCurrentBuilding(state) {
    const buildingName = window.__selectedBuildingName || getDefaultBuildingName(state);
    if (!buildingName) return;
    const selectedMonth = getSelectedBuildingMonth();
    const title = document.getElementById('printBuildingTitle');
    const month = document.getElementById('printBuildingMonth');
    const table = document.getElementById('printBuildingTable');
    const sheet = document.getElementById('printSheet');
    if (!title || !month || !table || !sheet) return;
    title.textContent = buildingName;
    month.textContent = formatMonth(selectedMonth);
    const printable = buildPrintableBuildingTable(state, buildingName, selectedMonth);
    sheet.classList.remove('print-density-roomy', 'print-density-medium', 'print-density-dense');
    sheet.classList.add(`print-density-${printable.density}`);
    table.innerHTML = printable.html;
    window.print();
  }

  function renderBuildingRow(state, tenant, selectedMonth) {
    const badge = STATUS_META[tenant.status] || STATUS_META.upcoming;
    const previousPaid = getTenantDuePaidAmount(state, tenant.id, selectedMonth);
    const oldTenantDuePaidNote = getOldTenantDuePaidNote(state, tenant.building, tenant.unit, selectedMonth);
    const rowClasses = [];
    const canOpenDetail = tenant.isVacant || tenant.isArchivedSnapshot || (!tenant.isArchivedSnapshot && !tenant.isVacant);
    if (canOpenDetail) rowClasses.push('clickable');
    if (tenant.status === 'overdue') rowClasses.push('is-late', 'is-dim');
    if (tenant.previousDue > 0) rowClasses.push('is-dim');
    if (tenant.plannedVacateDate && !tenant.isVacant) rowClasses.push('is-planned-vacate');
    if (tenant.isArchivedSnapshot) rowClasses.push('is-archived-snapshot');
    if (tenant.isVacant) rowClasses.push('is-vacant');
    const rowOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(tenant) : String(tenant.id || '').trim();
    const rowAttr = canOpenDetail
      ? ` data-tenant-row="${escapeHtml(tenant.id)}" data-building-row-order="${escapeHtml(rowOrderKey)}" data-row-building="${escapeHtml(tenant.building || '')}" data-row-unit="${escapeHtml(tenant.unit || '')}" data-row-floor="${escapeHtml(tenant.floor || '')}" data-row-unit-id="${escapeHtml(tenant.unitId || '')}" data-row-source-tenant-id="${escapeHtml(tenant.sourceTenantId || '')}"`
      : '';
    return `<tr class="${rowClasses.join(' ')}"${rowAttr}>
      <td><span class="floor-chip">${escapeHtml(tenant.floor || '-')}</span></td>
      <td>${escapeHtml(tenant.unit)}</td>
      <td>${escapeHtml(tenant.name)}</td>
      <td><span class="badge ${badge.className}">${badge.label}</span></td>
      <td class="amount">${formatBuildingAmountCell(Number(tenant.discount || 0))}</td>
      <td class="amount">${formatBuildingAmountCell(getBuildingVacantAmount(tenant))}</td>
      <td class="amount">${formatBuildingAmountCell(getBuildingActualAmount(tenant))}</td>
      <td class="amount">${formatBuildingAmountCell(tenant.prepaidFromBefore)}</td>
      <td class="center">${formatBuildingAmountCell(tenant.paidCurrent)}</td>
      <td class="amount">${formatBuildingAmountCell(previousPaid)}</td>
      <td class="amount">${formatBuildingAmountCell(tenant.prepaidNext)}</td>
      <td class="amount">${formatBuildingAmountCell(tenant.totalDue)}</td>
      <td class="amount">${formatBuildingAmountCell(tenant.insuranceCurrentAmount)}</td>
      <td class="amount">${formatBuildingAmountCell(tenant.insurancePreviousAmount)}</td>
      <td class="amount">${formatBuildingAmountCell(oldTenantDuePaidNote)}</td>
      <td class="notes-cell">${escapeHtml(getTenantNotesDisplay(tenant))}</td>
    </tr>`;
  }

  function getTenantNotesDisplay(tenant) {
    const parts = [];
    if (tenant.isVacant && tenant.vacatedOn) {
      parts.push(`Vacant since ${tenant.vacatedOn}`);
    }
    if (tenant.isVacant && Number(tenant.lastActualRent || 0) > 0) {
      parts.push(`Last actual rent ${formatCurrency(tenant.lastActualRent)}`);
    }
    if (tenant.isVacant && Number(tenant.lastContractRent || 0) > 0) {
      parts.push(`Last contract rent ${formatCurrency(tenant.lastContractRent)}`);
    }
    if (!tenant.isVacant && tenant.moveInDate && tenant.contractStart && tenant.moveInDate !== tenant.contractStart) {
      parts.push(`Moves in ${tenant.moveInDate}`);
    }
    if (!tenant.isVacant && (tenant.isPreContractOccupancy || tenant.startsNextMonthVisible) && tenant.contractStart) {
      if (tenant.moveInDate) {
        parts.push(`Moved in ${tenant.moveInDate}`);
      }
      parts.push('Starts next month');
      parts.push(`Contract starts ${tenant.contractStart}`);
      if (Number(tenant.prepaidNext || 0) > 0) {
        parts.push(`Prepaid for ${formatMonth(addMonths(getMonthKeyFromDate(tenant.contractStart), 0))}`);
      }
    }
    if (tenant.plannedVacateDate && !tenant.isVacant) {
      parts.push(`Planned vacate ${tenant.plannedVacateDate}`);
    }
    if (tenant.notes) parts.push(String(tenant.notes).trim());
    return parts.filter(Boolean).join(' · ') || '-';
  }

  function getJanuaryBaselineBankAdjustment(tenant, selectedMonth) {
    const monthKey = String(selectedMonth || '').trim();
    const buildingName = String(tenant && tenant.building || '').trim();
    const unit = String(tenant && tenant.unit || '').trim().toUpperCase();
    const floor = String(normalizeFloorLabel(tenant && tenant.floor || '') || '').trim().toUpperCase();
    const monthRules = BASELINE_BANK_RULES[monthKey] || null;
    const buildingRules = monthRules && monthRules[buildingName] ? monthRules[buildingName] : null;
    if (!buildingRules) return 0;
    if (typeof buildingRules === 'number') {
      const firstVisibleRow = typeof getBuildingDisplayTenants === 'function'
        ? (getBuildingDisplayTenants(window.__appState, buildingName, selectedMonth)[0] || null)
        : null;
      return firstVisibleRow && String(firstVisibleRow.id || '').trim() === String(tenant && tenant.id || '').trim()
        ? Number(buildingRules || 0)
        : 0;
    }
    const matchesBaselineRule = buildingRules.some((rule) => {
      const normalizedRule = String(rule || '').trim().toUpperCase();
      if (!normalizedRule) return false;
      if (normalizedRule.includes('::')) {
        const [ruleFloor, ruleUnit] = normalizedRule.split('::');
        return floor === String(ruleFloor || '').trim() && unit === String(ruleUnit || '').trim();
      }
      return unit === normalizedRule;
    });
    if (!matchesBaselineRule) return 0;
    // Baseline month starts without the prior month file, so these units are treated as prepaid from the month before.
    return Number(tenant && tenant.rentDue || 0);
  }

  function shouldExcludeTenantFromCurrentMonthFooter(tenant, selectedMonth) {
    const monthKey = String(selectedMonth || '').trim();
    const buildingName = String(tenant && tenant.building || '').trim().toLowerCase();
    const unit = String(tenant && tenant.unit || '').trim();
    const name = String(tenant && tenant.name || '').trim();
    const sourceTenantId = String(tenant && (tenant.sourceTenantId || tenant.id) || '').trim();
    const matchesProtectedRow = buildingName === 'fahaheel'
      && (unit === '\u0633\u0637\u062D' || name === '\u0634\u0628\u0643\u0629' || sourceTenantId === 'fahaheel-\u0633\u0637\u062D');
    return (monthKey === '2026-01' || monthKey === '2026-02')
      && buildingName === 'fahaheel'
      && matchesProtectedRow;
  }

  function getBuildingCurrentMonthSummaryAmount(tenant, selectedMonth) {
    if (shouldExcludeTenantFromCurrentMonthFooter(tenant, selectedMonth)) return 0;
    return Number(tenant && tenant.paidCurrent || 0);
  }

  function renderBuildingTotalsRow(state, tenants, selectedMonth, summary) {
    const actualRentTotal = tenants.reduce((sum, tenant) => sum + getBuildingActualAmount(tenant), 0);
    const discountTotal = tenants.reduce((sum, tenant) => sum + Number(tenant.discount || 0), 0);
    const vacantTotal = tenants.reduce((sum, tenant) => sum + getBuildingVacantAmount(tenant), 0);
    const paidCurrentTotal = tenants.reduce((sum, tenant) => sum + Number(tenant && tenant.paidCurrent || 0), 0);
    const previousPaidTotal = tenants.reduce((sum, tenant) => sum + Number(getTenantDuePaidAmount(state, tenant.id, selectedMonth) || 0), 0);
    const prepaidFromBeforeTotal = tenants.reduce((sum, tenant) => sum + Number(tenant.prepaidFromBefore || 0), 0);
    const prepaidTotal = tenants.reduce((sum, tenant) => sum + Number(tenant.prepaidNext || 0), 0);
    const unpaidTotal = tenants.reduce((sum, tenant) => sum + Number(tenant.totalDue || 0), 0);
    const insurancePreviousTotal = tenants.reduce((sum, tenant) => sum + Number(tenant.insurancePreviousAmount || 0), 0);
    const insuranceCurrentTotal = tenants.reduce((sum, tenant) => sum + Number(tenant.insuranceCurrentAmount || 0), 0);
    const oldTenantDuePaidTotal = tenants.reduce((sum, tenant) => sum + Number(getOldTenantDuePaidNote(state, tenant.building, tenant.unit, selectedMonth) || 0), 0);
    const totalCurrentMonth = previousPaidTotal
      + tenants.reduce((sum, tenant) => sum + getBuildingCurrentMonthSummaryAmount(tenant, selectedMonth), 0)
      + insuranceCurrentTotal
      + oldTenantDuePaidTotal;
    const januaryBaselineAdjustment = tenants.reduce((sum, tenant) => (
      sum + getJanuaryBaselineBankAdjustment(tenant, selectedMonth)
    ), 0);
    const totalInBank = totalCurrentMonth - januaryBaselineAdjustment;
    const summaryValueColspan = BUILDING_TABLE_COLUMN_COUNT - 4;
    const countRows = summary
      ? `<tr class="totals-row totals-row-muted"><td colspan="4"><strong>Empty units</strong></td><td colspan="${summaryValueColspan}"><strong>${Math.max(Number(summary.totalUnits || 0) - Number(summary.occupied || 0), 0)}</strong></td></tr>
         <tr class="totals-row totals-row-muted"><td colspan="4"><strong>Total units</strong></td><td colspan="${summaryValueColspan}"><strong>${Number(summary.totalUnits || 0)}</strong></td></tr>`
      : '';
    const baselineAdjustmentRow = januaryBaselineAdjustment > 0
      ? `<tr class="totals-row totals-row-muted"><td colspan="4"><strong>Baseline December prepaid</strong></td><td colspan="${summaryValueColspan}"><strong>${formatCurrency(januaryBaselineAdjustment)}</strong></td></tr>`
      : '';
    return `<tr class="totals-row"><td colspan="4"><strong>Total</strong></td><td class="amount"><strong>${formatCurrency(discountTotal)}</strong></td><td class="amount"><strong>${formatCurrency(vacantTotal)}</strong></td><td class="amount"><strong>${formatCurrency(actualRentTotal)}</strong></td><td class="amount"><strong>${formatCurrency(prepaidFromBeforeTotal)}</strong></td><td class="center"><strong>${formatCurrency(paidCurrentTotal)}</strong></td><td class="amount"><strong>${formatCurrency(previousPaidTotal)}</strong></td><td class="amount"><strong>${formatCurrency(prepaidTotal)}</strong></td><td class="amount"><strong>${formatCurrency(unpaidTotal)}</strong></td><td class="amount"><strong>${formatCurrency(insuranceCurrentTotal)}</strong></td><td class="amount"><strong>${formatCurrency(insurancePreviousTotal)}</strong></td><td class="amount"><strong>${formatCurrency(oldTenantDuePaidTotal)}</strong></td><td></td></tr><tr class="totals-row totals-row-muted"><td colspan="4"><strong>Total current month</strong></td><td colspan="${summaryValueColspan}"><strong>${formatCurrency(totalCurrentMonth)}</strong></td></tr>${baselineAdjustmentRow}<tr class="totals-row totals-row-muted"><td colspan="4"><strong>Total in bank</strong></td><td colspan="${summaryValueColspan}"><strong>${formatCurrency(totalInBank)}</strong></td></tr>${countRows}`;
  }

  function renderBuildingsPage(state, selectedBuilding) {
    if (!state || !Array.isArray(state.buildings) || !state.buildings.length) {
      renderBuildingsEmptyState('No buildings are available yet.');
      return;
    }

    let chosenBuilding = selectedBuilding || window.__selectedBuildingName || getDefaultBuildingName(state);
    let chosenBuildingMeta = state.buildings.find((building) => building.name === chosenBuilding) || state.buildings[0];
    let chosenArea = window.__selectedAreaName || (chosenBuildingMeta && chosenBuildingMeta.area) || getDefaultAreaName(state);
    if (!state.buildings.some((building) => building.area === chosenArea)) {
      chosenArea = (chosenBuildingMeta && chosenBuildingMeta.area) || getDefaultAreaName(state);
    }
    if (chosenArea && chosenBuildingMeta && chosenBuildingMeta.area !== chosenArea) {
      const preferredInArea = getPreferredBuildingForArea(state, chosenArea);
      if (preferredInArea) {
        chosenBuilding = preferredInArea;
        chosenBuildingMeta = state.buildings.find((building) => building.name === preferredInArea) || chosenBuildingMeta;
      }
    }
    if (!chosenBuildingMeta) {
      chosenBuilding = getPreferredBuildingForArea(state, chosenArea) || getDefaultBuildingName(state);
      chosenBuildingMeta = state.buildings.find((building) => building.name === chosenBuilding) || state.buildings[0];
    }
    if (!chosenBuildingMeta) {
      renderBuildingsEmptyState('No buildings are available for the selected area.');
      return;
    }
    if (!window.__selectedBuildingMonth) window.__selectedBuildingMonth = getActiveMonthKey();
    window.__selectedBuildingName = chosenBuilding;
    window.__selectedAreaName = chosenBuildingMeta.area || chosenArea;
    saveBuildingViewPreference();
    renderAreaGrid(state, window.__selectedAreaName, getSelectedBuildingMonth());
    renderAreaBuildingsGrid(state, window.__selectedAreaName, chosenBuilding, getSelectedBuildingMonth());
    bindAreaCards(state);
    bindBuildingCards(state);
    renderBuildingMonthTabs();
    renderBuildingDetails(state, chosenBuilding);
  }
