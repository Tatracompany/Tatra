  function logActivity(state, action, detail) {
    state.activity.unshift({
      id: `activity-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      when: new Date().toISOString(),
      actor: getCurrentUser(),
      action,
      detail
    });
    state.activity = state.activity.slice(0, 100);
    saveState(state);
  }

  function getPaymentsForTenant(state, tenantId) {
    return state.payments.filter((payment) => payment.tenantId === tenantId);
  }

  function getPaidForMonth(state, tenantId, monthKey) {
    return getPaymentsForTenant(state, tenantId)
      .filter((payment) => payment.rentMonth === monthKey)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  function getPrepaidNext(state, tenantId, currentMonth) {
    return getAdvancePaymentsForNextMonth(state, tenantId, currentMonth)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  function getAdvancePaymentCandidateTenantIds(state, tenantId) {
    const normalizedTenantId = String(tenantId || '').trim();
    const candidateIds = new Set(normalizedTenantId ? [normalizedTenantId] : []);
    const tenantRecord = (state.tenants || []).find((item) => String(item && item.id || '').trim() === normalizedTenantId);
    if (!tenantRecord) return candidateIds;
    const buildingName = String(tenantRecord.building || '').trim();
    const unit = String(tenantRecord.unit || '').trim();
    const floor = normalizeFloorLabel(tenantRecord.floor);
    (state.tenants || []).forEach((item) => {
      if (!item) return;
      if (String(item.building || '').trim() !== buildingName) return;
      if (String(item.unit || '').trim() !== unit) return;
      if (normalizeFloorLabel(item.floor) !== floor) return;
      const linkedId = String(item.id || '').trim();
      if (linkedId) candidateIds.add(linkedId);
    });
    return candidateIds;
  }

  function getAdvancePaymentsForNextMonth(state, tenantId, currentMonth) {
    const nextMonth = addMonths(currentMonth, 1);
    const candidateTenantIds = getAdvancePaymentCandidateTenantIds(state, tenantId);
    return (state.payments || [])
      .filter((payment) => candidateTenantIds.has(String(payment && payment.tenantId || '').trim()))
      .filter((payment) => payment.rentMonth === nextMonth && payment.method === 'Advance');
  }

  function monthsLate(previousDue, actualRent) {
    if (!previousDue || !actualRent) return 0;
    return Math.round(previousDue / actualRent);
  }

  function advanceMonthsCovered(prepaidAmount, actualRent) {
    if (!(prepaidAmount > 0) || !(actualRent > 0)) return 0;
    return Math.floor(prepaidAmount / actualRent);
  }

  function getManualPrepaidFromBeforeOverride(tenant, selectedMonth) {
    const monthKey = String(selectedMonth || '').trim();
    const buildingName = String(tenant && tenant.building || '').trim().toLowerCase();
    const unit = String(tenant && tenant.unit || '').trim();
    const name = String(tenant && tenant.name || '').trim();
    const sourceTenantId = String(tenant && (tenant.sourceTenantId || tenant.id) || '').trim();
    if (
      monthKey === '2026-01'
      && buildingName === 'fahaheel'
      && (
        unit === '\u0633\u0637\u062D'
        || name === '\u0634\u0628\u0643\u0629'
        || sourceTenantId === 'fahaheel-\u0633\u0637\u062D'
      )
    ) {
      return 597.87;
    }
    return null;
  }

  function normalizeAmount(value) {
    const amount = Number(value || 0);
    return Math.abs(amount) < 0.0005 ? 0 : amount;
  }

  function showFlashMessage(message) {
    const text = String(message || '').trim();
    if (!text || !document.body) return;
    document.querySelectorAll('.flash-message').forEach((node) => node.remove());
    const node = document.createElement('div');
    node.className = 'flash-message';
    node.textContent = text;
    document.body.appendChild(node);
    window.setTimeout(() => node.classList.add('is-visible'), 10);
    window.setTimeout(() => {
      node.classList.remove('is-visible');
      window.setTimeout(() => {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 220);
    }, 2200);
  }

  function ensurePaidOverridesState(state) {
    if (!state.paidOverrides || typeof state.paidOverrides !== 'object') {
      state.paidOverrides = {};
    }
  }

  function ensureCarryOverridesState(state) {
    if (!state.carryOverrides || typeof state.carryOverrides !== 'object') {
      state.carryOverrides = {};
    }
  }

  function ensureNotesOverridesState(state) {
    if (!state.notesOverrides || typeof state.notesOverrides !== 'object') {
      state.notesOverrides = {};
    }
  }

  function ensureActualRentOverridesState(state) {
    if (!state.actualRentOverrides || typeof state.actualRentOverrides !== 'object') {
      state.actualRentOverrides = {};
    }
  }

  function ensureVacantAmountOverridesState(state) {
    if (!state.vacantAmountOverrides || typeof state.vacantAmountOverrides !== 'object') {
      state.vacantAmountOverrides = {};
    }
  }

  function ensureTenantIdentityOverridesState(state) {
    if (!state.tenantIdentityOverrides || typeof state.tenantIdentityOverrides !== 'object') {
      state.tenantIdentityOverrides = {};
    }
  }

  function ensureOldTenantDuePaidNotesState(state) {
    if (!state.oldTenantDuePaidNotes || typeof state.oldTenantDuePaidNotes !== 'object') {
      state.oldTenantDuePaidNotes = {};
    }
  }

  function getTenantIdentityOverride(state, tenantId, field, monthKey) {
    ensureTenantIdentityOverridesState(state);
    const tenantBucket = state.tenantIdentityOverrides[tenantId];
    if (!tenantBucket || !tenantBucket[field]) return null;
    if (!Object.prototype.hasOwnProperty.call(tenantBucket[field], monthKey)) return null;
    return String(tenantBucket[field][monthKey] || '').trim();
  }

  function setTenantIdentityOverride(state, tenantId, field, monthKey, value) {
    ensureTenantIdentityOverridesState(state);
    const normalizedValue = String(value || '').trim();
    if (!state.tenantIdentityOverrides[tenantId]) state.tenantIdentityOverrides[tenantId] = {};
    if (!state.tenantIdentityOverrides[tenantId][field]) state.tenantIdentityOverrides[tenantId][field] = {};
    state.tenantIdentityOverrides[tenantId][field][monthKey] = normalizedValue;
  }

  function getEffectiveTenantIdentityField(state, tenant, field, monthKey) {
    if (!tenant) return '';
    if (tenant.isVacant) return String(tenant[field] || '').trim();
    const selectedMonth = monthKey || getCurrentMonthKey();
    let pointerMonth = selectedMonth;
    while (true) {
      const override = getTenantIdentityOverride(state, tenant.id, field, pointerMonth);
      if (override != null) return override;
      if (compareMonthKeys(pointerMonth, getDefaultActiveMonthKey()) <= 0) break;
      const previousMonth = addMonths(pointerMonth, -1);
      if (previousMonth === pointerMonth) break;
      pointerMonth = previousMonth;
    }
    return String(tenant[field] || '').trim();
  }

  function getEffectiveTenantProfile(state, tenant, monthKey) {
    if (!tenant) return null;
    const selectedMonth = monthKey || getCurrentMonthKey();
    const contractStart = getEffectiveTenantIdentityField(state, tenant, 'contractStart', selectedMonth);
    const moveInDate = getEffectiveTenantIdentityField(state, tenant, 'moveInDate', selectedMonth);
    return {
      name: getEffectiveTenantIdentityField(state, tenant, 'name', selectedMonth),
      unit: getEffectiveTenantIdentityField(state, tenant, 'unit', selectedMonth),
      floor: getEffectiveTenantIdentityField(state, tenant, 'floor', selectedMonth),
      moveInDate: moveInDate || contractStart,
      contractStart,
      contractEnd: getEffectiveTenantIdentityField(state, tenant, 'contractEnd', selectedMonth),
      phone: getEffectiveTenantIdentityField(state, tenant, 'phone', selectedMonth),
      civilId: getEffectiveTenantIdentityField(state, tenant, 'civilId', selectedMonth),
      nationality: getEffectiveTenantIdentityField(state, tenant, 'nationality', selectedMonth) || 'Not set'
    };
  }

  function getEffectiveTenantVisibleFromMonth(state, tenant, monthKey) {
    const profile = getEffectiveTenantProfile(state, tenant, monthKey);
    if (!profile) return '';
    return getMonthKeyFromDate(profile.moveInDate || profile.contractStart);
  }

  function getPaidOverride(state, tenantId, monthKey) {
    ensurePaidOverridesState(state);
    if (!state.paidOverrides[tenantId]) return null;
    if (!Object.prototype.hasOwnProperty.call(state.paidOverrides[tenantId], monthKey)) return null;
    return normalizeAmount(state.paidOverrides[tenantId][monthKey]);
  }

  function setPaidOverride(state, tenantId, monthKey, amountOrNull) {
    ensurePaidOverridesState(state);
    if (amountOrNull == null) {
      if (state.paidOverrides[tenantId]) {
        delete state.paidOverrides[tenantId][monthKey];
        if (!Object.keys(state.paidOverrides[tenantId]).length) delete state.paidOverrides[tenantId];
      }
      return;
    }
    if (!state.paidOverrides[tenantId]) state.paidOverrides[tenantId] = {};
    state.paidOverrides[tenantId][monthKey] = normalizeAmount(amountOrNull);
  }

  function getCarryOverride(state, tenantId, monthKey) {
    ensureCarryOverridesState(state);
    if (!state.carryOverrides[tenantId]) return null;
    if (!Object.prototype.hasOwnProperty.call(state.carryOverrides[tenantId], monthKey)) return null;
    return normalizeAmount(state.carryOverrides[tenantId][monthKey]);
  }

  function setCarryOverride(state, tenantId, monthKey, amountOrNull) {
    ensureCarryOverridesState(state);
    if (amountOrNull == null) {
      if (state.carryOverrides[tenantId]) {
        delete state.carryOverrides[tenantId][monthKey];
        if (!Object.keys(state.carryOverrides[tenantId]).length) delete state.carryOverrides[tenantId];
      }
      return;
    }
    if (!state.carryOverrides[tenantId]) state.carryOverrides[tenantId] = {};
    state.carryOverrides[tenantId][monthKey] = normalizeAmount(amountOrNull);
  }

  function getActualRentOverride(state, tenantId, monthKey) {
    ensureActualRentOverridesState(state);
    if (!state.actualRentOverrides[tenantId]) return null;
    if (!Object.prototype.hasOwnProperty.call(state.actualRentOverrides[tenantId], monthKey)) return null;
    return normalizeAmount(state.actualRentOverrides[tenantId][monthKey]);
  }

  function setActualRentOverride(state, tenantId, monthKey, amountOrNull) {
    ensureActualRentOverridesState(state);
    if (amountOrNull == null) {
      if (state.actualRentOverrides[tenantId]) {
        delete state.actualRentOverrides[tenantId][monthKey];
        if (!Object.keys(state.actualRentOverrides[tenantId]).length) delete state.actualRentOverrides[tenantId];
      }
      return;
    }
    if (!state.actualRentOverrides[tenantId]) state.actualRentOverrides[tenantId] = {};
    state.actualRentOverrides[tenantId][monthKey] = normalizeAmount(amountOrNull);
  }

  function getVacantAmountOverride(state, tenantId, monthKey) {
    ensureVacantAmountOverridesState(state);
    if (!state.vacantAmountOverrides[tenantId]) return null;
    if (!Object.prototype.hasOwnProperty.call(state.vacantAmountOverrides[tenantId], monthKey)) return null;
    return normalizeAmount(state.vacantAmountOverrides[tenantId][monthKey]);
  }

  function setVacantAmountOverride(state, tenantId, monthKey, amountOrNull) {
    ensureVacantAmountOverridesState(state);
    if (amountOrNull == null) {
      if (state.vacantAmountOverrides[tenantId]) {
        delete state.vacantAmountOverrides[tenantId][monthKey];
        if (!Object.keys(state.vacantAmountOverrides[tenantId]).length) delete state.vacantAmountOverrides[tenantId];
      }
      return;
    }
    if (!state.vacantAmountOverrides[tenantId]) state.vacantAmountOverrides[tenantId] = {};
    state.vacantAmountOverrides[tenantId][monthKey] = normalizeAmount(amountOrNull);
  }

  function getNotesOverride(state, tenantId, monthKey) {
    ensureNotesOverridesState(state);
    if (!state.notesOverrides[tenantId]) return null;
    if (!Object.prototype.hasOwnProperty.call(state.notesOverrides[tenantId], monthKey)) return null;
    return String(state.notesOverrides[tenantId][monthKey] || '');
  }

  function setNotesOverride(state, tenantId, monthKey, noteText) {
    ensureNotesOverridesState(state);
    if (!state.notesOverrides[tenantId]) state.notesOverrides[tenantId] = {};
    state.notesOverrides[tenantId][monthKey] = String(noteText || '').trim();
  }

  function getOldTenantDuePaidNote(state, buildingName, unit, monthKey) {
    ensureOldTenantDuePaidNotesState(state);
    const buildingBucket = state.oldTenantDuePaidNotes[String(buildingName || '').trim()];
    if (!buildingBucket) return 0;
    const unitBucket = buildingBucket[String(unit || '').trim()];
    if (!unitBucket) return 0;
    return Math.max(0, Math.round(Number(unitBucket[String(monthKey || '').trim()] || 0)));
  }

  function setOldTenantDuePaidNote(state, buildingName, unit, monthKey, noteText) {
    ensureOldTenantDuePaidNotesState(state);
    const buildingKey = String(buildingName || '').trim();
    const unitKey = String(unit || '').trim();
    const month = String(monthKey || '').trim();
    const value = Math.max(0, Math.round(Number(noteText || 0)));

    if (!buildingKey || !unitKey || !month) return;

    if (!(value > 0)) {
      if (!state.oldTenantDuePaidNotes[buildingKey]) return;
      if (!state.oldTenantDuePaidNotes[buildingKey][unitKey]) return;
      delete state.oldTenantDuePaidNotes[buildingKey][unitKey][month];
      if (!Object.keys(state.oldTenantDuePaidNotes[buildingKey][unitKey]).length) {
        delete state.oldTenantDuePaidNotes[buildingKey][unitKey];
      }
      if (!Object.keys(state.oldTenantDuePaidNotes[buildingKey]).length) {
        delete state.oldTenantDuePaidNotes[buildingKey];
      }
      return;
    }

    if (!state.oldTenantDuePaidNotes[buildingKey]) state.oldTenantDuePaidNotes[buildingKey] = {};
    if (!state.oldTenantDuePaidNotes[buildingKey][unitKey]) state.oldTenantDuePaidNotes[buildingKey][unitKey] = {};
    state.oldTenantDuePaidNotes[buildingKey][unitKey][month] = value;
  }

  function getInheritedTenantNote(state, tenant, monthKey) {
    if (!tenant || tenant.isVacant) return String(tenant && tenant.notes || '').trim();
    const selectedMonth = monthKey || getCurrentMonthKey();
    let pointerMonth = selectedMonth;
    const contractStartMonth = getMonthKeyFromDate(tenant.contractStart);
    while (true) {
      const override = getNotesOverride(state, tenant.id, pointerMonth);
      if (override != null) return override;
      if (contractStartMonth && compareMonthKeys(pointerMonth, contractStartMonth) <= 0) break;
      const previousMonth = addMonths(pointerMonth, -1);
      if (previousMonth === pointerMonth) break;
      pointerMonth = previousMonth;
      if (!contractStartMonth && monthStart(pointerMonth).getFullYear() < monthStart(selectedMonth).getFullYear() - 5) break;
    }
    return String(tenant.notes || '').trim();
  }

  function getEffectiveTenantNote(state, tenant, monthKey) {
    if (!tenant || tenant.isVacant) return String(tenant && tenant.notes || '').trim();
    const selectedMonth = monthKey || getCurrentMonthKey();
    const exactOverride = getNotesOverride(state, tenant.id, selectedMonth);
    if (exactOverride != null) return exactOverride;
    return getInheritedTenantNote(state, tenant, selectedMonth);
  }

  function ensureNoteSnapshotsForMonth(state, monthKey) {
    const targetMonth = String(monthKey || '').trim();
    if (!targetMonth) return false;
    ensureNotesOverridesState(state);
    let changed = false;
    state.tenants.forEach((tenant) => {
      if (!tenant || tenant.isVacant || tenant.isArchived) return;
      if (isBuildingMonthLocked(tenant.building, targetMonth)) return;
      if (getNotesOverride(state, tenant.id, targetMonth) != null) return;
      setNotesOverride(state, tenant.id, targetMonth, getInheritedTenantNote(state, tenant, targetMonth));
      changed = true;
    });
    return changed;
  }

  function getHistoricalBacklogMap(tenant, anchorMonth, rentDue) {
    const backlog = new Map();
    let remaining = normalizeAmount(tenant.previousDue || 0);
    if (!(remaining > 0) || !(rentDue > 0)) return backlog;
    let pointerMonth = addMonths(anchorMonth, -1);
    const contractStartMonth = getMonthKeyFromDate(tenant.contractStart);
    while (remaining > 0) {
      if (contractStartMonth && compareMonthKeys(pointerMonth, contractStartMonth) < 0) break;
      const monthlyUnpaid = normalizeAmount(Math.min(rentDue, remaining));
      backlog.set(pointerMonth, monthlyUnpaid);
      remaining = normalizeAmount(remaining - monthlyUnpaid);
      pointerMonth = addMonths(pointerMonth, -1);
    }
    return backlog;
  }

  function getMonthlyRentDue(tenant, monthKey, anchorMonth, rentDue) {
    const contractStartMonth = getMonthKeyFromDate(tenant.contractStart);
    if (contractStartMonth && compareMonthKeys(monthKey, contractStartMonth) < 0) return 0;
    if (compareMonthKeys(monthKey, anchorMonth) < 0) {
      return rentDue;
    }
    return rentDue;
  }

  function isPreContractOccupancyMonth(tenant, monthKey) {
    const visibleFromMonth = getTenantVisibleFromMonth(tenant);
    const contractStartMonth = getMonthKeyFromDate(tenant && tenant.contractStart);
    return !!visibleFromMonth
      && !!contractStartMonth
      && compareMonthKeys(monthKey, visibleFromMonth) >= 0
      && compareMonthKeys(monthKey, contractStartMonth) < 0;
  }

  function getBaselinePaidForMonth(state, tenant, monthKey, anchorMonth, rentDue) {
    if (compareMonthKeys(monthKey, anchorMonth) >= 0) return null;
    const due = getMonthlyRentDue(tenant, monthKey, anchorMonth, rentDue);
    if (!(due > 0)) return null;
    const backlog = getHistoricalBacklogMap(tenant, anchorMonth, rentDue);
    const unpaid = normalizeAmount(backlog.get(monthKey) || 0);
    return normalizeAmount(Math.max(due - unpaid, 0));
  }

  function getEffectivePaidForMonth(state, tenant, monthKey, anchorMonth, rentDue) {
    const override = getPaidOverride(state, tenant.id, monthKey);
    if (override != null) return override;
    const baselinePaid = getBaselinePaidForMonth(state, tenant, monthKey, anchorMonth, rentDue);
    if (baselinePaid != null) return baselinePaid;
    return normalizeAmount(getPaymentsForTenant(state, tenant.id)
      .filter((payment) => payment.rentMonth === monthKey && payment.method !== 'Due payment')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  }

  function getMonthPaymentBreakdown(state, tenant, monthKey, anchorMonth, rentDue) {
    const override = getPaidOverride(state, tenant.id, monthKey);
    if (override != null) {
      if (isPreContractOccupancyMonth(tenant, monthKey)) {
        return { directPaid: 0, priorAdvancePaid: 0, occupancyPaid: normalizeAmount(override) };
      }
      return { directPaid: normalizeAmount(override), priorAdvancePaid: 0, occupancyPaid: 0 };
    }
    const baselinePaid = getBaselinePaidForMonth(state, tenant, monthKey, anchorMonth, rentDue);
    if (baselinePaid != null) {
      return { directPaid: normalizeAmount(baselinePaid), priorAdvancePaid: 0, occupancyPaid: 0 };
    }
    const isPreContractMonth = isPreContractOccupancyMonth(tenant, monthKey);
    return getPaymentsForTenant(state, tenant.id)
      .filter((payment) => payment.rentMonth === monthKey && payment.method !== 'Due payment')
      .reduce((totals, payment) => {
        const amount = Number(payment.amount || 0);
        if (!(amount > 0)) return totals;
        const paymentMonth = getMonthKeyFromDate(payment.date || '');
        const isPriorAdvance = payment.method === 'Advance'
          && !!paymentMonth
          && compareMonthKeys(paymentMonth, monthKey) < 0;
        if (isPriorAdvance) {
          totals.priorAdvancePaid += amount;
        } else if (isPreContractMonth && payment.method !== 'Advance') {
          totals.occupancyPaid += amount;
        } else {
          totals.directPaid += amount;
        }
        return totals;
      }, { directPaid: 0, priorAdvancePaid: 0, occupancyPaid: 0 });
  }

  function getLedgerStartMonth(tenant, selectedMonth, anchorMonth, rentDue) {
    const selectedYearStart = `${monthStart(selectedMonth).getFullYear()}-01`;
    const contractStartMonth = getMonthKeyFromDate(tenant.contractStart);
    const backlog = getHistoricalBacklogMap(tenant, anchorMonth, rentDue);
    let startMonth = selectedYearStart;
    if (backlog.size) {
      const backlogMonths = Array.from(backlog.keys()).sort(compareMonthKeys);
      if (compareMonthKeys(backlogMonths[0], startMonth) < 0) startMonth = backlogMonths[0];
    }
    if (contractStartMonth && compareMonthKeys(contractStartMonth, startMonth) < 0) startMonth = contractStartMonth;
    return startMonth;
  }

  function buildTenantLedger(state, tenant, selectedMonth, rentDue) {
    const anchorMonth = getCurrentMonthKey();
    const startMonth = getLedgerStartMonth(tenant, selectedMonth, anchorMonth, rentDue);
    const ledger = [];
    let openingCarry = 0;
    let openingCredit = 0;
    let monthPointer = startMonth;
    while (compareMonthKeys(monthPointer, selectedMonth) <= 0) {
      const openingCarryOverride = getCarryOverride(state, tenant.id, monthPointer);
      if (openingCarryOverride != null) {
        openingCarry = openingCarryOverride;
      }
      const due = normalizeAmount(getMonthlyRentDue(tenant, monthPointer, anchorMonth, rentDue));
      const previousPaid = normalizeAmount(Math.min(getTenantDuePaidAmount(state, tenant.id, monthPointer), openingCarry));
      const paymentBreakdown = getMonthPaymentBreakdown(state, tenant, monthPointer, anchorMonth, rentDue);
      const directPaidRaw = normalizeAmount(paymentBreakdown.directPaid);
      const priorAdvancePaidRaw = normalizeAmount(paymentBreakdown.priorAdvancePaid);
      const occupancyPaidRaw = normalizeAmount(paymentBreakdown.occupancyPaid);
      const prepaidFromBefore = normalizeAmount(Math.min(due, openingCredit + priorAdvancePaidRaw));
      const dueAfterPrepaid = normalizeAmount(Math.max(due - prepaidFromBefore, 0));
      const directPaidApplied = normalizeAmount(Math.min(directPaidRaw, dueAfterPrepaid));
      const remainingCurrent = normalizeAmount(Math.max(dueAfterPrepaid - directPaidRaw, 0));
      const paid = normalizeAmount(prepaidFromBefore + directPaidApplied + occupancyPaidRaw);
      const closingCarry = normalizeAmount(Math.max(openingCarry - previousPaid + remainingCurrent, 0));
      const closingCredit = normalizeAmount(Math.max(openingCredit + priorAdvancePaidRaw + directPaidRaw - due, 0));
      ledger.push({
        monthKey: monthPointer,
        openingCarry,
        openingCredit,
        previousPaid,
        due,
        prepaidFromBefore,
        directPaidRaw,
        directPaidApplied,
        priorAdvancePaid: priorAdvancePaidRaw,
        occupancyPaidRaw,
        paid,
        remainingCurrent,
        closingCarry,
        closingCredit
      });
      openingCarry = closingCarry;
      openingCredit = closingCredit;
      monthPointer = addMonths(monthPointer, 1);
    }
    return ledger;
  }

  function buildOccupiedTenantMonthView(state, tenant, monthKey) {
    const selectedMonth = monthKey || getCurrentMonthKey();
    const profile = getEffectiveTenantProfile(state, tenant, selectedMonth);
    const effectiveName = profile ? profile.name : tenant.name;
    const effectiveUnit = profile ? profile.unit : tenant.unit;
    const effectiveFloor = profile ? profile.floor : tenant.floor;
    const effectiveMoveInDate = profile ? profile.moveInDate : (tenant.moveInDate || tenant.contractStart || '');
    const effectiveContractStart = profile ? profile.contractStart : (tenant.contractStart || '');
    const effectiveContractEnd = profile ? profile.contractEnd : (tenant.contractEnd || '');
    const effectivePhone = profile ? profile.phone : String(tenant.phone || '');
    const effectiveCivilId = profile ? profile.civilId : String(tenant.civilId || '');
    const effectiveNationality = profile ? profile.nationality : (tenant.nationality || 'Not set');
    const moveInMonth = getMonthKeyFromDate(effectiveMoveInDate);
    const defaultActualRent = normalizeAmount(Number(tenant.actualRent || (tenant.contractRent - tenant.discount) || 0));
    const actualRentOverride = getActualRentOverride(state, tenant.id, selectedMonth);
    const hasActualRentOverride = actualRentOverride != null;
    const baseActualRent = hasActualRentOverride ? normalizeAmount(actualRentOverride) : defaultActualRent;
    const vacantAmountOverride = getVacantAmountOverride(state, tenant.id, selectedMonth);
    const ledgerTenant = Object.assign({}, tenant, {
      moveInDate: effectiveMoveInDate,
      contractStart: effectiveContractStart,
      contractEnd: effectiveContractEnd
    });
    const ledger = buildTenantLedger(state, ledgerTenant, selectedMonth, baseActualRent);
    const currentLedger = ledger[ledger.length - 1] || { openingCarry: 0, due: baseActualRent, paid: 0, remainingCurrent: baseActualRent, closingCarry: baseActualRent };
    const rentDue = normalizeAmount(Number(currentLedger.due || 0));
    const occupancyPaidCurrent = normalizeAmount(currentLedger.occupancyPaidRaw || 0);
    const paidCurrentRaw = normalizeAmount((currentLedger.directPaidRaw || 0) + occupancyPaidCurrent);
    const paidCurrent = normalizeAmount(currentLedger.directPaidApplied || 0);
    const previousDue = normalizeAmount(Math.max(Number(currentLedger.openingCarry || 0) - Number(currentLedger.previousPaid || 0), 0));
    const remainingCurrent = normalizeAmount(currentLedger.remainingCurrent);
    const totalDue = normalizeAmount(currentLedger.closingCarry);
    const manualPrepaidFromBefore = getManualPrepaidFromBeforeOverride(tenant, selectedMonth);
    const prepaidFromBefore = normalizeAmount(
      manualPrepaidFromBefore != null
        ? manualPrepaidFromBefore
        : (
          Number(currentLedger.prepaidFromBefore || 0) > 0
            ? Number(currentLedger.prepaidFromBefore || 0)
            : (
              Number(currentLedger.due || 0) <= 0
                ? Number(currentLedger.priorAdvancePaid || 0)
                : 0
            )
        )
    );
    const prepaidCredit = normalizeAmount(Number(currentLedger.closingCredit || 0));
    const prepaidNext = normalizeAmount(getPrepaidNext(state, tenant.id, selectedMonth));
    const insuranceDisplay = getInsuranceDisplayAmounts(tenant, selectedMonth);
    const dueDate = new Date(`${selectedMonth}-${pad(tenant.dueDay || 20)}T00:00:00`);
    const visibleFromMonth = getEffectiveTenantVisibleFromMonth(state, tenant, selectedMonth);
    const contractStartMonth = getMonthKeyFromDate(effectiveContractStart);
    const startsNextMonthVisible = !!visibleFromMonth && addMonths(selectedMonth, 1) === visibleFromMonth;
    const hasSelectedMonthMoveIn = !!moveInMonth && moveInMonth === selectedMonth;
    const isPreContractOccupancy =
      rentDue <= 0
      && !!visibleFromMonth
      && !!contractStartMonth
      && compareMonthKeys(selectedMonth, visibleFromMonth) >= 0
      && compareMonthKeys(selectedMonth, contractStartMonth) < 0;
    const handoverArchivedTenant = isPreContractOccupancy
      ? state.tenants.find((item) => (
        item
        && item.isArchived
        && !item.isVacant
        && item.building === tenant.building
        && String(item.unit || '').trim() === String(effectiveUnit || '').trim()
        && normalizeFloorLabel(item.floor) === normalizeFloorLabel(effectiveFloor)
        && getMonthKeyFromDate(item.archivedOn || item.contractEnd || '') === selectedMonth
      ))
      : null;
    const handoverArchivedView = handoverArchivedTenant ? getArchivedTenantDisplayView(state, handoverArchivedTenant, selectedMonth) : null;
    const displayPaidCurrent = normalizeAmount(
      (isPreContractOccupancy ? occupancyPaidCurrent : paidCurrent)
      + Number(handoverArchivedView && handoverArchivedView.paidCurrent || 0)
    );
    const displayPaidCurrentRaw = normalizeAmount(
      (isPreContractOccupancy ? occupancyPaidCurrent : paidCurrentRaw)
      + Number(handoverArchivedView && handoverArchivedView.paidCurrentRaw || handoverArchivedView && handoverArchivedView.paidCurrent || 0)
    );
    const handoverVacantBaseAmount = normalizeAmount(
      Number(
        handoverArchivedView && (
          handoverArchivedView.displayActualRent != null
            ? handoverArchivedView.displayActualRent
            : handoverArchivedView.rentDue
        )
        || tenant.lastActualRent
        || 0
      )
    );
    const displayVacantAmount = vacantAmountOverride != null
      ? normalizeAmount(vacantAmountOverride)
      : (
        (isPreContractOccupancy || startsNextMonthVisible)
          ? normalizeAmount(
            ((isPreContractOccupancy && (displayPaidCurrentRaw > 0 || (hasActualRentOverride && baseActualRent > 0)))
              || (startsNextMonthVisible && hasSelectedMonthMoveIn))
              ? 0
              : (handoverVacantBaseAmount || defaultActualRent)
          )
          : 0
      );
    let status = 'upcoming';
    if (isPreContractOccupancy || startsNextMonthVisible) status = 'precontract';
    else if (previousDue > 0) status = 'overdue';
    else if (displayPaidCurrent >= rentDue && rentDue > 0) status = 'paid';
    else if (displayPaidCurrent > 0) status = 'partial';
    else if (today() > dueDate && remainingCurrent > 0) status = 'overdue';

    const lateMonths = monthsLate(previousDue, rentDue);
    const prepaidMonths = advanceMonthsCovered(prepaidCredit + prepaidNext, rentDue);
    let lastPaidMonth = tenant.lastPaidMonth || '';
    const lastPositivePaid = ledger.slice().reverse().find((entry) => entry.paid > 0);
    if (lastPositivePaid) {
      lastPaidMonth = lastPositivePaid.monthKey;
    } else if (lateMonths > 0) {
      lastPaidMonth = addMonths(selectedMonth, -(lateMonths + 1));
    }

    const contractEnd = effectiveContractEnd ? new Date(`${effectiveContractEnd}T00:00:00`) : null;
    const daysToEnd = contractEnd ? Math.ceil((contractEnd - today()) / 86400000) : null;

    return Object.assign({}, tenant, {
      name: effectiveName,
      unit: effectiveUnit,
      floor: effectiveFloor,
      moveInDate: effectiveMoveInDate,
      contractStart: effectiveContractStart,
      contractEnd: effectiveContractEnd,
      phone: effectivePhone,
      civilId: effectiveCivilId,
      nationality: effectiveNationality,
      paidCurrent: displayPaidCurrent,
      paidCurrentRaw: displayPaidCurrentRaw,
      prepaidFromBefore,
      prepaidCredit,
      prepaidNext,
      rentDue,
      baseActualRent,
      displayActualRent: (isPreContractOccupancy || startsNextMonthVisible)
        ? (
          hasActualRentOverride
            ? baseActualRent
            : (
              isPreContractOccupancy
                ? (displayPaidCurrentRaw > 0 ? (handoverVacantBaseAmount || defaultActualRent) : 0)
                : (hasSelectedMonthMoveIn ? defaultActualRent : 0)
            )
        )
        : rentDue,
      displayVacantAmount,
      previousDue,
      previousPaid: normalizeAmount(currentLedger.previousPaid || 0),
      remainingCurrent,
      totalDue,
      status,
      isPreContractOccupancy,
      startsNextMonthVisible,
      insuranceCurrentAmount: insuranceDisplay.current,
      insurancePreviousAmount: insuranceDisplay.previous,
      lateMonths,
      prepaidMonths,
      paidThroughMonth: prepaidMonths > 0 ? addMonths(selectedMonth, prepaidMonths) : selectedMonth,
      lastPaidMonth,
      lastPaidMonthLabel: lastPaidMonth ? formatMonth(lastPaidMonth) : '-',
      contractAlert: daysToEnd != null && daysToEnd <= CONTRACT_WARNING_DAYS,
      contractExpired: daysToEnd != null && daysToEnd < 0,
      daysToEnd,
      notes: getEffectiveTenantNote(state, tenant, selectedMonth)
    });
  }

  function getArchivedTenantDisplayView(state, tenant, monthKey) {
    const selectedMonth = monthKey || getCurrentMonthKey();
    if (!tenant || !tenant.isArchived || tenant.isVacant) return null;
    if (getMonthKeyFromDate(tenant.archivedOn || tenant.contractEnd || '') !== selectedMonth) return null;
    const archivedUnit = String(tenant.unit || '').trim();
    const archivedFloor = normalizeFloorLabel(tenant.floor);
    const matchingVacant = state.tenants.find((item) => {
      if (!item || item.isArchived || !item.isVacant) return false;
      if (String(item.building || '').trim() !== String(tenant.building || '').trim()) return false;
      if (String(item.unit || '').trim() !== archivedUnit) return false;
      const vacantFloor = normalizeFloorLabel(item.floor);
      if (archivedFloor && vacantFloor) return vacantFloor === archivedFloor;
      return true;
    });
    if (matchingVacant) return null;
    const matchingActiveTenant = state.tenants.find((item) => {
      if (!item || item.isArchived || item.isVacant) return false;
      if (String(item.building || '').trim() !== String(tenant.building || '').trim()) return false;
      const activeProfile = getEffectiveTenantProfile(state, item, selectedMonth);
      const activeUnit = String((activeProfile ? activeProfile.unit : item.unit) || '').trim();
      if (activeUnit !== archivedUnit) return false;
      const activeFloor = normalizeFloorLabel(activeProfile ? activeProfile.floor : item.floor);
      if (archivedFloor && activeFloor) return activeFloor === archivedFloor;
      return true;
    });
    if (matchingActiveTenant) return null;
    const view = buildOccupiedTenantMonthView(state, tenant, selectedMonth);
    return Object.assign({}, view, {
      isArchivedSnapshot: true,
      notes: [`Vacated on ${tenant.archivedOn || tenant.contractEnd || ''}`, view.notes].filter(Boolean).join(' · ')
    });
  }


  function choosePreferredBuildingDisplayTenant(currentTenant, nextTenant) {
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
    const currentVacatedOn = String(currentTenant.vacatedOn || currentTenant.archivedOn || '').trim();
    const nextVacatedOn = String(nextTenant.vacatedOn || nextTenant.archivedOn || '').trim();
    if (!!currentVacatedOn !== !!nextVacatedOn) {
      return nextVacatedOn ? nextTenant : currentTenant;
    }
    return currentTenant;
  }

  function dedupeBuildingDisplayTenants(tenants) {
    const preferredByKey = new Map();
    tenants.forEach((tenant) => {
      const key = typeof getTenantOrderKey === 'function'
        ? getTenantOrderKey(tenant)
        : `${tenant.building}::${getTenantUnitLookupKey(tenant)}`;
      preferredByKey.set(key, choosePreferredBuildingDisplayTenant(preferredByKey.get(key), tenant));
    });
    return tenants.filter((tenant) => {
      const key = typeof getTenantOrderKey === 'function'
        ? getTenantOrderKey(tenant)
        : `${tenant.building}::${getTenantUnitLookupKey(tenant)}`;
      return preferredByKey.get(key) === tenant;
    });
  }

  function compareSnapshotUnitPosition(leftUnit, rightUnit) {
    const leftPosition = Number(leftUnit && (leftUnit.activeRowPosition ?? leftUnit.templatePosition) || Number.MAX_SAFE_INTEGER);
    const rightPosition = Number(rightUnit && (rightUnit.activeRowPosition ?? rightUnit.templatePosition) || Number.MAX_SAFE_INTEGER);
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return unitSortValue(String(leftUnit && leftUnit.unit || '')).localeCompare(unitSortValue(String(rightUnit && rightUnit.unit || '')), 'en', { numeric: true });
  }

  function buildSnapshotVacantRow(state, buildingName, snapshotUnit, selectedMonth) {
    const unitLabel = String(snapshotUnit && snapshotUnit.unit || '').trim();
    const floorLabel = String(snapshotUnit && snapshotUnit.floor || '').trim();
    const archivedTenant = typeof getLatestArchivedTenantForUnitUpToMonth === 'function'
      ? getLatestArchivedTenantForUnitUpToMonth(state, buildingName, unitLabel, selectedMonth, floorLabel)
      : null;
    return {
      id: `snapshot-vacant-${String(snapshotUnit && snapshotUnit.id || '').trim() || `${buildingName}-${unitLabel}-${selectedMonth}`}`,
      unitId: String(snapshotUnit && snapshotUnit.id || '').trim(),
      sourceTenantId: String(snapshotUnit && snapshotUnit.sourceTenantId || '').trim(),
      building: buildingName,
      unit: unitLabel,
      floor: floorLabel,
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
      dueDay: Number(archivedTenant && archivedTenant.dueDay || 20),
      contractStart: '',
      contractEnd: '',
      contractRent: 0,
      discount: Number(archivedTenant && archivedTenant.discount || 0),
      actualRent: 0,
      lastActualRent: Number(archivedTenant && archivedTenant.actualRent || 0),
      lastContractRent: Number(archivedTenant && archivedTenant.contractRent || 0),
      previousDue: 0,
      paidCurrent: 0,
      prepaidNext: 0,
      prepaidFromBefore: 0,
      remainingCurrent: 0,
      totalDue: 0,
      status: 'vacant',
      lateMonths: 0,
      prepaidMonths: 0,
      paidThroughMonth: selectedMonth,
      lastPaidMonth: '',
      lastPaidMonthLabel: '-',
      contractAlert: false,
      contractExpired: false,
      daysToEnd: null,
      notes: 'Vacant unit',
      vacatedOn: typeof getLatestKnownVacateDate === 'function'
        ? getLatestKnownVacateDate(state, buildingName, unitLabel, floorLabel)
        : '',
      seedOrder: Number(snapshotUnit && (snapshotUnit.activeRowPosition ?? snapshotUnit.templatePosition) || 0)
    };
  }

  function buildSnapshotOccupiedRow(state, buildingName, snapshotUnit, snapshotTenancy, selectedMonth) {
    const snapshotTenant = {
      id: String(snapshotTenancy && (snapshotTenancy.sourceTenantId || snapshotTenancy.id) || '').trim() || `snapshot-tenant-${String(snapshotUnit && snapshotUnit.id || '').trim()}`,
      unitId: String(snapshotUnit && snapshotUnit.id || '').trim(),
      sourceTenantId: String(snapshotTenancy && snapshotTenancy.sourceTenantId || '').trim(),
      building: buildingName,
      unit: String(snapshotUnit && snapshotUnit.unit || '').trim(),
      floor: String(snapshotUnit && snapshotUnit.floor || '').trim(),
      name: String(snapshotTenancy && snapshotTenancy.tenantName || '').trim() || 'Tenant',
      phone: String(snapshotTenancy && snapshotTenancy.phone || '').trim(),
      civilId: String(snapshotTenancy && snapshotTenancy.civilId || '').trim(),
      nationality: String(snapshotTenancy && snapshotTenancy.nationality || 'Not set').trim() || 'Not set',
      moveInDate: String(snapshotTenancy && snapshotTenancy.moveInDate || '').trim(),
      contractStart: String(snapshotTenancy && snapshotTenancy.contractStart || '').trim(),
      contractEnd: String(snapshotTenancy && snapshotTenancy.contractEnd || '').trim(),
      contractRent: Number(snapshotTenancy && snapshotTenancy.contractRent || 0),
      discount: Number(snapshotTenancy && snapshotTenancy.discount || 0),
      actualRent: Number(snapshotTenancy && snapshotTenancy.actualRent || 0),
      previousDue: Number(snapshotTenancy && snapshotTenancy.previousDue || 0),
      prepaidNextMonth: Number(snapshotTenancy && snapshotTenancy.prepaidNextMonth || 0),
      insuranceAmount: Number(snapshotTenancy && snapshotTenancy.insuranceAmount || 0),
      insurancePaidMonth: String(snapshotTenancy && snapshotTenancy.insurancePaidMonth || '').trim(),
      dueDay: Number(snapshotTenancy && snapshotTenancy.dueDay || 20),
      plannedVacateDate: String(snapshotTenancy && snapshotTenancy.plannedVacateDate || '').trim(),
      notes: String(snapshotTenancy && snapshotTenancy.notes || '').trim(),
      isVacant: false,
      isArchived: false,
      seedOrder: Number(snapshotUnit && (snapshotUnit.activeRowPosition ?? snapshotUnit.templatePosition) || 0),
      lastPaidMonth: '',
      paidCurrent: 0
    };
    return Object.assign({}, buildOccupiedTenantMonthView(state, snapshotTenant, selectedMonth), {
      unitId: String(snapshotUnit && snapshotUnit.id || '').trim(),
      sourceTenantId: String(snapshotTenancy && snapshotTenancy.sourceTenantId || snapshotTenant.id || '').trim(),
      seedOrder: Number(snapshotUnit && (snapshotUnit.activeRowPosition ?? snapshotUnit.templatePosition) || 0)
    });
  }

  function shouldSuppressVacantRowAgainstOccupiedRow(rows, tenant) {
    if (!tenant || !tenant.isVacant) return false;
    const buildingName = String(tenant.building || '').trim();
    const unitLabel = String(tenant.unit || '').trim();
    const floorLabel = normalizeFloorLabel(tenant.floor);
    return rows.some((candidate) => {
      if (!candidate || candidate === tenant || candidate.isVacant) return false;
      if (String(candidate.building || '').trim() !== buildingName) return false;
      if (String(candidate.unit || '').trim() !== unitLabel) return false;
      const candidateFloor = normalizeFloorLabel(candidate.floor);
      if (candidateFloor && floorLabel) return candidateFloor === floorLabel;
      return true;
    });
  }

  function getSnapshotBuildingUnitRows(state, buildingName, monthKey) {
    if (typeof getDbSnapshotUnitsForBuilding !== 'function') return null;
    const snapshotUnits = getDbSnapshotUnitsForBuilding(buildingName);
    if (!snapshotUnits.length) return null;
    const selectedMonth = monthKey || getCurrentMonthKey();
    const activeTenants = getTenantViews(state, selectedMonth).filter((tenant) => tenant.building === buildingName);
    const archivedTenants = state.tenants
      .filter((tenant) => tenant.building === buildingName)
      .map((tenant) => getArchivedTenantDisplayView(state, tenant, selectedMonth))
      .filter(Boolean);
    const visibleRows = dedupeBuildingDisplayTenants(activeTenants.concat(archivedTenants));
    const primaryUnitRows = visibleRows.filter((tenant) => !tenant.isArchivedSnapshot);
    const rowByLookupKey = new Map();
    const rowCandidatesByUnit = new Map();
    primaryUnitRows.forEach((tenant) => {
      rowByLookupKey.set(getTenantUnitLookupKey(tenant), tenant);
      const unitKey = String(tenant && tenant.unit || '').trim().toUpperCase();
      if (!unitKey) return;
      if (!rowCandidatesByUnit.has(unitKey)) rowCandidatesByUnit.set(unitKey, []);
      rowCandidatesByUnit.get(unitKey).push(tenant);
    });

    const orderedSnapshotUnits = snapshotUnits.slice().sort(compareSnapshotUnitPosition);
    const snapshotLookupKeys = new Set();
    const matchedRows = new Set();
    const rows = orderedSnapshotUnits.map((snapshotUnit) => {
      const lookupKey = getTenantUnitLookupKey({ unit: snapshotUnit.unit, floor: snapshotUnit.floor });
      const unitKey = String(snapshotUnit && snapshotUnit.unit || '').trim().toUpperCase();
      snapshotLookupKeys.add(lookupKey);
      let matchedRow = rowByLookupKey.get(lookupKey);
      if (!matchedRow && unitKey) {
        const candidates = (rowCandidatesByUnit.get(unitKey) || []).filter((candidate) => !matchedRows.has(candidate));
        if (candidates.length === 1) {
          matchedRow = candidates[0];
        }
      }
      if (matchedRow) matchedRows.add(matchedRow);
      if (matchedRow) {
        return Object.assign({}, matchedRow, {
          unitId: String(snapshotUnit && snapshotUnit.id || '').trim(),
          sourceTenantId: String(matchedRow.sourceTenantId || matchedRow.id || snapshotUnit && snapshotUnit.sourceTenantId || '').trim()
        });
      }
      const snapshotTenancy = typeof getDbSnapshotActiveTenancyForUnit === 'function'
        ? getDbSnapshotActiveTenancyForUnit(String(snapshotUnit && snapshotUnit.id || '').trim())
        : null;
      if (snapshotTenancy) {
        return buildSnapshotOccupiedRow(state, buildingName, snapshotUnit, snapshotTenancy, selectedMonth);
      }
      return buildSnapshotVacantRow(state, buildingName, snapshotUnit, selectedMonth);
    });

    const extraRows = visibleRows
      .filter((tenant) => !matchedRows.has(tenant))
      .filter((tenant) => !snapshotLookupKeys.has(getTenantUnitLookupKey(tenant)))
      .sort((leftTenant, rightTenant) => {
        const seedDiff = Number(leftTenant.seedOrder ?? Number.MAX_SAFE_INTEGER) - Number(rightTenant.seedOrder ?? Number.MAX_SAFE_INTEGER);
        if (seedDiff !== 0) return seedDiff;
        return unitSortValue(String(leftTenant.unit || '')).localeCompare(unitSortValue(String(rightTenant.unit || '')), 'en', { numeric: true });
      });

    const combinedRows = rows.concat(extraRows);
    const filteredRows = combinedRows.filter((tenant) => !shouldSuppressVacantRowAgainstOccupiedRow(combinedRows, tenant));
    return dedupeBuildingDisplayTenants(filteredRows);
  }

  function getBuildingUnitRows(state, buildingName, monthKey) {
    const carriedRows = typeof getCarriedMonthSnapshotRows === 'function'
      ? getCarriedMonthSnapshotRows(state, monthKey, buildingName)
      : null;
    if (carriedRows && carriedRows.length) {
      return carriedRows.slice();
    }
    const snapshotRows = getSnapshotBuildingUnitRows(state, buildingName, monthKey);
    if (snapshotRows && snapshotRows.length) {
      return snapshotRows;
    }
    const selectedMonth = monthKey || getCurrentMonthKey();
    const activeTenants = getTenantViews(state, selectedMonth).filter((tenant) => tenant.building === buildingName);
    const archivedTenants = state.tenants
      .filter((tenant) => tenant.building === buildingName)
      .map((tenant) => getArchivedTenantDisplayView(state, tenant, selectedMonth))
      .filter(Boolean);
    return dedupeBuildingDisplayTenants(activeTenants.concat(archivedTenants));
  }

  function getBuildingDisplayTenants(state, buildingName, monthKey) {
    return getBuildingUnitRows(state, buildingName, monthKey);
  }

  function getAllVisibleUnitRows(state, monthKey) {
    const selectedMonth = monthKey || getCurrentMonthKey();
    const carriedRows = typeof getCarriedMonthSnapshotRows === 'function'
      ? getCarriedMonthSnapshotRows(state, selectedMonth)
      : null;
    if (carriedRows && carriedRows.length) {
      return carriedRows.slice();
    }
    return (state.buildings || []).flatMap((buildingMeta) => (
      getBuildingUnitRows(state, buildingMeta.name, selectedMonth)
    ));
  }

  function getTenantView(state, tenant, monthKey) {
    if (!tenant) return null;
    if (tenant.isArchived) return null;
    const selectedMonth = monthKey || getCurrentMonthKey();
    const carriedRows = typeof getCarriedMonthSnapshotRows === 'function'
      ? getCarriedMonthSnapshotRows(state, selectedMonth)
      : null;
    if (carriedRows && carriedRows.length) {
      const sourceTenantId = String(tenant.sourceTenantId || tenant.id || '').trim();
      const unitId = String(tenant.unitId || '').trim();
      const matchedCarriedRow = carriedRows.find((row) => {
        if (!row) return false;
        if (sourceTenantId && String(row.sourceTenantId || row.id || '').trim() === sourceTenantId) return true;
        if (unitId && String(row.unitId || '').trim() === unitId && !!row.isVacant === !!tenant.isVacant) return true;
        return (
          String(row.building || '').trim() === String(tenant.building || '').trim()
          && String(row.unit || '').trim() === String(tenant.unit || '').trim()
          && normalizeFloorLabel(row.floor) === normalizeFloorLabel(tenant.floor)
          && !!row.isVacant === !!tenant.isVacant
        );
      });
      if (matchedCarriedRow) return Object.assign({}, matchedCarriedRow);
    }
    const profile = getEffectiveTenantProfile(state, tenant, selectedMonth);
    const effectiveUnit = profile ? profile.unit : tenant.unit;
    const effectiveFloor = profile ? profile.floor : tenant.floor;
    if (tenant.isVacant) {
      const replacementTenant = state.tenants.find((item) => {
        if (item.isArchived || item.isVacant) return false;
        const replacementProfile = getEffectiveTenantProfile(state, item, selectedMonth);
        const replacementUnit = replacementProfile ? replacementProfile.unit : item.unit;
        const replacementFloor = replacementProfile ? replacementProfile.floor : item.floor;
        if (item.building !== tenant.building || replacementUnit !== effectiveUnit) return false;
        if (normalizeFloorLabel(replacementFloor) !== normalizeFloorLabel(effectiveFloor)) return false;
        const replacementStartMonth = getEffectiveTenantVisibleFromMonth(state, item, selectedMonth);
        return replacementStartMonth && compareMonthKeys(selectedMonth, replacementStartMonth) >= 0;
      });
      if (replacementTenant) return null;
      const lastArchivedTenant = getLatestArchivedTenantForUnitUpToMonth(state, tenant.building, tenant.unit, selectedMonth);
      return Object.assign({}, tenant, {
        unit: tenant.unit,
        floor: tenant.floor,
        vacatedOn: tenant.vacatedOn || getLatestKnownVacateDate(state, tenant.building, tenant.unit),
        discount: Number(tenant.discount || (lastArchivedTenant && lastArchivedTenant.discount) || 0),
        lastActualRent: Number(tenant.lastActualRent || (lastArchivedTenant && lastArchivedTenant.actualRent) || 0),
        lastContractRent: Number(tenant.lastContractRent || (lastArchivedTenant && lastArchivedTenant.contractRent) || 0),
        paidCurrent: 0,
        prepaidNext: 0,
        rentDue: 0,
        previousDue: 0,
        remainingCurrent: 0,
        totalDue: 0,
        status: 'vacant',
        lateMonths: 0,
        prepaidMonths: 0,
        paidThroughMonth: selectedMonth,
        lastPaidMonth: '',
        lastPaidMonthLabel: '-',
        contractAlert: false,
        contractExpired: false,
        daysToEnd: null,
        notes: getEffectiveTenantNote(state, tenant, selectedMonth)
      });
    }
    const matchingVacantRecord = state.tenants.find((item) => (
      item
      && item.isVacant
      && !item.isArchived
      && String(item.building || '').trim() === String(tenant.building || '').trim()
      && String(item.unit || '').trim() === String(effectiveUnit || '').trim()
      && normalizeFloorLabel(item.floor) === normalizeFloorLabel(effectiveFloor)
    ));
    if (matchingVacantRecord) {
      const vacantMonth = getMonthKeyFromDate(matchingVacantRecord.vacatedOn || '') || String(matchingVacantRecord.vacantMonthContext || '').trim();
      if (!vacantMonth || compareMonthKeys(vacantMonth, selectedMonth) <= 0) {
        return null;
      }
    }
    const visibleFromMonth = getEffectiveTenantVisibleFromMonth(state, tenant, selectedMonth);
    if (visibleFromMonth && compareMonthKeys(selectedMonth, visibleFromMonth) < 0) {
      const existingOccupant = state.tenants.find((item) => {
        if (item.id === tenant.id || item.isArchived || item.isVacant) return false;
        const occupantProfile = getEffectiveTenantProfile(state, item, selectedMonth);
        const occupantUnit = occupantProfile ? occupantProfile.unit : item.unit;
        const occupantFloor = occupantProfile ? occupantProfile.floor : item.floor;
        if (item.building !== tenant.building || occupantUnit !== effectiveUnit) return false;
        if (normalizeFloorLabel(occupantFloor) !== normalizeFloorLabel(effectiveFloor)) return false;
        const occupantVisibleFromMonth = getEffectiveTenantVisibleFromMonth(state, item, selectedMonth);
        return !occupantVisibleFromMonth || compareMonthKeys(selectedMonth, occupantVisibleFromMonth) >= 0;
      });
      if (existingOccupant) return null;
      return buildOccupiedTenantMonthView(state, tenant, selectedMonth);
    }
    return buildOccupiedTenantMonthView(state, tenant, selectedMonth);
  }

  function getTenantViews(state, monthKey) {
    const selectedMonth = monthKey || getCurrentMonthKey();
    if (renderCache.tenantViews.has(selectedMonth)) {
      return renderCache.tenantViews.get(selectedMonth);
    }
    const carriedRows = typeof getCarriedMonthSnapshotRows === 'function'
      ? getCarriedMonthSnapshotRows(state, selectedMonth)
      : null;
    if (carriedRows && carriedRows.length) {
      const views = carriedRows.slice();
      renderCache.tenantViews.set(selectedMonth, views);
      return views;
    }
    const views = state.tenants.map((tenant) => getTenantView(state, tenant, selectedMonth)).filter(Boolean);
    renderCache.tenantViews.set(selectedMonth, views);
    return views;
  }

  function getBuildingSummary(state, buildingName, monthKey) {
    const selectedMonth = monthKey || getCurrentMonthKey();
    const cacheKey = `${buildingName}::${selectedMonth}`;
    if (renderCache.buildingSummaries.has(cacheKey)) {
      return renderCache.buildingSummaries.get(cacheKey);
    }
    const importedOrderMap = getBuildingTemplateOrderMap(buildingName);
    const tenants = getBuildingUnitRows(state, buildingName, selectedMonth)
      .sort((a, b) => {
        const seedDiff = Number(a.seedOrder ?? Number.MAX_SAFE_INTEGER) - Number(b.seedOrder ?? Number.MAX_SAFE_INTEGER);
        if (seedDiff !== 0) return seedDiff;
        if (importedOrderMap) {
          const aLookupKey = getTenantUnitLookupKey(a);
          const bLookupKey = getTenantUnitLookupKey(b);
          const aImportedIndex = importedOrderMap.has(aLookupKey)
            ? importedOrderMap.get(aLookupKey)
            : Number.MAX_SAFE_INTEGER;
          const bImportedIndex = importedOrderMap.has(bLookupKey)
            ? importedOrderMap.get(bLookupKey)
            : Number.MAX_SAFE_INTEGER;
          if (aImportedIndex !== bImportedIndex) return aImportedIndex - bImportedIndex;
        }
        return unitSortValue(String(a.unit || '')).localeCompare(unitSortValue(String(b.unit || '')), 'en', { numeric: true });
      });
    const activeTenants = tenants.filter((tenant) => !tenant.isVacant);
    const occupied = activeTenants.length;
    const totalUnits = tenants.length;
    const late = activeTenants.filter((tenant) => tenant.status === 'overdue').length;
    const unpaid = activeTenants.filter((tenant) => tenant.status === 'upcoming').length;
    const collected = activeTenants.reduce((sum, tenant) => sum + tenant.paidCurrent, 0);
    const expected = activeTenants.reduce((sum, tenant) => sum + tenant.rentDue, 0);
    const totalDue = activeTenants.reduce((sum, tenant) => sum + tenant.totalDue, 0);
    const summary = { tenants, occupied, totalUnits, late, unpaid, collected, expected, totalDue };
    renderCache.buildingSummaries.set(cacheKey, summary);
    return summary;
  }

  function getTenantDuePaidAmount(state, tenantId, monthKey) {
    const cacheKey = `${tenantId}::${monthKey}`;
    if (renderCache.duePaid.has(cacheKey)) {
      return renderCache.duePaid.get(cacheKey);
    }
    const total = state.payments
      .filter((payment) => payment.tenantId === tenantId && payment.method === 'Due payment' && payment.rentMonth === monthKey)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    renderCache.duePaid.set(cacheKey, total);
    return total;
  }

  function getAreaSummaries(state, monthKey) {
    const selectedMonth = monthKey || getCurrentMonthKey();
    if (renderCache.areaSummaries.has(selectedMonth)) {
      return renderCache.areaSummaries.get(selectedMonth);
    }
    const summaries = Array.from(new Set(state.buildings.map((building) => building.area))).map((area) => {
      const buildings = state.buildings.filter((building) => building.area === area);
      const totals = buildings.reduce((acc, building) => {
        const summary = getBuildingSummary(state, building.name, selectedMonth);
        acc.totalUnits += summary.totalUnits;
        acc.occupied += summary.occupied;
        acc.late += summary.late;
        acc.totalDue += summary.totalDue;
        return acc;
      }, { totalUnits: 0, occupied: 0, late: 0, totalDue: 0 });
      return Object.assign({ area }, totals);
    });
    renderCache.areaSummaries.set(selectedMonth, summaries);
    return summaries;
  }

  function isTenantDueForCollections(tenant, monthKey) {
    if (tenant.isVacant) return false;
    const selectedMonth = monthKey || getCurrentMonthKey();
    const currentMonth = getActiveMonthKey();
    if (compareMonthKeys(selectedMonth, currentMonth) < 0) {
      return tenant.previousDue > 0 || tenant.remainingCurrent > 0;
    }
    const dueDate = new Date(`${selectedMonth}-${pad(tenant.dueDay || 20)}T00:00:00`);
    return tenant.previousDue > 0 || (today() > dueDate && tenant.remainingCurrent > 0);
  }

  function getSelectedDueMonth() {
    return clampMonthToVisible(window.__selectedDueMonth || getActiveMonthKey());
  }

  function getSelectedTenantMonth() {
    const buildingFilter = ((document.getElementById('tenantBuildingFilter') || {}).value || window.__selectedTenantBuilding || 'all');
    const buildingName = buildingFilter === 'all' ? '' : buildingFilter;
    return clampMonthToVisibleForBuilding(window.__selectedTenantMonth || getActiveMonthKey(), buildingName);
  }

  function renderTenantMonthTabs() {
    const container = document.getElementById('tenantMonthTabs');
    if (!container) return;
    const selectedMonth = getSelectedTenantMonth();
    const buildingFilter = ((document.getElementById('tenantBuildingFilter') || {}).value || window.__selectedTenantBuilding || 'all');
    const buildingName = buildingFilter === 'all' ? '' : buildingFilter;
    window.__selectedTenantMonth = selectedMonth;
    const year = monthStart(selectedMonth).getFullYear();
    container.innerHTML = getVisibleYearMonthKeysForBuilding(year, buildingName).map((monthKey) => {
      const active = monthKey === selectedMonth ? ' active' : '';
      return `<button type="button" class="month-tab${active}" data-tenant-month="${escapeHtml(monthKey)}">${escapeHtml(formatMonth(monthKey).replace(` ${year}`, ''))}</button>`;
    }).join('');
    container.querySelectorAll('[data-tenant-month]').forEach((button) => {
      button.addEventListener('click', () => {
        window.__selectedTenantMonth = button.getAttribute('data-tenant-month') || getActiveMonthKey();
        renderTenantMonthTabs();
        populateTenantSelectors(window.__appState);
        renderTenants(window.__appState);
      });
    });
  }

  function renderDueMonthTabs() {
    const container = document.getElementById('dueMonthTabs');
    if (!container) return;
    const selectedMonth = getSelectedDueMonth();
    window.__selectedDueMonth = selectedMonth;
    const year = monthStart(selectedMonth).getFullYear();
    container.innerHTML = getVisibleYearMonthKeys(year).map((monthKey) => {
      const active = monthKey === selectedMonth ? ' active' : '';
      return `<button type="button" class="month-tab${active}" data-due-month="${escapeHtml(monthKey)}">${escapeHtml(formatMonth(monthKey).replace(` ${year}`, ''))}</button>`;
    }).join('');
    container.querySelectorAll('[data-due-month]').forEach((button) => {
      button.addEventListener('click', () => {
        window.__selectedDueMonth = button.getAttribute('data-due-month') || getActiveMonthKey();
        renderDueMonthTabs();
        renderDueTenants(window.__appState);
      });
    });
  }

  function getSelectedVacantMonth() {
    return clampMonthToVisible(window.__selectedVacantMonth || getActiveMonthKey());
  }

  function renderVacantMonthTabs() {
    const container = document.getElementById('vacantMonthTabs');
    if (!container) return;
    const selectedMonth = getSelectedVacantMonth();
    window.__selectedVacantMonth = selectedMonth;
    const year = monthStart(selectedMonth).getFullYear();
    container.innerHTML = getVisibleYearMonthKeys(year).map((monthKey) => {
      const active = monthKey === selectedMonth ? ' active' : '';
      return `<button type="button" class="month-tab${active}" data-vacant-month="${escapeHtml(monthKey)}">${escapeHtml(formatMonth(monthKey).replace(` ${year}`, ''))}</button>`;
    }).join('');
    container.querySelectorAll('[data-vacant-month]').forEach((button) => {
      button.addEventListener('click', () => {
        window.__selectedVacantMonth = button.getAttribute('data-vacant-month') || getActiveMonthKey();
        renderVacantMonthTabs();
        renderVacantUnits(window.__appState);
      });
    });
  }
