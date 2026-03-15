  function addDueAmount(state) {
    const select = document.getElementById('dueTenantSelect');
    const amountInput = document.getElementById('dueAddAmount');
    const tenantId = String(select && select.value || '');
    const amount = Number(amountInput && amountInput.value || 0);
    if (!tenantId) {
      alert('Select a tenant first.');
      return;
    }
    if (!(amount > 0)) {
      alert('Enter a due amount greater than zero.');
      return;
    }
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const selectedMonth = getSelectedDueMonth();
    if (!canEditBuildingMonth(tenant.building, selectedMonth)) {
      return;
    }
    tenant.previousDue = normalizeAmount(Number(tenant.previousDue || 0) + amount);
    saveState(state);
    logActivity(state, 'Due added', `${tenant.building} ${tenant.unit} due increased by ${formatCurrency(amount)}.`);
    if (amountInput) amountInput.value = '';
    populateDueTenantSelect(state);
    renderAll(state, tenant.building);
  }

  async function payDueAmount(state) {
    const select = document.getElementById('dueTenantSelect');
    const amountInput = document.getElementById('dueAddAmount');
    const tenantId = String(select && select.value || '');
    const amount = Number(amountInput && amountInput.value || 0);
    if (!tenantId) {
      alert('Select a tenant first.');
      return;
    }
    if (!(amount > 0)) {
      alert('Enter a due payment amount greater than zero.');
      return;
    }
    const tenant = state.tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const selectedMonth = getSelectedDueMonth();
    if (!canEditBuildingMonth(tenant.building, selectedMonth)) {
      return;
    }
    const tenantView = tenant.isArchived
      ? buildOccupiedTenantMonthView(state, tenant, selectedMonth)
      : getTenantView(state, tenant, selectedMonth);
    if (!tenantView || !(tenantView.previousDue > 0)) {
      alert('This tenant does not have previous due to clear.');
      return;
    }
    const appliedAmount = Math.min(amount, tenantView.previousDue);
    const sourceTenantId = String(tenantView.sourceTenantId || tenant.sourceTenantId || tenant.id || tenantId || '').trim();
    if (typeof syncTenantPaymentToDb === 'function') {
      await syncTenantPaymentToDb({
        sourceTenantId,
        amount: appliedAmount,
        paidOn: new Date().toISOString().slice(0, 10),
        rentMonth: selectedMonth,
        method: 'Due payment',
        note: 'Applied from due form'
      });
    }
    logActivity(state, 'Due payment recorded', `${tenant.building} ${tenant.unit} ${tenant.isArchived ? 'former tenant' : 'tenant'} due payment ${formatCurrency(appliedAmount)} applied to previous due.`);
    if (amountInput) amountInput.value = '';
    populateDueTenantSelect(state);
    renderAll(state, tenant.building);
    showFlashMessage(`Due payment saved for ${tenant.building} ${tenant.unit}.`);
  }

  async function saveTenantProfile(state, tenantId) {
    try {
      const selectedMonth = getSelectedTenantMonth();
      const shouldSyncSharedUnitIdentity = compareMonthKeys(selectedMonth, getDefaultActiveMonthKey()) <= 0;
      const futureIdentityFreezeMonth = selectedMonth === getDefaultActiveMonthKey()
        ? getPreviewMonthKey()
        : '';
      const tenant = state.tenants.find((item) => item.id === tenantId);
      const profileRow = typeof findTenantProfileRow === 'function' ? findTenantProfileRow(tenantId) : null;
      const rowUnitId = String(profileRow && profileRow.getAttribute('data-tenant-profile-unit-id') || '').trim();
      const vacantView = !tenant
        ? getTenantViews(state, selectedMonth).find((item) => item.id === tenantId && item.isVacant)
        : null;
      const targetTenant = tenant || vacantView;
      if (!targetTenant) return;
      if (!canEditBuildingMonth(targetTenant.building, selectedMonth)) {
        return;
      }
      preserveVisibleTenantOrderForBuilding(state, targetTenant.building, selectedMonth);
      const nameInput = findDetailInput('data-tenant-name', tenantId);
      const unitInput = findDetailInput('data-tenant-unit', tenantId);
      const floorSelect = findDetailInput('data-tenant-floor', tenantId);
      const moveInInput = findDetailInput('data-tenant-move-in', tenantId);
      const contractStartInput = findDetailInput('data-tenant-contract-start', tenantId);
      const contractEndInput = findDetailInput('data-tenant-contract-end', tenantId);
      const phoneInput = findDetailInput('data-tenant-phone', tenantId);
      const civilInput = findDetailInput('data-tenant-civil', tenantId);
      const nationalitySelect = findDetailInput('data-tenant-nationality', tenantId);

      function updateCarriedMonthRowIdentity(monthKey, targetRowLike, nextValues) {
        const normalizedMonth = String(monthKey || '').trim();
        if (!normalizedMonth || typeof getCarriedMonthSnapshotRows !== 'function') return;
        const carriedRows = getCarriedMonthSnapshotRows(state, normalizedMonth) || [];
        if (!carriedRows.length) return;
        const sourceTenantId = String(targetRowLike && (targetRowLike.sourceTenantId || targetRowLike.id) || '').trim();
        const unitId = String(targetRowLike && targetRowLike.unitId || rowUnitId || '').trim();
        const matchedRow = carriedRows.find((row) => {
          if (!row) return false;
          if (sourceTenantId && String(row.sourceTenantId || row.id || '').trim() === sourceTenantId) return true;
          if (unitId && String(row.unitId || '').trim() === unitId) return true;
          return false;
        });
        if (!matchedRow) return;
        ['name', 'unit', 'floor', 'moveInDate', 'contractStart', 'contractEnd', 'phone', 'civilId', 'nationality'].forEach((field) => {
          if (!Object.prototype.hasOwnProperty.call(nextValues, field)) return;
          matchedRow[field] = nextValues[field];
        });
      }

      function buildTenantMonthIdentityPayload(monthKey, sourceTenantId, values) {
        const normalizedMonth = String(monthKey || '').trim();
        const normalizedSourceTenantId = String(sourceTenantId || '').trim();
        if (!normalizedMonth || !normalizedSourceTenantId) return null;
        return {
          sourceTenantId: normalizedSourceTenantId,
          monthKey: normalizedMonth,
          name: String(values && values.name || '').trim(),
          unit: String(values && values.unit || '').trim(),
          floor: String(values && values.floor || '').trim(),
          moveInDate: String(values && values.moveInDate || '').trim(),
          contractStart: String(values && values.contractStart || '').trim(),
          contractEnd: String(values && values.contractEnd || '').trim(),
          phone: normalizePhone(values && values.phone || ''),
          civilId: String(values && values.civilId || '').trim(),
          nationality: String(values && values.nationality || 'Not set').trim() || 'Not set'
        };
      }

      async function persistTenantMonthIdentity(monthKey, sourceTenantId, values) {
        if (typeof syncTenantMonthIdentityToDb !== 'function') return;
        const payload = buildTenantMonthIdentityPayload(monthKey, sourceTenantId, values);
        if (!payload) return;
        await syncTenantMonthIdentityToDb(payload);
      }

      async function freezeFutureTenantIdentity(targetRowLike) {
        if (!futureIdentityFreezeMonth || typeof getCarriedMonthSnapshotRows !== 'function') return;
        const futureRows = getCarriedMonthSnapshotRows(state, futureIdentityFreezeMonth) || [];
        if (!futureRows.length) return;
        const sourceTenantId = String(targetRowLike && (targetRowLike.sourceTenantId || targetRowLike.id) || '').trim();
        const unitId = String(targetRowLike && targetRowLike.unitId || rowUnitId || '').trim();
        const futureRow = futureRows.find((row) => {
          if (!row) return false;
          if (sourceTenantId && String(row.sourceTenantId || row.id || '').trim() === sourceTenantId) return true;
          if (unitId && String(row.unitId || '').trim() === unitId) return true;
          return false;
        });
        if (!futureRow) return;
        if (sourceTenantId) {
          setTenantIdentityOverride(state, sourceTenantId, 'name', futureIdentityFreezeMonth, futureRow.name);
          setTenantIdentityOverride(state, sourceTenantId, 'unit', futureIdentityFreezeMonth, futureRow.unit);
          setTenantIdentityOverride(state, sourceTenantId, 'floor', futureIdentityFreezeMonth, futureRow.floor);
          setTenantIdentityOverride(state, sourceTenantId, 'moveInDate', futureIdentityFreezeMonth, futureRow.moveInDate);
          setTenantIdentityOverride(state, sourceTenantId, 'contractStart', futureIdentityFreezeMonth, futureRow.contractStart);
          setTenantIdentityOverride(state, sourceTenantId, 'contractEnd', futureIdentityFreezeMonth, futureRow.contractEnd);
          setTenantIdentityOverride(state, sourceTenantId, 'phone', futureIdentityFreezeMonth, futureRow.phone);
          setTenantIdentityOverride(state, sourceTenantId, 'civilId', futureIdentityFreezeMonth, futureRow.civilId);
          setTenantIdentityOverride(state, sourceTenantId, 'nationality', futureIdentityFreezeMonth, futureRow.nationality);
          await persistTenantMonthIdentity(futureIdentityFreezeMonth, sourceTenantId, futureRow);
        }
        updateCarriedMonthRowIdentity(futureIdentityFreezeMonth, targetRowLike, futureRow);
      }

      if (targetTenant.isVacant) {
        const previousOrderKey = tenant && typeof getTenantOrderKey === 'function'
          ? getTenantOrderKey(tenant)
          : '';
        const nextUnit = String(unitInput ? unitInput.value : targetTenant.unit || '').trim() || targetTenant.unit;
        const nextFloor = String(floorSelect ? floorSelect.value : targetTenant.floor || '').trim();

      if (tenant) {
        await freezeFutureTenantIdentity(tenant);
        const previousUnit = String(tenant.unit || '').trim();
        const previousFloor = String(tenant.floor || '').trim();

        tenant.unit = nextUnit;
        tenant.floor = nextFloor;

        if ((nextUnit !== previousUnit || nextFloor !== previousFloor) && typeof getLatestArchivedTenantForUnitUpToMonth === 'function') {
          const archivedTenant = getLatestArchivedTenantForUnitUpToMonth(state, tenant.building, previousUnit, selectedMonth);
          if (archivedTenant) {
            archivedTenant.unit = nextUnit;
            archivedTenant.floor = nextFloor;
          }
        }
        const nextOrderKey = typeof getTenantOrderKey === 'function' ? getTenantOrderKey(tenant) : '';
        if (previousOrderKey && nextOrderKey && previousOrderKey !== nextOrderKey) {
          replaceBuildingTenantOrderOverrideKey(state, tenant.building, previousOrderKey, nextOrderKey);
        }
      } else if (vacantView && vacantView.sourceTenantId) {
        await freezeFutureTenantIdentity(vacantView);
        const sourceTenant = state.tenants.find((item) => item.id === vacantView.sourceTenantId) || null;
        const sourceProfile = sourceTenant && typeof getEffectiveTenantProfile === 'function'
          ? (getEffectiveTenantProfile(state, sourceTenant, selectedMonth) || sourceTenant)
          : sourceTenant;
        const linkedVacantRecord = state.tenants.find((item) => (
          item
          && item.isVacant
          && !item.isArchived
          && String(item.building || '').trim() === String(vacantView.building || '').trim()
          && String(item.unit || '').trim() === String(sourceProfile && sourceProfile.unit || vacantView.unit || '').trim()
          && normalizeFloorLabel(item.floor) === normalizeFloorLabel(sourceProfile && sourceProfile.floor || vacantView.floor || '')
        )) || state.tenants.find((item) => (
          item
          && item.isVacant
          && !item.isArchived
          && String(item.building || '').trim() === String(vacantView.building || '').trim()
          && String(item.unit || '').trim() === String(vacantView.unit || '').trim()
        )) || null;
        const previousOrderKey = sourceProfile && typeof getTenantOrderKey === 'function'
          ? getTenantOrderKey({
            building: vacantView.building,
            unit: sourceProfile.unit || vacantView.unit,
            floor: sourceProfile.floor || vacantView.floor
          })
          : '';
        const previousVacantOrderKey = linkedVacantRecord && typeof getTenantOrderKey === 'function'
          ? getTenantOrderKey(linkedVacantRecord)
          : '';
        setTenantIdentityOverride(state, vacantView.sourceTenantId, 'unit', selectedMonth, nextUnit);
        setTenantIdentityOverride(state, vacantView.sourceTenantId, 'floor', selectedMonth, nextFloor);
        await persistTenantMonthIdentity(selectedMonth, vacantView.sourceTenantId, {
          name: String(sourceProfile && sourceProfile.name || '').trim(),
          unit: nextUnit,
          floor: nextFloor,
          moveInDate: String(sourceProfile && sourceProfile.moveInDate || '').trim(),
          contractStart: String(sourceProfile && sourceProfile.contractStart || '').trim(),
          contractEnd: String(sourceProfile && sourceProfile.contractEnd || '').trim(),
          phone: String(sourceProfile && sourceProfile.phone || '').trim(),
          civilId: String(sourceProfile && sourceProfile.civilId || '').trim(),
          nationality: String(sourceProfile && sourceProfile.nationality || 'Not set').trim() || 'Not set'
        });
        if (linkedVacantRecord && shouldSyncSharedUnitIdentity) {
          linkedVacantRecord.unit = nextUnit;
          linkedVacantRecord.floor = nextFloor;
        }
        const nextOrderKey = typeof getTenantOrderKey === 'function'
          ? getTenantOrderKey({
            building: vacantView.building,
            unit: nextUnit,
            floor: nextFloor
          })
          : '';
        if (previousOrderKey && nextOrderKey && previousOrderKey !== nextOrderKey) {
          replaceBuildingTenantOrderOverrideKey(state, vacantView.building, previousOrderKey, nextOrderKey);
        }
        if (previousVacantOrderKey && nextOrderKey && previousVacantOrderKey !== nextOrderKey) {
          replaceBuildingTenantOrderOverrideKey(state, vacantView.building, previousVacantOrderKey, nextOrderKey);
        }
      } else if (rowUnitId && shouldSyncSharedUnitIdentity) {
        await syncUnitIdentityToDb({
          unitId: rowUnitId,
          unit: nextUnit,
          floor: nextFloor
        });
        if (profileRow) {
          profileRow.setAttribute('data-tenant-profile-unit', nextUnit);
          profileRow.setAttribute('data-tenant-profile-floor', nextFloor);
        }
        saveState(state);
        logActivity(state, 'Vacant unit updated', `${targetTenant.building} ${nextUnit} vacant row updated from tenant page.`);
        showFlashMessage(`Saved ${targetTenant.building} ${nextUnit}. Refreshing...`);
        setTimeout(() => window.location.reload(), 200);
        return;
      } else if (rowUnitId) {
        updateCarriedMonthRowIdentity(selectedMonth, targetTenant, {
          unit: nextUnit,
          floor: nextFloor
        });
        saveState(state);
        logActivity(state, 'Vacant unit updated', `${targetTenant.building} ${nextUnit} vacant row updated for ${formatMonth(selectedMonth)}.`);
        renderAll(state, targetTenant.building);
        showFlashMessage(`Saved ${targetTenant.building} ${nextUnit} for ${formatMonth(selectedMonth)}.`);
        return;
      } else {
        return;
      }

        if (shouldSyncSharedUnitIdentity && rowUnitId && typeof syncUnitIdentityToDb === 'function') {
          await syncUnitIdentityToDb({
            unitId: rowUnitId,
            unit: nextUnit,
            floor: nextFloor
          });
        }
        refreshBuildingTenantOrder(state, targetTenant.building);
        saveState(state);
        logActivity(state, 'Vacant unit updated', `${targetTenant.building} ${nextUnit} vacant row updated from tenant page.`);
        renderAll(state, targetTenant.building);
        showFlashMessage(`Saved ${targetTenant.building} ${nextUnit}.`);
        return;
      }

      const currentProfile = getEffectiveTenantProfile(state, tenant, selectedMonth) || {};
      const nextName = String(nameInput ? nameInput.value : currentProfile.name).trim() || tenant.name;
      const nextUnit = String(unitInput ? unitInput.value : currentProfile.unit).trim() || tenant.unit;
      const nextFloor = String(floorSelect ? floorSelect.value : currentProfile.floor).trim();
      const nextMoveInDate = String(moveInInput ? moveInInput.value : currentProfile.moveInDate || '').trim();
      const nextContractStart = String(contractStartInput ? contractStartInput.value : currentProfile.contractStart || '').trim();
      const nextContractEnd = String(contractEndInput ? contractEndInput.value : currentProfile.contractEnd || '').trim();
      const nextPhone = normalizePhone(phoneInput ? phoneInput.value : (currentProfile.phone || ''));
      const nextCivilId = String(civilInput ? civilInput.value : (currentProfile.civilId || '')).trim();
      const nextNationality = String(nationalitySelect ? nationalitySelect.value : (currentProfile.nationality || 'Not set')).trim() || 'Not set';
      await freezeFutureTenantIdentity(tenant);
      const previousOrderKey = typeof getTenantOrderKey === 'function'
        ? getTenantOrderKey({
          building: tenant.building,
          unit: currentProfile.unit || tenant.unit,
          floor: currentProfile.floor || tenant.floor
        })
        : '';
      const nextOrderKey = typeof getTenantOrderKey === 'function'
        ? getTenantOrderKey({
          building: tenant.building,
          unit: nextUnit,
          floor: nextFloor
        })
        : '';
      setTenantIdentityOverride(state, tenant.id, 'name', selectedMonth, nextName);
      setTenantIdentityOverride(state, tenant.id, 'unit', selectedMonth, nextUnit);
      setTenantIdentityOverride(state, tenant.id, 'floor', selectedMonth, nextFloor);
      setTenantIdentityOverride(state, tenant.id, 'moveInDate', selectedMonth, nextMoveInDate);
      setTenantIdentityOverride(state, tenant.id, 'contractStart', selectedMonth, nextContractStart);
      setTenantIdentityOverride(state, tenant.id, 'contractEnd', selectedMonth, nextContractEnd);
      setTenantIdentityOverride(state, tenant.id, 'phone', selectedMonth, nextPhone);
      setTenantIdentityOverride(state, tenant.id, 'civilId', selectedMonth, nextCivilId);
      setTenantIdentityOverride(state, tenant.id, 'nationality', selectedMonth, nextNationality);
      updateCarriedMonthRowIdentity(selectedMonth, tenant, {
        name: nextName,
        unit: nextUnit,
        floor: nextFloor,
        moveInDate: nextMoveInDate,
        contractStart: nextContractStart,
        contractEnd: nextContractEnd,
        phone: nextPhone,
        civilId: nextCivilId,
        nationality: nextNationality
      });
      if (previousOrderKey && nextOrderKey && previousOrderKey !== nextOrderKey) {
        replaceBuildingTenantOrderOverrideKey(state, tenant.building, previousOrderKey, nextOrderKey);
      }
      saveState(state);
      await persistTenantMonthIdentity(selectedMonth, tenant.id, {
        name: nextName,
        unit: nextUnit,
        floor: nextFloor,
        moveInDate: nextMoveInDate,
        contractStart: nextContractStart,
        contractEnd: nextContractEnd,
        phone: nextPhone,
        civilId: nextCivilId,
        nationality: nextNationality
      });
      if (shouldSyncSharedUnitIdentity && rowUnitId && typeof syncUnitIdentityToDb === 'function') {
        await syncUnitIdentityToDb({
          unitId: rowUnitId,
          unit: nextUnit,
          floor: nextFloor
        });
      }
      if (typeof syncTenantProfileToDb === 'function') {
        await syncTenantProfileToDb({
          sourceTenantId: tenant.id,
          name: nextName,
          phone: nextPhone,
          civilId: nextCivilId,
          nationality: nextNationality,
          moveInDate: nextMoveInDate,
          contractStart: nextContractStart,
          contractEnd: nextContractEnd
        });
      }
      logActivity(state, 'Tenant profile updated', `${tenant.building} ${nextUnit} profile updated.`);
      renderAll(state, tenant.building);
      showFlashMessage(`Saved ${tenant.building} ${nextUnit}.`);
    } catch (error) {
      showFlashMessage(String(error && error.message || 'Save failed.'));
    }
  }

  function getVacantTenantCreateValue(attributeName, tenantId) {
    const input = findDetailInput(attributeName, tenantId);
    return input ? String(input.value || '').trim() : '';
  }

  function buildTenantCreatePayload(state, selectedMonth, baseData) {
    const contractRent = Math.max(0, Math.round(Number(baseData.rent || 0)));
    const discount = Math.max(0, Math.round(Number(baseData.discount || 0)));
    const buildingName = String(baseData.building || '').trim();
    const unit = String(baseData.unit || '').trim();
    const sourceVacantId = String(baseData.sourceVacantId || '').trim();
    const sourceUnitId = String(baseData.unitId || '').trim();
    const sourceTenantId = String(baseData.sourceTenantId || '').trim();
    const normalizedFloor = normalizeFloorLabel(baseData.floor);
    const matchingVacantView = getTenantViews(state, selectedMonth).find((item) => (
      item.isVacant
      && !item.isArchived
      && (
        (sourceVacantId && item.id === sourceVacantId)
        || (sourceUnitId && String(item.unitId || '').trim() === sourceUnitId)
        || (sourceTenantId && String(item.sourceTenantId || item.id || '').trim() === sourceTenantId)
        || (
          item.building === buildingName
          && String(item.unit || '').trim() === unit
          && normalizeFloorLabel(item.floor) === normalizedFloor
        )
      )
    )) || null;
    const matchingVacant = sourceVacantId
      ? state.tenants.find((item) => item.id === sourceVacantId && item.isVacant && !item.isArchived)
      : sourceTenantId
        ? state.tenants.find((item) => item.id === sourceTenantId && item.isVacant && !item.isArchived)
        : sourceUnitId
          ? state.tenants.find((item) => (
            item.isVacant
            && !item.isArchived
            && String(item.building || '').trim() === buildingName
            && String(item.unit || '').trim() === unit
            && normalizeFloorLabel(item.floor) === normalizedFloor
          ))
      : state.tenants.find((item) => (
        item.building === buildingName
        && String(item.unit || '').trim() === unit
        && item.isVacant
        && !item.isArchived
        && normalizeFloorLabel(item.floor) === normalizedFloor
      ));
    const matchingFutureSource = matchingVacantView && matchingVacantView.sourceTenantId
      ? state.tenants.find((item) => item.id === matchingVacantView.sourceTenantId && !item.isArchived)
      : null;
    const seedOrder = matchingVacant
      ? Number(matchingVacant.seedOrder ?? state.tenants.length)
      : matchingFutureSource
        ? Number(matchingFutureSource.seedOrder ?? state.tenants.length)
        : state.tenants.length;
    const fallbackFloor = String(
      baseData.floor
      || (matchingVacant && matchingVacant.floor)
      || (matchingVacantView && matchingVacantView.floor)
      || (matchingFutureSource && matchingFutureSource.floor)
      || ''
    ).trim();
    const insurancePaidMonth = String(baseData.insurancePaidMonth || '').trim();
    if (insurancePaidMonth && compareMonthKeys(insurancePaidMonth, selectedMonth) > 0) {
      alert('Insurance paid month cannot be after the selected month.');
      return null;
    }
    return {
      matchingVacantView,
      matchingVacant,
      matchingFutureSource,
      nextTenantData: {
        building: buildingName,
        unit,
        floor: fallbackFloor,
        existingProfileId: String(baseData.existingProfileId || '').trim(),
        name: String(baseData.name || '').trim(),
        phone: normalizePhone(String(baseData.phone || '')),
        civilId: String(baseData.civilId || '').trim(),
        nationality: String(baseData.nationality || 'Not set').trim() || 'Not set',
        insurancePreviousAmount: 0,
        insuranceCurrentAmount: 0,
        insuranceAmount: Math.max(0, Number(baseData.insuranceAmount || 0)),
        insurancePaidMonth,
        dueDay: Number(baseData.dueDay || 20),
        moveInDate: String(baseData.moveInDate || baseData.contractStart || ''),
        contractStart: String(baseData.contractStart || ''),
        contractEnd: String(baseData.contractEnd || ''),
        contractRent,
        discount,
        actualRent: Math.max(contractRent - discount, 0),
        previousDue: 0,
        notes: String(baseData.notes || '').trim(),
        prepaidNextMonth: 0,
        seedOrder,
        lastPaidMonth: '',
        isVacant: false,
        isArchived: false
      }
    };
  }

  function normalizeTenantMatchName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizeTenantMatchPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length >= 8) return digits.slice(-8);
    return digits;
  }

  function findExistingTenantHistoryMatch(baseData) {
    const tenantName = normalizeTenantMatchName(baseData && baseData.name);
    const civilId = String(baseData && baseData.civilId || '').trim();
    const phone = normalizeTenantMatchPhone(baseData && baseData.phone);
    const existingProfileId = String(baseData && baseData.existingProfileId || '').trim();
    if (!tenantName && !civilId && !phone) return null;
    const profiles = typeof getDbSnapshotTenantProfiles === 'function' ? getDbSnapshotTenantProfiles() : [];
    const profile = profiles.find((item) => {
      const profileName = normalizeTenantMatchName(item && item.fullName);
      const profileCivilId = String(item && item.civilId || '').trim();
      const profilePhone = normalizeTenantMatchPhone(item && item.phone);
      return (
        (civilId && profileCivilId && civilId === profileCivilId)
        || (phone && profilePhone && phone === profilePhone)
        || (tenantName && profileName && tenantName === profileName)
      );
    }) || null;
    if (!profile) return null;
    if (existingProfileId && String(profile.id || '').trim() === existingProfileId) return null;
    const reasons = [];
    if (civilId && String(profile.civilId || '').trim() === civilId) reasons.push('Civil ID');
    if (phone && normalizeTenantMatchPhone(profile.phone) === phone) reasons.push('phone');
    if (tenantName && normalizeTenantMatchName(profile.fullName) === tenantName) reasons.push('name');
    return { profile, reasons };
  }

  function getTenantUnitFloorSnapshotKey(tenantLike) {
    if (!tenantLike) return '';
    return [
      String(tenantLike.building || '').trim(),
      String(tenantLike.unit || '').trim(),
      normalizeFloorLabel(tenantLike.floor)
    ].join('::');
  }

  function captureBuildingFinancialSnapshot(state, buildingName, excludedUnit, excludedFloor) {
    const targetBuilding = String(buildingName || '').trim();
    const targetUnit = String(excludedUnit || '').trim();
    const targetFloor = normalizeFloorLabel(excludedFloor);
    const isExcluded = (tenantLike) => (
      String(tenantLike && tenantLike.building || '').trim() === targetBuilding
      && String(tenantLike && tenantLike.unit || '').trim() === targetUnit
      && normalizeFloorLabel(tenantLike && tenantLike.floor) === targetFloor
    );

    const tenantIdsInBuilding = new Set();
    const insuranceByKey = new Map();
    (state.tenants || []).forEach((tenant) => {
      if (!tenant || tenant.isArchived) return;
      if (String(tenant.building || '').trim() !== targetBuilding) return;
      const tenantId = String(tenant.id || '').trim();
      if (tenantId) tenantIdsInBuilding.add(tenantId);
      if (tenant.isVacant || isExcluded(tenant)) return;
      const key = getTenantUnitFloorSnapshotKey(tenant);
      if (!key) return;
      insuranceByKey.set(key, {
        insuranceAmount: Number(tenant.insuranceAmount || 0),
        insurancePaidMonth: String(tenant.insurancePaidMonth || '').trim(),
        insuranceCurrentAmount: Number(tenant.insuranceCurrentAmount || 0),
        insurancePreviousAmount: Number(tenant.insurancePreviousAmount || 0)
      });
    });

    const advancePayments = ((typeof getDbSnapshotPayments === 'function' ? getDbSnapshotPayments() : state.payments) || [])
      .filter((payment) => String(payment.method || '').trim() === 'Advance')
      .filter((payment) => tenantIdsInBuilding.has(String(payment.tenantId || '').trim()))
      .filter((payment) => {
        const tenant = (state.tenants || []).find((item) => String(item.id || '').trim() === String(payment.tenantId || '').trim());
        return tenant && !isExcluded(tenant);
      })
      .map((payment) => Object.assign({}, payment));

    return { advancePayments, insuranceByKey };
  }

  function restoreBuildingFinancialSnapshot(state, snapshot, buildingName, excludedUnit, excludedFloor) {
    if (!snapshot) return false;
    const targetBuilding = String(buildingName || '').trim();
    const targetUnit = String(excludedUnit || '').trim();
    const targetFloor = normalizeFloorLabel(excludedFloor);
    const isExcluded = (tenantLike) => (
      String(tenantLike && tenantLike.building || '').trim() === targetBuilding
      && String(tenantLike && tenantLike.unit || '').trim() === targetUnit
      && normalizeFloorLabel(tenantLike && tenantLike.floor) === targetFloor
    );
    let changed = false;

    (state.tenants || []).forEach((tenant) => {
      if (!tenant || tenant.isArchived || tenant.isVacant || isExcluded(tenant)) return;
      const key = getTenantUnitFloorSnapshotKey(tenant);
      const saved = snapshot.insuranceByKey && snapshot.insuranceByKey.get(key);
      if (!saved) return;
      if (!tenant.insuranceAmount && saved.insuranceAmount) {
        tenant.insuranceAmount = saved.insuranceAmount;
        changed = true;
      }
      if (!String(tenant.insurancePaidMonth || '').trim() && saved.insurancePaidMonth) {
        tenant.insurancePaidMonth = saved.insurancePaidMonth;
        changed = true;
      }
      if (!tenant.insuranceCurrentAmount && saved.insuranceCurrentAmount) {
        tenant.insuranceCurrentAmount = saved.insuranceCurrentAmount;
        changed = true;
      }
      if (!tenant.insurancePreviousAmount && saved.insurancePreviousAmount) {
        tenant.insurancePreviousAmount = saved.insurancePreviousAmount;
        changed = true;
      }
    });

    return changed;
  }

  async function createTenantFromData(state, selectedMonth, baseData) {
    const buildingName = String(baseData.building || '').trim();
    const unit = String(baseData.unit || '').trim();
    if (!buildingName || !unit) {
      alert('Select a vacant unit first.');
      return null;
    }
    if (!canEditBuildingMonth(buildingName, selectedMonth)) {
      return null;
    }
    const targetFloorForSnapshot = String(baseData.floor || '').trim();
    const buildingFinancialSnapshot = captureBuildingFinancialSnapshot(state, buildingName, unit, targetFloorForSnapshot);
    preserveVisibleTenantOrderForBuilding(state, buildingName, selectedMonth);
    const payload = buildTenantCreatePayload(state, selectedMonth, baseData);
    if (!payload) return null;
    if (!payload.matchingVacant && payload.matchingVacantView) {
      const materializedVacant = Object.assign({
        id: `vacant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        phone: '',
        civilId: '',
        nationality: 'Not set',
        insurancePreviousAmount: 0,
        insuranceCurrentAmount: 0,
        insuranceAmount: 0,
        insurancePaidMonth: '',
        dueDay: 20,
        contractStart: '',
        contractEnd: '',
        contractRent: 0,
        discount: 0,
        actualRent: 0,
        previousDue: 0,
        paidCurrent: 0,
        prepaidNextMonth: 0,
        lastPaidMonth: '',
        isVacant: true,
        isArchived: false,
        sourceTenantId: String(payload.matchingVacantView.sourceTenantId || '').trim()
      }, {
        building: payload.matchingVacantView.building,
        unit: payload.matchingVacantView.unit,
        floor: payload.matchingVacantView.floor,
        name: 'Available unit',
        notes: String(payload.matchingVacantView.notes || 'Vacant unit').trim() || 'Vacant unit',
        vacatedOn: String(payload.matchingVacantView.vacatedOn || '').trim(),
        lastActualRent: Number(payload.matchingVacantView.lastActualRent || 0),
        lastContractRent: Number(payload.matchingVacantView.lastContractRent || 0),
        seedOrder: Number(payload.nextTenantData.seedOrder ?? state.tenants.length)
      });
      const insertIndex = state.tenants.findIndex((item) => (
        String(item.building || '').trim() === materializedVacant.building
        && Number(item.seedOrder ?? Number.MAX_SAFE_INTEGER) > Number(materializedVacant.seedOrder)
      ));
      if (insertIndex >= 0) state.tenants.splice(insertIndex, 0, materializedVacant);
      else state.tenants.push(materializedVacant);
      payload.matchingVacant = materializedVacant;
    }
    const tenantName = String(payload.nextTenantData.name || '').trim();
    if (!tenantName) {
      alert('Enter tenant name.');
      return null;
    }
    const duplicateHistoryMatch = findExistingTenantHistoryMatch(payload.nextTenantData);
    if (duplicateHistoryMatch) {
      const reasonText = duplicateHistoryMatch.reasons.length ? duplicateHistoryMatch.reasons.join(', ') : 'saved history';
      showFlashMessage(`Tenant already exists in history by ${reasonText}.`);
      return null;
    }
    if (!payload.nextTenantData.contractEnd) {
      alert('Enter contract end date.');
      return null;
    }
    const tenant = payload.matchingVacant
      ? Object.assign(payload.matchingVacant, payload.nextTenantData, {
        id: payload.matchingVacant.id,
        sourceTenantId: ''
      })
      : Object.assign({
        id: `custom-${Date.now()}`
      }, payload.nextTenantData);
    if (payload.matchingVacant) {
      tenant.isVacant = false;
      tenant.vacatedOn = '';
      tenant.lastActualRent = 0;
      tenant.lastContractRent = 0;
    } else {
      state.tenants.push(tenant);
    }
    if (payload.matchingVacant && payload.matchingVacant.id !== tenant.id) {
      replaceBuildingTenantOrderOverrideId(state, buildingName, payload.matchingVacant.id, tenant.id);
    }
    const contractStartMonth = getMonthKeyFromDate(tenant.contractStart);
    const monthsToForceUnpaid = new Set([selectedMonth]);
    if (contractStartMonth && isMonthVisible(contractStartMonth)) {
      monthsToForceUnpaid.add(contractStartMonth);
    }
    monthsToForceUnpaid.forEach((monthKey) => {
      setPaidOverride(state, tenant.id, monthKey, 0);
    });
    tenant.lastPaidMonth = addMonths(contractStartMonth || selectedMonth, -1);
    restoreBuildingFinancialSnapshot(state, buildingFinancialSnapshot, buildingName, tenant.unit, tenant.floor);
    saveState(state);
    try {
      if (typeof syncCreateTenantToDb === 'function') {
        await syncCreateTenantToDb({
          buildingName: tenant.building,
          unit: tenant.unit,
          floor: tenant.floor,
          existingProfileId: tenant.existingProfileId,
          sourceTenantId: tenant.id,
          name: tenant.name,
          phone: tenant.phone,
          civilId: tenant.civilId,
          nationality: tenant.nationality,
          moveInDate: tenant.moveInDate,
          contractStart: tenant.contractStart,
          contractEnd: tenant.contractEnd,
          contractRent: tenant.contractRent,
          discount: tenant.discount,
          actualRent: tenant.actualRent,
          dueDay: tenant.dueDay,
          insuranceAmount: tenant.insuranceAmount,
          insurancePaidMonth: tenant.insurancePaidMonth,
          notes: tenant.notes
        });
      }
      logActivity(state, 'Tenant created', `${tenant.building} ${tenant.unit} ${tenant.name}`);
      renderAll(state, tenant.building);
      const visibleFromMonth = getMonthKeyFromDate(tenant.moveInDate || tenant.contractStart || '');
      if (visibleFromMonth && compareMonthKeys(selectedMonth, visibleFromMonth) < 0) {
        showFlashMessage(`Tenant saved for ${tenant.building} ${tenant.unit}. It will appear starting ${formatMonth(visibleFromMonth)}.`);
      } else {
        showFlashMessage(`Tenant saved for ${tenant.building} ${tenant.unit}.`);
      }
      return tenant;
    } catch (error) {
      showFlashMessage(String(error && error.message || 'Tenant create failed.'));
      return null;
    }
  }

  async function createTenantFromVacantDetail(state, tenantId, buttonElement) {
    const selectedMonth = getSelectedTenantMonth();
    const vacantView = getTenantViews(state, selectedMonth).find((item) => item.id === tenantId && item.isVacant);
    const sourceUnitId = String(buttonElement && buttonElement.getAttribute('data-create-tenant-unit-id') || '').trim();
    const sourceTenantId = String(buttonElement && buttonElement.getAttribute('data-create-tenant-source-tenant-id') || '').trim();
    const buildingName = String(buttonElement && buttonElement.getAttribute('data-create-tenant-building') || vacantView && vacantView.building || '').trim();
    const unit = String(buttonElement && buttonElement.getAttribute('data-create-tenant-unit') || vacantView && vacantView.unit || '').trim();
    const floor = String(buttonElement && buttonElement.getAttribute('data-create-tenant-floor') || vacantView && vacantView.floor || '').trim();
    if (!vacantView && !buildingName && !unit) return;
    await createTenantFromData(state, selectedMonth, {
      sourceVacantId: tenantId,
      unitId: sourceUnitId,
      sourceTenantId,
      building: buildingName,
      unit,
      floor,
      existingProfileId: getVacantTenantCreateValue('data-vacant-create-profile-id', tenantId),
      name: getVacantTenantCreateValue('data-vacant-create-name', tenantId),
      phone: getVacantTenantCreateValue('data-vacant-create-phone', tenantId),
      civilId: getVacantTenantCreateValue('data-vacant-create-civil-id', tenantId),
      nationality: getVacantTenantCreateValue('data-vacant-create-nationality', tenantId) || 'Not set',
      moveInDate: getVacantTenantCreateValue('data-vacant-create-move-in', tenantId),
      contractStart: getVacantTenantCreateValue('data-vacant-create-contract-start', tenantId),
      contractEnd: getVacantTenantCreateValue('data-vacant-create-contract-end', tenantId),
      rent: getVacantTenantCreateValue('data-vacant-create-rent', tenantId),
      discount: getVacantTenantCreateValue('data-vacant-create-discount', tenantId),
      dueDay: getVacantTenantCreateValue('data-vacant-create-due-day', tenantId) || '20',
      insuranceAmount: getVacantTenantCreateValue('data-vacant-create-insurance-amount', tenantId),
      insurancePaidMonth: getVacantTenantCreateValue('data-vacant-create-insurance-paid-month', tenantId),
      notes: getVacantTenantCreateValue('data-vacant-create-notes', tenantId)
    });
  }

  function getSavedTenantProfileById(profileId) {
    const targetId = String(profileId || '').trim();
    if (!targetId) return null;
    const profiles = typeof getDbSnapshotTenantProfiles === 'function' ? getDbSnapshotTenantProfiles() : [];
    return profiles.find((item) => String(item && item.id || '').trim() === targetId) || null;
  }

  function loadSavedTenantIntoVacantDetail(tenantId) {
    const profileSelect = findDetailInput('data-vacant-history-profile', tenantId);
    const profileId = String(profileSelect && profileSelect.value || '').trim();
    if (!profileId) {
      showFlashMessage('Choose a saved tenant first.');
      return;
    }
    const profile = getSavedTenantProfileById(profileId);
    if (!profile) {
      showFlashMessage('Saved tenant profile not found.');
      return;
    }
    const setDetailValue = (attributeName, value) => {
      const input = findDetailInput(attributeName, tenantId);
      if (!input) return;
      input.value = String(value || '').trim();
    };
    setDetailValue('data-vacant-create-profile-id', profile.id);
    setDetailValue('data-vacant-create-name', profile.fullName);
    setDetailValue('data-vacant-create-phone', profile.phone);
    setDetailValue('data-vacant-create-civil-id', profile.civilId);
    setDetailValue('data-vacant-create-nationality', profile.nationality || 'Not set');
    showFlashMessage(`Loaded saved tenant ${profile.fullName || 'record'}. Enter the new contract details and save.`);
  }

  function bindVacantTenantCreateDetail(detailRow, tenantId) {
    if (!detailRow) return;
    const rentInput = detailRow.querySelector(`[data-vacant-create-rent="${CSS.escape(tenantId)}"]`);
    const discountInput = detailRow.querySelector(`[data-vacant-create-discount="${CSS.escape(tenantId)}"]`);
    const actualRentInput = detailRow.querySelector(`[data-vacant-create-actual-rent="${CSS.escape(tenantId)}"]`);
    const presetSelect = detailRow.querySelector(`[data-vacant-create-contract-preset="${CSS.escape(tenantId)}"]`);
    const contractStartInput = detailRow.querySelector(`[data-vacant-create-contract-start="${CSS.escape(tenantId)}"]`);
    const contractEndInput = detailRow.querySelector(`[data-vacant-create-contract-end="${CSS.escape(tenantId)}"]`);
    const loadHistoryButton = detailRow.querySelector(`[data-load-history-profile="${CSS.escape(tenantId)}"]`);

    const updateActualRent = () => {
      if (!actualRentInput) return;
      const contractRent = Math.max(0, Math.round(Number(rentInput && rentInput.value || 0)));
      const discount = Math.max(0, Math.round(Number(discountInput && discountInput.value || 0)));
      actualRentInput.value = String(Math.max(contractRent - discount, 0));
    };

    const applyPreset = () => {
      if (!presetSelect || !contractStartInput || !contractEndInput) return;
      const presetValue = String(presetSelect.value || 'custom');
      if (presetValue === 'custom') return;
      const years = presetValue === '1year' ? 1 : presetValue === '5years' ? 5 : 0;
      const computedEnd = getContractEndFromPreset(contractStartInput.value, years);
      if (computedEnd) contractEndInput.value = computedEnd;
    };

    if (rentInput) rentInput.addEventListener('input', updateActualRent);
    if (discountInput) discountInput.addEventListener('input', updateActualRent);
    if (presetSelect) presetSelect.addEventListener('change', applyPreset);
    if (contractStartInput) contractStartInput.addEventListener('change', applyPreset);
    if (contractEndInput) {
      contractEndInput.addEventListener('input', () => {
        if (presetSelect && presetSelect.value !== 'custom') {
          presetSelect.value = 'custom';
        }
      });
    }
    if (loadHistoryButton) {
      loadHistoryButton.addEventListener('click', () => loadSavedTenantIntoVacantDetail(tenantId));
    }
    updateActualRent();
  }

  function handleTenantForm(state) {
    const form = document.getElementById('tenantForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const selectedMonth = getSelectedTenantMonth();
      const formData = new FormData(form);
      void createTenantFromData(state, selectedMonth, {
        building: String(formData.get('building') || '').trim(),
        unit: String(formData.get('unit') || formData.get('vacantUnit') || '').trim(),
        floor: String(formData.get('floor') || '').trim(),
        name: String(formData.get('name') || '').trim(),
        phone: String(formData.get('phone') || ''),
        civilId: String(formData.get('civilId') || '').trim(),
        nationality: String(formData.get('nationality') || 'Not set').trim() || 'Not set',
        moveInDate: String(formData.get('moveInDate') || formData.get('contractStart') || ''),
        contractStart: String(formData.get('contractStart') || ''),
        contractEnd: String(formData.get('contractEnd') || ''),
        rent: String(formData.get('rent') || '0'),
        discount: String(formData.get('discount') || '0'),
        dueDay: String(formData.get('dueDay') || '20'),
        insuranceAmount: String(formData.get('insuranceAmount') || '0'),
        insurancePaidMonth: String(formData.get('insurancePaidMonth') || '').trim(),
        notes: String(formData.get('notes') || '').trim()
      }).then((tenant) => {
        if (!tenant) return;
        form.reset();
        form.querySelector('[name="dueDay"]').value = '20';
        form.querySelector('[name="discount"]').value = '0';
        form.querySelector('[name="nationality"]').value = 'Not set';
        populateTenantSelectors(state);
      });
    });
  }

  function bindContractPresetControls() {
    const presetSelect = document.getElementById('tenantContractPreset');
    const startInput = document.querySelector('#tenantForm [name="contractStart"]');
    const endInput = document.querySelector('#tenantForm [name="contractEnd"]');
    if (!presetSelect || !startInput || !endInput) return;

    const applyPreset = () => {
      const presetValue = String(presetSelect.value || 'custom');
      if (presetValue === 'custom') return;
      const years = presetValue === '1year' ? 1 : presetValue === '5years' ? 5 : 0;
      const computedEnd = getContractEndFromPreset(startInput.value, years);
      if (computedEnd) endInput.value = computedEnd;
    };

    presetSelect.addEventListener('change', applyPreset);
    startInput.addEventListener('change', applyPreset);
    endInput.addEventListener('input', () => {
      if (presetSelect.value !== 'custom') {
        presetSelect.value = 'custom';
      }
    });
  }

  function bindTenantActualRentPreview() {
    const rentInput = document.getElementById('tenantRentInput');
    const discountInput = document.getElementById('tenantDiscountInput');
    const actualRentInput = document.getElementById('tenantActualRentPreview');
    if (!rentInput || !discountInput || !actualRentInput) return;

    const updateActualRent = () => {
    const contractRent = Math.max(0, Math.round(Number(rentInput.value || 0)));
    const discount = Math.max(0, Math.round(Number(discountInput.value || 0)));
      actualRentInput.value = String(Math.max(contractRent - discount, 0));
    };

    rentInput.addEventListener('input', updateActualRent);
    discountInput.addEventListener('input', updateActualRent);
    updateActualRent();
  }

  function handlePaymentForm(state) {
    const form = document.getElementById('paymentForm');
    if (!form) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const currentMonth = getActiveMonthKey();
    const dateField = form.querySelector('[name="date"]');
    const monthField = form.querySelector('[name="rentMonth"]');
    if (dateField) dateField.value = todayIso;
    if (monthField) monthField.value = currentMonth;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const tenantId = String(formData.get('tenantId') || '');
      const tenant = state.tenants.find((item) => item.id === tenantId);
      if (!tenant) return;
      const amount = Number(formData.get('amount') || 0);
      const rentMonth = String(formData.get('rentMonth') || currentMonth);
      const nextMonthAdvance = Number(formData.get('nextMonthAdvance') || 0);
      if (!isMonthVisible(rentMonth)) {
        showFlashMessage('That month is not open yet. January and February are available, and February keeps its own carried-forward state.');
        return;
      }
      if (!canEditBuildingMonth(tenant.building, rentMonth)) {
        return;
      }
      if (rentMonth === currentMonth && Number(tenant.previousDue || 0) > 0) {
        alert('This tenant has unpaid previous months. Clear older due first.');
        logActivity(state, 'Payment blocked', `${tenant.building} ${tenant.unit} current month payment blocked because previous due exists.`);
        return;
      }
      const sourceTenantId = String(tenant.sourceTenantId || tenant.id || tenantId || '').trim();
      const paidOn = String(formData.get('date') || todayIso);
      const method = String(formData.get('method') || '').trim();
      const note = String(formData.get('note') || '').trim();
      if (typeof syncTenantPaymentToDb === 'function' && amount > 0) {
        await syncTenantPaymentToDb({
          sourceTenantId,
          amount,
          paidOn,
          rentMonth,
          method,
          note
        });
      }
      if (typeof syncTenantPaymentToDb === 'function') {
        await syncBuildingInlineEditToDb({
          sourceTenantId,
          monthKey: rentMonth,
          prepaidAmount: nextMonthAdvance > 0 ? nextMonthAdvance : 0
        });
      }
      tenant.lastPaidMonth = rentMonth;
      logActivity(state, 'Payment recorded', `${tenant.building} ${tenant.unit} ${formatCurrency(amount)} for ${formatMonth(rentMonth)}`);
      form.reset();
      if (dateField) dateField.value = todayIso;
      if (monthField) monthField.value = currentMonth;
      const nextField = form.querySelector('[name="nextMonthAdvance"]');
      if (nextField) nextField.value = '0';
      renderAll(state, tenant.building);
    });
  }
