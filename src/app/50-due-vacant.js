  function getFormerDueTenantViews(state, selectedMonth) {
    return state.tenants
      .filter((tenant) => tenant.isArchived && !tenant.isVacant)
      .map((tenant) => {
        const archivedMonth = getMonthKeyFromDate(tenant.archivedOn || tenant.contractEnd || '');
        if (archivedMonth && compareMonthKeys(selectedMonth, archivedMonth) < 0) return null;
        const view = buildOccupiedTenantMonthView(state, tenant, selectedMonth);
        if (!view) return null;
        const paidPrevious = getTenantDuePaidAmount(state, tenant.id, selectedMonth);
        const previousDue = normalizeAmount(Math.max(Number(view.previousDue || 0), 0));
        return Object.assign({}, view, {
          isFormerTenant: true,
          vacatedOn: tenant.archivedOn || tenant.contractEnd || '',
          displayType: 'Former tenant',
          previousDue,
          previousPaid: paidPrevious,
          remainingCurrent: 0,
          totalDue: normalizeAmount(Math.max(previousDue, 0))
        });
      })
      .filter((tenant) => tenant && tenant.totalDue > 0);
  }

  function getDueTenantRows(state, selectedMonth) {
    const buildingFilter = ((document.getElementById('dueBuildingFilter') || {}).value || 'all');
    const scopeFilter = ((document.getElementById('dueScopeFilter') || {}).value || 'all');
    const currentTenants = getTenantViews(state, selectedMonth)
      .filter((tenant) => !tenant.isVacant)
      .filter((tenant) => isTenantDueForCollections(tenant, selectedMonth))
      .map((tenant) => Object.assign({}, tenant, {
        isFormerTenant: false,
        vacatedOn: '',
        displayType: 'Current tenant'
      }));
    const formerTenants = getFormerDueTenantViews(state, selectedMonth);
    return []
      .concat(scopeFilter === 'former' ? [] : currentTenants)
      .concat(scopeFilter === 'current' ? [] : formerTenants)
      .filter((tenant) => buildingFilter === 'all' || tenant.building === buildingFilter)
      .sort((a, b) => {
        if (!!a.isFormerTenant !== !!b.isFormerTenant) return a.isFormerTenant ? 1 : -1;
        if (b.previousDue !== a.previousDue) return b.previousDue - a.previousDue;
        return b.totalDue - a.totalDue;
      });
  }

  function renderDueTenants(state) {
    const container = document.getElementById('dueList');
    if (!container) return;
    const selectedMonth = getSelectedDueMonth();
    const tenants = getDueTenantRows(state, selectedMonth);
    container.innerHTML = tenants.length ? `<div class="table-scroll"><table class="building-table due-table"><thead><tr><th>Building</th><th>Unit</th><th>Tenant</th><th>Type</th><th>Vacated on</th><th class="amount">Previous due</th><th class="amount">Paid previous</th><th class="amount">Current due</th><th class="amount">Total due</th><th>Save</th></tr></thead><tbody>${tenants.map((tenant) => {
      const isLockedBaseline = isBuildingMonthLocked(tenant.building, selectedMonth);
      const readOnlyAttr = isLockedBaseline ? ' readonly aria-readonly="true"' : '';
      const disabledAttr = isLockedBaseline ? ' disabled aria-disabled="true"' : '';
      const partialDuePaid = getTenantDuePaidAmount(state, tenant.id, selectedMonth);
      const tenantUrl = tenant.isFormerTenant
        ? `buildings.html?building=${encodeURIComponent(tenant.building)}&month=${encodeURIComponent(selectedMonth)}`
        : `buildings.html?building=${encodeURIComponent(tenant.building)}&month=${encodeURIComponent(selectedMonth)}&tenant=${encodeURIComponent(tenant.id)}&unit=${encodeURIComponent(tenant.unit)}`;
      const currentDue = tenant.isFormerTenant ? 0 : tenant.remainingCurrent;
      const totalDue = tenant.isFormerTenant ? tenant.previousDue : tenant.totalDue;
      const previousDueCell = tenant.isFormerTenant
        ? `<input class="table-amount-input" type="number" step="1" min="0" data-due-edit-previous="${escapeHtml(tenant.id)}" value="${escapeHtml(Math.round(tenant.previousDue || 0))}"${readOnlyAttr}>`
        : formatCurrency(tenant.previousDue);
      const paidPreviousCell = tenant.isFormerTenant
        ? `<input class="table-amount-input" type="number" step="1" min="0" data-due-edit-paid="${escapeHtml(tenant.id)}" value="${escapeHtml(Math.round(partialDuePaid || 0))}"${readOnlyAttr}>`
        : formatCurrency(partialDuePaid);
      const saveCell = tenant.isFormerTenant
        ? `<button type="button" class="secondary-action due-row-save" data-save-due-row="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked' : 'Save'}</button>`
        : '-';
      return `
      <tr class="${tenant.previousDue > 0 && tenant.totalDue > 0 ? 'is-late' : ''}">
        <td>${escapeHtml(tenant.building)}</td>
        <td>${escapeHtml(tenant.unit)}</td>
        <td><a class="table-link" href="${tenantUrl}">${escapeHtml(tenant.name)}</a></td>
        <td>${escapeHtml(tenant.displayType || '-')}</td>
        <td>${escapeHtml(tenant.vacatedOn ? formatDate(tenant.vacatedOn) : '-')}</td>
        <td class="amount">${previousDueCell}</td>
        <td class="amount">${paidPreviousCell}</td>
        <td class="amount">${formatCurrency(currentDue)}</td>
        <td class="amount">${formatCurrency(totalDue)}</td>
        <td>${saveCell}</td>
      </tr>`;
    }).join('')}</tbody><tfoot><tr class="totals-row"><td colspan="5"><strong>Total</strong></td><td class="amount"><strong>${formatCurrency(tenants.reduce((sum, tenant) => sum + tenant.previousDue, 0))}</strong></td><td class="amount"><strong>${formatCurrency(tenants.reduce((sum, tenant) => sum + getTenantDuePaidAmount(state, tenant.id, selectedMonth), 0))}</strong></td><td class="amount"><strong>${formatCurrency(tenants.reduce((sum, tenant) => sum + (tenant.isFormerTenant ? 0 : tenant.remainingCurrent), 0))}</strong></td><td class="amount"><strong>${formatCurrency(tenants.reduce((sum, tenant) => sum + (tenant.isFormerTenant ? tenant.previousDue : tenant.totalDue), 0))}</strong></td><td></td></tr></tfoot></table></div>` : '<div class="empty-state">No due tenants for the selected month.</div>';
    container.querySelectorAll('[data-save-due-row]').forEach((button) => {
      button.addEventListener('click', () => {
        saveDueRowEdit(state, button.getAttribute('data-save-due-row') || '', selectedMonth);
      });
    });
    tenants
      .filter((tenant) => tenant.isFormerTenant)
      .forEach((tenant) => {
        const previousDueInput = findDueRowInput('data-due-edit-previous', tenant.id);
        const paidPreviousInput = findDueRowInput('data-due-edit-paid', tenant.id);
        if (typeof bindPreviousDuePanelInputs === 'function') {
          bindPreviousDuePanelInputs(previousDueInput, paidPreviousInput);
        }
      });
  }

  function findDueRowInput(attributeName, tenantId) {
    return Array.from(document.querySelectorAll(`[${attributeName}]`))
      .find((node) => node.getAttribute(attributeName) === tenantId) || null;
  }

  async function saveDueRowEdit(state, tenantId, selectedMonth) {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    if (!canEditBuildingMonth(tenant.building, selectedMonth)) {
      return;
    }
    const previousDueInput = findDueRowInput('data-due-edit-previous', tenantId);
    const paidPreviousInput = findDueRowInput('data-due-edit-paid', tenantId);
    const previousDueAmount = Math.max(0, Math.round(Number(previousDueInput && previousDueInput.value || 0)));
    const paidPreviousAmount = Math.max(0, Math.round(Number(paidPreviousInput && paidPreviousInput.value || 0)));
    const sourceTenantId = String(tenant.sourceTenantId || tenant.id || tenantId || '').trim();
    if (typeof syncBuildingInlineEditToDb === 'function') {
      await syncBuildingInlineEditToDb({
        sourceTenantId,
        monthKey: selectedMonth,
        carryOverride: previousDueAmount + paidPreviousAmount,
        oldTenantDuePaid: paidPreviousAmount
      });
    }
    logActivity(
      state,
      'Due row updated',
      `${tenant.building} ${tenant.unit} ${formatMonth(selectedMonth)} previous due ${previousDueAmount} / paid previous ${paidPreviousAmount}.`
    );
    renderAll(state, tenant.building);
    showFlashMessage(`Saved ${tenant.building} ${tenant.unit}.`);
  }

  function renderVacantUnits(state) {
    const container = document.getElementById('vacantList');
    if (!container) return;
    const summary = document.getElementById('vacantSummary');
    const buildingFilter = ((document.getElementById('vacantBuildingFilter') || {}).value || 'all');
    const selectedMonth = getSelectedVacantMonth();
    const currentMonth = getCurrentMonthKey();
    const vacantUnits = getTenantViews(state, selectedMonth)
      .filter((tenant) => tenant.isVacant)
      .filter((tenant) => {
        const vacantFromMonth = getMonthKeyFromDate(tenant.vacatedOn || '');
        if (vacantFromMonth) return compareMonthKeys(selectedMonth, vacantFromMonth) >= 0;
        return compareMonthKeys(selectedMonth, currentMonth) >= 0;
      })
      .filter((tenant) => buildingFilter === 'all' || tenant.building === buildingFilter)
      .sort((a, b) => {
        if (a.building !== b.building) return a.building.localeCompare(b.building, 'ar');
        return (Number(a.seedOrder || 0) - Number(b.seedOrder || 0))
          || unitSortValue(String(a.unit || '')).localeCompare(unitSortValue(String(b.unit || '')), 'en', { numeric: true });
      })
      .map((tenant) => {
        const lastTenant = getLatestArchivedTenantForUnitUpToMonth(state, tenant.building, tenant.unit, selectedMonth);
        const vacantSince = tenant.vacatedOn || (lastTenant && (lastTenant.archivedOn || lastTenant.contractEnd)) || '';
        return Object.assign({}, tenant, {
          lastTenantId: lastTenant ? lastTenant.id : '',
          lastTenantName: lastTenant ? lastTenant.name : '-',
          lastActualRent: Number(lastTenant && lastTenant.actualRent || tenant.lastActualRent || 0),
          lastContractRent: Number(lastTenant && lastTenant.contractRent || tenant.lastContractRent || 0),
          vacantSince,
          plannedVacateDate: String(tenant.plannedVacateDate || '').trim()
        });
      });
    if (summary) {
      const totalActualRent = vacantUnits.reduce((sum, tenant) => sum + Number(tenant.lastActualRent || 0), 0);
      const totalContractRent = vacantUnits.reduce((sum, tenant) => sum + Number(tenant.lastContractRent || 0), 0);
      summary.innerHTML = [
        `<span class="metric-pill">Vacant units ${vacantUnits.length}</span>`,
        `<span class="metric-pill">Last actual rent ${formatCurrency(totalActualRent)}</span>`,
        `<span class="metric-pill">Last contract rent ${formatCurrency(totalContractRent)}</span>`
      ].join('');
    }
    container.innerHTML = vacantUnits.length ? `<div class="table-scroll"><table class="building-table vacant-table"><thead><tr><th>Building</th><th>Unit</th><th>Floor</th><th>Last tenant</th><th class="amount"><span class="header-stack"><span>Last actual</span><span>rent</span></span></th><th class="amount"><span class="header-stack"><span>Last contract</span><span>rent</span></span></th><th>Vacant since</th><th>Planned vacate</th><th>Notes</th></tr></thead><tbody>${vacantUnits.map((tenant) => `
      <tr class="is-vacant">
        <td>${escapeHtml(tenant.building)}</td>
        <td>${escapeHtml(tenant.unit)}</td>
        <td>${escapeHtml(tenant.floor || '-')}</td>
        <td>${escapeHtml(tenant.lastTenantName || '-')}</td>
        <td class="amount">${formatCurrency(tenant.lastActualRent || 0)}</td>
        <td class="amount">${formatCurrency(tenant.lastContractRent || 0)}</td>
        <td>${escapeHtml(tenant.vacantSince ? formatDate(tenant.vacantSince) : '-')}</td>
        <td>${escapeHtml(tenant.plannedVacateDate ? formatDate(tenant.plannedVacateDate) : '-')}</td>
        <td class="notes-cell">${escapeHtml(tenant.notes || 'Vacant unit')}</td>
      </tr>`).join('')}</tbody><tfoot><tr class="totals-row"><td colspan="4"><strong>Total</strong></td><td class="amount"><strong>${formatCurrency(vacantUnits.reduce((sum, tenant) => sum + Number(tenant.lastActualRent || 0), 0))}</strong></td><td class="amount"><strong>${formatCurrency(vacantUnits.reduce((sum, tenant) => sum + Number(tenant.lastContractRent || 0), 0))}</strong></td><td colspan="3"><strong>${vacantUnits.length} vacant units</strong></td></tr></tfoot></table></div>` : '<div class="empty-state">No vacant units found for the selected month.</div>';
  }

  function toggleVacantRowDetail(state, tenantId) {
    const row = findVacantRow(tenantId);
    if (!row) return;
    const existing = row.nextElementSibling;
    if (existing && existing.matches('[data-vacant-detail]')) {
      existing.remove();
      return;
    }
    document.querySelectorAll('[data-vacant-detail]').forEach((node) => node.remove());
    const selectedMonth = getSelectedVacantMonth();
    const tenant = getTenantViews(state, selectedMonth).find((item) => item.id === tenantId && item.isVacant);
    if (!tenant) return;
    const isLockedBaseline = isBuildingMonthLocked(tenant.building, selectedMonth);
    const readOnlyAttr = isLockedBaseline ? ' readonly aria-readonly="true"' : '';
    const disabledAttr = isLockedBaseline ? ' disabled aria-disabled="true"' : '';
    const detailRow = document.createElement('tr');
    detailRow.setAttribute('data-vacant-detail', tenantId);
    detailRow.innerHTML = `<td colspan="9" class="building-row-detail">
      <div class="detail-grid">
        <div class="detail-item"><span class="label">Last actual rent</span><input type="number" step="1" min="0" data-vacant-last-actual="${escapeHtml(tenant.id)}" value="${escapeHtml(Math.round(tenant.lastActualRent || 0))}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Last contract rent</span><input type="number" step="1" min="0" data-vacant-last-contract="${escapeHtml(tenant.id)}" value="${escapeHtml(Math.round(tenant.lastContractRent || 0))}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Vacant since</span><input type="date" data-vacant-since="${escapeHtml(tenant.id)}" value="${escapeHtml(tenant.vacantSince || '')}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Planned vacate</span><strong>${escapeHtml(tenant.plannedVacateDate ? formatDate(tenant.plannedVacateDate) : '-')}</strong></div>
        <div class="detail-item"><span class="label">Save</span><button type="button" class="secondary-action" data-save-vacant-meta="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked baseline' : 'Save changes'}</button></div>
        ${isLockedBaseline ? `<div class="detail-item detail-item-wide"><span class="label">Baseline lock</span><strong>${escapeHtml(getBuildingMonthLockMessage(tenant.building, selectedMonth))}</strong></div>` : ''}
      </div>
    </td>`;
    row.insertAdjacentElement('afterend', detailRow);
    const saveButton = detailRow.querySelector('[data-save-vacant-meta]');
    if (saveButton) {
      saveButton.addEventListener('click', (event) => {
        event.stopPropagation();
        saveVacantUnitMeta(state, tenant.id, selectedMonth);
      });
    }
  }

  async function saveVacantUnitMeta(state, tenantId, selectedMonth, fallbackTenant) {
    const targetVacantTenant = state.tenants.find((tenant) => tenant.id === tenantId && tenant.isVacant && !tenant.isArchived) || fallbackTenant;
    if (targetVacantTenant && !canEditBuildingMonth(targetVacantTenant.building, selectedMonth)) {
      return;
    }
    if (targetVacantTenant && typeof preserveVisibleBuildingOrderForBuilding === 'function') {
      preserveVisibleBuildingOrderForBuilding(state, targetVacantTenant.building, selectedMonth);
    }
    const vacantTenant = ensureVacantUnitRecord(
      state,
      targetVacantTenant,
      selectedMonth
    );
    if (!vacantTenant) return;
    const archivedTenant = getLatestArchivedTenantForUnitUpToMonth(state, vacantTenant.building, vacantTenant.unit, selectedMonth);
    const discountInput = findDetailInput('data-vacant-discount', tenantId);
    const actualInput = findDetailInput('data-vacant-last-actual', tenantId);
    const contractInput = findDetailInput('data-vacant-last-contract', tenantId);
    const vacantSinceInput = findDetailInput('data-vacant-since', tenantId);
    const oldTenantDuePaidNoteInput = findDetailInput('data-old-tenant-due-note', tenantId);
    const readBlankableNumber = (input, fallbackValue) => {
      if (!input) return Math.max(0, Math.round(Number(fallbackValue || 0)));
      const rawValue = String(input.value || '').trim();
      if (!rawValue) return 0;
      return Math.max(0, Math.round(Number(rawValue || 0)));
    };
    const readBlankableText = (input, fallbackValue) => {
      if (!input) return String(fallbackValue || '').trim();
      return String(input.value || '').trim();
    };
    const nextDiscount = readBlankableNumber(discountInput, vacantTenant.discount || archivedTenant && archivedTenant.discount || 0);
    const nextContractRent = readBlankableNumber(contractInput, vacantTenant.lastContractRent || archivedTenant && archivedTenant.contractRent || 0);
    const nextActualRent = readBlankableNumber(actualInput, vacantTenant.lastActualRent || Math.max(nextContractRent - nextDiscount, 0) || archivedTenant && archivedTenant.actualRent || 0);
    const nextVacantSince = readBlankableText(vacantSinceInput, vacantTenant.vacatedOn || '');
    const oldTenantDuePaidNote = readBlankableNumber(oldTenantDuePaidNoteInput, 0);

    vacantTenant.vacatedOn = nextVacantSince;
    vacantTenant.discount = nextDiscount;
    vacantTenant.lastActualRent = nextActualRent;
    vacantTenant.lastContractRent = nextContractRent;
    setOldTenantDuePaidNote(state, vacantTenant.building, vacantTenant.unit, selectedMonth, oldTenantDuePaidNote);
    if (archivedTenant) {
      archivedTenant.discount = nextDiscount;
      archivedTenant.actualRent = nextActualRent;
      archivedTenant.contractRent = nextContractRent;
      if (nextVacantSince) archivedTenant.archivedOn = nextVacantSince;
    }

    saveState(state);
    try {
      if (typeof syncVacantUnitMetaToDb === 'function') {
        await syncVacantUnitMetaToDb({
          unitId: String(vacantTenant.unitId || '').trim(),
          sourceTenantId: String(
            vacantTenant.sourceTenantId
            || archivedTenant && (archivedTenant.sourceTenantId || archivedTenant.id)
            || ''
          ).trim(),
          buildingName: vacantTenant.building,
          unit: vacantTenant.unit,
          floor: vacantTenant.floor,
          monthKey: selectedMonth,
          vacantSince: nextVacantSince,
          lastContractRent: nextContractRent,
          lastActualRent: nextActualRent,
          discount: nextDiscount,
          oldTenantDuePaid: oldTenantDuePaidNote,
          notes: String(vacantTenant.notes || '').trim()
        });
      }
      resetRenderCache();
      logActivity(state, 'Vacant unit updated', `${vacantTenant.building} ${vacantTenant.unit} vacant info updated.`);
      renderAll(state, vacantTenant.building);
      showFlashMessage(`Saved ${vacantTenant.building} ${vacantTenant.unit}.`);
    } catch (error) {
      showFlashMessage(String(error && error.message || 'Vacant save failed.'));
    }
  }

  async function applyDuePayment(state, tenantId) {
    const tenantRecord = state.tenants.find((item) => item.id === tenantId);
    if (!tenantRecord) return;
    const selectedMonth = getSelectedDueMonth();
    if (!canEditBuildingMonth(tenantRecord.building, selectedMonth)) {
      return;
    }
    const tenant = getTenantView(state, tenantRecord, selectedMonth);
    if (!tenant) return;
    const input = findDetailInput('data-due-payment', tenantId);
    const amount = Number(input && input.value || 0);
    if (!(amount > 0)) {
      alert('Enter a due payment amount greater than zero.');
      return;
    }
    if (tenant.previousDue <= 0) {
      alert('This tenant does not have previous due to clear.');
      return;
    }
    const appliedAmount = Math.min(amount, tenant.previousDue);
    const sourceTenantId = String(tenant.sourceTenantId || tenantRecord.sourceTenantId || tenantRecord.id || tenantId || '').trim();
    if (typeof syncTenantPaymentToDb === 'function') {
      await syncTenantPaymentToDb({
        sourceTenantId,
        amount: appliedAmount,
        paidOn: new Date().toISOString().slice(0, 10),
        rentMonth: selectedMonth,
        method: 'Due payment',
        note: 'Applied to previous due'
      });
    }
    logActivity(state, 'Due payment recorded', `${tenant.building} ${tenant.unit} due payment ${formatCurrency(appliedAmount)} applied to previous due.`);
    renderAll(state, tenant.building);
  }

  function renderPayments(state) {
    const container = document.getElementById('paymentList');
    if (!container) return;
    const summaryContainer = document.getElementById('paymentSummary');
    const buildingFilter = document.getElementById('paymentBuildingFilter');
    const methodFilter = document.getElementById('paymentMethodFilter');
    const monthFilter = document.getElementById('paymentMonthFilter');
    const searchInput = document.getElementById('paymentSearch');

    const payments = typeof getDbSnapshotPayments === 'function'
      ? getDbSnapshotPayments()
      : [];
    const rows = payments
      .slice()
      .filter((payment) => {
        const rentMonth = String(payment.rentMonth || '').trim();
        return !rentMonth || isMonthVisible(rentMonth);
      })
      .sort((a, b) => new Date(String(b.date || '')) - new Date(String(a.date || '')));

    const decoratedRows = rows.map((payment) => {
      const tenant = state.tenants.find((item) => item.id === payment.tenantId);
      const building = tenant ? tenant.building : '-';
      const unit = tenant ? tenant.unit : '-';
      const tenantName = tenant ? tenant.name : 'Unknown';
      return Object.assign({}, payment, {
        building,
        unit,
        tenantName,
        searchText: `${building} ${unit} ${tenantName} ${payment.method || ''} ${payment.note || ''}`.toLowerCase()
      });
    });

    if (buildingFilter) {
      const buildingOptions = Array.from(new Set(decoratedRows.map((row) => row.building).filter((value) => value && value !== '-')))
        .sort((a, b) => a.localeCompare(b, 'ar'));
      const currentValue = buildingFilter.value || 'all';
      buildingFilter.innerHTML = '<option value="all">All buildings</option>' + buildingOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      buildingFilter.value = buildingOptions.includes(currentValue) ? currentValue : 'all';
    }

    if (methodFilter) {
      const methodOptions = Array.from(new Set(decoratedRows.map((row) => String(row.method || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'en'));
      const currentValue = methodFilter.value || 'all';
      methodFilter.innerHTML = '<option value="all">All methods</option>' + methodOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      methodFilter.value = methodOptions.includes(currentValue) ? currentValue : 'all';
    }

    if (monthFilter) {
      const monthOptions = Array.from(new Set(decoratedRows.map((row) => String(row.rentMonth || '').trim()).filter(Boolean)))
        .sort((a, b) => compareMonthKeys(b, a));
      const currentValue = monthFilter.value || 'all';
      monthFilter.innerHTML = '<option value="all">All months</option>' + monthOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatMonth(value))}</option>`).join('');
      monthFilter.value = monthOptions.includes(currentValue) ? currentValue : 'all';
    }

    const selectedBuilding = buildingFilter ? buildingFilter.value || 'all' : 'all';
    const selectedMethod = methodFilter ? methodFilter.value || 'all' : 'all';
    const selectedMonth = monthFilter ? monthFilter.value || 'all' : 'all';
    const searchValue = (searchInput && searchInput.value || '').trim().toLowerCase();

    const filteredRows = decoratedRows.filter((payment) => {
      if (selectedBuilding !== 'all' && payment.building !== selectedBuilding) return false;
      if (selectedMethod !== 'all' && String(payment.method || '').trim() !== selectedMethod) return false;
      if (selectedMonth !== 'all' && String(payment.rentMonth || '').trim() !== selectedMonth) return false;
      if (searchValue && !payment.searchText.includes(searchValue)) return false;
      return true;
    });

    if (summaryContainer) {
      const totalAmount = filteredRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const latestPayment = filteredRows[0] || null;
      const monthCount = new Set(filteredRows.map((payment) => String(payment.rentMonth || '').trim()).filter(Boolean)).size;
      summaryContainer.innerHTML = [
        { label: 'Visible payments', value: String(filteredRows.length), note: `${decoratedRows.length} total records` },
        { label: 'Visible amount', value: formatCurrency(totalAmount), note: selectedMonth === 'all' ? `${monthCount} rent months` : formatMonth(selectedMonth) },
        { label: 'Latest payment', value: latestPayment ? formatCurrency(latestPayment.amount) : '-', note: latestPayment ? `${formatDate(latestPayment.date)} · ${latestPayment.tenantName}` : 'No payment in this view' },
        { label: 'Current filter', value: selectedBuilding === 'all' ? 'All buildings' : selectedBuilding, note: selectedMethod === 'all' ? 'All methods' : selectedMethod }
      ].map((card) => `<article class="payments-summary-card"><span class="payments-summary-label">${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.note)}</small></article>`).join('');
    }

    container.innerHTML = filteredRows.length ? filteredRows.map((payment) => `
      <article class="payment-row payment-history-card">
        <div class="payment-row-head">
          <div>
            <strong>${escapeHtml(payment.building)} · ${escapeHtml(payment.unit)} · ${escapeHtml(payment.tenantName)}</strong>
            <div class="small-note">${escapeHtml(formatMonth(payment.rentMonth))} · ${formatDate(payment.date)}</div>
          </div>
          <span class="payment-amount-chip">${formatCurrency(payment.amount)}</span>
        </div>
        <div class="payment-row-grid">
          <div><span class="payment-meta-label">Method</span><strong>${escapeHtml(payment.method || '-')}</strong></div>
          <div><span class="payment-meta-label">Building</span><strong>${escapeHtml(payment.building)}</strong></div>
          <div><span class="payment-meta-label">Unit</span><strong>${escapeHtml(payment.unit)}</strong></div>
          <div><span class="payment-meta-label">Rent month</span><strong>${escapeHtml(formatMonth(payment.rentMonth))}</strong></div>
        </div>
        ${payment.note ? `<div class="payment-note">${escapeHtml(payment.note)}</div>` : ''}
      </article>`).join('') : '<div class="empty-state">No payments match the selected filters.</div>';
  }

  function renderActivity(state) {
    const container = document.getElementById('activityList');
    const summary = document.getElementById('activitySummary');
    const actorTabs = document.getElementById('activityActorTabs');
    if (!container) return;

    const items = (typeof getDbSnapshotActivity === 'function'
      ? getDbSnapshotActivity()
      : [])
      .slice()
      .sort((a, b) => new Date(String(b.when || '')) - new Date(String(a.when || '')));
    const userActors = Array.from(new Set(items
      .map((item) => String(item.actor || '').trim())
      .filter((actor) => actor && actor !== 'system')))
      .sort((a, b) => a.localeCompare(b, 'en'));
    const hasSystem = items.some((item) => String(item.actor || '').trim() === 'system');
    const availableTabs = ['all'].concat(userActors).concat(hasSystem ? ['system'] : []);
    const selectedActor = availableTabs.includes(window.__selectedActivityActor || 'all')
      ? (window.__selectedActivityActor || 'all')
      : 'all';
    window.__selectedActivityActor = selectedActor;

    const humanItems = items.filter((item) => String(item.actor || '').trim() !== 'system');
    const systemItems = items.filter((item) => String(item.actor || '').trim() === 'system');
    const filteredItems = selectedActor === 'all'
      ? humanItems
      : items.filter((item) => String(item.actor || '').trim() === selectedActor);

    if (summary) {
      const latestItem = items[0] || null;
      const cards = [
        { label: 'User updates', value: String(humanItems.length), note: `${userActors.length} active users` },
        { label: 'System updates', value: String(systemItems.length), note: hasSystem ? 'Kept in separate tab' : 'No system activity' },
        { label: 'Latest actor', value: latestItem ? String(latestItem.actor || 'system') : '-', note: latestItem ? formatDateTime(latestItem.when) : 'No activity yet' },
        { label: 'Current view', value: selectedActor === 'all' ? 'All users' : selectedActor, note: `${filteredItems.length} items shown` }
      ];
      summary.innerHTML = cards.map((card) => `<article class="activity-summary-card">
        <span class="activity-summary-label">${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
        <small>${escapeHtml(card.note)}</small>
      </article>`).join('');
    }

    if (actorTabs) {
      actorTabs.innerHTML = availableTabs.map((actor) => {
        const active = actor === selectedActor ? ' active' : '';
        const count = actor === 'all'
          ? humanItems.length
          : items.filter((item) => String(item.actor || '').trim() === actor).length;
        const label = actor === 'all' ? 'All users' : actor === 'system' ? 'System' : actor;
        return `<button type="button" class="mini-tab${active}" data-activity-actor="${escapeHtml(actor)}">${escapeHtml(label)}<span>${count}</span></button>`;
      }).join('');
      actorTabs.querySelectorAll('[data-activity-actor]').forEach((button) => {
        button.addEventListener('click', () => {
          window.__selectedActivityActor = button.getAttribute('data-activity-actor') || 'all';
          renderActivity(state);
        });
      });
    }

    container.innerHTML = filteredItems.length ? filteredItems.map((item) => {
      const actor = String(item.actor || 'system').trim() || 'system';
      const actorLabel = actor === 'system' ? 'System' : actor;
      const actorClass = actor === 'system' ? ' system' : '';
      return `<article class="activity-row activity-page-row${actorClass}">
        <div class="activity-page-head">
          <div>
            <strong>${escapeHtml(item.action)}</strong>
            <div class="small-note">${formatDateTime(item.when)}</div>
          </div>
          <span class="metric-pill">${escapeHtml(actorLabel)}</span>
        </div>
        <div>${escapeHtml(item.detail || '')}</div>
      </article>`;
    }).join('') : '<div class="empty-state">No activity for this tab yet.</div>';
  }

  function populateDueTenantSelect(state) {
    const select = document.getElementById('dueTenantSelect');
    if (!select) return;
    const currentValue = select.value || '';
    const tenants = getDueTenantRows(state, getSelectedDueMonth())
      .sort((a, b) => {
        if (a.building !== b.building) return a.building.localeCompare(b.building, 'ar');
        if (!!a.isFormerTenant !== !!b.isFormerTenant) return a.isFormerTenant ? 1 : -1;
        return unitSortValue(String(a.unit || '')).localeCompare(unitSortValue(String(b.unit || '')), 'en', { numeric: true });
      });
    select.innerHTML = '<option value="">Select tenant</option>' + tenants.map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.building)} · ${escapeHtml(tenant.unit)} · ${escapeHtml(tenant.name)}${tenant.isFormerTenant ? ' · Former tenant' : ''}</option>`).join('');
    select.value = tenants.some((tenant) => tenant.id === currentValue) ? currentValue : '';
  }

  function getTenantFormVacantUnits(state, buildingName) {
    const currentPage = String((document.body && document.body.dataset.page) || '').trim();
    const selectedMonth = currentPage === 'tenants' ? getSelectedTenantMonth() : getActiveMonthKey();
    const sourceTenants = currentPage === 'tenants'
      ? getTenantViews(state, selectedMonth)
      : state.tenants;

    return sourceTenants
      .filter((tenant) => tenant.isVacant && !tenant.isArchived && tenant.building === buildingName)
      .sort((a, b) => {
        if (currentPage === 'tenants' && typeof compareTenantOriginalPosition === 'function') {
          return compareTenantOriginalPosition(state, a, b);
        }
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant) => {
        const previousTenant = state.tenants
          .filter((item) => item.building === tenant.building && item.unit === tenant.unit && !item.isVacant)
          .sort((a, b) => {
            const aDate = new Date(String(a.archivedOn || a.contractEnd || '1900-01-01'));
            const bDate = new Date(String(b.archivedOn || b.contractEnd || '1900-01-01'));
            return bDate - aDate;
          })[0];
        return {
          unit: String(tenant.unit || '').trim(),
          floor: String(tenant.floor || getSeedUnitFloorLabel(tenant.unit) || '').trim(),
          contractRent: Number((previousTenant && previousTenant.contractRent) || tenant.lastContractRent || 0),
          actualRent: Number((previousTenant && previousTenant.actualRent) || tenant.lastActualRent || 0),
          vacantSince: String(tenant.vacatedOn || '').trim()
        };
      })
      .filter((tenant, index, list) => tenant.unit && list.findIndex((item) => item.unit === tenant.unit) === index);
  }

  function populateTenantSelectors(state) {
    const areaSelect = document.getElementById('tenantAreaInput');
    const buildingSelect = document.getElementById('tenantBuilding');
    const vacantUnitSelect = document.getElementById('tenantVacantUnit');
    const unitInput = document.getElementById('tenantUnitInput');
    const floorInput = document.getElementById('tenantFloorInput');
    const rentInput = document.getElementById('tenantRentInput');
    const previousActualRentNote = document.getElementById('tenantPreviousActualRentNote');
    const paymentSelect = document.getElementById('paymentTenant');
    const tenantBuildingFilter = document.getElementById('tenantBuildingFilter');
    const dueBuildingFilter = document.getElementById('dueBuildingFilter');
    const vacantBuildingFilter = document.getElementById('vacantBuildingFilter');
    if (areaSelect) {
      const areas = Array.from(new Set(state.buildings.map((building) => building.area)));
      const currentArea = areaSelect.value || areas[0] || '';
      areaSelect.innerHTML = areas.map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('');
      areaSelect.value = areas.includes(currentArea) ? currentArea : (areas[0] || '');
    }
    if (buildingSelect) {
      const selectedArea = areaSelect ? areaSelect.value : '';
      const visibleBuildings = state.buildings.filter((building) => !selectedArea || building.area === selectedArea);
      const currentBuilding = buildingSelect.value || (visibleBuildings[0] && visibleBuildings[0].name) || '';
      buildingSelect.innerHTML = visibleBuildings.map((building) => `<option value="${escapeHtml(building.name)}">${escapeHtml(building.name)}</option>`).join('');
      buildingSelect.value = visibleBuildings.some((building) => building.name === currentBuilding) ? currentBuilding : ((visibleBuildings[0] && visibleBuildings[0].name) || '');
    }
    if (vacantUnitSelect && buildingSelect) {
      const currentValue = vacantUnitSelect.value || '';
      const vacantUnits = getTenantFormVacantUnits(state, buildingSelect.value);
      vacantUnitSelect.innerHTML = '<option value="">Select vacant unit</option>' + vacantUnits.map((tenant) => `<option value="${escapeHtml(tenant.unit)}" data-floor="${escapeHtml(tenant.floor)}" data-contract-rent="${escapeHtml(tenant.contractRent)}" data-actual-rent="${escapeHtml(tenant.actualRent)}" data-vacant-since="${escapeHtml(tenant.vacantSince)}">${escapeHtml(tenant.unit)}${tenant.floor ? ` · ${escapeHtml(tenant.floor)}` : ''}</option>`).join('');
      vacantUnitSelect.value = vacantUnits.some((tenant) => tenant.unit === currentValue) ? currentValue : '';
      if (vacantUnitSelect.value && unitInput) {
        unitInput.value = vacantUnitSelect.value;
      }
      if (vacantUnitSelect.value && floorInput) {
        const selectedOption = vacantUnitSelect.options[vacantUnitSelect.selectedIndex];
        if (selectedOption) {
          floorInput.value = selectedOption.getAttribute('data-floor') || floorInput.value;
          if (rentInput) {
            const oldContractRent = selectedOption.getAttribute('data-contract-rent') || '';
            if (oldContractRent) rentInput.value = oldContractRent;
          }
          if (previousActualRentNote) {
            const oldActualRent = selectedOption.getAttribute('data-actual-rent') || '';
            const oldContractRent = selectedOption.getAttribute('data-contract-rent') || '';
            const vacantSince = selectedOption.getAttribute('data-vacant-since') || '';
            const parts = [];
            if (oldActualRent) parts.push(`Previous actual rent: ${formatCurrency(oldActualRent)}`);
            if (oldContractRent) parts.push(`Previous contract rent: ${formatCurrency(oldContractRent)}`);
            if (vacantSince) parts.push(`Vacant since: ${formatDate(vacantSince)}`);
            previousActualRentNote.textContent = parts.join(' | ');
            previousActualRentNote.classList.toggle('is-hidden', parts.length === 0);
          }
        }
      }
      if (!vacantUnitSelect.value) {
        if (unitInput) unitInput.value = '';
        if (floorInput) floorInput.value = '';
        if (previousActualRentNote) {
          previousActualRentNote.textContent = '';
          previousActualRentNote.classList.add('is-hidden');
        }
      }
    }
    if (tenantBuildingFilter) {
      const currentValue = window.__selectedTenantBuildingFilter || tenantBuildingFilter.value || getPreferredTenantBuildingFilter(state);
      tenantBuildingFilter.innerHTML = '<option value="all">All buildings</option>' + state.buildings.map((building) => `<option value="${escapeHtml(building.name)}">${escapeHtml(getBuildingDisplayLabel(building.name))}</option>`).join('');
      tenantBuildingFilter.value = state.buildings.some((building) => building.name === currentValue) ? currentValue : 'all';
      window.__selectedTenantBuildingFilter = tenantBuildingFilter.value || 'all';
    }
    if (dueBuildingFilter) {
      const currentValue = dueBuildingFilter.value || 'all';
      dueBuildingFilter.innerHTML = '<option value="all">All buildings</option>' + state.buildings.map((building) => `<option value="${escapeHtml(building.name)}">${escapeHtml(getBuildingDisplayLabel(building.name))}</option>`).join('');
      dueBuildingFilter.value = state.buildings.some((building) => building.name === currentValue) ? currentValue : 'all';
    }
    if (vacantBuildingFilter) {
      const currentValue = vacantBuildingFilter.value || 'all';
      vacantBuildingFilter.innerHTML = '<option value="all">All buildings</option>' + state.buildings.map((building) => `<option value="${escapeHtml(building.name)}">${escapeHtml(getBuildingDisplayLabel(building.name))}</option>`).join('');
      vacantBuildingFilter.value = state.buildings.some((building) => building.name === currentValue) ? currentValue : 'all';
    }
    populateDueTenantSelect(state);
    if (paymentSelect) {
      paymentSelect.innerHTML = state.tenants
        .filter((tenant) => !tenant.isArchived && !tenant.isVacant)
        .map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.building)} · ${escapeHtml(tenant.unit)} · ${escapeHtml(tenant.name)}</option>`).join('');
    }
  }
