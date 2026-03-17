  function findTenantRow(tenantId) {
    return Array.from(document.querySelectorAll('[data-tenant-row]')).find((row) => row.dataset.tenantRow === tenantId) || null;
  }

  function findDetailInput(attributeName, tenantId) {
    return Array.from(document.querySelectorAll(`[${attributeName}]`)).find((node) => node.getAttribute(attributeName) === tenantId) || null;
  }

  function buildTenantMonthFieldId(tenantId, monthKey, fieldName) {
    const normalizedTenantId = String(tenantId || '').trim();
    const normalizedMonthKey = String(monthKey || '').trim();
    const normalizedFieldName = String(fieldName || '').trim();
    if (!normalizedTenantId || !normalizedMonthKey || !normalizedFieldName) return '';
    return `${normalizedTenantId}::${normalizedMonthKey}::${normalizedFieldName}`;
  }

  function findDetailInputByFieldId(attributeName, tenantId, monthKey, fieldName) {
    const fieldId = buildTenantMonthFieldId(tenantId, monthKey, fieldName);
    if (fieldId) {
      const exactNode = document.querySelector(`[data-inline-field-id="${fieldId}"]`);
      if (exactNode) return exactNode;
    }
    return findDetailInput(attributeName, tenantId);
  }

  function captureBuildingRowUiState(tenantId) {
    const row = findTenantRow(tenantId);
    if (!row) return null;
    return {
      tenantId: String(tenantId || '').trim(),
      top: row.getBoundingClientRect().top,
      unitId: String(row.dataset.rowUnitId || '').trim(),
      sourceTenantId: String(row.dataset.rowSourceTenantId || '').trim(),
      building: String(row.dataset.rowBuilding || '').trim(),
      unit: String(row.dataset.rowUnit || '').trim(),
      floor: normalizeFloorLabel(row.dataset.rowFloor || '')
    };
  }

  function findBuildingRowByUiState(snapshot) {
    if (!snapshot) return null;
    const rows = Array.from(document.querySelectorAll('[data-tenant-row]'));
    if (snapshot.unitId) {
      const byUnitId = rows.find((row) => String(row.dataset.rowUnitId || '').trim() === snapshot.unitId);
      if (byUnitId) return byUnitId;
    }
    if (snapshot.sourceTenantId) {
      const bySourceTenant = rows.find((row) => String(row.dataset.rowSourceTenantId || '').trim() === snapshot.sourceTenantId);
      if (bySourceTenant) return bySourceTenant;
    }
    return rows.find((row) => (
      String(row.dataset.rowBuilding || '').trim() === snapshot.building
      && String(row.dataset.rowUnit || '').trim() === snapshot.unit
      && normalizeFloorLabel(row.dataset.rowFloor || '') === snapshot.floor
    )) || null;
  }

  function restoreBuildingRowUiState(state, snapshot) {
    const row = findBuildingRowByUiState(snapshot);
    if (!row) return;
    const delta = row.getBoundingClientRect().top - Number(snapshot.top || 0);
    if (Math.abs(delta) > 1) {
      window.scrollBy(0, delta);
    }
    toggleTenantRowDetail(state, row.dataset.tenantRow || snapshot.tenantId, row);
  }

  function findVisibleTenantByRowContext(state, row, monthKey) {
    if (!row) return null;
    const unitId = String(row.dataset.rowUnitId || '').trim();
    const sourceTenantId = String(row.dataset.rowSourceTenantId || '').trim();
    const buildingName = String(row.dataset.rowBuilding || '').trim();
    const unit = String(row.dataset.rowUnit || '').trim();
    const floor = normalizeFloorLabel(row.dataset.rowFloor);
    if (!buildingName) return null;
    const visibleRows = getBuildingDisplayTenants(state, buildingName, monthKey);
    if (unitId) {
      const exactByUnitId = visibleRows.find((item) => String(item && item.unitId || '').trim() === unitId);
      if (exactByUnitId) return exactByUnitId;
    }
    if (sourceTenantId) {
      const exactBySourceTenant = visibleRows.find((item) => String(item && (item.sourceTenantId || item.id) || '').trim() === sourceTenantId);
      if (exactBySourceTenant) return exactBySourceTenant;
    }
    if (!unit) return null;
    const exactVisible = visibleRows.find((item) => {
      if (!item) return false;
      if (String(item.building || '').trim() !== buildingName) return false;
      if (String(item.unit || '').trim() !== unit) return false;
      return normalizeFloorLabel(item.floor) === floor;
    });
    if (exactVisible) return exactVisible;
    if (unitId && typeof getAllVisibleUnitRows === 'function') {
      const unitMatchedView = getAllVisibleUnitRows(state, monthKey).find((item) => String(item && item.unitId || '').trim() === unitId);
      if (unitMatchedView) return unitMatchedView;
    }
    const liveTenant = (state.tenants || []).find((item) => {
      if (!item || item.isArchived) return false;
      if (sourceTenantId && String(item.id || '').trim() === sourceTenantId) return true;
      if (String(item.building || '').trim() !== buildingName) return false;
      const profile = getEffectiveTenantProfile(state, item, monthKey);
      const profileUnit = String((profile ? profile.unit : item.unit) || '').trim();
      const profileFloor = normalizeFloorLabel(profile ? profile.floor : item.floor);
      if (profileUnit !== unit) return false;
      return profileFloor === floor;
    });
    return liveTenant ? getTenantView(state, liveTenant, monthKey) : null;
  }

  function getCurrentBuildingDetailColspan() {
    return window.__buildingVisibleColumnCount || BUILDING_TABLE_COLUMN_COUNT;
  }

  function usesDecimalAmountInputs(tenant) {
    if (!tenant) return false;
    const buildingName = String(tenant.building || '').trim().toLowerCase();
    const unit = String(tenant.unit || '').trim();
    const name = String(tenant.name || '').trim();
    const sourceTenantId = String(tenant.sourceTenantId || tenant.id || '').trim();
    return buildingName === 'fahaheel'
      && (unit === 'سطح' || name === 'شبكة' || sourceTenantId === 'fahaheel-سطح');
  }

  function normalizeAmountInputValue(value, allowDecimals) {
    const numericValue = Math.max(0, Number(value || 0));
    return normalizeAmount(numericValue);
  }

  function getAmountInputStep(tenant) {
    return '0.001';
  }

  function formatAmountInputValue(value, allowDecimals) {
    const normalized = normalizeAmountInputValue(value, !!allowDecimals);
    if (!(normalized > 0)) return '';
    return String(Number(normalized.toFixed(3)));
  }

  function formatBlankAmountInputValue(value, allowDecimals) {
    const normalized = normalizeAmountInputValue(value, !!allowDecimals);
    return normalized > 0 ? String(Number(normalized.toFixed(3))) : '';
  }

  function getDetailNumericInputValue(input, fallbackValue) {
    if (!input) return Math.max(0, Number(fallbackValue || 0));
    const rawValue = String(input.value || '').trim();
    if (!rawValue) return 0;
    return Math.max(0, Number(rawValue || 0));
  }

  function getDetailTextInputValue(input, fallbackValue) {
    if (!input) return String(fallbackValue || '').trim();
    return String(input.value || '').trim();
  }

  function toggleTenantRowDetail(state, tenantId, rowElement) {
    const row = rowElement || findTenantRow(tenantId);
    if (!row) return;
    const existing = row.nextElementSibling;
    if (existing && existing.matches('[data-tenant-detail]')) {
      existing.remove();
      return;
    }
    document.querySelectorAll('[data-tenant-detail]').forEach((node) => node.remove());
    const selectedMonth = getSelectedBuildingMonth();
    const storedTenant = state.tenants.find((item) => item.id === tenantId) || null;
    const allVisibleRows = typeof getAllVisibleUnitRows === 'function'
      ? getAllVisibleUnitRows(state, selectedMonth)
      : [];
    const visibleTenant = storedTenant
      ? getTenantView(state, storedTenant, selectedMonth)
      : (allVisibleRows.find((item) => item.id === tenantId)
        || getBuildingDisplayTenants(state, window.__selectedBuildingName || '', selectedMonth).find((item) => item.id === tenantId)
        || null);
    const tenant = visibleTenant || findVisibleTenantByRowContext(state, row, selectedMonth);
    if (!tenant) return;
    const isLockedBaseline = isBuildingMonthLocked(tenant.building, selectedMonth);
    const readOnlyAttr = isLockedBaseline ? ' readonly aria-readonly="true"' : '';
    const disabledAttr = isLockedBaseline ? ' disabled aria-disabled="true"' : '';
    const editablePrepaidAmount = getPrepaidNext(state, tenant.id, selectedMonth);
    const detailRow = document.createElement('tr');
    detailRow.setAttribute('data-tenant-detail', tenantId);
    if (tenant.isArchivedSnapshot) {
      detailRow.innerHTML = `<td colspan="${getCurrentBuildingDetailColspan()}" class="building-row-detail">
        <div class="detail-grid">
          <div class="detail-item"><span class="label">Archived tenant</span><strong>${escapeHtml(tenant.name)}</strong></div>
          <div class="detail-item"><span class="label">Unit</span><strong>${escapeHtml(tenant.unit)}</strong></div>
          <div class="detail-item"><span class="label">Vacated on</span><strong>${formatDate(tenant.archivedOn || tenant.contractEnd || '')}</strong></div>
          <div class="detail-item detail-item-wide"><span class="label">Note</span><strong>This is a vacated tenant snapshot for ${escapeHtml(formatMonth(selectedMonth))}. Edit the vacant row for this unit to change vacant details.</strong></div>
        </div>
      </td>`;
      row.insertAdjacentElement('afterend', detailRow);
      return;
    }
    if (tenant.isVacant) {
      const archivedTenant = getLatestArchivedTenantForUnit(state, tenant.building, tenant.unit, selectedMonth);
      const canUndoVacate = !!archivedTenant;
      const tenantUnitId = String(tenant.unitId || '').trim();
      const storedVacantTenant = state.tenants.find((item) => (
        item
        && item.isVacant
        && !item.isArchived
        && (
          item.id === tenant.id
          || (
            tenantUnitId
            && String(item.unitId || '').trim() === tenantUnitId
          )
          || (
            String(item.building || '').trim() === String(tenant.building || '').trim()
            && String(item.unit || '').trim() === String(tenant.unit || '').trim()
            && normalizeFloorLabel(item.floor) === normalizeFloorLabel(tenant.floor)
          )
        )
      ));
      const vacantDiscount = normalizeAmount(Math.max(0, Number(tenant.discount || 0)));
      const vacantLastContractRent = normalizeAmount(Math.max(0, Number(tenant.lastContractRent || 0)));
      const vacantLastActualRent = normalizeAmount(Math.max(
        0,
        Number(tenant.lastActualRent || Math.max(vacantLastContractRent - vacantDiscount, 0))
      ));
      detailRow.innerHTML = `<td colspan="${getCurrentBuildingDetailColspan()}" class="building-row-detail">
        <div class="detail-grid">
          <div class="detail-item"><span class="label">Vacant unit</span><strong>${escapeHtml(tenant.unit)}</strong></div>
          <div class="detail-item"><span class="label">Last tenant</span><strong>${escapeHtml(archivedTenant && archivedTenant.name || '-')}</strong></div>
          <div class="detail-item"><span class="label">Last contract rent</span><input type="number" step="0.001" min="0" data-vacant-last-contract="${escapeHtml(tenant.id)}" value="${escapeHtml(formatBlankAmountInputValue(vacantLastContractRent))}"${readOnlyAttr}></div>
          <div class="detail-item"><span class="label">Discount</span><input type="number" step="0.001" min="0" data-vacant-discount="${escapeHtml(tenant.id)}" value="${escapeHtml(formatBlankAmountInputValue(vacantDiscount))}"${readOnlyAttr}></div>
          <div class="detail-item"><span class="label">Last actual rent</span><input type="number" step="0.001" min="0" data-vacant-last-actual="${escapeHtml(tenant.id)}" value="${escapeHtml(formatBlankAmountInputValue(vacantLastActualRent))}"${readOnlyAttr}></div>
          <div class="detail-item"><span class="label">Vacant since</span><input type="date" data-vacant-since="${escapeHtml(tenant.id)}" value="${escapeHtml(tenant.vacantSince || tenant.vacatedOn || '')}"${readOnlyAttr}></div>
          <div class="detail-item"><span class="label">Old tenant due paid</span><input type="number" step="1" min="0" data-old-tenant-due-note="${escapeHtml(tenant.id)}" value="${escapeHtml(formatBlankAmountInputValue(getOldTenantDuePaidNote(state, tenant.building, tenant.unit, selectedMonth)))}" placeholder="0"${readOnlyAttr}></div>
          <div class="detail-item"><span class="label">Save</span><button type="button" class="secondary-action" data-save-vacant-meta="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked baseline' : 'Save changes'}</button></div>
          ${!storedVacantTenant ? `<div class="detail-item"><span class="label">Note</span><strong>Pre-start vacancy for ${escapeHtml(formatMonth(selectedMonth))}</strong></div>` : ''}
          ${canUndoVacate ? `<div class="detail-item detail-item-wide"><span class="label">Undo vacate</span><button type="button" class="secondary-action" data-undo-vacate="${escapeHtml(tenant.id)}"${disabledAttr}>Restore tenant</button></div>` : ''}
          ${isLockedBaseline ? `<div class="detail-item detail-item-wide"><span class="label">Baseline lock</span><strong>${escapeHtml(getBuildingMonthLockMessage(tenant.building, selectedMonth))}</strong></div>` : ''}
        </div>
      </td>`;
      row.insertAdjacentElement('afterend', detailRow);
        const saveVacantButton = detailRow.querySelector('[data-save-vacant-meta]');
        if (saveVacantButton) {
          saveVacantButton.addEventListener('click', (event) => {
            event.stopPropagation();
            void saveVacantUnitMeta(state, tenant.id, selectedMonth, tenant);
          });
        }
      const contractInput = findDetailInput('data-vacant-last-contract', tenant.id);
      const discountInput = findDetailInput('data-vacant-discount', tenant.id);
      const actualInput = findDetailInput('data-vacant-last-actual', tenant.id);
      const updateVacantActual = () => {
        if (!contractInput || !actualInput) return;
        const contractValue = normalizeAmount(Math.max(0, Number(contractInput.value || 0)));
        const discountValue = normalizeAmount(Math.max(0, Number(discountInput && discountInput.value || 0)));
        actualInput.value = formatBlankAmountInputValue(Math.max(contractValue - discountValue, 0));
      };
      if (contractInput) contractInput.addEventListener('input', updateVacantActual);
      if (discountInput) discountInput.addEventListener('input', updateVacantActual);
      const undoButton = detailRow.querySelector('[data-undo-vacate]');
      if (undoButton) {
        undoButton.addEventListener('click', (event) => {
          event.stopPropagation();
          void undoVacateTenantFromBuilding(state, tenantId);
        });
      }
      return;
    }
    const showMoveInDetail = !!tenant.moveInDate && !!tenant.contractStart && tenant.moveInDate !== tenant.contractStart;
    const suggestedVacateDate = tenant.plannedVacateDate || '';
    const isProtectedBaselinePrepaid = typeof isProtectedBaselinePrepaidTenant === 'function'
      && isProtectedBaselinePrepaidTenant(tenant, selectedMonth);
    const canMarkUnpaid = !isProtectedBaselinePrepaid && hasUndoablePaidActionForMonth(state, tenant, selectedMonth);
    const markSelectedMonthLabel = isProtectedBaselinePrepaid
      ? 'Covered by Dec prepaid'
      : (canMarkUnpaid ? 'Mark unpaid' : 'Mark as paid');
    const fieldTenantId = String(tenant.sourceTenantId || tenant.id || '').trim() || String(tenant.id || '').trim();
    const allowDecimalAmounts = usesDecimalAmountInputs(tenant);
    const amountInputStep = getAmountInputStep(tenant);
    const stableContractAmount = normalizeAmount(
      tenant.contractRent > 0
        ? tenant.contractRent
        : (tenant.displayActualRent || tenant.rentDue || 0)
    );
    const stableActualRent = normalizeAmount(
      tenant.displayActualRent != null && Number(tenant.displayActualRent || 0) > 0
        ? tenant.displayActualRent
        : (tenant.baseActualRent || tenant.rentDue || stableContractAmount || 0)
    );
    const storedPrepaidFromBefore = typeof getOpeningCreditOverride === 'function'
      ? normalizeAmount(getOpeningCreditOverride(state, fieldTenantId, selectedMonth) || 0)
      : normalizeAmount(tenant.prepaidFromBefore || 0);
    const markPaidButtonDisabledAttr = (isLockedBaseline || isProtectedBaselinePrepaid) ? ' disabled aria-disabled="true"' : '';
    const protectedFinancialReadOnlyAttr = isProtectedBaselinePrepaid ? ' readonly aria-readonly="true"' : '';
    const prepaidFromBeforeReadOnlyAttr = protectedFinancialReadOnlyAttr;
    detailRow.innerHTML = `<td colspan="${getCurrentBuildingDetailColspan()}" class="building-row-detail">
      <div class="detail-grid">
        <div class="detail-item"><span class="label">Mark selected month</span><button type="button" class="secondary-action" data-mark-paid="${escapeHtml(tenant.id)}"${markPaidButtonDisabledAttr}>${isLockedBaseline ? 'Locked baseline' : markSelectedMonthLabel}</button></div>
        <div class="detail-item"><span class="label">Unpaid from before</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-previous-due="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'unpaid_from_before'))}" value="${escapeHtml(formatBlankAmountInputValue(tenant.previousDue || 0, allowDecimalAmounts))}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Paid previous</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-paid-previous="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'paid_previous'))}" value="${escapeHtml(formatBlankAmountInputValue(getTenantDuePaidAmount(state, tenant.id, getSelectedBuildingMonth()), allowDecimalAmounts))}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Prepaid from before</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-prepaid-from-before="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'prepaid_from_before'))}" value="${escapeHtml(formatBlankAmountInputValue(storedPrepaidFromBefore, allowDecimalAmounts))}"${prepaidFromBeforeReadOnlyAttr}></div>
        <div class="detail-item"><span class="label">Vacant amount</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-vacant-amount="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'vacant_amount'))}" value="${escapeHtml(formatBlankAmountInputValue(tenant.displayVacantAmount || 0, allowDecimalAmounts))}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Actual rent</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-actual-rent="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'actual_rent'))}" value="${escapeHtml(formatBlankAmountInputValue(stableActualRent, allowDecimalAmounts))}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Last paid month</span><strong>${escapeHtml(tenant.lastPaidMonthLabel)}${tenant.lateMonths ? ` · Late ${tenant.lateMonths} months` : ''}</strong></div>
        <div class="detail-item"><span class="label">Paid through</span><strong>${escapeHtml(tenant.paidThroughMonth ? formatMonth(tenant.paidThroughMonth) : '-')}</strong></div>
        <div class="detail-item"><span class="label">Advance covers</span><strong>${tenant.prepaidMonths > 0 ? `${tenant.prepaidMonths} month${tenant.prepaidMonths > 1 ? 's' : ''}` : '0 months'}</strong></div>
        <div class="detail-item"><span class="label">Contract start</span><strong>${formatDate(tenant.contractStart)}</strong></div>
        <div class="detail-item"><span class="label">Contract end</span><strong>${formatDate(tenant.contractEnd)}</strong></div>
        ${showMoveInDetail ? `<div class="detail-item"><span class="label">Move in</span><strong>${formatDate(tenant.moveInDate)}</strong></div>` : ''}
        <div class="detail-item"><span class="label">Insurance amount</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-insurance-current="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'insurance_amount'))}" value="${escapeHtml(formatBlankAmountInputValue(tenant.insuranceAmount || tenant.insuranceCurrentAmount || tenant.insurancePreviousAmount || 0, allowDecimalAmounts))}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Insurance paid month</span><input type="month" max="${escapeHtml(selectedMonth)}" data-edit-insurance-paid-month="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'insurance_paid_month'))}" value="${escapeHtml(tenant.insurancePaidMonth || '')}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Old tenant due paid</span><input type="number" step="0.001" min="0" data-old-tenant-due-note="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'old_tenant_due_paid'))}" value="${escapeHtml(formatBlankAmountInputValue(getOldTenantDuePaidNote(state, tenant.building, tenant.unit, getSelectedBuildingMonth())))}" placeholder="0"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Prepaid amount</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-prepaid="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'prepaid_amount'))}" value="${escapeHtml(formatBlankAmountInputValue(editablePrepaidAmount, allowDecimalAmounts))}" placeholder="0"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Prepaid action</span><button type="button" class="secondary-action" data-save-prepaid="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked baseline' : (editablePrepaidAmount > 0 ? 'Update / clear prepaid' : 'Save prepaid')}</button></div>
        <div class="detail-item"><span class="label">Partial amount</span><input type="number" step="${escapeHtml(amountInputStep)}" min="0" data-edit-partial-paid="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'partial_amount'))}" value="" placeholder="0"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Partial action</span><button type="button" class="secondary-action" data-save-partial-paid="${escapeHtml(tenant.id)}"${markPaidButtonDisabledAttr}>${isLockedBaseline ? 'Locked baseline' : (isProtectedBaselinePrepaid ? 'Covered by Dec prepaid' : 'Save partial / clear')}</button></div>
        <div class="detail-item"><span class="label">Planned vacate date</span><input type="date" data-vacate-date="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'planned_vacate_date'))}" value="${escapeHtml(suggestedVacateDate)}"${readOnlyAttr}></div>
        <div class="detail-item"><span class="label">Vacate unit</span><button type="button" class="secondary-action" data-vacate-tenant="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked baseline' : 'Vacate tenant'}</button></div>
        <div class="detail-item detail-item-wide detail-item-notes"><span class="label">Notes</span><textarea rows="3" data-edit-notes="${escapeHtml(tenant.id)}" data-inline-field-id="${escapeHtml(buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'notes'))}" placeholder="Add notes"${readOnlyAttr}>${escapeHtml(tenant.notes || '')}</textarea></div>
        <div class="detail-item detail-item-wide detail-item-save"><span class="label">Save all changes</span><button type="button" data-save-tenant="${escapeHtml(tenant.id)}"${disabledAttr}>${isLockedBaseline ? 'Locked baseline' : 'Save changes'}</button></div>
        ${isLockedBaseline ? `<div class="detail-item detail-item-wide"><span class="label">Baseline lock</span><strong>${escapeHtml(getBuildingMonthLockMessage(tenant.building, selectedMonth))}</strong></div>` : ''}
        ${isProtectedBaselinePrepaid ? `<div class="detail-item detail-item-wide"><span class="label">January baseline</span><strong>This row is covered by prepaid from before December and cannot be marked unpaid.</strong></div>` : ''}
      </div>
    </td>`;
    row.insertAdjacentElement('afterend', detailRow);
    const saveButton = detailRow.querySelector('[data-save-tenant]');
    if (saveButton) {
      saveButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await saveTenantInlineEdit(state, tenantId);
        } catch (error) {
          showFlashMessage(String(error && error.message || error || 'Save failed.'));
        }
      });
    }
    const paidButton = detailRow.querySelector('[data-mark-paid]');
    if (paidButton) {
      paidButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const rowUiState = captureBuildingRowUiState(tenantId);
        if (canMarkUnpaid) {
          markTenantUnpaidForCurrentMonth(state, tenantId);
        } else {
          markTenantPaidForCurrentMonth(state, tenantId);
        }
        restoreBuildingRowUiState(state, rowUiState);
      });
    }
    const partialPaidButton = detailRow.querySelector('[data-save-partial-paid]');
    if (partialPaidButton) {
      partialPaidButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const rowUiState = captureBuildingRowUiState(tenantId);
        const partialInput = findDetailInputByFieldId('data-edit-partial-paid', fieldTenantId, selectedMonth, 'partial_amount');
        const partialAmount = Number(partialInput && partialInput.value || 0);
        if (partialAmount > 0) {
          applyTenantPartialPaid(state, tenantId);
        } else {
          markTenantUnpaidForCurrentMonth(state, tenantId);
        }
        restoreBuildingRowUiState(state, rowUiState);
      });
    }
    const prepaidButton = detailRow.querySelector('[data-save-prepaid]');
    if (prepaidButton) {
      prepaidButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const prepaidInput = findDetailInputByFieldId('data-edit-prepaid', fieldTenantId, selectedMonth, 'prepaid_amount');
        const prepaidAmount = Number(prepaidInput && prepaidInput.value || 0);
        if (prepaidAmount > 0) {
          saveTenantPrepaidAmount(state, tenantId, tenant);
        } else {
          deleteTenantPrepaidAmount(state, tenantId, tenant);
        }
      });
    }
    const vacateButton = detailRow.querySelector('[data-vacate-tenant]');
    if (vacateButton) {
      vacateButton.addEventListener('click', (event) => {
        event.stopPropagation();
        void vacateTenantFromBuilding(state, tenantId);
      });
    }
    const plannedVacateInput = findDetailInputByFieldId('data-vacate-date', fieldTenantId, selectedMonth, 'planned_vacate_date');
    if (plannedVacateInput) {
      plannedVacateInput.addEventListener('change', (event) => {
        event.stopPropagation();
        savePlannedVacateDate(state, tenantId);
      });
    }
    const previousDueInput = findDetailInputByFieldId('data-edit-previous-due', fieldTenantId, selectedMonth, 'unpaid_from_before');
    const paidPreviousInput = findDetailInputByFieldId('data-edit-paid-previous', fieldTenantId, selectedMonth, 'paid_previous');
    const contractInput = findDetailInputByFieldId('data-edit-contract', fieldTenantId, selectedMonth, 'contract_amount');
    const discountInput = findDetailInputByFieldId('data-edit-discount', fieldTenantId, selectedMonth, 'discount');
    const vacantAmountInput = findDetailInputByFieldId('data-edit-vacant-amount', fieldTenantId, selectedMonth, 'vacant_amount');
    const actualRentInput = findDetailInputByFieldId('data-edit-actual-rent', fieldTenantId, selectedMonth, 'actual_rent');
    bindPreviousDueLockInputs(previousDueInput, paidPreviousInput, fieldTenantId);
    bindActualRentPanelInputs(contractInput, discountInput, vacantAmountInput, actualRentInput, allowDecimalAmounts);
  }

  function bindPreviousDueLockInputs(previousDueInput, paidPreviousInput, tenantId) {
    if (!previousDueInput || !paidPreviousInput) return;
    const syncCurrentMonthLock = () => {
      const currentMonthFieldId = buildTenantMonthFieldId(tenantId, getSelectedBuildingMonth(), 'current_month');
      const currentMonthInput = currentMonthFieldId
        ? document.querySelector(`[data-inline-field-id="${currentMonthFieldId}"][data-row-edit-current-month]`)
        : null;
      const previousValue = normalizeAmount(Math.max(0, Number(previousDueInput.value || 0)));
      const paidValue = normalizeAmount(Math.max(0, Number(paidPreviousInput.value || 0)));
      if (!currentMonthInput) return;
      if (paidValue >= previousValue) {
        currentMonthInput.readOnly = false;
        currentMonthInput.removeAttribute('aria-readonly');
      } else {
        currentMonthInput.readOnly = true;
        currentMonthInput.setAttribute('aria-readonly', 'true');
      }
      syncBuildingRowStatusPreview(tenantId);
    };
    previousDueInput.addEventListener('input', () => {
      const previousValue = normalizeAmount(Math.max(0, Number(previousDueInput.value || 0)));
      previousDueInput.value = formatBlankAmountInputValue(previousValue, true);
      syncCurrentMonthLock();
    });
    paidPreviousInput.addEventListener('input', () => {
      const paidValue = normalizeAmount(Math.max(0, Number(paidPreviousInput.value || 0)));
      paidPreviousInput.value = formatBlankAmountInputValue(paidValue, true);
      syncCurrentMonthLock();
    });
    syncCurrentMonthLock();
  }

  function syncBuildingRowStatusPreview(tenantId) {
    const selectedMonth = getSelectedBuildingMonth();
    const row = findTenantRow(tenantId);
    if (!row) return;
    const badgeNode = row.querySelector('.badge');
    if (!badgeNode) return;
    const visibleTenant = findVisibleTenantByRowContext(window.__appState || {}, row, selectedMonth);
    const fieldTenantId = String(
      row.dataset.rowSourceTenantId || tenantId || ''
    ).trim() || String(tenantId || '').trim();
    const previousDueInput = findDetailInputByFieldId('data-edit-previous-due', fieldTenantId, selectedMonth, 'unpaid_from_before');
    const paidPreviousInput = findDetailInputByFieldId('data-edit-paid-previous', fieldTenantId, selectedMonth, 'paid_previous');
    const actualRentInput = findDetailInputByFieldId('data-edit-actual-rent', fieldTenantId, selectedMonth, 'actual_rent');
    const currentMonthFieldId = buildTenantMonthFieldId(fieldTenantId, selectedMonth, 'current_month');
    const currentMonthInput = currentMonthFieldId
      ? document.querySelector(`[data-inline-field-id="${currentMonthFieldId}"][data-row-edit-current-month]`)
      : null;
    const previousDueValue = normalizeAmount(Math.max(0, Number(previousDueInput ? previousDueInput.value : visibleTenant && visibleTenant.previousDue || 0)));
    const paidPreviousValue = normalizeAmount(Math.max(0, Number(paidPreviousInput ? paidPreviousInput.value : visibleTenant && visibleTenant.previousPaid || 0)));
    const actualRentValue = normalizeAmount(Math.max(0, Number(actualRentInput ? actualRentInput.value : visibleTenant && visibleTenant.displayActualRent || visibleTenant && visibleTenant.rentDue || 0)));
    const currentMonthValue = normalizeAmount(Math.max(0, Number(currentMonthInput ? currentMonthInput.value : visibleTenant && visibleTenant.paidCurrent || 0)));
    const remainingPreviousDue = normalizeAmount(Math.max(previousDueValue - paidPreviousValue, 0));
    const remainingCurrent = normalizeAmount(actualRentValue - currentMonthValue);
    let nextStatus = 'upcoming';
    if (remainingPreviousDue > 0) nextStatus = 'overdue';
    else if (actualRentValue <= 0 || remainingCurrent <= 0) nextStatus = 'paid';
    else if (currentMonthValue > 0) nextStatus = 'partial';
    const badgeMeta = STATUS_META[nextStatus] || STATUS_META.upcoming;
    badgeNode.className = `badge ${badgeMeta.className}`;
    badgeNode.textContent = badgeMeta.label;
    row.classList.toggle('is-late', nextStatus === 'overdue');
    row.classList.toggle('is-dim', nextStatus === 'overdue' || remainingPreviousDue > 0);
  }

  function bindActualRentPanelInputs(contractInput, discountInput, vacantAmountInput, actualRentInput, allowDecimalAmounts) {
    if (!contractInput || !actualRentInput) return;
    let manualOverride = false;
    const updateActualRent = () => {
      if (manualOverride) return;
      const contractValue = normalizeAmountInputValue(contractInput.value || 0, allowDecimalAmounts);
      const discountValue = normalizeAmountInputValue(discountInput && discountInput.value || 0, allowDecimalAmounts);
      const vacantValue = normalizeAmountInputValue(vacantAmountInput && vacantAmountInput.value || 0, allowDecimalAmounts);
      actualRentInput.value = formatBlankAmountInputValue(Math.max(contractValue - discountValue - vacantValue, 0), allowDecimalAmounts);
    };
    const markManualOverride = () => {
      manualOverride = true;
    };
    actualRentInput.addEventListener('input', markManualOverride);
    if (contractInput) contractInput.addEventListener('input', updateActualRent);
    if (discountInput) discountInput.addEventListener('input', updateActualRent);
    if (vacantAmountInput) vacantAmountInput.addEventListener('input', updateActualRent);
    updateActualRent();
  }

  function getLatestArchivedTenantForUnit(state, buildingName, unit, monthKey) {
    return state.tenants
      .filter((tenant) => tenant.building === buildingName && tenant.unit === unit && tenant.isArchived && !tenant.isVacant)
      .filter((tenant) => !monthKey || getMonthKeyFromDate(tenant.archivedOn || tenant.contractEnd || '') === monthKey)
      .sort((a, b) => new Date(String(b.archivedOn || b.contractEnd || '1900-01-01')) - new Date(String(a.archivedOn || a.contractEnd || '1900-01-01')))[0] || null;
  }

  function getLatestArchivedTenantForUnitUpToMonth(state, buildingName, unit, monthKey, floor) {
    const normalizedFloor = normalizeFloorLabel(floor);
    return state.tenants
      .filter((tenant) => tenant.building === buildingName && tenant.unit === unit && tenant.isArchived && !tenant.isVacant)
      .filter((tenant) => !normalizedFloor || normalizeFloorLabel(tenant.floor) === normalizedFloor)
      .filter((tenant) => {
        if (!monthKey) return true;
        const archivedMonth = getMonthKeyFromDate(tenant.archivedOn || tenant.contractEnd || '');
        return !archivedMonth || compareMonthKeys(archivedMonth, monthKey) <= 0;
      })
      .sort((a, b) => new Date(String(b.archivedOn || b.contractEnd || '1900-01-01')) - new Date(String(a.archivedOn || a.contractEnd || '1900-01-01')))[0] || null;
  }

  function findVacantRow(tenantId) {
    return Array.from(document.querySelectorAll('[data-vacant-row]')).find((row) => row.getAttribute('data-vacant-row') === tenantId) || null;
  }

  function getLatestKnownVacateDate(state, buildingName, unit, floor) {
    const normalizedFloor = normalizeFloorLabel(floor);
    const vacantRecord = state.tenants.find((tenant) => (
      tenant.building === buildingName
      && tenant.unit === unit
      && (!normalizedFloor || normalizeFloorLabel(tenant.floor) === normalizedFloor)
      && tenant.isVacant
      && !tenant.isArchived
      && tenant.vacatedOn
    ));
    if (vacantRecord && vacantRecord.vacatedOn) return vacantRecord.vacatedOn;
    const archivedTenant = state.tenants
      .filter((tenant) => tenant.building === buildingName && tenant.unit === unit && tenant.isArchived && !tenant.isVacant)
      .filter((tenant) => !normalizedFloor || normalizeFloorLabel(tenant.floor) === normalizedFloor)
      .sort((a, b) => new Date(String(b.archivedOn || b.contractEnd || '1900-01-01')) - new Date(String(a.archivedOn || a.contractEnd || '1900-01-01')))[0];
    return archivedTenant ? String(archivedTenant.archivedOn || archivedTenant.contractEnd || '') : '';
  }

  async function saveTenantInlineEdit(state, tenantId, options = {}) {
    const rowUiState = captureBuildingRowUiState(tenantId);
    const row = findTenantRow(tenantId);
    const selectedMonth = getSelectedBuildingMonth();
    let tenant = state.tenants.find((item) => item.id === tenantId) || null;
    let visibleTenant = tenant ? getTenantView(state, tenant, selectedMonth) : null;
    if (!visibleTenant) {
      visibleTenant = findVisibleTenantByRowContext(state, row, selectedMonth);
    }
    const canonicalSourceTenantId = String(
      visibleTenant && (visibleTenant.sourceTenantId || visibleTenant.id)
      || tenant && tenant.id
      || tenantId
      || ''
    ).trim();
    const canonicalUnitId = String(
      visibleTenant && visibleTenant.unitId
      || row && row.dataset && row.dataset.rowUnitId
      || ''
    ).trim();
    if (!tenant && canonicalSourceTenantId) {
      tenant = state.tenants.find((item) => String(item && item.id || '').trim() === canonicalSourceTenantId) || null;
    }
    if (!tenant && !visibleTenant) return;
    if (!visibleTenant) {
      visibleTenant = getTenantView(state, tenant, selectedMonth);
    }
    const tenantForDisplay = visibleTenant || tenant;
    if (!tenantForDisplay) return;
    if (!canEditBuildingMonth(tenantForDisplay.building, selectedMonth)) {
      return;
    }
    if (typeof preserveVisibleBuildingOrderForBuilding === 'function') {
      preserveVisibleBuildingOrderForBuilding(state, tenantForDisplay.building, selectedMonth);
    }
    const fieldTenantId = canonicalSourceTenantId || tenantId;
    const previousDueInput = findDetailInputByFieldId('data-edit-previous-due', fieldTenantId, selectedMonth, 'unpaid_from_before');
    const paidPreviousInput = findDetailInputByFieldId('data-edit-paid-previous', fieldTenantId, selectedMonth, 'paid_previous');
    const prepaidFromBeforeInput = findDetailInputByFieldId('data-edit-prepaid-from-before', fieldTenantId, selectedMonth, 'prepaid_from_before');
    const currentMonthInput = findDetailInputByFieldId('data-edit-current-month', fieldTenantId, selectedMonth, 'current_month');
    const contractInput = findDetailInputByFieldId('data-edit-contract', fieldTenantId, selectedMonth, 'contract_amount');
    const discountInput = findDetailInputByFieldId('data-edit-discount', fieldTenantId, selectedMonth, 'discount');
    const actualRentInput = findDetailInputByFieldId('data-edit-actual-rent', fieldTenantId, selectedMonth, 'actual_rent');
    const vacantAmountInput = findDetailInputByFieldId('data-edit-vacant-amount', fieldTenantId, selectedMonth, 'vacant_amount');
    const insuranceCurrentInput = findDetailInputByFieldId('data-edit-insurance-current', fieldTenantId, selectedMonth, 'insurance_amount');
    const insurancePaidMonthInput = findDetailInputByFieldId('data-edit-insurance-paid-month', fieldTenantId, selectedMonth, 'insurance_paid_month');
    const oldTenantDuePaidNoteInput = findDetailInputByFieldId('data-old-tenant-due-note', fieldTenantId, selectedMonth, 'old_tenant_due_paid');
    const prepaidInput = findDetailInputByFieldId('data-edit-prepaid', fieldTenantId, selectedMonth, 'prepaid_amount');
    const notesInput = findDetailInputByFieldId('data-edit-notes', fieldTenantId, selectedMonth, 'notes');
    const vacateInput = findDetailInputByFieldId('data-vacate-date', fieldTenantId, selectedMonth, 'planned_vacate_date');
    const allowDecimalAmounts = usesDecimalAmountInputs(tenantForDisplay);
    const shouldUpdateBaseTenant = compareMonthKeys(selectedMonth, getDefaultActiveMonthKey()) <= 0;
    const isProtectedBaselinePrepaid = typeof isProtectedBaselinePrepaidTenant === 'function'
      && isProtectedBaselinePrepaidTenant(tenantForDisplay, selectedMonth);
    const paidPreviousAmount = normalizeAmountInputValue(getDetailNumericInputValue(paidPreviousInput, 0), allowDecimalAmounts);
    const requestedCurrentMonthAmount = normalizeAmountInputValue(getDetailNumericInputValue(currentMonthInput, tenantForDisplay.paidCurrent || 0), allowDecimalAmounts);
    const contractRent = normalizeAmountInputValue(getDetailNumericInputValue(contractInput, tenantForDisplay.contractRent || 0), allowDecimalAmounts);
    const discount = normalizeAmountInputValue(getDetailNumericInputValue(discountInput, tenantForDisplay.discount || 0), allowDecimalAmounts);
    const vacantAmount = normalizeAmountInputValue(getDetailNumericInputValue(vacantAmountInput, tenantForDisplay.displayVacantAmount || 0), allowDecimalAmounts);
    const derivedActualRentAmount = Math.max(contractRent - discount - vacantAmount, 0);
    const actualRentAmount = normalizeAmountInputValue(
      getDetailNumericInputValue(
        actualRentInput,
        derivedActualRentAmount || tenantForDisplay.displayActualRent || tenantForDisplay.baseActualRent || tenantForDisplay.actualRent || 0
      ),
      allowDecimalAmounts
    );
    const insuranceAmount = Math.max(0, getDetailNumericInputValue(insuranceCurrentInput, tenantForDisplay.insuranceAmount || tenantForDisplay.insuranceCurrentAmount || tenantForDisplay.insurancePreviousAmount || 0));
    const insurancePaidMonth = getDetailTextInputValue(insurancePaidMonthInput, tenantForDisplay.insurancePaidMonth || '');
    if (insurancePaidMonth && compareMonthKeys(insurancePaidMonth, selectedMonth) > 0) {
      showFlashMessage('Insurance paid month cannot be after the selected month.');
      return;
    }
    const oldTenantDuePaidNote = normalizeAmountInputValue(getDetailNumericInputValue(oldTenantDuePaidNoteInput, 0), allowDecimalAmounts);
    const prepaidAmount = normalizeAmountInputValue(getDetailNumericInputValue(prepaidInput, 0), allowDecimalAmounts);
    if (tenant && shouldUpdateBaseTenant) {
      tenant.contractRent = contractRent;
      tenant.discount = discount;
      tenant.actualRent = Math.max(contractRent - discount, 0);
    }
    const baseActualRent = tenant && shouldUpdateBaseTenant ? tenant.actualRent : Math.max(contractRent - discount, 0);
    const effectiveRentDue = Math.max(actualRentAmount, 0);
    const prepaidFromBeforeAmount = normalizeAmountInputValue(
      getDetailNumericInputValue(
        prepaidFromBeforeInput,
        (typeof getOpeningCreditOverride === 'function'
          ? getOpeningCreditOverride(state, fieldTenantId, selectedMonth)
          : tenantForDisplay.prepaidFromBefore) || 0
      ),
      allowDecimalAmounts
    );
    const currentMonthAmount = requestedCurrentMonthAmount;
    const remainingCurrentAmount = normalizeAmount(effectiveRentDue - currentMonthAmount);
    const previousDueAmount = normalizeAmountInputValue(
      getDetailNumericInputValue(previousDueInput, tenantForDisplay.previousDue || 0),
      allowDecimalAmounts
    );
    const unpaidTotalAmount = isProtectedBaselinePrepaid
      ? remainingCurrentAmount
      : normalizeAmount(previousDueAmount + remainingCurrentAmount);
    if (tenant && shouldUpdateBaseTenant && insuranceAmount > 0 && insurancePaidMonth) {
      tenant.insuranceAmount = insuranceAmount;
      tenant.insurancePaidMonth = insurancePaidMonth;
      tenant.insurancePreviousAmount = insurancePaidMonth < selectedMonth ? insuranceAmount : 0;
      tenant.insuranceCurrentAmount = insurancePaidMonth === selectedMonth ? insuranceAmount : 0;
    } else if (tenant && shouldUpdateBaseTenant) {
      tenant.insuranceAmount = 0;
      tenant.insurancePaidMonth = '';
      tenant.insurancePreviousAmount = 0;
      tenant.insuranceCurrentAmount = 0;
    }
    const plannedVacateDate = getDetailTextInputValue(vacateInput, '');
    if (tenant && shouldUpdateBaseTenant) {
      tenant.plannedVacateDate = plannedVacateDate;
    }
    if (typeof setOldTenantDuePaidNote === 'function') {
      setOldTenantDuePaidNote(state, tenantForDisplay.building, tenantForDisplay.unit, selectedMonth, oldTenantDuePaidNote);
    }
    const prepaidTargetTenantId = String(
      canonicalSourceTenantId
      || tenantForDisplay.sourceTenantId
      || tenantForDisplay.id
      || tenant && (tenant.sourceTenantId || tenant.id)
      || tenantId
      || ''
    ).trim();
    if (tenant) {
      tenant.prepaidNextMonth = prepaidAmount > 0 ? prepaidAmount : 0;
    }
    tenantForDisplay.prepaidNext = prepaidAmount > 0 ? prepaidAmount : 0;
    if (typeof syncBuildingInlineEditToDb === 'function' && canonicalSourceTenantId) {
      await syncBuildingInlineEditToDb({
        sourceTenantId: canonicalSourceTenantId,
        unitId: canonicalUnitId,
        monthKey: selectedMonth,
        contractRent,
        discount,
        baseActualRent,
        actualRentOverride: actualRentAmount,
        vacantAmount,
        openingCreditAmount: prepaidFromBeforeAmount,
        carryOverride: compareMonthKeys(selectedMonth, getDefaultActiveMonthKey()) > 0 ? 0 : (previousDueAmount + paidPreviousAmount),
        paidOverride: currentMonthAmount,
        insuranceAmount,
        insurancePaidMonth,
        oldTenantDuePaid: paidPreviousAmount,
        prepaidAmount,
        plannedVacateDate,
        notes: getDetailTextInputValue(notesInput, tenantForDisplay.notes || '')
      });
    }
    logActivity(state, 'Tenant updated', `${tenantForDisplay.building} ${tenantForDisplay.unit} ${formatMonth(selectedMonth)} current month ${currentMonthAmount} / unpaid total ${unpaidTotalAmount} / paid previous ${paidPreviousAmount} / prepaid ${formatCurrency(prepaidAmount)} / vacant ${formatCurrency(vacantAmount)} / old tenant due paid ${formatCurrency(oldTenantDuePaidNote)} / contract ${contractRent} / discount ${discount} / actual ${actualRentAmount} / insurance ${insuranceAmount} in ${insurancePaidMonth || 'not set'} / planned vacate ${plannedVacateDate || 'not set'} / notes updated`);
    renderAll(state, tenantForDisplay.building);
    if (options && options.reopenDetail === false) {
      const rowAfterRender = findBuildingRowByUiState(rowUiState);
      if (rowAfterRender && Math.abs((rowAfterRender.getBoundingClientRect().top || 0) - Number(rowUiState && rowUiState.top || 0)) > 1) {
        window.scrollBy(0, rowAfterRender.getBoundingClientRect().top - Number(rowUiState.top || 0));
      }
    } else {
      restoreBuildingRowUiState(state, rowUiState);
    }
    showFlashMessage(`Saved ${tenantForDisplay.building} ${tenantForDisplay.unit}.`);
  }

  function savePlannedVacateDate(state, tenantId) {
      const tenant = state.tenants.find((item) => item.id === tenantId);
      if (!tenant || tenant.isVacant || tenant.isArchived) return;
      const rowUiState = captureBuildingRowUiState(tenantId);
      const selectedMonth = getSelectedBuildingMonth();
      if (!canEditBuildingMonth(tenant.building, selectedMonth)) {
        return;
      }
      const vacateInput = findDetailInput('data-vacate-date', tenantId);
      const plannedVacateDate = getDetailTextInputValue(vacateInput, '');
      tenant.plannedVacateDate = plannedVacateDate;
      saveState(state);
      if (typeof syncPlannedVacateToDb === 'function') {
        syncPlannedVacateToDb(tenant.id, plannedVacateDate);
      }
      logActivity(state, 'Planned vacate updated', `${tenant.building} ${tenant.unit} planned vacate ${plannedVacateDate || 'cleared'}.`);
      renderAll(state, tenant.building);
      restoreBuildingRowUiState(state, rowUiState);
    }
