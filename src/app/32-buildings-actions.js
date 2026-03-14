  function setTenantDuePaidAmount(state, tenantId, monthKey, amount) {
    const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
    state.payments = state.payments.filter((payment) => !(
      payment.tenantId === tenantId
      && payment.method === 'Due payment'
      && payment.rentMonth === monthKey
    ));
    if (!(normalizedAmount > 0)) return;
    state.payments.push({
      id: `payment-${Date.now()}-due-edit-${Math.random().toString(16).slice(2, 8)}`,
      tenantId,
      amount: normalizedAmount,
      date: new Date().toISOString().slice(0, 10),
      rentMonth: monthKey,
      method: 'Due payment',
      note: 'Edited from building page'
    });
  }

  function markTenantPaidForCurrentMonth(state, tenantId) {
    const tenantRecord = state.tenants.find((item) => item.id === tenantId);
    if (!tenantRecord) return;
    const selectedMonth = getSelectedBuildingMonth();
    if (!canEditBuildingMonth(tenantRecord.building, selectedMonth)) {
      return;
    }
    const tenant = getTenantView(state, tenantRecord, selectedMonth);
    if (!tenant) return;
    if (tenant.previousDue > 0) {
      alert('This tenant still has previous due. Clear old due first.');
      logActivity(state, 'Mark paid blocked', `${tenant.building} ${tenant.unit} blocked because previous due exists.`);
      return;
    }
    if (tenant.remainingCurrent <= 0) {
      alert('This tenant is already paid for the selected month.');
      return;
    }
    const currentMonth = selectedMonth;
    if (compareMonthKeys(currentMonth, getCurrentMonthKey()) < 0) {
      setPaidOverride(state, tenantId, currentMonth, tenant.rentDue);
      tenantRecord.lastPaidMonth = currentMonth;
      saveState(state);
      logActivity(state, 'Marked paid', `${tenant.building} ${tenant.unit} marked paid for ${formatMonth(currentMonth)}.`);
      renderAll(state, tenant.building);
      return;
    }
    state.payments.push({
      id: `payment-${Date.now()}-mark-paid`,
      tenantId,
      amount: tenant.remainingCurrent,
      date: new Date().toISOString().slice(0, 10),
      rentMonth: currentMonth,
      method: 'Mark as paid',
      note: 'Auto-filled remaining current month amount'
    });
    tenantRecord.lastPaidMonth = currentMonth;
    saveState(state);
    logActivity(state, 'Marked paid', `${tenant.building} ${tenant.unit} marked paid for ${formatMonth(currentMonth)} with ${formatCurrency(tenant.remainingCurrent)}.`);
    renderAll(state, tenant.building);
  }

  function applyTenantPartialPaid(state, tenantId) {
    const tenantRecord = state.tenants.find((item) => item.id === tenantId);
    if (!tenantRecord) return;
    const selectedMonth = getSelectedBuildingMonth();
    if (!canEditBuildingMonth(tenantRecord.building, selectedMonth)) {
      return;
    }
    const tenant = getTenantView(state, tenantRecord, selectedMonth);
    if (!tenant) return;
    const partialInput = findDetailInput('data-edit-partial-paid', tenantId);
    const enteredAmount = Number(partialInput && partialInput.value || 0);
    if (!(enteredAmount > 0)) {
      alert('Enter a partial payment amount greater than zero.');
      return;
    }
    if (tenant.previousDue > 0) {
      alert('This tenant still has previous due. Clear old due first.');
      logActivity(state, 'Partial payment blocked', `${tenant.building} ${tenant.unit} blocked because previous due exists.`);
      return;
    }
    if (tenant.remainingCurrent <= 0) {
      alert('This tenant is already fully paid for the selected month.');
      return;
    }
    const appliedAmount = Math.min(enteredAmount, tenant.remainingCurrent);
    const currentMonth = selectedMonth;
    if (compareMonthKeys(currentMonth, getCurrentMonthKey()) < 0) {
      setPaidOverride(state, tenantId, currentMonth, appliedAmount);
      tenantRecord.lastPaidMonth = currentMonth;
      saveState(state);
      logActivity(state, 'Partial payment recorded', `${tenant.building} ${tenant.unit} partial paid ${formatCurrency(appliedAmount)} for ${formatMonth(currentMonth)}.`);
      renderAll(state, tenant.building);
      return;
    }
    state.payments.push({
      id: `payment-${Date.now()}-partial-paid`,
      tenantId,
      amount: appliedAmount,
      date: new Date().toISOString().slice(0, 10),
      rentMonth: currentMonth,
      method: 'Partial paid',
      note: 'Partial current month payment'
    });
    tenantRecord.lastPaidMonth = currentMonth;
    saveState(state);
    logActivity(state, 'Partial payment recorded', `${tenant.building} ${tenant.unit} partial paid ${formatCurrency(appliedAmount)} for ${formatMonth(currentMonth)}.`);
    renderAll(state, tenant.building);
  }

  function applyTenantPreviousDuePaid(state, tenantId) {
    const tenantRecord = state.tenants.find((item) => item.id === tenantId);
    if (!tenantRecord) return;
    const selectedMonth = getSelectedBuildingMonth();
    if (!canEditBuildingMonth(tenantRecord.building, selectedMonth)) {
      return;
    }
    const tenant = getTenantView(state, tenantRecord, selectedMonth);
    if (!tenant) return;
    const previousPaidInput = findDetailInput('data-edit-previous-paid', tenantId);
    const enteredAmount = Number(previousPaidInput && previousPaidInput.value || 0);
    if (!(enteredAmount > 0)) {
      alert('Enter a previous due payment amount greater than zero.');
      return;
    }
    if (tenant.previousDue <= 0) {
      alert('This tenant does not have previous due to clear.');
      return;
    }
    const appliedAmount = Math.min(enteredAmount, tenant.previousDue);
    state.payments.push({
      id: `payment-${Date.now()}-building-due`,
      tenantId,
      amount: appliedAmount,
      date: new Date().toISOString().slice(0, 10),
      rentMonth: selectedMonth,
      method: 'Due payment',
      note: 'Applied from building page'
    });
    saveState(state);
    logActivity(state, 'Due payment recorded', `${tenant.building} ${tenant.unit} previous due payment ${formatCurrency(appliedAmount)} applied for ${formatMonth(selectedMonth)}.`);
    renderAll(state, tenant.building);
  }

  function hasUndoablePaidActionForMonth(state, tenant, monthKey) {
    if (!tenant || tenant.isVacant) return false;
    if (tenant.rentDue <= 0 || tenant.previousDue > 0 || tenant.remainingCurrent > 0) return false;
    if (compareMonthKeys(monthKey, getCurrentMonthKey()) < 0) {
      const paidOverride = getPaidOverride(state, tenant.id, monthKey);
      if (paidOverride != null) return normalizeAmount(paidOverride) > 0;
      return normalizeAmount(tenant.paidCurrentRaw || 0) > 0 && normalizeAmount(tenant.prepaidFromBefore || 0) <= 0;
    }
    return state.payments.some((payment) => (
      payment.tenantId === tenant.id
      && payment.rentMonth === monthKey
      && payment.method === 'Mark as paid'
    ));
  }

  function markTenantUnpaidForCurrentMonth(state, tenantId) {
    const tenantRecord = state.tenants.find((item) => item.id === tenantId);
    if (!tenantRecord) return;
    const currentMonth = getSelectedBuildingMonth();
    if (!canEditBuildingMonth(tenantRecord.building, currentMonth)) {
      return;
    }
    const tenant = getTenantView(state, tenantRecord, currentMonth);
    if (!tenant || !hasUndoablePaidActionForMonth(state, tenant, currentMonth)) {
      alert('This month is not using a reversible mark-as-paid action.');
      return;
    }
    if (compareMonthKeys(currentMonth, getCurrentMonthKey()) < 0) {
      setPaidOverride(state, tenantId, currentMonth, 0);
      tenantRecord.lastPaidMonth = addMonths(currentMonth, -1);
      saveState(state);
      logActivity(state, 'Marked unpaid', `${tenantRecord.building} ${tenantRecord.unit} paid override removed for ${formatMonth(currentMonth)}.`);
      renderAll(state, tenantRecord.building);
      return;
    }
    const reversiblePayments = state.payments
      .filter((payment) => payment.tenantId === tenantId && payment.rentMonth === currentMonth && payment.method === 'Mark as paid')
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!reversiblePayments.length) {
      alert('No auto mark-as-paid entry was found for this tenant in the current month.');
      return;
    }
    const paymentToRemove = reversiblePayments[0];
    state.payments = state.payments.filter((payment) => payment.id !== paymentToRemove.id);
    const updatedTenant = getTenantView(state, tenantRecord, currentMonth);
    tenantRecord.lastPaidMonth = updatedTenant && updatedTenant.paidCurrent > 0 ? currentMonth : addMonths(currentMonth, -1);
    saveState(state);
    logActivity(state, 'Marked unpaid', `${tenantRecord.building} ${tenantRecord.unit} auto paid entry removed for ${formatMonth(currentMonth)}.`);
    renderAll(state, tenantRecord.building);
  }

  function setTenantPrepaidAmount(state, tenantId, desiredAmount) {
    const tenantRecord = state.tenants.find((item) => item.id === tenantId);
    if (!tenantRecord) return;
    const selectedMonth = getSelectedBuildingMonth();
    if (!canEditBuildingMonth(tenantRecord.building, selectedMonth)) {
      return null;
    }
    const tenant = getTenantView(state, tenantRecord, selectedMonth);
    if (!tenant) return;
    const currentMonth = selectedMonth;
    const nextMonth = addMonths(currentMonth, 1);
    const existingAdvancePayments = getAdvancePaymentsForNextMonth(state, tenantId, currentMonth);
    const existingAmount = existingAdvancePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    if (desiredAmount > existingAmount && tenant.previousDue > 0) {
      alert('Prepaid is blocked because this tenant has previous due.');
      logActivity(state, 'Prepaid blocked', `${tenant.building} ${tenant.unit} blocked because previous due exists.`);
      return;
    }
    if (desiredAmount > existingAmount && tenant.status !== 'paid' && tenant.remainingCurrent > 0) {
      alert('Prepaid is blocked until the current month is fully paid.');
      logActivity(state, 'Prepaid blocked', `${tenant.building} ${tenant.unit} blocked because current month is not fully paid.`);
      return;
    }
    state.payments = state.payments.filter((payment) => !existingAdvancePayments.some((advance) => advance.id === payment.id));
    if (desiredAmount > 0) {
      state.payments.push({
        id: `payment-${Date.now()}-prepaid`,
        tenantId,
        amount: desiredAmount,
        date: new Date().toISOString().slice(0, 10),
        rentMonth: nextMonth,
        method: 'Advance',
        note: 'Prepaid next month'
      });
    }
    saveState(state);
    return { tenantRecord, nextMonth, existingAmount };
  }

  function saveTenantPrepaidAmount(state, tenantId) {
    const prepaidInput = findDetailInput('data-edit-prepaid', tenantId);
    const prepaidAmount = Number(prepaidInput && prepaidInput.value || 0);
    if (!(prepaidAmount >= 0)) {
      alert('Enter a valid prepaid amount.');
      return;
    }
    const result = setTenantPrepaidAmount(state, tenantId, prepaidAmount);
    if (!result) return;
    logActivity(state, 'Prepaid saved', `${result.tenantRecord.building} ${result.tenantRecord.unit} prepaid set to ${formatCurrency(prepaidAmount)} for ${formatMonth(result.nextMonth)}.`);
    renderAll(state, result.tenantRecord.building);
  }

  function deleteTenantPrepaidAmount(state, tenantId) {
    const result = setTenantPrepaidAmount(state, tenantId, 0);
    if (!result) return;
    logActivity(state, 'Prepaid deleted', `${result.tenantRecord.building} ${result.tenantRecord.unit} prepaid removed for ${formatMonth(result.nextMonth)}.`);
    renderAll(state, result.tenantRecord.building);
  }

  async function vacateTenantFromBuilding(state, tenantId) {
    const selectedMonth = getSelectedBuildingMonth();
    let tenantRecord = state.tenants.find((item) => item.id === tenantId);
    if (!tenantRecord || tenantRecord.isVacant || tenantRecord.isArchived) {
      const row = typeof findTenantRow === 'function' ? findTenantRow(tenantId) : null;
      const rowUnit = row ? String(row.getAttribute('data-row-unit') || '').trim() : '';
      const rowFloor = row ? String(row.getAttribute('data-row-floor') || '').trim() : '';
      const rowBuilding = row ? String(row.getAttribute('data-row-building') || window.__selectedBuildingName || '').trim() : String(window.__selectedBuildingName || '').trim();
      if (rowUnit && rowBuilding) {
        tenantRecord = state.tenants.find((item) => (
          !item.isVacant
          && !item.isArchived
          && item.building === rowBuilding
          && String(item.unit || '').trim() === rowUnit
          && (!rowFloor || normalizeFloorLabel(item.floor) === normalizeFloorLabel(rowFloor))
        )) || null;
      }
    }
    if (!tenantRecord || tenantRecord.isVacant || tenantRecord.isArchived) return;
    if (!canEditBuildingMonth(tenantRecord.building, selectedMonth)) {
      return;
    }
    if (typeof preserveVisibleBuildingOrderForBuilding === 'function') {
      preserveVisibleBuildingOrderForBuilding(state, tenantRecord.building, selectedMonth);
    }
    const effectiveProfile = typeof getEffectiveTenantProfile === 'function'
      ? (getEffectiveTenantProfile(state, tenantRecord, selectedMonth) || tenantRecord)
      : tenantRecord;
    const previousOrderKey = typeof getTenantOrderKey === 'function'
      ? getTenantOrderKey({
        building: tenantRecord.building,
        unit: effectiveProfile.unit || tenantRecord.unit,
        floor: effectiveProfile.floor || tenantRecord.floor
      })
      : '';
    const vacateInput = findDetailInput('data-vacate-date', tenantId);
    const fallbackVacateDate = String(tenantRecord.contractEnd || '').trim();
    const vacateDate = String(vacateInput && vacateInput.value || fallbackVacateDate).trim();
    if (!vacateDate) {
      alert('Choose a vacate date first.');
      return;
    }
    tenantRecord.isArchived = true;
    tenantRecord.archivedOn = vacateDate;
    tenantRecord.plannedVacateDate = '';
    tenantRecord.originalContractEndBeforeVacate = String(tenantRecord.contractEnd || '').trim();
    tenantRecord.unit = String(effectiveProfile.unit || tenantRecord.unit || '').trim();
    tenantRecord.floor = String(effectiveProfile.floor || tenantRecord.floor || '').trim();
    tenantRecord.notes = [tenantRecord.notes, `Vacated on ${vacateDate}`].filter(Boolean).join(' · ');

    state.tenants = state.tenants.filter((tenant) => !(
      tenant.building === tenantRecord.building
      && String(tenant.unit || '').trim() === String(tenantRecord.unit || '').trim()
      && normalizeFloorLabel(tenant.floor) === normalizeFloorLabel(tenantRecord.floor)
      && tenant.isVacant
      && !tenant.isArchived
    ));
    const vacantTenant = {
      id: `vacant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      building: tenantRecord.building,
      unit: tenantRecord.unit,
      floor: tenantRecord.floor,
      name: 'Available unit',
      isVacant: true,
      isArchived: false,
      phone: '',
      civilId: '',
      nationality: 'Not set',
      insurancePreviousAmount: 0,
      insuranceCurrentAmount: 0,
      insuranceAmount: 0,
      insurancePaidMonth: '',
      dueDay: Number(tenantRecord.dueDay || 20),
      contractStart: '',
      contractEnd: '',
      contractRent: 0,
      discount: Number(tenantRecord.discount || 0),
      actualRent: 0,
      previousDue: 0,
      notes: `Vacated on ${vacateDate}. Last tenant: ${tenantRecord.name}`,
      vacatedOn: vacateDate,
      lastActualRent: Number(tenantRecord.actualRent || 0),
      lastContractRent: Number(tenantRecord.contractRent || 0),
      prepaidNextMonth: 0,
      seedOrder: Number(tenantRecord.seedOrder || 0),
      lastPaidMonth: ''
    };
    const tenantIndex = state.tenants.findIndex((tenant) => tenant.id === tenantRecord.id);
    if (tenantIndex >= 0) {
      state.tenants.splice(tenantIndex + 1, 0, vacantTenant);
    } else {
      state.tenants.push(vacantTenant);
    }
    const nextOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(vacantTenant) : '';
    if (previousOrderKey && nextOrderKey && previousOrderKey !== nextOrderKey) {
      replaceBuildingTenantOrderOverrideKey(state, tenantRecord.building, previousOrderKey, nextOrderKey);
    }
    replaceBuildingTenantOrderOverrideId(state, tenantRecord.building, tenantRecord.id, vacantTenant.id);
    refreshBuildingTenantOrder(state, tenantRecord.building);
    saveState(state);
    try {
      if (typeof syncVacateTenantToDb === 'function') {
        await syncVacateTenantToDb({
          sourceTenantId: tenantRecord.id,
          vacateDate,
          lastTenantName: tenantRecord.name,
          lastContractRent: Number(tenantRecord.contractRent || 0),
          lastActualRent: Number(tenantRecord.actualRent || 0),
          lastDiscount: Number(tenantRecord.discount || 0),
          archivedNotes: tenantRecord.notes,
          vacancyNotes: vacantTenant.notes
        });
      }
      logActivity(state, 'Tenant vacated', `${tenantRecord.building} ${tenantRecord.unit} vacated on ${vacateDate}.`);
      renderAll(state, tenantRecord.building);
      showFlashMessage(`Vacated ${tenantRecord.building} ${tenantRecord.unit}.`);
    } catch (error) {
      showFlashMessage(String(error && error.message || 'Vacate failed.'));
    }
  }

  async function undoVacateTenantFromBuilding(state, vacantTenantId) {
    const vacantTenant = state.tenants.find((item) => item.id === vacantTenantId);
    if (!vacantTenant || !vacantTenant.isVacant || vacantTenant.isArchived) return;
    const selectedMonth = getSelectedBuildingMonth();
    if (!canEditBuildingMonth(vacantTenant.building, selectedMonth)) {
      return;
    }
    if (typeof preserveVisibleBuildingOrderForBuilding === 'function') {
      preserveVisibleBuildingOrderForBuilding(state, vacantTenant.building, selectedMonth);
    }
    const archivedTenant = getLatestArchivedTenantForUnit(state, vacantTenant.building, vacantTenant.unit, selectedMonth);
    if (!archivedTenant) {
      alert('Undo vacate is only available in the same month as the vacate date.');
      return;
    }
    archivedTenant.isArchived = false;
    archivedTenant.archivedOn = '';
    if (archivedTenant.originalContractEndBeforeVacate) {
      archivedTenant.contractEnd = archivedTenant.originalContractEndBeforeVacate;
      delete archivedTenant.originalContractEndBeforeVacate;
    }
    archivedTenant.notes = String(archivedTenant.notes || '')
      .replace(/\s*·\s*Vacated on \d{4}-\d{2}-\d{2}\s*/g, ' ')
      .replace(/Vacated on \d{4}-\d{2}-\d{2}/g, '')
      .trim();
    state.tenants = state.tenants.filter((tenant) => tenant.id !== vacantTenantId);
    refreshBuildingTenantOrder(state, archivedTenant.building);
    saveState(state);
    try {
      if (typeof syncUndoVacateToDb === 'function') {
        await syncUndoVacateToDb({
          sourceTenantId: archivedTenant.id,
          notes: archivedTenant.notes
        });
      }
      logActivity(state, 'Vacate undone', `${archivedTenant.building} ${archivedTenant.unit} restored for ${archivedTenant.name}.`);
      renderAll(state, archivedTenant.building);
      showFlashMessage(`Restored ${archivedTenant.building} ${archivedTenant.unit}.`);
    } catch (error) {
      showFlashMessage(String(error && error.message || 'Undo vacate failed.'));
    }
  }
