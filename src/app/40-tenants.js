  function getTenantColumnDefinitions() {
    return [
      { key: 'drag', label: '' },
      { key: 'building', label: 'Building' },
      { key: 'unit', label: 'Unit' },
      { key: 'floor', label: 'Floor' },
      { key: 'tenant', label: 'Tenant' },
      { key: 'status', label: 'Status' },
      { key: 'due', label: 'Due', className: 'amount' },
      { key: 'moveInDate', label: 'Move in' },
      { key: 'contractStart', label: 'Contract start' },
      { key: 'contractEnd', label: 'Contract end' },
      { key: 'phone', label: 'Phone' },
      { key: 'civilId', label: 'Civil ID' },
      { key: 'nationality', label: 'Nationality' },
      { key: 'action', label: 'Action', className: 'center' }
    ];
  }

  function refreshBuildingTenantOrder(state, buildingName) {
    const buildingTenants = state.tenants
      .filter((tenant) => tenant.building === buildingName);
    const otherTenants = state.tenants.filter((tenant) => tenant.building !== buildingName);
    state.tenants = otherTenants.concat(buildingTenants);
    state.tenants.forEach((tenant, index) => {
      tenant.seedOrder = index;
    });
  }

  function compareTenantCanonicalPosition(state, leftTenant, rightTenant) {
    const leftBuildingIndex = state.buildings.findIndex((building) => building.name === leftTenant.building);
    const rightBuildingIndex = state.buildings.findIndex((building) => building.name === rightTenant.building);
    if (leftBuildingIndex !== rightBuildingIndex) return leftBuildingIndex - rightBuildingIndex;

    const seedDiff = Number(leftTenant.seedOrder ?? Number.MAX_SAFE_INTEGER) - Number(rightTenant.seedOrder ?? Number.MAX_SAFE_INTEGER);
    if (seedDiff !== 0) return seedDiff;

    const templateOrderMap = getBuildingTemplateOrderMap(leftTenant.building);
    if (templateOrderMap) {
      const leftLookupKey = getTenantUnitLookupKey(leftTenant);
      const rightLookupKey = getTenantUnitLookupKey(rightTenant);
      const leftTemplateIndex = templateOrderMap.has(leftLookupKey)
        ? templateOrderMap.get(leftLookupKey)
        : Number.MAX_SAFE_INTEGER;
      const rightTemplateIndex = templateOrderMap.has(rightLookupKey)
        ? templateOrderMap.get(rightLookupKey)
        : Number.MAX_SAFE_INTEGER;
      if (leftTemplateIndex !== rightTemplateIndex) return leftTemplateIndex - rightTemplateIndex;
    }

    return unitSortValue(String(leftTenant.unit || '')).localeCompare(unitSortValue(String(rightTenant.unit || '')), 'en', { numeric: true });
  }

  function getTenantOrderIndexMap(state, buildingName, monthKey) {
    return typeof getBuildingDisplayOrderIndexMap === 'function'
      ? getBuildingDisplayOrderIndexMap(state, buildingName, monthKey)
      : null;
  }

  function renderTenantHeaderCell(column) {
    const className = column.className ? ` class="${column.className}"` : '';
    return `<th${className}>${escapeHtml(column.label)}</th>`;
  }

  function choosePreferredTenantDisplayRow(currentTenant, nextTenant) {
    if (!currentTenant) return nextTenant;
    if (!nextTenant) return currentTenant;
    const getFinancialWeight = (tenant) => normalizeAmount(
      Number(tenant && tenant.prepaidFromBefore || 0)
      + Number(tenant && tenant.prepaidNext || 0)
      + Number(tenant && tenant.insuranceCurrentAmount || 0)
      + Number(tenant && tenant.insurancePreviousAmount || 0)
      + Number(tenant && tenant.paidCurrent || 0)
      + Number(tenant && tenant.previousDue || 0)
    );
    const currentRank = currentTenant.isArchivedSnapshot ? 1 : currentTenant.isVacant ? 2 : 3;
    const nextRank = nextTenant.isArchivedSnapshot ? 1 : nextTenant.isVacant ? 2 : 3;
    if (currentRank !== nextRank) return nextRank > currentRank ? nextTenant : currentTenant;
    const currentFinancialWeight = getFinancialWeight(currentTenant);
    const nextFinancialWeight = getFinancialWeight(nextTenant);
    if (currentFinancialWeight !== nextFinancialWeight) {
      return nextFinancialWeight > currentFinancialWeight ? nextTenant : currentTenant;
    }
    const currentFloor = normalizeFloorLabel(currentTenant.floor);
    const nextFloor = normalizeFloorLabel(nextTenant.floor);
    const currentHasRealFloor = !!currentFloor && currentFloor.toLowerCase() !== 'floor';
    const nextHasRealFloor = !!nextFloor && nextFloor.toLowerCase() !== 'floor';
    if (currentHasRealFloor !== nextHasRealFloor) {
      return nextHasRealFloor ? nextTenant : currentTenant;
    }
    const currentHasLastTenant = /last tenant:/i.test(String(currentTenant.notes || ''));
    const nextHasLastTenant = /last tenant:/i.test(String(nextTenant.notes || ''));
    if (currentHasLastTenant !== nextHasLastTenant) {
      return nextHasLastTenant ? nextTenant : currentTenant;
    }
    const currentVacatedOn = String(currentTenant.vacatedOn || '').trim();
    const nextVacatedOn = String(nextTenant.vacatedOn || '').trim();
    if (!!currentVacatedOn !== !!nextVacatedOn) {
      return nextVacatedOn ? nextTenant : currentTenant;
    }
    return currentTenant;
  }

  function dedupeTenantDisplayRows(tenants) {
    const preferredByKey = new Map();
    tenants.forEach((tenant) => {
      const key = getTenantRowOrderKey(tenant);
      preferredByKey.set(key, choosePreferredTenantDisplayRow(preferredByKey.get(key), tenant));
    });
    return tenants.filter((tenant) => {
      const key = getTenantRowOrderKey(tenant);
      return preferredByKey.get(key) === tenant;
    });
  }

  function renderTenantColGroup() {
    return `<colgroup>
      <col class="tenant-col-drag">
      <col class="tenant-col-building">
      <col class="tenant-col-unit">
      <col class="tenant-col-floor">
      <col class="tenant-col-tenant">
      <col class="tenant-col-status">
      <col class="tenant-col-due">
      <col class="tenant-col-move-in">
      <col class="tenant-col-contract-start">
      <col class="tenant-col-contract-end">
      <col class="tenant-col-phone">
      <col class="tenant-col-civil">
      <col class="tenant-col-nationality">
      <col class="tenant-col-action">
    </colgroup>`;
  }

  function getShortUnitIdLabel(unitId) {
    const normalized = String(unitId || '').trim();
    if (!normalized) return '';
    const trailingNumberMatch = normalized.match(/(\d+)\s*$/);
    if (!trailingNumberMatch) return normalized;
    return String(Number(trailingNumberMatch[1]));
  }

  function getTenantRowOrderKey(tenant) {
    return typeof getTenantOrderKey === 'function'
      ? getTenantOrderKey(tenant)
      : String((tenant && (tenant.sourceTenantId || tenant.id)) || '').trim();
  }

  function renderTenantTotalsRow(state, tenants, buildingName) {
    const totalUnits = tenants.length;
    return `<tr class="totals-row totals-row-muted"><td colspan="12"><strong>Total units</strong></td><td class="center"><strong>${escapeHtml(String(totalUnits))}</strong></td></tr>`;
  }

  function getTenantReorderBuilding(buildingFilter, tenants) {
    const normalizedFilter = String(buildingFilter || 'all').trim() || 'all';
    if (normalizedFilter !== 'all') return normalizedFilter;
    const visibleBuildings = Array.from(new Set(
      (Array.isArray(tenants) ? tenants : [])
        .map((tenant) => String(tenant && tenant.building || '').trim())
        .filter(Boolean)
    ));
    return visibleBuildings.length === 1 ? visibleBuildings[0] : '';
  }

  function renderTenantBodyCell(state, tenant, column) {
    const selectedMonth = getSelectedTenantMonth();
    const isLockedBaseline = isTenantMonthLocked(tenant, selectedMonth);
    const readOnlyAttr = isLockedBaseline ? ' readonly aria-readonly="true"' : '';
    const disabledAttr = isLockedBaseline ? ' disabled aria-disabled="true"' : '';
    const reorderBuilding = String(window.__tenantReorderBuilding || '').trim();
    if (column.key === 'drag') {
      if (!reorderBuilding || isLockedBaseline) return '<td class="center">-</td>';
      return `<td class="center"><span class="drag-handle" draggable="true" data-tenant-row-drag-handle="${escapeHtml(getTenantRowOrderKey(tenant))}" title="Drag to reorder">&#8801;</span></td>`;
    }
    if (column.key === 'building') {
      const unitIdNote = tenant.unitId
        ? `<div class="small-note tenant-unit-id-note">Row ${escapeHtml(getShortUnitIdLabel(tenant.unitId))}</div>`
        : '';
      return `<td>${escapeHtml(getBuildingDisplayLabel(tenant.building))}${unitIdNote}</td>`;
    }
    if (column.key === 'unit') {
      if (tenant.isVacant) {
        return `<td><input type="text" value="${escapeHtml(tenant.unit)}" data-tenant-unit="${escapeHtml(tenant.id)}" placeholder="Unit"${readOnlyAttr}></td>`;
      }
      return `<td><input type="text" value="${escapeHtml(tenant.unit)}" data-tenant-unit="${escapeHtml(tenant.id)}" placeholder="Unit"${readOnlyAttr}></td>`;
    }
    if (column.key === 'floor') {
      if (tenant.isVacant) {
        return `<td><input type="text" value="${escapeHtml(tenant.floor || '')}" data-tenant-floor="${escapeHtml(tenant.id)}" placeholder="Floor"${readOnlyAttr}></td>`;
      }
      return `<td><input type="text" value="${escapeHtml(tenant.floor || '')}" data-tenant-floor="${escapeHtml(tenant.id)}" placeholder="Floor"${readOnlyAttr}></td>`;
    }
    if (column.key === 'tenant') {
      if (tenant.isVacant) {
        return `<td>
          <button type="button" class="tenant-name-display" data-tenant-profile-toggle="${escapeHtml(tenant.id)}" data-tenant-profile-unit-id="${escapeHtml(tenant.unitId || '')}" data-tenant-profile-source-tenant-id="${escapeHtml(tenant.sourceTenantId || '')}" data-tenant-profile-building="${escapeHtml(tenant.building || '')}" data-tenant-profile-unit="${escapeHtml(tenant.unit || '')}" data-tenant-profile-floor="${escapeHtml(tenant.floor || '')}">${escapeHtml(tenant.name || 'Available unit')}</button>
          <div class="small-note">${escapeHtml(getTenantNotesDisplay(tenant))}</div>
        </td>`;
      }
      const tenantDetailParts = [];
      if ((tenant.isPreContractOccupancy || tenant.startsNextMonthVisible) && tenant.contractStart) {
        if (tenant.moveInDate) {
          tenantDetailParts.push(`Moved in ${formatDate(tenant.moveInDate)}`);
        }
        tenantDetailParts.push('Starts next month');
      } else if (tenant.contractStart) {
        tenantDetailParts.push(`Started ${formatDate(tenant.contractStart)}`);
      }
      return `<td>
        <button type="button" class="tenant-name-display" data-tenant-profile-toggle="${escapeHtml(tenant.id)}" data-tenant-profile-unit-id="${escapeHtml(tenant.unitId || '')}" data-tenant-profile-source-tenant-id="${escapeHtml(tenant.sourceTenantId || '')}" data-tenant-profile-building="${escapeHtml(tenant.building || '')}" data-tenant-profile-unit="${escapeHtml(tenant.unit || '')}" data-tenant-profile-floor="${escapeHtml(tenant.floor || '')}">${escapeHtml(tenant.name)}</button>
        <div class="small-note">${escapeHtml(tenantDetailParts.join(' · ') || '-')}</div>
      </td>`;
    }
    if (column.key === 'status') return `<td><span class="badge ${STATUS_META[tenant.status].className}">${STATUS_META[tenant.status].label}</span></td>`;
    if (column.key === 'due') return `<td class="amount">${formatCurrency(tenant.totalDue)}</td>`;
    if (column.key === 'moveInDate') {
      if (tenant.isVacant) return `<td>${escapeHtml(tenant.vacatedOn ? formatDate(tenant.vacatedOn) : '--------')}</td>`;
      const moveInDisplay = tenant.moveInDate && tenant.contractStart && tenant.moveInDate !== tenant.contractStart
        ? formatDate(tenant.moveInDate)
        : '--------';
      return `<td>${escapeHtml(moveInDisplay)}</td>`;
    }
    if (column.key === 'contractStart') return tenant.isVacant ? `<td>-</td>` : `<td><input type="date" value="${escapeHtml(tenant.contractStart || '')}" data-tenant-contract-start="${escapeHtml(tenant.id)}"${readOnlyAttr}></td>`;
    if (column.key === 'contractEnd') return tenant.isVacant ? `<td>-</td>` : `<td><input type="date" value="${escapeHtml(tenant.contractEnd || '')}" data-tenant-contract-end="${escapeHtml(tenant.id)}"${readOnlyAttr}></td>`;
    if (column.key === 'phone') return `<td>${escapeHtml(tenant.phone || '-')}</td>`;
    if (column.key === 'civilId') return `<td>${escapeHtml(tenant.civilId || '-')}</td>`;
    if (column.key === 'nationality') return `<td>${escapeHtml(tenant.isVacant ? '-' : (tenant.nationality || 'Not set'))}</td>`;
    if (column.key === 'action') {
      return `<td class="center"><button type="button" class="tenant-save-button" data-save-tenant-profile="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked' : 'Save'}</button></td>`;
    }
    return '<td></td>';
  }

  function saveBuildingTenantOrderByIds(state, buildingName, monthKey, orderedIds) {
    setBuildingTenantOrderOverride(state, buildingName, monthKey, orderedIds);
  }

  function preserveVisibleTenantOrderForBuilding(state, buildingName, monthKey) {
    const buildingKey = String(buildingName || '').trim();
    const selectedMonth = String(monthKey || getSelectedTenantMonth() || '').trim();
    if (!buildingKey || !selectedMonth) return;

    const rowIds = Array.from(document.querySelectorAll('[data-tenant-row-order]'))
      .map((row) => String(row.getAttribute('data-tenant-row-order') || '').trim())
      .filter(Boolean);
    if (!rowIds.length) return;

    const tenantViews = typeof getAllVisibleUnitRows === 'function'
      ? getAllVisibleUnitRows(state, selectedMonth)
      : state.buildings.flatMap((buildingMeta) => (
        typeof getBuildingUnitRows === 'function'
          ? getBuildingUnitRows(state, buildingMeta.name, selectedMonth)
          : getTenantViews(state, selectedMonth).filter((tenant) => tenant.building === buildingMeta.name)
      ));
    const viewMap = new Map(tenantViews.map((tenant) => [getTenantRowOrderKey(tenant), tenant]));
    const visibleBuildingIds = [];
    const seenVisible = new Set();
    rowIds.forEach((id) => {
      if (seenVisible.has(id)) return;
      seenVisible.add(id);
      const tenant = viewMap.get(id);
      if (tenant && tenant.building === buildingKey) visibleBuildingIds.push(id);
    });
    if (!visibleBuildingIds.length) return;

    const orderedBuildingIds = tenantViews
      .filter((tenant) => tenant.building === buildingKey)
      .sort((leftTenant, rightTenant) => compareTenantOriginalPosition(state, leftTenant, rightTenant))
      .map((tenant) => getTenantRowOrderKey(tenant))
      .filter(Boolean);

    const nextOrderedIds = [];
    const seenIds = new Set();
    visibleBuildingIds.concat(orderedBuildingIds).forEach((id) => {
      if (seenIds.has(id)) return;
      seenIds.add(id);
      nextOrderedIds.push(id);
    });
    if (!nextOrderedIds.length) return;

    saveBuildingTenantOrderByIds(state, buildingKey, selectedMonth, nextOrderedIds);
  }

  function compareTenantOriginalPosition(state, leftTenant, rightTenant) {
    const selectedMonth = getSelectedTenantMonth();
    const orderIndexMap = leftTenant.building === rightTenant.building
      ? getTenantOrderIndexMap(state, leftTenant.building, selectedMonth)
      : null;
    if (orderIndexMap) {
      const leftOrderKey = getTenantRowOrderKey(leftTenant);
      const rightOrderKey = getTenantRowOrderKey(rightTenant);
      const leftOverrideIndex = orderIndexMap.has(leftOrderKey) ? orderIndexMap.get(leftOrderKey) : Number.MAX_SAFE_INTEGER;
      const rightOverrideIndex = orderIndexMap.has(rightOrderKey) ? orderIndexMap.get(rightOrderKey) : Number.MAX_SAFE_INTEGER;
      if (leftOverrideIndex !== rightOverrideIndex) return leftOverrideIndex - rightOverrideIndex;
    }
    const seedDiff = Number(leftTenant.seedOrder ?? Number.MAX_SAFE_INTEGER) - Number(rightTenant.seedOrder ?? Number.MAX_SAFE_INTEGER);
    if (seedDiff !== 0) return seedDiff;
    const templateOrderMap = leftTenant.building === rightTenant.building
      ? getBuildingTemplateOrderMap(leftTenant.building)
      : null;
    if (templateOrderMap) {
      const leftLookupKey = getTenantUnitLookupKey(leftTenant);
      const rightLookupKey = getTenantUnitLookupKey(rightTenant);
      const leftTemplateIndex = templateOrderMap.has(leftLookupKey)
        ? templateOrderMap.get(leftLookupKey)
        : Number.MAX_SAFE_INTEGER;
      const rightTemplateIndex = templateOrderMap.has(rightLookupKey)
        ? templateOrderMap.get(rightLookupKey)
        : Number.MAX_SAFE_INTEGER;
      if (leftTemplateIndex !== rightTemplateIndex) return leftTemplateIndex - rightTemplateIndex;
    }
    if (
      leftTenant.building === rightTenant.building
      && String(leftTenant.unit || '').trim().toUpperCase() === String(rightTenant.unit || '').trim().toUpperCase()
    ) {
      if (!!leftTenant.isVacant !== !!rightTenant.isVacant) return leftTenant.isVacant ? -1 : 1;
      if (!!leftTenant.isArchivedSnapshot !== !!rightTenant.isArchivedSnapshot) return leftTenant.isArchivedSnapshot ? -1 : 1;
    }
    return unitSortValue(String(leftTenant.unit || '')).localeCompare(unitSortValue(String(rightTenant.unit || '')), 'en', { numeric: true });
  }

  function attachTenantRowDnD(state, buildingName) {
    if (!buildingName || buildingName === 'all') return;
    const rows = Array.from(document.querySelectorAll('[data-tenant-row-order]'));
    if (!rows.length) return;
    const handles = Array.from(document.querySelectorAll('[data-tenant-row-drag-handle]'));
    if (!handles.length) return;
    let draggedId = '';
    handles.forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
        draggedId = handle.getAttribute('data-tenant-row-drag-handle') || '';
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.dropEffect = 'move';
          event.dataTransfer.setData('text/plain', draggedId);
        }
        const row = handle.closest('[data-tenant-row-order]');
        if (row) row.classList.add('is-dragging-row');
      });
      handle.addEventListener('dragend', () => {
        const row = handle.closest('[data-tenant-row-order]');
        if (row) row.classList.remove('is-dragging-row');
        document.querySelectorAll('[data-tenant-row-order]').forEach((node) => node.classList.remove('drag-row-target'));
        draggedId = '';
      });
    });
    rows.forEach((row) => {
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-row-target');
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-row-target');
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('drag-row-target');
        const selectedMonth = getSelectedTenantMonth();
        if (!canEditBuildingMonth(buildingName, selectedMonth)) {
          return;
        }
        const targetId = row.getAttribute('data-tenant-row-order') || '';
        if (!draggedId || !targetId || draggedId === targetId) return;
        const currentIds = Array.from(document.querySelectorAll('[data-tenant-row-order]'))
          .map((node) => node.getAttribute('data-tenant-row-order'))
          .filter(Boolean);
        const fromIndex = currentIds.indexOf(draggedId);
        const toIndex = currentIds.indexOf(targetId);
        if (fromIndex < 0 || toIndex < 0) return;
        currentIds.splice(toIndex, 0, currentIds.splice(fromIndex, 1)[0]);
        saveBuildingTenantOrderByIds(state, buildingName, selectedMonth, currentIds);
        saveState(state);
        logActivity(state, 'Tenant order updated', `${buildingName} tenant order changed from the Tenants page.`);
        renderAll(state, buildingName);
      });
    });
  }

  function renderTenants(state) {
    const container = document.getElementById('tenantList');
    if (!container) return;
    const search = ((document.getElementById('tenantSearch') || {}).value || '').toLowerCase();
    const status = ((document.getElementById('statusFilter') || {}).value || 'all');
    const building = ((document.getElementById('tenantBuildingFilter') || {}).value || 'all');
    const selectedMonth = getSelectedTenantMonth();
    const sourceTenants = typeof getAllVisibleUnitRows === 'function'
      ? getAllVisibleUnitRows(state, selectedMonth)
      : state.buildings.flatMap((buildingMeta) => (
        typeof getBuildingUnitRows === 'function'
          ? getBuildingUnitRows(state, buildingMeta.name, selectedMonth)
          : getTenantViews(state, selectedMonth).filter((tenant) => tenant.building === buildingMeta.name)
      ));
    const monthAwareTenants = sourceTenants.map((tenant) => {
      if (!tenant || tenant.isVacant || typeof getEffectiveTenantProfile !== 'function') return tenant;
      const profile = getEffectiveTenantProfile(state, tenant, selectedMonth) || null;
      if (!profile) return tenant;
      return Object.assign({}, tenant, {
        name: profile.name,
        unit: profile.unit,
        floor: profile.floor,
        moveInDate: profile.moveInDate,
        contractStart: profile.contractStart,
        contractEnd: profile.contractEnd,
        phone: profile.phone,
        civilId: profile.civilId,
        nationality: profile.nationality
      });
    });
    const tenants = dedupeTenantDisplayRows(monthAwareTenants).filter((tenant) => {
      const text = `${tenant.name} ${tenant.unit} ${tenant.phone || ''} ${tenant.civilId || ''}`.toLowerCase();
      const matchesSearch = !search || text.includes(search);
      const matchesStatus = status === 'all' || tenant.status === status;
      const matchesBuilding = building === 'all' || tenant.building === building;
      return matchesSearch && matchesStatus && matchesBuilding;
    }).sort((a, b) => compareTenantOriginalPosition(state, a, b));
    const reorderBuilding = getTenantReorderBuilding(building, tenants);
    window.__tenantReorderBuilding = reorderBuilding;
    const orderedColumns = getTenantColumnDefinitions();
    const headerHtml = orderedColumns.map((column) => renderTenantHeaderCell(column)).join('');
    const rowsHtml = tenants.map((tenant) => {
      const isLockedBaseline = isTenantMonthLocked(tenant, selectedMonth);
        const rowClasses = [
          tenant.status === 'overdue' ? 'is-late' : '',
          tenant.isVacant ? 'is-vacant' : '',
          (reorderBuilding && !isLockedBaseline) ? 'draggable-row' : ''
        ].filter(Boolean).join(' ');
        const dragAttr = (reorderBuilding && !isLockedBaseline) ? ` data-tenant-row-order="${escapeHtml(getTenantRowOrderKey(tenant))}"` : '';
        return `<tr data-tenant-profile-row="${escapeHtml(tenant.id)}" data-tenant-profile-unit-id="${escapeHtml(tenant.unitId || '')}" data-tenant-profile-source-tenant-id="${escapeHtml(tenant.sourceTenantId || '')}" data-tenant-profile-building="${escapeHtml(tenant.building || '')}" data-tenant-profile-unit="${escapeHtml(tenant.unit || '')}" data-tenant-profile-floor="${escapeHtml(tenant.floor || '')}" class="${rowClasses}"${dragAttr}>${orderedColumns.map((column) => renderTenantBodyCell(state, tenant, column)).join('')}</tr>`;
      }).join('');
    const totalsHtml = renderTenantTotalsRow(state, tenants, building);
    container.innerHTML = tenants.length ? `<div class="table-scroll"><table class="building-table tenant-table">${renderTenantColGroup()}<thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody><tfoot>${totalsHtml}</tfoot></table></div>` : '<div class="empty-state">No tenants found.</div>';
    if (typeof applyResponsiveTableLabels === 'function') {
      applyResponsiveTableLabels(container.querySelector('.tenant-table'));
    }
    container.querySelectorAll('[data-save-tenant-profile]').forEach((button) => {
      button.addEventListener('click', () => {
        const tenantId = button.getAttribute('data-save-tenant-profile');
        const tenant = tenants.find((item) => String(item && item.id || '').trim() === String(tenantId || '').trim()) || null;
        if (tenant && typeof showFlashMessage === 'function') {
          showFlashMessage(`Saving ${tenant.building} ${tenant.unit}...`);
        }
        saveTenantProfile(state, tenantId);
      });
    });
    attachTenantRowDnD(state, reorderBuilding);
    container.querySelectorAll('[data-tenant-profile-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        toggleTenantProfileDetail(state, button.getAttribute('data-tenant-profile-toggle'));
      });
    });
  }

  function findTenantProfileRow(tenantId) {
    return Array.from(document.querySelectorAll('[data-tenant-profile-row]')).find((row) => row.getAttribute('data-tenant-profile-row') === tenantId) || null;
  }

  function findTenantProfileTargetByRowContext(state, row, monthKey) {
    if (!row) return null;
    const unitId = String(row.getAttribute('data-tenant-profile-unit-id') || '').trim();
    const sourceTenantId = String(row.getAttribute('data-tenant-profile-source-tenant-id') || '').trim();
    const buildingName = String(row.getAttribute('data-tenant-profile-building') || '').trim();
    const unit = String(row.getAttribute('data-tenant-profile-unit') || '').trim();
    const floor = normalizeFloorLabel(row.getAttribute('data-tenant-profile-floor') || '');
    const visibleRows = typeof getAllVisibleUnitRows === 'function'
      ? getAllVisibleUnitRows(state, monthKey)
      : state.buildings.flatMap((buildingMeta) => (
        typeof getBuildingUnitRows === 'function'
          ? getBuildingUnitRows(state, buildingMeta.name, monthKey)
          : getTenantViews(state, monthKey).filter((tenant) => tenant.building === buildingMeta.name)
      ));
    if (unitId) {
      const byUnitId = visibleRows.find((item) => String(item && item.unitId || '').trim() === unitId);
      if (byUnitId) return byUnitId;
    }
    if (sourceTenantId) {
      const bySourceTenant = visibleRows.find((item) => String(item && (item.sourceTenantId || item.id) || '').trim() === sourceTenantId);
      if (bySourceTenant) return bySourceTenant;
    }
    return visibleRows.find((item) => {
      if (!item) return false;
      if (String(item.building || '').trim() !== buildingName) return false;
      if (String(item.unit || '').trim() !== unit) return false;
      return normalizeFloorLabel(item.floor) === floor;
    }) || null;
  }

  function renderVacantTenantDetailRow(state, vacantTenant, selectedMonth) {
    const isLockedBaseline = !canEditBuildingMonth(vacantTenant.building, selectedMonth);
    const disabledAttr = isLockedBaseline ? ' disabled aria-disabled="true"' : '';
    const readonlyAttr = isLockedBaseline ? ' readonly aria-readonly="true"' : '';
    const vacantSince = vacantTenant.vacatedOn ? formatDate(vacantTenant.vacatedOn) : 'Not set';
    const previousContractRent = Number(vacantTenant.lastContractRent || 0);
    const previousActualRent = Number(vacantTenant.lastActualRent || 0);
    const infoParts = [
      `Unit ${vacantTenant.unit}`,
      vacantTenant.floor ? `Floor ${vacantTenant.floor}` : '',
      `Vacant since ${vacantSince}`,
      previousContractRent > 0 ? `Previous contract rent ${formatCurrency(previousContractRent)}` : '',
      previousActualRent > 0 ? `Previous actual rent ${formatCurrency(previousActualRent)}` : ''
    ].filter(Boolean);
    const savedTenantProfiles = typeof getDbSnapshotTenantProfiles === 'function'
      ? getDbSnapshotTenantProfiles().slice().sort((left, right) => String(left && left.fullName || '').localeCompare(String(right && right.fullName || ''), 'en'))
      : [];
    const historyOptions = savedTenantProfiles.length
      ? savedTenantProfiles.map((profile) => {
        const labelParts = [
          String(profile && profile.fullName || '').trim() || 'Unnamed tenant',
          String(profile && profile.civilId || '').trim(),
          String(profile && profile.phone || '').trim()
        ].filter(Boolean);
        return `<option value="${escapeHtml(String(profile && profile.id || ''))}">${escapeHtml(labelParts.join(' | '))}</option>`;
      }).join('')
      : '<option value="">No saved tenant history</option>';
    return `<td colspan="13" class="building-row-detail tenant-profile-detail">
      <div class="detail-grid">
        <div class="detail-item detail-item-wide"><span class="label">Vacant unit</span><strong>${escapeHtml(infoParts.join(' | '))}</strong></div>
        <div class="detail-item detail-item-wide tenant-history-picker"><span class="label">Return tenant</span><div class="tenant-history-picker-row"><select data-vacant-history-profile="${escapeHtml(vacantTenant.id)}"${disabledAttr}>${historyOptions}</select><button type="button" class="secondary-action" data-load-history-profile="${escapeHtml(vacantTenant.id)}"${disabledAttr}>Use saved tenant</button></div><input type="hidden" value="" data-vacant-create-profile-id="${escapeHtml(vacantTenant.id)}"><span class="small-note">Use a saved tenant from history, then enter the new contract details below.</span></div>
        <div class="detail-item detail-item-wide"><span class="label">Tenant name</span><input type="text" value="" data-vacant-create-name="${escapeHtml(vacantTenant.id)}" placeholder="Tenant name"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Move in</span><input type="date" value="" data-vacant-create-move-in="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Contract start</span><input type="date" value="" data-vacant-create-contract-start="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Contract preset</span><select data-vacant-create-contract-preset="${escapeHtml(vacantTenant.id)}"${disabledAttr}><option value="custom">Custom</option><option value="1year">1 year</option><option value="5years">5 years</option></select></div>
        <div class="detail-item"><span class="label">Contract end</span><input type="date" value="" data-vacant-create-contract-end="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Contract amount</span><input type="number" min="0" step="1" value="" data-vacant-create-rent="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Discount</span><input type="number" min="0" step="1" value="0" data-vacant-create-discount="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Actual rent</span><input type="number" min="0" step="1" value="0" data-vacant-create-actual-rent="${escapeHtml(vacantTenant.id)}" readonly aria-readonly="true"></div>
        <div class="detail-item"><span class="label">Due day</span><input type="number" min="1" max="28" value="20" data-vacant-create-due-day="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Insurance amount</span><input type="number" min="0" step="1" value="0" data-vacant-create-insurance-amount="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Insurance paid month</span><input type="month" max="${escapeHtml(selectedMonth)}" value="" data-vacant-create-insurance-paid-month="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Mobile</span><input type="text" value="" data-vacant-create-phone="${escapeHtml(vacantTenant.id)}" placeholder="+965 55551111"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Civil ID</span><input type="text" value="" data-vacant-create-civil-id="${escapeHtml(vacantTenant.id)}" placeholder="Civil ID"${readonlyAttr}></div>
        <div class="detail-item"><span class="label">Nationality</span><select data-vacant-create-nationality="${escapeHtml(vacantTenant.id)}"${disabledAttr}>${NATIONALITY_OPTIONS.map((option) => `<option value="${escapeHtml(option)}"${option === 'Not set' ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>
        <div class="detail-item detail-item-wide"><span class="label">Notes</span><textarea rows="3" data-vacant-create-notes="${escapeHtml(vacantTenant.id)}"${readonlyAttr}></textarea></div>
        <div class="detail-item"><span class="label">Create tenant</span><button type="button" class="tenant-save-button" data-create-tenant-from-vacant="${escapeHtml(vacantTenant.id)}" data-create-tenant-unit-id="${escapeHtml(vacantTenant.unitId || '')}" data-create-tenant-source-tenant-id="${escapeHtml(vacantTenant.sourceTenantId || '')}" data-create-tenant-building="${escapeHtml(vacantTenant.building || '')}" data-create-tenant-unit="${escapeHtml(vacantTenant.unit || '')}" data-create-tenant-floor="${escapeHtml(vacantTenant.floor || '')}"${disabledAttr}>${isLockedBaseline ? 'Locked baseline' : 'Create tenant'}</button></div>
        ${isLockedBaseline ? `<div class="detail-item detail-item-wide"><span class="label">Baseline lock</span><strong>${escapeHtml(getBuildingMonthLockMessage(vacantTenant.building, selectedMonth))}</strong></div>` : ''}
      </div>
    </td>`;
  }

  function toggleTenantProfileDetail(state, tenantId) {
    const row = findTenantProfileRow(tenantId);
    if (!row) return;
    const existing = row.nextElementSibling;
    if (existing && existing.matches('[data-tenant-profile-detail]')) {
      existing.remove();
      return;
    }
    document.querySelectorAll('[data-tenant-profile-detail]').forEach((node) => node.remove());
    const tenant = state.tenants.find((item) => item.id === tenantId);
    const selectedMonth = getSelectedTenantMonth();
    const rowContextTarget = findTenantProfileTargetByRowContext(state, row, selectedMonth);
    const vacantView = !tenant
      ? (rowContextTarget && rowContextTarget.isVacant
        ? rowContextTarget
        : ((typeof getAllVisibleUnitRows === 'function'
            ? getAllVisibleUnitRows(state, selectedMonth)
            : getTenantViews(state, selectedMonth))
          .find((item) => item.id === tenantId && item.isVacant)))
      : null;
    const targetTenant = tenant || vacantView || rowContextTarget;
    if (!targetTenant) return;
    if (targetTenant.isVacant) {
      const detailRow = document.createElement('tr');
      detailRow.setAttribute('data-tenant-profile-detail', tenantId);
      detailRow.innerHTML = renderVacantTenantDetailRow(state, targetTenant, selectedMonth);
      row.insertAdjacentElement('afterend', detailRow);
      bindVacantTenantCreateDetail(detailRow, tenantId);
      const createButton = detailRow.querySelector('[data-create-tenant-from-vacant]');
      if (createButton) {
        createButton.addEventListener('click', () => void createTenantFromVacantDetail(state, tenantId, createButton));
      }
      return;
    }
    const profile = getEffectiveTenantProfile(state, tenant, selectedMonth);
    const isLockedBaseline = isTenantMonthLocked(tenant, selectedMonth);
    const readOnlyAttr = isLockedBaseline ? ' readonly aria-readonly="true"' : '';
    const disabledAttr = isLockedBaseline ? ' disabled aria-disabled="true"' : '';
    const detailName = profile ? profile.name : String(tenant.name || '');
    const detailMoveInDate = profile ? profile.moveInDate : String(tenant.moveInDate || tenant.contractStart || '');
    const detailPhone = profile ? profile.phone : String(tenant.phone || '');
    const detailCivilId = profile ? profile.civilId : String(tenant.civilId || '');
    const detailNationality = profile ? profile.nationality : (tenant.nationality || 'Not set');
    const detailRow = document.createElement('tr');
    detailRow.setAttribute('data-tenant-profile-detail', tenantId);
    detailRow.innerHTML = `<td colspan="13" class="building-row-detail tenant-profile-detail">
      <div class="detail-grid">
        <div class="detail-item detail-item-wide"><span class="label">Tenant name</span><input type="text" value="${escapeHtml(detailName)}" data-tenant-name="${escapeHtml(tenant.id)}" placeholder="Tenant name"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Move in</span><input type="date" value="${escapeHtml(detailMoveInDate)}" data-tenant-move-in="${escapeHtml(tenant.id)}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Phone</span><input type="text" value="${escapeHtml(detailPhone)}" data-tenant-phone="${escapeHtml(tenant.id)}" placeholder="+965 55551111"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Civil ID</span><input type="text" value="${escapeHtml(detailCivilId)}" data-tenant-civil="${escapeHtml(tenant.id)}" placeholder="Civil ID"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Nationality</span><select data-tenant-nationality="${escapeHtml(tenant.id)}"${disabledAttr}>${NATIONALITY_OPTIONS.map((option) => `<option value="${escapeHtml(option)}"${detailNationality === option ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>
        <div class="detail-item"><span class="label">Save profile</span><button type="button" class="tenant-save-button" data-save-tenant-profile-detail="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked baseline' : 'Save tenant info'}</button></div>
        <div class="detail-item"><span class="label">Remove tenant</span><button type="button" class="tenant-save-button secondary-action" data-remove-tenant-profile="${escapeHtml(tenant.id)}"${disabledAttr}>Remove tenant</button></div>
        ${isLockedBaseline ? `<div class="detail-item detail-item-wide"><span class="label">Baseline lock</span><strong>${escapeHtml(getBuildingMonthLockMessage(tenant.building, selectedMonth))}</strong></div>` : ''}
      </div>
    </td>`;
    row.insertAdjacentElement('afterend', detailRow);
    const saveButton = detailRow.querySelector('[data-save-tenant-profile-detail]');
    if (saveButton) {
      saveButton.addEventListener('click', () => saveTenantProfile(state, tenantId));
    }
    const removeButton = detailRow.querySelector('[data-remove-tenant-profile]');
    if (removeButton) {
      removeButton.addEventListener('click', () => void removeTenantFromTenantsPage(state, tenantId));
    }
  }

  async function removeTenantFromTenantsPage(state, tenantId) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant || tenant.isVacant || tenant.isArchived) return;
    const sourceTenantId = String(tenant.sourceTenantId || tenant.id || '').trim();
    if (!sourceTenantId) return;
    const selectedMonth = getSelectedTenantMonth();
    if (!canEditBuildingMonth(tenant.building, selectedMonth)) {
      return;
    }
    const effectiveProfile = typeof getEffectiveTenantProfile === 'function'
      ? (getEffectiveTenantProfile(state, tenant, selectedMonth) || tenant)
      : tenant;
    const previousOrderKey = typeof getTenantOrderKey === 'function'
      ? getTenantOrderKey({
        building: tenant.building,
        unit: effectiveProfile.unit || tenant.unit,
        floor: effectiveProfile.floor || tenant.floor
      })
      : '';
    const vacateDate = typeof today === 'function'
      ? today().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const ok = window.confirm(`Remove tenant ${tenant.name} from ${tenant.building} ${tenant.unit}? The unit will become vacant.`);
    if (!ok) return;

    const existingVacant = state.tenants.find((item) => (
      item.building === tenant.building
      && item.unit === tenant.unit
      && item.isVacant
      && !item.isArchived
    ));

    const tenantIndex = state.tenants.findIndex((item) => item.id === tenantId);
    state.tenants = state.tenants.filter((item) => item.id !== tenantId);

    if (!existingVacant) {
      const vacantTenant = {
        id: `vacant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        building: tenant.building,
        unit: String(effectiveProfile.unit || tenant.unit || '').trim(),
        floor: String(effectiveProfile.floor || tenant.floor || '').trim(),
        name: 'Available unit',
        moveInDate: '',
        isVacant: true,
        isArchived: false,
        phone: '',
        civilId: '',
        nationality: 'Not set',
        insurancePreviousAmount: 0,
        insuranceCurrentAmount: 0,
        insuranceAmount: 0,
        insurancePaidMonth: '',
        dueDay: Number(tenant.dueDay || 20),
        contractStart: '',
        contractEnd: '',
        contractRent: 0,
        discount: 0,
        actualRent: 0,
        previousDue: 0,
        notes: `Vacated on ${vacateDate}. Last tenant: ${tenant.name}`,
        vacatedOn: vacateDate,
        prepaidNextMonth: 0,
        seedOrder: Number(tenant.seedOrder || 0),
        lastPaidMonth: ''
      };
      if (tenantIndex >= 0 && tenantIndex <= state.tenants.length) {
        state.tenants.splice(tenantIndex, 0, vacantTenant);
      } else {
        state.tenants.push(vacantTenant);
      }
      const nextOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(vacantTenant) : '';
      if (previousOrderKey && nextOrderKey && previousOrderKey !== nextOrderKey) {
        replaceBuildingTenantOrderOverrideKey(state, tenant.building, previousOrderKey, nextOrderKey);
      }
      replaceBuildingTenantOrderOverrideId(state, tenant.building, tenant.id, vacantTenant.id);
    }

    refreshBuildingTenantOrder(state, tenant.building);
    saveState(state);
    try {
      if (typeof syncVacateTenantToDb === 'function') {
        await syncVacateTenantToDb({
          sourceTenantId,
          vacateDate,
          lastTenantName: tenant.name,
          lastContractRent: Number(tenant.contractRent || 0),
          lastActualRent: Number(tenant.actualRent || 0),
          lastDiscount: Number(tenant.discount || 0),
          archivedNotes: [String(tenant.notes || '').trim(), `Vacated on ${vacateDate}`].filter(Boolean).join(' · '),
          vacancyNotes: `Vacated on ${vacateDate}. Last tenant: ${tenant.name}`
        });
      }
      logActivity(state, 'Tenant removed', `${tenant.building} ${tenant.unit} ${tenant.name} removed from tenant page.`);
      showFlashMessage(`Removed ${tenant.building} ${tenant.unit}. Refreshing...`);
      setTimeout(() => window.location.reload(), 200);
    } catch (error) {
      showFlashMessage(String(error && error.message || 'Remove tenant failed.'));
      renderAll(state, tenant.building);
    }
  }
