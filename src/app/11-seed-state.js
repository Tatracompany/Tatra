  function seedState() {
    const currentMonth = getCurrentMonthKey();
    let offset = 0;
    const seedData = getBuildingSeedConfigs().map((config) => {
      const built = buildSeedTenants(config.items, config.buildingName, config.idPrefix, offset, currentMonth);
      offset += built.tenants.length;
      return built;
    });
    const tenants = seedData.flatMap((item) => item.tenants);
    const payments = seedData.flatMap((item) => item.payments);

    return {
      buildings: BUILDINGS,
      tenants,
        payments,
        actualRentOverrides: {},
        vacantAmountOverrides: {},
        paidOverrides: {},
        lastInsuranceRollMonth: currentMonth,
      activity: [
        { id: 'activity-seed', when: new Date().toISOString(), action: 'System seed loaded', actor: 'system', detail: 'Rebuilt stable English baseline with Salwa 165 data.' }
      ]
    };
  }

  function buildFreshSqlResetState() {
    const currentMonth = getCurrentMonthKey();
    return {
      buildings: BUILDINGS.slice(),
      tenants: [],
      payments: [],
      actualRentOverrides: {},
      vacantAmountOverrides: {},
      paidOverrides: {},
      carryOverrides: {},
      notesOverrides: {},
      tenantIdentityOverrides: {},
      carriedMonthSnapshots: {},
      tenantOrderOverrides: {},
      oldTenantDuePaidNotes: {},
      lastInsuranceRollMonth: currentMonth,
      activity: [
        {
          id: `activity-fresh-reset-${Date.now()}`,
          when: new Date().toISOString(),
          action: 'Fresh SQL reset applied',
          actor: 'system',
          detail: 'Cleared all live tenant rows, payments, overrides, and order data while keeping the building structure.'
        }
      ],
      appliedFixes: {
        'fresh-reset-all-buildings-v2': true
      }
    };
  }

  function sanitizeSystemNoteText(noteText) {
    const text = String(noteText || '').trim();
    if (!text) return '';
    const parts = [];
    if (/\bVacant unit\b/i.test(text)) {
      parts.push('Vacant unit');
    }
    const vacatedMatch = text.match(/Vacated on \d{4}-\d{2}-\d{2}/i);
    if (vacatedMatch) {
      parts.push(vacatedMatch[0]);
    }
    const lastTenantMatch = text.match(/Last tenant:\s*([^.|·]+)/i);
    if (lastTenantMatch) {
      parts.push(`Last tenant: ${String(lastTenantMatch[1] || '').trim()}`);
    }
    return parts.filter(Boolean).join('. ').trim();
  }

  function inferMissingNumericVacantUnits(seedItems, buildingName) {
    const buildingMeta = BUILDINGS.find((building) => building.name === buildingName);
    const normalizedItems = seedItems.slice();
    const numericUnits = normalizedItems
      .map((tenant) => String(tenant.unit || '').trim())
      .filter((unit) => /^\d+$/.test(unit))
      .map((unit) => Number(unit));
    const maxNumericUnit = numericUnits.length ? Math.max(...numericUnits) : 0;
    const totalUnits = Number(buildingMeta && buildingMeta.totalUnits || 0);
    const upperBound = Math.max(maxNumericUnit, totalUnits);
    if (!(upperBound > 0) || !numericUnits.length) return normalizedItems;
    const hasOnlyNumericUnits = normalizedItems.every((tenant) => /^\d+$/.test(String(tenant.unit || '').trim()));
    if (!hasOnlyNumericUnits) return normalizedItems;
    const usedUnits = new Set(numericUnits);
    for (let unitNumber = 1; unitNumber <= upperBound; unitNumber += 1) {
      if (usedUnits.has(unitNumber)) continue;
      normalizedItems.push({
        unit: String(unitNumber),
        floor: '',
        name: '',
        contractStart: '',
        contractEnd: '',
        contractRent: 0,
        discount: 0,
        actualRent: 0,
        previousDue: 0,
        paidCurrent: 0,
        prepaid: 0,
        note: ''
      });
    }
    return normalizedItems.sort((a, b) => {
      const aUnit = Number(String(a.unit || '').trim());
      const bUnit = Number(String(b.unit || '').trim());
      return aUnit - bUnit;
    });
  }

  function buildSeedTenants(seedItems, buildingName, idPrefix, startIndex, currentMonth) {
    const previousMonth = addMonths(currentMonth, -1);
    const payments = [];
    const normalizedSeedItems = inferMissingNumericVacantUnits(seedItems, buildingName);
    const filteredItems = normalizedSeedItems.filter((tenant) => {
      const unit = String(tenant.unit || '').trim();
      return unit && !isSummaryRowLike(unit) && !isSummaryRowLike(tenant.name);
    });
    const baseIdCounts = filteredItems.reduce((counts, tenant) => {
      const unitSlug = String(tenant.unit || '').toLowerCase().trim().replace(/\s+/g, '-');
      const baseId = `${idPrefix}-${unitSlug}`;
      counts.set(baseId, (counts.get(baseId) || 0) + 1);
      return counts;
    }, new Map());
    const tenants = filteredItems.map((tenant, index) => {
      const isVacant = !String(tenant.name || '').trim();
      const unitSlug = String(tenant.unit || '').toLowerCase().trim().replace(/\s+/g, '-');
      const explicitFloor = normalizeFloorLabel(tenant.floor);
      const inferredFloor = explicitFloor || getSeedUnitFloorLabel(tenant.unit);
      const floorSlug = String(inferredFloor || '').toLowerCase().trim().replace(/\s+/g, '-');
      const baseId = `${idPrefix}-${unitSlug}`;
      const id = (baseIdCounts.get(baseId) || 0) > 1
        ? `${baseId}-${floorSlug || `row-${index + 1}`}`
        : baseId;
      if (!isVacant && tenant.paidCurrent > 0) {
        payments.push({
          id: `seed-${id}-${currentMonth}`,
          tenantId: id,
          amount: tenant.paidCurrent,
          date: `${currentMonth}-01`,
          rentMonth: currentMonth,
          method: 'Seeded from Excel',
          note: tenant.note || ''
        });
      }
      return {
        id,
        building: buildingName,
        unit: tenant.unit,
        floor: inferredFloor,
        name: isVacant ? 'Available unit' : tenant.name,
        isVacant,
        isArchived: false,
        phone: '',
        civilId: '',
        nationality: 'Not set',
        insurancePreviousAmount: 0,
        insuranceCurrentAmount: 0,
        dueDay: 20,
        contractStart: tenant.contractStart,
        contractEnd: tenant.contractEnd,
        contractRent: isVacant ? 0 : tenant.contractRent,
        discount: Number(tenant.discount || 0),
        actualRent: isVacant ? 0 : tenant.actualRent,
        lastContractRent: isVacant ? Number(tenant.contractRent || 0) : 0,
        lastActualRent: isVacant ? Number(tenant.actualRent || 0) : 0,
        previousDue: isVacant ? 0 : tenant.previousDue,
        notes: isVacant ? 'Vacant unit' : sanitizeSystemNoteText(tenant.note),
        prepaidNextMonth: tenant.prepaid,
        seedOrder: startIndex + index,
        lastPaidMonth: !isVacant && tenant.paidCurrent > 0 ? currentMonth : previousMonth
      };
    });
    return { tenants, payments };
  }

  function getSeedUnitFloorLabel(unit) {
    const value = String(unit || '').trim();
    if (!value) return '';
    if (value.includes('سرداب')) return 'سرداب';
    if (value.includes('محل') || value.includes('ارض')) return 'ارضي';
    if (value.includes('سطح') || value.includes('ملحق')) return 'ملاحق';
    if (value.includes('شقق')) return 'الشقق';
    return '';
  }

  function getBuildingSeedConfigs() {
    const configs = [
      { buildingName: 'سلوى 165', idPrefix: 'salwa', items: SALWA_TENANTS },
      { buildingName: 'سلوى 247', idPrefix: 'salwa247', items: SALWA_247_TENANTS },
      { buildingName: 'سلوى 249', idPrefix: 'salwa249', items: SALWA_249_TENANTS },
      { buildingName: 'حولي 16-46', idPrefix: 'hawali', items: HAWALI_TENANTS },
      { buildingName: 'حولي 06-161', idPrefix: 'hawali-06-161', items: Array.from({ length: 43 }, (_, index) => index + 1).map((unitNumber) => ({ unit: String(unitNumber), floor: '', name: '', contractStart: '', contractEnd: '', contractRent: 0, discount: 0, actualRent: 0, previousDue: 0, paidCurrent: 0, prepaid: 0, note: '' })) }
    ];
    SALMIYA_BUILDING_TEMPLATES.forEach((item) => {
      configs.push({ buildingName: item.name, idPrefix: item.id, items: item.tenants || [] });
    });
    HAWALI_BUILDING_TEMPLATES.forEach((item) => {
      configs.push({ buildingName: item.name, idPrefix: item.id, items: item.tenants || [] });
    });
    EXTRA_BUILDING_TEMPLATES.forEach((item) => {
      configs.push({ buildingName: item.name, idPrefix: item.id, items: item.tenants || [] });
    });
    return configs.filter((config) => !isRemovedBuilding({ id: config.idPrefix, name: config.buildingName }));
  }

  function getBuildingTemplateOrderMap(buildingName) {
    if (renderCache.templateOrderMaps.has(buildingName)) {
      return renderCache.templateOrderMaps.get(buildingName);
    }
    if (typeof getDbSnapshotUnitsForBuilding === 'function') {
      const snapshotUnits = getDbSnapshotUnitsForBuilding(buildingName);
      if (snapshotUnits.length) {
        const map = new Map(snapshotUnits
          .slice()
          .sort((left, right) => {
            const leftPosition = Number(left.activeRowPosition ?? left.templatePosition ?? Number.MAX_SAFE_INTEGER);
            const rightPosition = Number(right.activeRowPosition ?? right.templatePosition ?? Number.MAX_SAFE_INTEGER);
            if (leftPosition !== rightPosition) return leftPosition - rightPosition;
            return String(left.unit || '').localeCompare(String(right.unit || ''), 'en', { numeric: true });
          })
          .map((unit, index) => [getTenantUnitLookupKey({ unit: unit.unit, floor: unit.floor }), index]));
        renderCache.templateOrderMaps.set(buildingName, map);
        return map;
      }
    }
    renderCache.templateOrderMaps.set(buildingName, null);
    return null;
  }

  function renameTenantIdAcrossState(state, previousId, nextId) {
    const fromId = String(previousId || '').trim();
    const toId = String(nextId || '').trim();
    if (!fromId || !toId || fromId === toId) return false;
    let changed = false;
    state.payments.forEach((payment) => {
      if (String(payment.tenantId || '').trim() !== fromId) return;
      payment.tenantId = toId;
      changed = true;
    });
    ['paidOverrides', 'carryOverrides', 'notesOverrides', 'tenantIdentityOverrides', 'actualRentOverrides', 'vacantAmountOverrides'].forEach((bucketKey) => {
      const bucket = state[bucketKey];
      if (!bucket || typeof bucket !== 'object' || !Object.prototype.hasOwnProperty.call(bucket, fromId)) return;
      if (!Object.prototype.hasOwnProperty.call(bucket, toId)) {
        bucket[toId] = bucket[fromId];
      }
      delete bucket[fromId];
      changed = true;
    });
    return changed;
  }

  function ensureUniqueTenantIds(state) {
    const seenIds = new Set();
    let changed = false;
    state.tenants.forEach((tenant, index) => {
      const originalId = String(tenant.id || '').trim();
      if (originalId && !seenIds.has(originalId)) {
        seenIds.add(originalId);
        return;
      }
      const unitSlug = String(tenant.unit || '').toLowerCase().trim().replace(/\s+/g, '-');
      const floorSlug = String(normalizeFloorLabel(tenant.floor) || '').toLowerCase().trim().replace(/\s+/g, '-');
      const baseId = originalId || `${String(tenant.building || 'tenant').toLowerCase().trim().replace(/\s+/g, '-')}-${unitSlug || 'unit'}`;
      let nextId = `${baseId}-${floorSlug || 'row'}-${index + 1}`;
      let suffix = 2;
      while (seenIds.has(nextId)) {
        nextId = `${baseId}-${floorSlug || 'row'}-${index + 1}-${suffix}`;
        suffix += 1;
      }
      tenant.id = nextId;
      seenIds.add(nextId);
      if (originalId) renameTenantIdAcrossState(state, originalId, nextId);
      changed = true;
    });
    return changed;
  }

  function getDynamicTemplateBuildingNames() {
    return new Set(
      SALMIYA_BUILDING_TEMPLATES
        .map((item) => item.name)
        .concat(HAWALI_BUILDING_TEMPLATES.map((item) => item.name))
        .concat(EXTRA_BUILDING_TEMPLATES.map((item) => item.name))
        .filter((name) => !REMOVED_BUILDING_NAMES.has(String(name || '').trim()))
    );
  }

  function buildingNeedsTemplateRefresh(state, buildingName) {
    const buildingTenants = state.tenants.filter((tenant) => tenant.building === buildingName);
    if (!buildingTenants.length) return true;
    return buildingTenants.some((tenant) => {
      const name = String(tenant.name || '');
      const unit = String(tenant.unit || '');
      return name.includes('?') || unit.includes('?') || isSummaryRowLike(name) || isSummaryRowLike(unit);
    });
  }

  function repairMissingTemplateRows(state, config, currentMonth, existingTenantIds, existingPaymentIds) {
    const built = buildSeedTenants(config.items, config.buildingName, config.idPrefix, 0, currentMonth);
    const currentTenants = state.tenants.filter((tenant) => tenant.building === config.buildingName && !tenant.isArchived);
    const currentKeys = new Set(currentTenants.map((tenant) => getTenantOrderKey(tenant)).filter(Boolean));
    const missingTenants = built.tenants.filter((tenant) => !currentKeys.has(getTenantOrderKey(tenant)));
    if (!missingTenants.length) return false;

    const missingTenantIds = new Set(missingTenants.map((tenant) => tenant.id));
    missingTenants.forEach((tenant) => {
      if (existingTenantIds.has(tenant.id)) return;
      tenant.seedOrder = state.tenants.length;
      state.tenants.push(tenant);
      existingTenantIds.add(tenant.id);
    });
    built.payments.forEach((payment) => {
      if (!missingTenantIds.has(payment.tenantId) || existingPaymentIds.has(payment.id)) return;
      state.payments.push(payment);
      existingPaymentIds.add(payment.id);
    });

    const desiredOrder = new Map(built.tenants.map((tenant, index) => [getTenantOrderKey(tenant), index]));
    const buildingTenants = state.tenants
      .filter((tenant) => tenant.building === config.buildingName)
      .sort((a, b) => {
        const aIndex = desiredOrder.has(getTenantOrderKey(a)) ? desiredOrder.get(getTenantOrderKey(a)) : Number.MAX_SAFE_INTEGER;
        const bIndex = desiredOrder.has(getTenantOrderKey(b)) ? desiredOrder.get(getTenantOrderKey(b)) : Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant, index) => Object.assign(tenant, { seedOrder: index }));
    const otherTenants = state.tenants.filter((tenant) => tenant.building !== config.buildingName);
    state.tenants = otherTenants.concat(buildingTenants);
    return true;
  }

  function ensureTemplateSeedBuildings(state) {
    const currentMonth = getCurrentMonthKey();
    const configs = getBuildingSeedConfigs();
    const dynamicTemplateBuildings = getDynamicTemplateBuildingNames();
    const existingBuildings = new Set(state.buildings.map((building) => building.name));
    const existingTenantIds = new Set(state.tenants.map((tenant) => tenant.id));
    const existingPaymentIds = new Set(state.payments.map((payment) => payment.id));
    let changed = false;

    BUILDINGS.forEach((buildingMeta) => {
      const existing = state.buildings.find((building) => building.name === buildingMeta.name);
      if (!existing) return;
      if (existing.id !== buildingMeta.id || existing.area !== buildingMeta.area || existing.totalUnits !== buildingMeta.totalUnits) {
        existing.id = buildingMeta.id;
        existing.area = buildingMeta.area;
        existing.totalUnits = buildingMeta.totalUnits;
        changed = true;
      }
    });

    const buildingOrder = new Map(BUILDINGS.map((building, index) => [building.name, index]));
    const reorderedBuildings = state.buildings.slice().sort((a, b) => {
      const aIndex = buildingOrder.has(a.name) ? buildingOrder.get(a.name) : Number.MAX_SAFE_INTEGER;
      const bIndex = buildingOrder.has(b.name) ? buildingOrder.get(b.name) : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.name.localeCompare(b.name, 'ar');
    });
    if (reorderedBuildings.some((building, index) => state.buildings[index] !== building)) {
      state.buildings = reorderedBuildings;
      changed = true;
    }

    configs.forEach((config) => {
      if (!dynamicTemplateBuildings.has(config.buildingName)) return;
      if (!buildingNeedsTemplateRefresh(state, config.buildingName)) {
        if (repairMissingTemplateRows(state, config, currentMonth, existingTenantIds, existingPaymentIds)) {
          changed = true;
        }
        return;
      }
      const built = buildSeedTenants(config.items, config.buildingName, config.idPrefix, 0, currentMonth);
      const oldTenantIds = new Set(
        state.tenants
          .filter((tenant) => tenant.building === config.buildingName)
          .map((tenant) => tenant.id)
      );
      const seedTenantIds = new Set(built.tenants.map((tenant) => tenant.id));
      const seedPaymentIds = new Set(built.payments.map((payment) => payment.id));
      const tenantCountBefore = state.tenants.length;
      const paymentCountBefore = state.payments.length;

      state.tenants = state.tenants.filter((tenant) => tenant.building !== config.buildingName);
      state.payments = removeTenantLinkedPaymentsExceptAdvance(state.payments, oldTenantIds)
        .filter((payment) => !seedPaymentIds.has(payment.id));

      built.tenants.forEach((tenant) => {
        state.tenants.push(tenant);
        existingTenantIds.add(tenant.id);
      });
      built.payments.forEach((payment) => {
        state.payments.push(payment);
        existingPaymentIds.add(payment.id);
      });

      if (state.tenants.length !== tenantCountBefore || state.payments.length !== paymentCountBefore || built.tenants.length > 0) {
        changed = true;
      }
    });

    configs.forEach((config) => {
      const buildingMeta = BUILDINGS.find((building) => building.name === config.buildingName);
      if (buildingMeta && !existingBuildings.has(config.buildingName)) {
        state.buildings.push(buildingMeta);
        existingBuildings.add(config.buildingName);
        changed = true;
      }
      const buildingHasRows = state.tenants.some((tenant) => tenant.building === config.buildingName);
      const seedData = buildSeedTenants(config.items, config.buildingName, config.idPrefix, state.tenants.length, currentMonth);
      if (!buildingHasRows) {
        seedData.tenants.forEach((tenant) => {
          if (existingTenantIds.has(tenant.id)) return;
          tenant.seedOrder = state.tenants.length;
          state.tenants.push(tenant);
          existingTenantIds.add(tenant.id);
          changed = true;
        });
        seedData.payments.forEach((payment) => {
          if (existingPaymentIds.has(payment.id)) return;
          state.payments.push(payment);
          existingPaymentIds.add(payment.id);
          changed = true;
        });
      }

      const desiredOrder = new Map(seedData.tenants.map((tenant, index) => [tenant.id, index]));
      const buildingTenants = state.tenants
        .filter((tenant) => tenant.building === config.buildingName)
        .sort((a, b) => {
          const aIndex = desiredOrder.has(a.id) ? desiredOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
          const bIndex = desiredOrder.has(b.id) ? desiredOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) return aIndex - bIndex;
          return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
        })
        .map((tenant, index) => Object.assign(tenant, { seedOrder: index }));
      const otherTenants = state.tenants.filter((tenant) => tenant.building !== config.buildingName);
      state.tenants = otherTenants.concat(buildingTenants);
    });

    if (changed) {
      state.buildings = BUILDINGS.map((buildingMeta) => state.buildings.find((building) => building.name === buildingMeta.name) || buildingMeta);
      state.activity.unshift({
        id: `activity-seed-import-${Date.now()}`,
        when: new Date().toISOString(),
        actor: 'system',
        action: 'Seed buildings loaded',
        detail: 'Loaded building templates into the fresh baseline.'
      });
      state.activity = state.activity.slice(0, 100);
    }
    return changed;
  }

  function rollInsuranceForwardIfNeeded(state) {
    const currentMonth = getCurrentMonthKey();
    if (state.lastInsuranceRollMonth === currentMonth) return false;
    state.tenants.forEach((tenant) => {
      tenant.insurancePreviousAmount = Number(tenant.insuranceCurrentAmount || 0);
      tenant.insuranceCurrentAmount = 0;
    });
    state.lastInsuranceRollMonth = currentMonth;
    state.activity.unshift({
      id: `activity-insurance-roll-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Insurance rolled forward',
      detail: `Moved current insurance to previous insurance for ${formatMonth(currentMonth)}.`
    });
    state.activity = state.activity.slice(0, 100);
    return true;
  }

  function loadState() {
    try {
      const raw = safeStorageGet(STORAGE_KEY);
      if (!raw) {
        const fresh = buildFreshSqlResetState();
        saveState(fresh, { kind: 'passive' });
        return fresh;
      }
      let parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tenants) || !Array.isArray(parsed.payments)) {
        throw new Error('Invalid state');
      }
      if (typeof hasDbSnapshot === 'function' && hasDbSnapshot()) {
        if (typeof getDbSnapshotPayments === 'function') parsed.payments = getDbSnapshotPayments();
        if (typeof getDbSnapshotActivity === 'function') parsed.activity = getDbSnapshotActivity();
      }
      if (typeof hasDbSnapshot === 'function' && hasDbSnapshot()) {
        parsed.buildings = BUILDINGS.slice();
      } else if (!Array.isArray(parsed.buildings)) {
        parsed.buildings = BUILDINGS.slice();
      }
      if (!Array.isArray(parsed.activity)) parsed.activity = [];
      if (!parsed.lastInsuranceRollMonth) parsed.lastInsuranceRollMonth = getCurrentMonthKey();
      ensureAppliedFixesState(parsed);
      if (!parsed.appliedFixes['fresh-reset-all-buildings-v2']) {
        const fresh = buildFreshSqlResetState();
        saveState(fresh, { kind: 'passive' });
        return fresh;
      }
      if (typeof isStateBehindCurrentDbSnapshot === 'function' && isStateBehindCurrentDbSnapshot(parsed)) {
        if (parsed.__meta && typeof parsed.__meta === 'object') {
          parsed.__meta.dbSnapshotVersion = '';
        }
        if (parsed.appliedFixes && typeof parsed.appliedFixes === 'object') {
          delete parsed.appliedFixes['repair-broken-buildings-from-db-snapshot-v2'];
        }
      }
      ensureTenantIdentityOverridesState(parsed);
      ensureActualRentOverridesState(parsed);
      ensureVacantAmountOverridesState(parsed);
      ensurePaidOverridesState(parsed);
      ensureCarryOverridesState(parsed);
      ensureNotesOverridesState(parsed);
      parsed.tenants = parsed.tenants.map((tenant, index) => Object.assign({
        phone: '',
        civilId: '',
        nationality: 'Not set',
        moveInDate: '',
        isVacant: false,
        isArchived: false,
        insuranceAmount: 0,
        insurancePaidMonth: '',
        insurancePreviousAmount: 0,
        insuranceCurrentAmount: 0,
        notes: '',
        dueDay: 20,
        seedOrder: index
      }, tenant, {
        phone: normalizePhone(tenant.phone || ''),
        civilId: String(tenant.civilId || '').trim(),
        nationality: tenant.nationality || 'Not set',
        moveInDate: String(tenant.moveInDate || tenant.contractStart || '').trim(),
        insuranceAmount: Number(tenant.insuranceAmount || 0),
        insurancePaidMonth: String(tenant.insurancePaidMonth || '').trim(),
        insurancePreviousAmount: Number(tenant.insurancePreviousAmount || (tenant.insurancePeriod === 'previous' ? tenant.insuranceAmount : 0) || 0),
        insuranceCurrentAmount: Number(tenant.insuranceCurrentAmount || (tenant.insurancePeriod === 'current' ? tenant.insuranceAmount : 0) || 0),
        dueDay: Number(tenant.dueDay || 20),
        floor: normalizeFloorLabel(tenant.floor),
        actualRent: Number(tenant.actualRent || Math.max(Number(tenant.contractRent || 0) - Number(tenant.discount || 0), 0))
      }));
      const restoredFromDbSnapshotChanged = restoreStateFromDbSnapshot(parsed);
      const duplicateVacantChanged = removeDuplicateVacantUnits(parsed);
      const uniqueTenantIdsChanged = ensureUniqueTenantIds(parsed);
      const duplicatePaymentChanged = removeDuplicateSeedCurrentMonthPayments(parsed);
      const restoredSeedPaymentsChanged = false;
      const collapsedSeedPaymentsChanged = false;
      const repairedSalwa247Changed = false;
      const insuranceChanged = rollInsuranceForwardIfNeeded(parsed);
      const removedBuildingsChanged = false;
      const normalizedHawali16105NameChanged = false;
      const clearedFutureMonthsChanged = false;
      const unit5FebruaryUnpaidChanged = false;
      const removedHawali06161Unit6Changed = false;
      const restoredHawali06161Unit6Changed = false;
      const restoredHawali8587RowsChanged = false;
      const restoredHawali8532BasementChanged = false;
      const restoredHawali1646BasementChanged = false;
      const restoredHawali175BasementChanged = false;
      const repairedHawali362DuplicatesChanged = false;
      const removedHawali362Unit53Changed = false;
      const repairedHawali16105RowCountChanged = false;
      const movedFahaheelShabakaPrepaidChanged = false;
      const templateSeedChanged = false;
      const normalizedInsuranceChanged = normalizeTenantInsuranceState(parsed);
      const clearedFreeTextNotesChanged = clearFreeTextTenantNotes(parsed);
      const clearedLegacyTenantOrderOverridesChanged = clearLegacyTenantIdOrderOverrides(parsed);
      const resetFebruaryCarryChanged = !parsed.appliedFixes['reset-february-carry-v7']
        ? resetCarriedMonthState(parsed, '2026-02')
        : false;
      parsed.appliedFixes['reset-february-carry-v7'] = true;
      if (restoredFromDbSnapshotChanged || duplicateVacantChanged || uniqueTenantIdsChanged || duplicatePaymentChanged || restoredSeedPaymentsChanged || collapsedSeedPaymentsChanged || repairedSalwa247Changed || insuranceChanged || removedBuildingsChanged || normalizedHawali16105NameChanged || clearedFutureMonthsChanged || unit5FebruaryUnpaidChanged || removedHawali06161Unit6Changed || restoredHawali06161Unit6Changed || restoredHawali8587RowsChanged || restoredHawali8532BasementChanged || restoredHawali1646BasementChanged || restoredHawali175BasementChanged || repairedHawali362DuplicatesChanged || removedHawali362Unit53Changed || repairedHawali16105RowCountChanged || movedFahaheelShabakaPrepaidChanged || templateSeedChanged || normalizedInsuranceChanged || clearedFreeTextNotesChanged || clearedLegacyTenantOrderOverridesChanged || resetFebruaryCarryChanged) saveState(parsed, { kind: 'passive' });
      if (typeof rememberLoadedStateMeta === 'function') rememberLoadedStateMeta(parsed);
      return parsed;
    } catch (error) {
      const fresh = buildFreshSqlResetState();
      saveState(fresh, { kind: 'passive' });
      return fresh;
    }
  }

  function saveState(state, options) {
    const saveKind = String(options && options.kind || 'user').trim() || 'user';
    if (typeof stampStateMeta === 'function') stampStateMeta(state, saveKind);
    safeStorageSet(STORAGE_KEY, JSON.stringify(state));
    if (typeof rememberLoadedStateMeta === 'function') rememberLoadedStateMeta(state);
    if (saveKind === 'user' && typeof queueStateExtrasSync === 'function') queueStateExtrasSync(state);
  }

  function clearWholeMonthOverrideBucket(bucket, monthKey) {
    if (!bucket || typeof bucket !== 'object') return false;
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth) return false;
    let changed = false;
    Object.keys(bucket).forEach((entryKey) => {
      const monthBucket = bucket[entryKey];
      if (!monthBucket || typeof monthBucket !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(monthBucket, normalizedMonth)) {
        delete monthBucket[normalizedMonth];
        changed = true;
      }
      if (!Object.keys(monthBucket).length) {
        delete bucket[entryKey];
        changed = true;
      }
    });
    return changed;
  }

  function clearTenantMonthOverrideBucket(bucket, tenantIds, monthKey) {
    if (!bucket || typeof bucket !== 'object') return false;
    let changed = false;
    tenantIds.forEach((tenantId) => {
      if (!bucket[tenantId] || typeof bucket[tenantId] !== 'object') return;
      if (monthKey) {
        const normalizedMonth = String(monthKey).trim();
        if (Object.prototype.hasOwnProperty.call(bucket[tenantId], normalizedMonth)) {
          delete bucket[tenantId][normalizedMonth];
          changed = true;
        }
      } else {
        delete bucket[tenantId];
        changed = true;
      }
      if (bucket[tenantId] && !Object.keys(bucket[tenantId]).length) {
        delete bucket[tenantId];
        changed = true;
      }
    });
    return changed;
  }

  function clearWholeMonthIdentityOverrideBucket(bucket, monthKey) {
    if (!bucket || typeof bucket !== 'object') return false;
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth) return false;
    let changed = false;
    Object.keys(bucket).forEach((tenantId) => {
      const tenantBucket = bucket[tenantId];
      if (!tenantBucket || typeof tenantBucket !== 'object') return;
      Object.keys(tenantBucket).forEach((field) => {
        const monthBucket = tenantBucket[field];
        if (!monthBucket || typeof monthBucket !== 'object') return;
        if (Object.prototype.hasOwnProperty.call(monthBucket, normalizedMonth)) {
          delete monthBucket[normalizedMonth];
          changed = true;
        }
        if (!Object.keys(monthBucket).length) {
          delete tenantBucket[field];
          changed = true;
        }
      });
      if (!Object.keys(tenantBucket).length) {
        delete bucket[tenantId];
        changed = true;
      }
    });
    return changed;
  }

  function clearWholeMonthNestedBucket(bucket, monthKey) {
    if (!bucket || typeof bucket !== 'object') return false;
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth) return false;
    let changed = false;
    Object.keys(bucket).forEach((groupKey) => {
      const groupBucket = bucket[groupKey];
      if (!groupBucket || typeof groupBucket !== 'object') return;
      Object.keys(groupBucket).forEach((entryKey) => {
        const monthBucket = groupBucket[entryKey];
        if (!monthBucket || typeof monthBucket !== 'object') return;
        if (Object.prototype.hasOwnProperty.call(monthBucket, normalizedMonth)) {
          delete monthBucket[normalizedMonth];
          changed = true;
        }
        if (!Object.keys(monthBucket).length) {
          delete groupBucket[entryKey];
          changed = true;
        }
      });
      if (!Object.keys(groupBucket).length) {
        delete bucket[groupKey];
        changed = true;
      }
    });
    return changed;
  }

  function resetCarriedMonthState(state, monthKey) {
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth) return false;
    let changed = false;
    if (state.carriedMonthSnapshots && Object.prototype.hasOwnProperty.call(state.carriedMonthSnapshots, normalizedMonth)) {
      delete state.carriedMonthSnapshots[normalizedMonth];
      changed = true;
    }
    if (clearWholeMonthOverrideBucket(state.paidOverrides, normalizedMonth)) changed = true;
    if (clearWholeMonthOverrideBucket(state.carryOverrides, normalizedMonth)) changed = true;
    if (clearWholeMonthOverrideBucket(state.notesOverrides, normalizedMonth)) changed = true;
    if (clearWholeMonthOverrideBucket(state.actualRentOverrides, normalizedMonth)) changed = true;
    if (clearWholeMonthOverrideBucket(state.vacantAmountOverrides, normalizedMonth)) changed = true;
    if (clearWholeMonthIdentityOverrideBucket(state.tenantIdentityOverrides, normalizedMonth)) changed = true;
    if (clearWholeMonthNestedBucket(state.oldTenantDuePaidNotes, normalizedMonth)) changed = true;
    if (clearWholeMonthNestedBucket(state.tenantOrderOverrides, normalizedMonth)) changed = true;
    const paymentsBefore = Array.isArray(state.payments) ? state.payments.length : 0;
    state.payments = (state.payments || []).filter((payment) => {
      const rentMonth = String(payment && payment.rentMonth || '').trim();
      const method = String(payment && payment.method || '').trim();
      if (rentMonth !== normalizedMonth) return true;
      return method === 'Advance';
    });
    if (state.payments.length !== paymentsBefore) changed = true;
    return changed;
  }

  function removeTenantLinkedPaymentsExceptAdvance(payments, tenantIds) {
    const paymentList = Array.isArray(payments) ? payments : [];
    const removedIds = tenantIds instanceof Set ? tenantIds : new Set(Array.from(tenantIds || []).map((id) => String(id || '').trim()).filter(Boolean));
    return paymentList.filter((payment) => {
      const tenantId = String(payment && payment.tenantId || '').trim();
      const method = String(payment && payment.method || '').trim();
      if (!removedIds.has(tenantId)) return true;
      return method === 'Advance';
    });
  }

  function clearTenantIdentityMonthOverrideBucket(bucket, tenantIds, monthKey) {
    if (!bucket || typeof bucket !== 'object') return false;
    let changed = false;
    tenantIds.forEach((tenantId) => {
      const tenantBucket = bucket[tenantId];
      if (!tenantBucket || typeof tenantBucket !== 'object') return;
      Object.keys(tenantBucket).forEach((field) => {
        if (!tenantBucket[field] || typeof tenantBucket[field] !== 'object') return;
        if (monthKey) {
          const normalizedMonth = String(monthKey).trim();
          if (Object.prototype.hasOwnProperty.call(tenantBucket[field], normalizedMonth)) {
            delete tenantBucket[field][normalizedMonth];
            changed = true;
          }
        } else {
          delete tenantBucket[field];
          changed = true;
        }
        if (tenantBucket[field] && !Object.keys(tenantBucket[field]).length) {
          delete tenantBucket[field];
          changed = true;
        }
      });
      if (!Object.keys(tenantBucket).length) {
        delete bucket[tenantId];
        changed = true;
      }
    });
    return changed;
  }

  function clearBuildingMonthOldDueNotes(state, buildingName, monthKey) {
    ensureOldTenantDuePaidNotesState(state);
    const buildingKey = String(buildingName || '').trim();
    const buildingBucket = state.oldTenantDuePaidNotes[buildingKey];
    if (!buildingBucket) return false;
    let changed = false;
    if (!monthKey) {
      delete state.oldTenantDuePaidNotes[buildingKey];
      return true;
    }
    const normalizedMonth = String(monthKey).trim();
    Object.keys(buildingBucket).forEach((unitKey) => {
      if (!Object.prototype.hasOwnProperty.call(buildingBucket[unitKey], normalizedMonth)) return;
      delete buildingBucket[unitKey][normalizedMonth];
      changed = true;
      if (!Object.keys(buildingBucket[unitKey]).length) delete buildingBucket[unitKey];
    });
    if (!Object.keys(buildingBucket).length) delete state.oldTenantDuePaidNotes[buildingKey];
    return changed;
  }

  function clearGlobalMonthData(state, monthKey) {
    ensureAppliedFixesState(state);
    const normalizedMonth = String(monthKey || '').trim();
    if (!normalizedMonth) return false;
    const appliedKey = `cleared-month-${normalizedMonth}`;
    if (state.appliedFixes[appliedKey]) return false;

    const tenantIds = new Set(state.tenants.map((tenant) => String(tenant.id || '').trim()).filter(Boolean));
    const buildingNames = new Set(state.buildings.map((building) => String(building.name || '').trim()).filter(Boolean));
    let changed = false;

    const nextPayments = state.payments.filter((payment) => {
      const rentMonth = String(payment.rentMonth || '').trim();
      const paymentDateMonth = getMonthKeyFromDate(String(payment.date || '').trim());
      return rentMonth !== normalizedMonth && paymentDateMonth !== normalizedMonth;
    });
    if (nextPayments.length !== state.payments.length) {
      state.payments = nextPayments;
      changed = true;
    }

    if (clearTenantMonthOverrideBucket(state.actualRentOverrides, tenantIds, normalizedMonth)) changed = true;
    if (clearTenantMonthOverrideBucket(state.vacantAmountOverrides, tenantIds, normalizedMonth)) changed = true;
    if (clearTenantMonthOverrideBucket(state.paidOverrides, tenantIds, normalizedMonth)) changed = true;
    if (clearTenantMonthOverrideBucket(state.carryOverrides, tenantIds, normalizedMonth)) changed = true;
    if (clearTenantMonthOverrideBucket(state.notesOverrides, tenantIds, normalizedMonth)) changed = true;
    if (clearTenantIdentityMonthOverrideBucket(state.tenantIdentityOverrides, tenantIds, normalizedMonth)) changed = true;

    state.tenants.forEach((tenant) => {
      if (!tenant || tenant.isArchived || tenant.isVacant) return;
      if (getPaidOverride(state, tenant.id, normalizedMonth) !== 0) {
        setPaidOverride(state, tenant.id, normalizedMonth, 0);
        changed = true;
      }
    });

    ensureTenantOrderOverridesState(state);
    buildingNames.forEach((buildingName) => {
      if (clearBuildingMonthOldDueNotes(state, buildingName, normalizedMonth)) changed = true;
      const buildingBucket = state.tenantOrderOverrides[buildingName];
      if (!buildingBucket || typeof buildingBucket !== 'object') return;
      if (!Object.prototype.hasOwnProperty.call(buildingBucket, normalizedMonth)) return;
      delete buildingBucket[normalizedMonth];
      if (!Object.keys(buildingBucket).length) delete state.tenantOrderOverrides[buildingName];
      changed = true;
    });

    state.appliedFixes[appliedKey] = true;
    if (changed) {
      state.activity.unshift({
        id: `activity-clear-month-${Date.now()}`,
        when: new Date().toISOString(),
        actor: 'system',
        action: 'Month cleared',
        detail: `${formatMonth(normalizedMonth)} data was cleared across all buildings.`
      });
      state.activity = state.activity.slice(0, 100);
    }
    return changed;
  }

  function pruneRemovedBuildingsFromState(state) {
    const removedNames = new Set(Array.from(REMOVED_BUILDING_NAMES));
    state.buildings.forEach((building) => {
      if (isRemovedBuilding(building)) removedNames.add(String(building.name || '').trim());
    });
    state.tenants.forEach((tenant) => {
      if (removedNames.has(String(tenant.building || '').trim())) removedNames.add(String(tenant.building || '').trim());
    });
    if (!removedNames.size) return false;

    const removedTenantIds = new Set(
      state.tenants
        .filter((tenant) => removedNames.has(String(tenant.building || '').trim()))
        .map((tenant) => tenant.id)
    );
    let changed = false;

    const nextBuildings = state.buildings.filter((building) => !isRemovedBuilding(building));
    if (nextBuildings.length !== state.buildings.length) {
      state.buildings = nextBuildings;
      changed = true;
    }
    const nextTenants = state.tenants.filter((tenant) => !removedNames.has(String(tenant.building || '').trim()));
    if (nextTenants.length !== state.tenants.length) {
      state.tenants = nextTenants;
      changed = true;
    }
    const nextPayments = removeTenantLinkedPaymentsExceptAdvance(state.payments, removedTenantIds);
    if (nextPayments.length !== state.payments.length) {
      state.payments = nextPayments;
      changed = true;
    }

    if (clearTenantMonthOverrideBucket(state.actualRentOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.vacantAmountOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.paidOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.carryOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.notesOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantIdentityMonthOverrideBucket(state.tenantIdentityOverrides, removedTenantIds, '')) changed = true;
    ensureTenantOrderOverridesState(state);
    removedNames.forEach((buildingName) => {
      if (state.tenantOrderOverrides[buildingName]) {
        delete state.tenantOrderOverrides[buildingName];
        changed = true;
      }
      if (clearBuildingMonthOldDueNotes(state, buildingName, '')) changed = true;
    });

    if (changed) {
      state.tenants.forEach((tenant, index) => {
        tenant.seedOrder = index;
      });
      state.activity.unshift({
        id: `activity-removed-building-${Date.now()}`,
        when: new Date().toISOString(),
        actor: 'system',
        action: 'Building removed',
        detail: `${Array.from(removedNames).join(', ')} was removed from the workspace.`
      });
      state.activity = state.activity.slice(0, 100);
    }
    return changed;
  }

  function forceUnit5FebruaryUnpaid(state) {
    const targetMonth = '2026-02';
    const targetBuildings = new Set(['حولي 06-161', 'حولي 161-06']);
    let changed = false;
    state.tenants.forEach((tenant) => {
      if (!tenant || tenant.isVacant || tenant.isArchived) return;
      if (!targetBuildings.has(String(tenant.building || '').trim())) return;
      if (String(tenant.unit || '').trim() !== '5') return;
      const moveInMonth = getMonthKeyFromDate(tenant.moveInDate || '');
      const contractStartMonth = getMonthKeyFromDate(tenant.contractStart || '');
      if (moveInMonth !== '2026-01' || contractStartMonth !== targetMonth) return;
      const hasRealFebruaryPayment = state.payments.some((payment) => (
        String(payment.tenantId || '').trim() === String(tenant.id || '').trim()
        && String(payment.rentMonth || '').trim() === targetMonth
        && String(payment.method || '').trim() !== 'Due payment'
        && String(payment.method || '').trim() !== 'Advance'
      ));
      if (hasRealFebruaryPayment) return;
      if (getPaidOverride(state, tenant.id, targetMonth) === 0) return;
      setPaidOverride(state, tenant.id, targetMonth, 0);
      tenant.lastPaidMonth = '2026-01';
      changed = true;
    });
    return changed;
  }

  function renameBuildingAcrossState(state, previousName, nextName) {
    ensureTenantOrderOverridesState(state);
    ensureOldTenantDuePaidNotesState(state);
    const fromName = String(previousName || '').trim();
    const toName = String(nextName || '').trim();
    if (!fromName || !toName || fromName === toName) return false;
    let changed = false;

    state.buildings.forEach((building) => {
      if (String(building.name || '').trim() !== fromName) return;
      building.name = toName;
      changed = true;
    });
    state.tenants.forEach((tenant) => {
      if (String(tenant.building || '').trim() !== fromName) return;
      tenant.building = toName;
      changed = true;
    });

    if (state.tenantOrderOverrides[fromName]) {
      const existing = state.tenantOrderOverrides[toName];
      state.tenantOrderOverrides[toName] = Object.assign({}, state.tenantOrderOverrides[fromName], existing || {});
      delete state.tenantOrderOverrides[fromName];
      changed = true;
    }
    if (state.oldTenantDuePaidNotes[fromName]) {
      const existing = state.oldTenantDuePaidNotes[toName];
      state.oldTenantDuePaidNotes[toName] = Object.assign({}, state.oldTenantDuePaidNotes[fromName], existing || {});
      delete state.oldTenantDuePaidNotes[fromName];
      changed = true;
    }

    return changed;
  }

  function normalizeHawali16105Name(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'normalize-hawali-161-05-name';
    if (state.appliedFixes[appliedKey]) return false;
    let changed = false;
    changed = renameBuildingAcrossState(state, 'حولي 05-161', 'حولي 161-05') || changed;
    changed = renameBuildingAcrossState(state, '05-161 حولي', 'حولي 161-05') || changed;
    state.appliedFixes[appliedKey] = true;
    return changed;
  }


  function removeHawali06161Unit6(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'remove-hawali-06-161-unit-6';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = 'حولي 06-161';
    const targetUnit = '6';
    const removedTenantIds = new Set(
      state.tenants
        .filter((tenant) => (
          String(tenant.building || '').trim() === targetBuilding
          && String(tenant.unit || '').trim() === targetUnit
        ))
        .map((tenant) => String(tenant.id || '').trim())
        .filter(Boolean)
    );
    let changed = false;

    if (removedTenantIds.size) {
      const nextTenants = state.tenants.filter((tenant) => !removedTenantIds.has(String(tenant.id || '').trim()));
      if (nextTenants.length !== state.tenants.length) {
        state.tenants = nextTenants;
        changed = true;
      }
      const nextPayments = removeTenantLinkedPaymentsExceptAdvance(state.payments, removedTenantIds);
      if (nextPayments.length !== state.payments.length) {
        state.payments = nextPayments;
        changed = true;
      }
      if (clearTenantMonthOverrideBucket(state.actualRentOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.vacantAmountOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.paidOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.carryOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.notesOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantIdentityMonthOverrideBucket(state.tenantIdentityOverrides, removedTenantIds, '')) changed = true;
    }

    ensureTenantOrderOverridesState(state);
    const buildingBucket = state.tenantOrderOverrides[targetBuilding];
    if (buildingBucket && typeof buildingBucket === 'object') {
      Object.keys(buildingBucket).forEach((monthKey) => {
        const orderedIds = Array.isArray(buildingBucket[monthKey]) ? buildingBucket[monthKey] : [];
        const nextOrderedIds = orderedIds.filter((id) => {
          const normalizedId = String(id || '').trim().toUpperCase();
          return !normalizedId.endsWith('::6') && !normalizedId.endsWith('::UNIT::6');
        });
        if (nextOrderedIds.length !== orderedIds.length) {
          buildingBucket[monthKey] = nextOrderedIds;
          changed = true;
        }
        if (!buildingBucket[monthKey].length) delete buildingBucket[monthKey];
      });
      if (!Object.keys(buildingBucket).length) delete state.tenantOrderOverrides[targetBuilding];
    }

    if (changed) {
      state.tenants.forEach((tenant, index) => {
        tenant.seedOrder = index;
      });
      state.activity.unshift({
        id: `activity-remove-16106-unit6-${Date.now()}`,
        when: new Date().toISOString(),
        actor: 'system',
        action: 'Unit removed',
        detail: 'حولي 06-161 unit 6 rows were removed from the workspace.'
      });
      state.activity = state.activity.slice(0, 100);
    }

    state.appliedFixes[appliedKey] = true;
    return changed;
  }

  function restoreHawali06161Unit6(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'restore-hawali-06-161-unit-6';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = 'حولي 06-161';
    const targetUnit = '6';
    const existingUnitRows = state.tenants.filter((tenant) => (
      String(tenant.building || '').trim() === targetBuilding
      && String(tenant.unit || '').trim() === targetUnit
      && !tenant.isArchived
    ));
    if (existingUnitRows.length) {
      state.appliedFixes[appliedKey] = true;
      return false;
    }

    const buildingTenants = state.tenants.filter((tenant) => String(tenant.building || '').trim() === targetBuilding);
    const nextTenant = {
      id: `restore-hawali-06-161-unit-6-${Date.now()}`,
      building: targetBuilding,
      unit: targetUnit,
      floor: '',
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
      dueDay: 20,
      contractStart: '',
      contractEnd: '',
      contractRent: 0,
      discount: 0,
      actualRent: 0,
      previousDue: 0,
      notes: 'Vacant unit',
      vacatedOn: '',
      prepaidNextMonth: 0,
      seedOrder: buildingTenants.length,
      lastPaidMonth: ''
    };

    state.tenants.push(nextTenant);

    const importedOrderMap = getBuildingTemplateOrderMap(targetBuilding);
    const targetTenants = state.tenants
      .filter((tenant) => tenant.building === targetBuilding)
      .sort((a, b) => {
        if (importedOrderMap) {
          const aIndex = importedOrderMap.has(getTenantUnitLookupKey(a))
            ? importedOrderMap.get(getTenantUnitLookupKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bIndex = importedOrderMap.has(getTenantUnitLookupKey(b))
            ? importedOrderMap.get(getTenantUnitLookupKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant, index) => Object.assign(tenant, { seedOrder: index }));
    const otherTenants = state.tenants.filter((tenant) => tenant.building !== targetBuilding);
    state.tenants = otherTenants.concat(targetTenants);

    state.activity.unshift({
      id: `activity-restore-16106-unit6-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Unit restored',
      detail: 'حولي 06-161 unit 6 was restored as a fresh vacant row.'
    });
    state.activity = state.activity.slice(0, 100);
    state.appliedFixes[appliedKey] = true;
    return true;
  }

  function restoreHawali8587MissingRows(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'restore-hawali-85-8-7-missing-rows-v3';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = 'حولي 85 8+7';
    const rowsToEnsure = [
      { unit: 'شقة 6', floor: 'الثانى' },
      { unit: 'شقة 9', floor: 'الثالث' },
      { unit: 'شقة 13', floor: 'الخامس' },
      { unit: 'شقة 18', floor: 'السادس' },
      { unit: 'شقة 20', floor: 'السابع' },
      { unit: 'شقة 21', floor: 'السابع' },
      { unit: 'سرداب', floor: 'السرداب' }
    ];

    const liveRows = state.tenants.filter((tenant) => (
      String(tenant.building || '').trim() === targetBuilding
      && !tenant.isArchived
    ));
    const existingKeys = new Set(liveRows.map((tenant) => getTenantOrderKey(tenant)).filter(Boolean));
    const importedOrderMap = getBuildingTemplateOrderMap(targetBuilding);
    let changed = false;

    rowsToEnsure.forEach((row) => {
      const orderKey = getTenantOrderKey({ building: targetBuilding, unit: row.unit, floor: row.floor });
      if (existingKeys.has(orderKey)) return;
      state.tenants.push({
        id: `restore-hawali-85-8-7-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        building: targetBuilding,
        unit: row.unit,
        floor: row.floor,
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
        dueDay: 20,
        contractStart: '',
        contractEnd: '',
        contractRent: 0,
        discount: 0,
        actualRent: 0,
        previousDue: 0,
        notes: 'Vacant unit',
        vacatedOn: '',
        prepaidNextMonth: 0,
        seedOrder: state.tenants.length,
        lastPaidMonth: ''
      });
      existingKeys.add(orderKey);
      changed = true;
    });

    const originalBuildingTenants = state.tenants.filter((tenant) => tenant.building === targetBuilding);
    const buildingTenants = originalBuildingTenants
      .slice()
      .sort((a, b) => {
        if (importedOrderMap) {
          const aIndex = importedOrderMap.has(getTenantUnitLookupKey(a))
            ? importedOrderMap.get(getTenantUnitLookupKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bIndex = importedOrderMap.has(getTenantUnitLookupKey(b))
            ? importedOrderMap.get(getTenantUnitLookupKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant, index) => Object.assign(tenant, { seedOrder: index }));
    const orderChanged = buildingTenants.some((tenant, index) => originalBuildingTenants[index] !== tenant);

    if (changed || orderChanged) {
      const otherTenants = state.tenants.filter((tenant) => tenant.building !== targetBuilding);
      state.tenants = otherTenants.concat(buildingTenants);
      state.activity.unshift({
        id: `activity-restore-8587-rows-${Date.now()}`,
        when: new Date().toISOString(),
        actor: 'system',
        action: changed ? 'Rows restored' : 'Rows aligned',
        detail: changed
          ? 'حولي 85 8+7 missing rows were restored from source.'
          : 'حولي 85 8+7 row order was realigned to the building template.'
      });
      state.activity = state.activity.slice(0, 100);
    }

    state.appliedFixes[appliedKey] = true;
    return changed || orderChanged;
  }

  function restoreHawali8532BasementRow(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'restore-hawali-85-3-2-missing-rows-v2';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = 'حولي 85 3+2';
    const rowsToEnsure = [
      { unit: 'شقة 8', floor: '' },
      { unit: 'سرداب', floor: 'السرداب' }
    ];
    const liveRows = state.tenants.filter((tenant) => (
      !tenant.isArchived
      && String(tenant.building || '').trim() === targetBuilding
    ));
    const existingKeys = new Set(liveRows.map((tenant) => getTenantOrderKey(tenant)).filter(Boolean));
    let changed = false;

    rowsToEnsure.forEach((row) => {
      const orderKey = getTenantOrderKey({ building: targetBuilding, unit: row.unit, floor: row.floor });
      if (existingKeys.has(orderKey)) return;
      state.tenants.push({
        id: `restore-hawali-85-3-2-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        building: targetBuilding,
        unit: row.unit,
        floor: row.floor,
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
        dueDay: 20,
        contractStart: '',
        contractEnd: '',
        contractRent: 0,
        discount: 0,
        actualRent: 0,
        previousDue: 0,
        notes: 'Vacant unit',
        vacatedOn: '',
        prepaidNextMonth: 0,
        seedOrder: state.tenants.length,
        lastPaidMonth: ''
      });
      existingKeys.add(orderKey);
      changed = true;
    });

    if (!changed) {
      state.appliedFixes[appliedKey] = true;
      return false;
    }

    const importedOrderMap = getBuildingTemplateOrderMap(targetBuilding);
    const buildingTenants = state.tenants
      .filter((tenant) => tenant.building === targetBuilding)
      .sort((a, b) => {
        if (importedOrderMap) {
          const aIndex = importedOrderMap.has(getTenantUnitLookupKey(a))
            ? importedOrderMap.get(getTenantUnitLookupKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bIndex = importedOrderMap.has(getTenantUnitLookupKey(b))
            ? importedOrderMap.get(getTenantUnitLookupKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant, index) => Object.assign(tenant, { seedOrder: index }));
    const otherTenants = state.tenants.filter((tenant) => tenant.building !== targetBuilding);
    state.tenants = otherTenants.concat(buildingTenants);
    state.activity.unshift({
      id: `activity-restore-8532-rows-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Rows restored',
      detail: 'حولي 85 3+2 missing rows were restored from source.'
    });
    state.activity = state.activity.slice(0, 100);
    state.appliedFixes[appliedKey] = true;
    return true;
  }

  function restoreHawali1646BasementRow(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'remove-hawali-16-46-vacant-restaurant-row-v1';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = '???? 16-46';
    const removedLookupKey = getTenantUnitLookupKey({ unit: '??????', floor: '?????' });
    const removedIds = new Set(
      state.tenants
        .filter((tenant) => (
          !tenant.isArchived
          && !!tenant.isVacant
          && String(tenant.building || '').trim() === targetBuilding
          && String(tenant.unit || '').trim() === '??????'
          && normalizeFloorLabel(tenant.floor) === normalizeFloorLabel('?????')
        ))
        .map((tenant) => String(tenant.id || '').trim())
        .filter(Boolean)
    );

    if (!removedIds.size) {
      state.appliedFixes[appliedKey] = true;
      return false;
    }

    state.tenants = state.tenants.filter((tenant) => !removedIds.has(String(tenant && tenant.id || '').trim()));
    if (state.tenantOrderOverrides && state.tenantOrderOverrides[targetBuilding]) {
      Object.keys(state.tenantOrderOverrides[targetBuilding]).forEach((monthKey) => {
        const entries = Array.isArray(state.tenantOrderOverrides[targetBuilding][monthKey]) ? state.tenantOrderOverrides[targetBuilding][monthKey] : [];
        state.tenantOrderOverrides[targetBuilding][monthKey] = entries.filter((entry) => {
          const normalizedEntry = String(entry || '').trim();
          return !removedIds.has(normalizedEntry) && normalizedEntry !== (targetBuilding + '::' + removedLookupKey);
        });
      });
    }

    state.appliedFixes[appliedKey] = true;
    return true;
  }



  function restoreHawali175BasementRow(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'restore-hawali-175-basement-row-v2';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = 'حولي 175';
    const basementOrderKey = getTenantOrderKey({ building: targetBuilding, unit: 'سرداب', floor: 'السرداب' });
    const hasBasementRow = state.tenants.some((tenant) => (
      !tenant.isArchived
      && String(tenant.building || '').trim() === targetBuilding
      && getTenantOrderKey(tenant) === basementOrderKey
    ));
    if (hasBasementRow) {
      state.appliedFixes[appliedKey] = true;
      return false;
    }

    state.tenants.push({
      id: `restore-hawali-175-basement-${Date.now()}`,
      building: targetBuilding,
      unit: 'سرداب',
      floor: 'السرداب',
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
      dueDay: 20,
      contractStart: '',
      contractEnd: '',
      contractRent: 0,
      discount: 0,
      actualRent: 0,
      previousDue: 0,
      paidCurrent: 0,
      prepaidNextMonth: 0,
      notes: 'Vacant unit',
      vacatedOn: '',
      seedOrder: state.tenants.length,
      lastPaidMonth: ''
    });

    const importedOrderMap = getBuildingTemplateOrderMap(targetBuilding);
    const buildingTenants = state.tenants
      .filter((tenant) => tenant.building === targetBuilding)
      .sort((a, b) => {
        if (importedOrderMap) {
          const aIndex = importedOrderMap.has(getTenantUnitLookupKey(a))
            ? importedOrderMap.get(getTenantUnitLookupKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bIndex = importedOrderMap.has(getTenantUnitLookupKey(b))
            ? importedOrderMap.get(getTenantUnitLookupKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant, index) => Object.assign(tenant, { seedOrder: index }));
    const otherTenants = state.tenants.filter((tenant) => tenant.building !== targetBuilding);
    state.tenants = otherTenants.concat(buildingTenants);
    state.activity.unshift({
      id: `activity-restore-175-basement-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Row restored',
      detail: 'حولي 175 basement row was restored from source.'
    });
    state.activity = state.activity.slice(0, 100);
    state.appliedFixes[appliedKey] = true;
    return true;
  }

  function repairHawali362DuplicateRows(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'repair-hawali-36-2-duplicate-rows-v5';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = 'حولي 36-2';
    const templateOrderMap = getBuildingTemplateOrderMap(targetBuilding);
    const removedTenantIds = new Set();
    let changed = false;

    const liveRows = state.tenants.filter((tenant) => (
      !tenant.isArchived
      && String(tenant.building || '').trim() === targetBuilding
    ));
    const preferredByLookupKey = new Map();
    liveRows.forEach((tenant) => {
      const unit = String(tenant.unit || '').trim();
      const name = String(tenant.name || '').trim();
      const lookupKey = getTenantUnitLookupKey(tenant);
      if (!unit || isSummaryRowLike(unit) || isSummaryRowLike(name)) {
        removedTenantIds.add(String(tenant.id || '').trim());
        return;
      }
      const current = preferredByLookupKey.get(lookupKey);
      if (!current) {
        preferredByLookupKey.set(lookupKey, tenant);
        return;
      }
      const currentName = String(current.name || '').trim();
      const currentIsNamed = !!currentName && currentName !== 'Available unit';
      const tenantIsNamed = !!name && name !== 'Available unit';
      const currentIsRestore = String(current.id || '').trim().startsWith('restore-hawali-36-2-');
      const tenantIsRestore = String(tenant.id || '').trim().startsWith('restore-hawali-36-2-');
      const keepCurrent = (
        (currentIsNamed && !tenantIsNamed)
        || (!currentIsRestore && tenantIsRestore)
        || Number(current.seedOrder || 0) <= Number(tenant.seedOrder || 0)
      );
      if (keepCurrent) {
        removedTenantIds.add(String(tenant.id || '').trim());
      } else {
        removedTenantIds.add(String(current.id || '').trim());
        preferredByLookupKey.set(lookupKey, tenant);
      }
    });

    if (removedTenantIds.size) {
      state.tenants = state.tenants.filter((tenant) => !removedTenantIds.has(String(tenant.id || '').trim()));
      state.payments = removeTenantLinkedPaymentsExceptAdvance(state.payments, removedTenantIds);
      if (clearTenantMonthOverrideBucket(state.actualRentOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.paidOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.carryOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.notesOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantIdentityMonthOverrideBucket(state.tenantIdentityOverrides, removedTenantIds, '')) changed = true;
      changed = true;
    }

    const originalBuildingRows = state.tenants.filter((tenant) => tenant.building === targetBuilding);
    const buildingRows = originalBuildingRows
      .slice()
      .sort((a, b) => {
        if (templateOrderMap) {
          const aIndex = templateOrderMap.has(getTenantUnitLookupKey(a))
            ? templateOrderMap.get(getTenantUnitLookupKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bIndex = templateOrderMap.has(getTenantUnitLookupKey(b))
            ? templateOrderMap.get(getTenantUnitLookupKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant, index) => Object.assign(tenant, { seedOrder: index }));
    const orderChanged = buildingRows.some((tenant, index) => originalBuildingRows[index] !== tenant);
    if (changed || orderChanged) {
      const otherRows = state.tenants.filter((tenant) => tenant.building !== targetBuilding);
      state.tenants = otherRows.concat(buildingRows);
      changed = true;
    }

    state.appliedFixes[appliedKey] = true;
    return changed;
  }

  function removeHawali362Unit53(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'remove-hawali-36-2-unit-53-v2';
    if (state.appliedFixes[appliedKey]) return false;

    const targetBuilding = 'حولي 36-2';
    const removedTenantIds = new Set(
      state.tenants
        .filter((tenant) => (
          !tenant.isArchived
          && String(tenant.building || '').trim() === targetBuilding
          && String(tenant.unit || '').trim() === '53'
        ))
        .map((tenant) => String(tenant.id || '').trim())
        .filter(Boolean)
    );

    state.appliedFixes[appliedKey] = true;
    if (!removedTenantIds.size) return false;

    let changed = false;
    state.tenants = state.tenants.filter((tenant) => !removedTenantIds.has(String(tenant.id || '').trim()));
    state.payments = removeTenantLinkedPaymentsExceptAdvance(state.payments, removedTenantIds);
    if (clearTenantMonthOverrideBucket(state.actualRentOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.vacantAmountOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.paidOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.carryOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantMonthOverrideBucket(state.notesOverrides, removedTenantIds, '')) changed = true;
    if (clearTenantIdentityMonthOverrideBucket(state.tenantIdentityOverrides, removedTenantIds, '')) changed = true;
    ensureTenantOrderOverridesState(state);
    const buildingBucket = state.tenantOrderOverrides[targetBuilding];
    if (buildingBucket && typeof buildingBucket === 'object') {
      Object.keys(buildingBucket).forEach((monthKey) => {
        const orderedIds = Array.isArray(buildingBucket[monthKey]) ? buildingBucket[monthKey] : [];
        const nextOrderedIds = orderedIds.filter((id) => !removedTenantIds.has(String(id || '').trim()));
        if (nextOrderedIds.length !== orderedIds.length) {
          buildingBucket[monthKey] = nextOrderedIds;
          changed = true;
        }
        if (!buildingBucket[monthKey].length) delete buildingBucket[monthKey];
      });
      if (!Object.keys(buildingBucket).length) delete state.tenantOrderOverrides[targetBuilding];
    }
    return true;
  }


  function repairHawali16105RowCount(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'repair-hawali-161-05-row-count-v9';
    if (state.appliedFixes[appliedKey]) return false;

    const canonicalBuilding = 'حولي 161-05';
    const numericUnits = new Set(Array.from({ length: 40 }, (_, index) => String(index + 1)));
    const specialRows = [
      { unit: 'محل', floor: 'الارضي' },
      { unit: 'سرداب', floor: 'السرداب' },
      { unit: 'غرفة', floor: 'السرداب' }
    ];
    const validSpecialLookupKeys = new Set(specialRows.map((row) => getTenantUnitLookupKey(row)));
    const isTargetBuilding = (value) => {
      const label = String(value || '').trim();
      return label.includes('161-05') || label.includes('05-161');
    };
    let changed = false;

    state.buildings.forEach((building) => {
      if (!isTargetBuilding(building.name) || building.name === canonicalBuilding) return;
      building.name = canonicalBuilding;
      changed = true;
    });
    state.tenants.forEach((tenant) => {
      if (!isTargetBuilding(tenant.building) || tenant.building === canonicalBuilding) return;
      tenant.building = canonicalBuilding;
      changed = true;
    });
    ensureTenantOrderOverridesState(state);
    Object.keys(state.tenantOrderOverrides).forEach((buildingName) => {
      if (!isTargetBuilding(buildingName) || buildingName === canonicalBuilding) return;
      state.tenantOrderOverrides[canonicalBuilding] = Object.assign(
        {},
        state.tenantOrderOverrides[buildingName],
        state.tenantOrderOverrides[canonicalBuilding] || {}
      );
      delete state.tenantOrderOverrides[buildingName];
      changed = true;
    });
    ensureOldTenantDuePaidNotesState(state);
    Object.keys(state.oldTenantDuePaidNotes).forEach((buildingName) => {
      if (!isTargetBuilding(buildingName) || buildingName === canonicalBuilding) return;
      state.oldTenantDuePaidNotes[canonicalBuilding] = Object.assign(
        {},
        state.oldTenantDuePaidNotes[buildingName],
        state.oldTenantDuePaidNotes[canonicalBuilding] || {}
      );
      delete state.oldTenantDuePaidNotes[buildingName];
      changed = true;
    });

    const removedTenantIds = new Set();
    const seenLookupKeys = new Set();
    state.tenants
      .filter((tenant) => !tenant.isArchived && isTargetBuilding(tenant.building))
      .sort((a, b) => {
        const aIsRepair = String(a.id || '').trim().startsWith('repair-hawali-161-05-');
        const bIsRepair = String(b.id || '').trim().startsWith('repair-hawali-161-05-');
        if (aIsRepair !== bIsRepair) return aIsRepair ? 1 : -1;
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .forEach((tenant) => {
        const tenantId = String(tenant.id || '').trim();
        const lookupKey = getTenantUnitLookupKey(tenant);
        const unit = String(tenant.unit || '').trim();
        const isValidNumeric = numericUnits.has(unit);
        const isValidSpecial = validSpecialLookupKeys.has(lookupKey);
        if (!isValidNumeric && !isValidSpecial) {
          removedTenantIds.add(tenantId);
          return;
        }
        const dedupeKey = isValidNumeric ? `UNIT::${unit}` : lookupKey;
        if (seenLookupKeys.has(dedupeKey)) {
          removedTenantIds.add(tenantId);
          return;
        }
        seenLookupKeys.add(dedupeKey);
      });

    if (removedTenantIds.size) {
      state.tenants = state.tenants.filter((tenant) => !removedTenantIds.has(String(tenant.id || '').trim()));
      state.payments = removeTenantLinkedPaymentsExceptAdvance(state.payments, removedTenantIds);
      if (clearTenantMonthOverrideBucket(state.actualRentOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.vacantAmountOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.paidOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.carryOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantMonthOverrideBucket(state.notesOverrides, removedTenantIds, '')) changed = true;
      if (clearTenantIdentityMonthOverrideBucket(state.tenantIdentityOverrides, removedTenantIds, '')) changed = true;
      changed = true;
    }

    const liveLookupKeys = new Set(
      state.tenants
        .filter((tenant) => !tenant.isArchived && isTargetBuilding(tenant.building))
        .map((tenant) => getTenantUnitLookupKey(tenant))
        .filter(Boolean)
    );
    const liveNumericUnits = new Set(
      state.tenants
        .filter((tenant) => !tenant.isArchived && isTargetBuilding(tenant.building))
        .map((tenant) => String(tenant.unit || '').trim())
        .filter((unit) => numericUnits.has(unit))
    );
    const missingNumericUnits = Array.from(numericUnits).filter((unit) => !liveNumericUnits.has(unit));
    if (missingNumericUnits.length) {
      missingNumericUnits.forEach((unit) => {
        state.tenants.push({
          id: `repair-hawali-161-05-${unit}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          building: canonicalBuilding,
          unit,
          floor: '',
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
          dueDay: 20,
          contractStart: '',
          contractEnd: '',
          contractRent: 0,
          discount: 0,
          actualRent: 0,
          previousDue: 0,
          paidCurrent: 0,
          prepaidNextMonth: 0,
          notes: 'Vacant unit',
          vacatedOn: '',
          seedOrder: state.tenants.length,
          lastPaidMonth: ''
        });
      });
      changed = true;
    }

    const refreshedLookupKeys = new Set(
      state.tenants
        .filter((tenant) => !tenant.isArchived && isTargetBuilding(tenant.building))
        .map((tenant) => getTenantUnitLookupKey(tenant))
        .filter(Boolean)
    );
    specialRows.forEach((row) => {
      if (refreshedLookupKeys.has(getTenantUnitLookupKey(row))) return;
      state.tenants.push({
        id: `repair-hawali-161-05-special-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        building: canonicalBuilding,
        unit: row.unit,
        floor: row.floor,
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
        dueDay: 20,
        contractStart: '',
        contractEnd: '',
        contractRent: 0,
        discount: 0,
        actualRent: 0,
        previousDue: 0,
        paidCurrent: 0,
        prepaidNextMonth: 0,
        notes: 'Vacant unit',
        vacatedOn: '',
        seedOrder: state.tenants.length,
        lastPaidMonth: ''
      });
      changed = true;
    });

    const templateOrderMap = getBuildingTemplateOrderMap(canonicalBuilding);
    const specialOrder = new Map([
      [getTenantUnitLookupKey({ unit: '???', floor: '??????' }), -3],
      [getTenantUnitLookupKey({ unit: '?????', floor: '???????' }), -2],
      [getTenantUnitLookupKey({ unit: '????', floor: '???????' }), -1]
    ]);
    const originalBuildingTenants = state.tenants.filter((tenant) => isTargetBuilding(tenant.building));
    const buildingTenants = originalBuildingTenants
      .slice()
      .sort((a, b) => {
        const aSpecial = specialOrder.has(getTenantUnitLookupKey(a)) ? specialOrder.get(getTenantUnitLookupKey(a)) : null;
        const bSpecial = specialOrder.has(getTenantUnitLookupKey(b)) ? specialOrder.get(getTenantUnitLookupKey(b)) : null;
        if (aSpecial != null || bSpecial != null) {
          if (aSpecial == null) return 1;
          if (bSpecial == null) return -1;
          if (aSpecial !== bSpecial) return aSpecial - bSpecial;
        }
        if (templateOrderMap) {
          const aIndex = templateOrderMap.has(getTenantUnitLookupKey(a))
            ? templateOrderMap.get(getTenantUnitLookupKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bIndex = templateOrderMap.has(getTenantUnitLookupKey(b))
            ? templateOrderMap.get(getTenantUnitLookupKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        return Number(a.seedOrder || 0) - Number(b.seedOrder || 0);
      })
      .map((tenant, index) => Object.assign(tenant, {
        building: canonicalBuilding,
        seedOrder: index
      }));
    const orderChanged = buildingTenants.some((tenant, index) => originalBuildingTenants[index] !== tenant);

    if (changed || orderChanged) {
      const otherTenants = state.tenants.filter((tenant) => !isTargetBuilding(tenant.building));
      state.tenants = otherTenants.concat(buildingTenants);
      state.activity.unshift({
        id: `activity-repair-16105-rows-1773262693413`,
        when: new Date().toISOString(),
        actor: 'system',
        action: 'Rows repaired',
        detail: '???? 161-05 was repaired to keep units 1-40 plus ??? / ????? / ????.'
      });
      state.activity = state.activity.slice(0, 100);
    }

    state.appliedFixes[appliedKey] = true;
    return changed;
  }

  function moveFahaheelShabakaPrepaidFromBefore(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'move-fahaheel-shabaka-prepaid-from-before-v3';
    if (state.appliedFixes[appliedKey]) return false;

    const currentMonth = getDefaultActiveMonthKey();
    const nextMonth = addMonths(currentMonth, 1);
    const previousMonthDate = (() => {
      const date = monthStart(currentMonth);
      date.setDate(0);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    })();

    const targetAmount = 597.87;
    const targetUnit = 'سطح';
    const targetName = 'شبكة';
    const targetSourceId = 'fahaheel-سطح';
    const matchingTenants = state.tenants
      .filter((tenant) => !tenant.isArchived)
      .filter((tenant) => String(tenant.building || '').trim().toLowerCase() === 'fahaheel')
      .filter((tenant) => (
        String(tenant.unit || '').trim() === targetUnit
        || String(tenant.name || '').trim() === targetName
        || String(tenant.id || '').trim() === targetSourceId
        || String(tenant.sourceTenantId || '').trim() === targetSourceId
      ));
    const tenantIds = new Set(matchingTenants.map((tenant) => String(tenant.id || '').trim()).filter(Boolean));

    if (!tenantIds.size) {
      state.appliedFixes[appliedKey] = true;
      return false;
    }

    let changed = false;
    let retained = false;
    state.payments = (state.payments || []).filter((payment) => {
      const tenantId = String(payment && payment.tenantId || '').trim();
      if (!tenantIds.has(tenantId)) return true;
      if (String(payment && payment.method || '').trim() !== 'Advance') return true;
      const rentMonth = String(payment && payment.rentMonth || '').trim();
      if (rentMonth !== currentMonth && rentMonth !== nextMonth) return true;
      if (!retained) {
        payment.rentMonth = currentMonth;
        payment.date = previousMonthDate;
        payment.amount = targetAmount;
        retained = true;
        changed = true;
        return true;
      }
      changed = true;
      return false;
    });

    if (!retained) {
      const targetTenantId = Array.from(tenantIds)[0];
      state.payments.push({
        id: `repair-fahaheel-shabaka-prepaid-${Date.now()}`,
        tenantId: targetTenantId,
        amount: targetAmount,
        date: previousMonthDate,
        rentMonth: currentMonth,
        method: 'Advance',
        note: 'Prepaid from before repair'
      });
      changed = true;
    }

    state.appliedFixes[appliedKey] = true;
    return changed;
  }

  function getFutureMonthKeysInState(state) {
    const baselineMonth = getDefaultActiveMonthKey();
    const monthKeys = new Set();

    const collectMonth = (monthKey) => {
      const normalizedMonth = String(monthKey || '').trim();
      if (!normalizedMonth) return;
      if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) return;
      if (compareMonthKeys(normalizedMonth, baselineMonth) <= 0) return;
      monthKeys.add(normalizedMonth);
    };

    (state.payments || []).forEach((payment) => {
      collectMonth(payment && payment.rentMonth);
      collectMonth(getMonthKeyFromDate(String(payment && payment.date || '').trim()));
    });

    [
      state.actualRentOverrides,
      state.vacantAmountOverrides,
      state.paidOverrides,
      state.carryOverrides,
      state.notesOverrides
    ].forEach((bucket) => {
      if (!bucket || typeof bucket !== 'object') return;
      Object.keys(bucket).forEach((tenantId) => {
        const monthBucket = bucket[tenantId];
        if (!monthBucket || typeof monthBucket !== 'object') return;
        Object.keys(monthBucket).forEach(collectMonth);
      });
    });

    if (state.tenantIdentityOverrides && typeof state.tenantIdentityOverrides === 'object') {
      Object.keys(state.tenantIdentityOverrides).forEach((tenantId) => {
        const fieldBucket = state.tenantIdentityOverrides[tenantId];
        if (!fieldBucket || typeof fieldBucket !== 'object') return;
        Object.keys(fieldBucket).forEach((fieldName) => {
          const monthBucket = fieldBucket[fieldName];
          if (!monthBucket || typeof monthBucket !== 'object') return;
          Object.keys(monthBucket).forEach(collectMonth);
        });
      });
    }

    if (state.tenantOrderOverrides && typeof state.tenantOrderOverrides === 'object') {
      Object.keys(state.tenantOrderOverrides).forEach((buildingName) => {
        const buildingBucket = state.tenantOrderOverrides[buildingName];
        if (!buildingBucket || typeof buildingBucket !== 'object') return;
        Object.keys(buildingBucket).forEach(collectMonth);
      });
    }

    if (state.oldTenantDuePaidNotes && typeof state.oldTenantDuePaidNotes === 'object') {
      Object.keys(state.oldTenantDuePaidNotes).forEach((buildingName) => {
        const buildingBucket = state.oldTenantDuePaidNotes[buildingName];
        if (!buildingBucket || typeof buildingBucket !== 'object') return;
        Object.keys(buildingBucket).forEach((unitKey) => {
          const monthBucket = buildingBucket[unitKey];
          if (!monthBucket || typeof monthBucket !== 'object') return;
          Object.keys(monthBucket).forEach(collectMonth);
        });
      });
    }

    return Array.from(monthKeys).sort(compareMonthKeys);
  }

  function clearAllFutureMonthData(state) {
    const futureMonths = getFutureMonthKeysInState(state);
    return futureMonths.reduce((changed, monthKey) => clearGlobalMonthData(state, monthKey) || changed, false);
  }

  function clearLegacyTenantIdOrderOverrides(state) {
    ensureTenantOrderOverridesState(state);
    let changed = false;
    Object.keys(state.tenantOrderOverrides).forEach((buildingName) => {
      const buildingBucket = state.tenantOrderOverrides[buildingName];
      if (!buildingBucket || typeof buildingBucket !== 'object') return;
      Object.keys(buildingBucket).forEach((monthKey) => {
        const entries = Array.isArray(buildingBucket[monthKey]) ? buildingBucket[monthKey] : [];
        const sanitizedEntries = entries
          .map((entry) => String(entry || '').trim())
          .filter((entry) => {
            if (!entry) return false;
            if (typeof isCanonicalTenantOrderKey === 'function' && isCanonicalTenantOrderKey(entry)) return true;
            return typeof canUseUnitOnlyOrderFallback === 'function'
              && canUseUnitOnlyOrderFallback(buildingName)
              && entry.includes('::UNIT::');
          })
          .filter((entry, index, list) => list.indexOf(entry) === index);
        if (sanitizedEntries.length !== entries.length || sanitizedEntries.some((entry, index) => entry !== String(entries[index] || '').trim())) {
          changed = true;
        }
        if (sanitizedEntries.length) {
          buildingBucket[monthKey] = sanitizedEntries;
        } else {
          delete buildingBucket[monthKey];
          changed = true;
        }
      });
      if (!Object.keys(buildingBucket).length) {
        delete state.tenantOrderOverrides[buildingName];
        changed = true;
      }
    });
    return changed;
  }

  function getRecoveryStateClone() {
    const recovery = window.__TATRA_RECOVERY_STATE__;
    if (!recovery || typeof recovery !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(recovery));
    } catch (error) {
      return null;
    }
  }

  function buildTenantOrderKeyFromUnit(buildingName, unit, floor) {
    return `${String(buildingName || '').trim()}::${getTenantUnitLookupKey({ unit, floor })}`;
  }

  function restoreStateFromDbSnapshot(state) {
    if (typeof hasDbSnapshot !== 'function' || !hasDbSnapshot()) return false;
    const snapshot = typeof getDbSnapshot === 'function' ? getDbSnapshot() : null;
    if (!snapshot || !Array.isArray(snapshot.buildings) || !Array.isArray(snapshot.units)) return false;

    const activeTenancyByUnitId = new Map(
      (snapshot.activeTenancies || [])
        .filter((tenancy) => Number(tenancy && tenancy.isActive || 0) === 1 && Number(tenancy && tenancy.isArchived || 0) !== 1)
        .map((tenancy) => [String(tenancy && tenancy.unitId || '').trim(), tenancy])
    );
    const vacancyByUnitId = new Map(
      (snapshot.vacancyStates || [])
        .map((vacancy) => [String(vacancy && vacancy.unitId || '').trim(), vacancy])
    );
    const unitsByBuildingId = new Map();
    (snapshot.units || []).forEach((unit) => {
      const buildingId = String(unit && unit.buildingId || '').trim();
      if (!buildingId) return;
      if (!unitsByBuildingId.has(buildingId)) unitsByBuildingId.set(buildingId, []);
      unitsByBuildingId.get(buildingId).push(unit);
    });

    function hasBrokenDisplayText(value) {
      return /[ØÙÂ�]/.test(String(value || ''));
    }

    // Treat literal question-mark placeholders as broken text too, so stale local state
    // gets replaced by the real DB snapshot values.
    function hasBrokenDisplayText(value) {
      const text = String(value || '').trim();
      if (!text) return false;
      return /[ØÙÂ�]/.test(text) || /^\?+(?:\s*\d+)?$/.test(text);
    }

    function buildSnapshotRowsForBuilding(building) {
      const units = (unitsByBuildingId.get(building.id) || []).slice().sort((left, right) => {
        const leftPosition = Number((left && left.activeRowPosition) ?? (left && left.templatePosition) ?? Number.MAX_SAFE_INTEGER);
        const rightPosition = Number((right && right.activeRowPosition) ?? (right && right.templatePosition) ?? Number.MAX_SAFE_INTEGER);
        if (leftPosition !== rightPosition) return leftPosition - rightPosition;
        return String(left && left.unit || '').localeCompare(String(right && right.unit || ''), 'en', { numeric: true });
      });

      return units.map((unit, index) => {
        const unitId = String(unit && unit.id || '').trim();
        const activeTenancy = activeTenancyByUnitId.get(unitId);
        const vacancy = vacancyByUnitId.get(unitId);
        const normalizedFloor = normalizeFloorLabel(unit && unit.floor);
        if (activeTenancy) {
          return {
            id: String(activeTenancy.sourceTenantId || activeTenancy.id || unitId || `tenant-${building.id}-${index}`),
            unitId,
            building: building.name,
            unit: String(unit && unit.unit || '').trim(),
            floor: normalizedFloor,
            name: String(activeTenancy.tenantName || '').trim() || 'Available unit',
            isVacant: false,
            isArchived: false,
            phone: normalizePhone(activeTenancy.phone || ''),
            civilId: String(activeTenancy.civilId || '').trim(),
            nationality: String(activeTenancy.nationality || 'Not set').trim() || 'Not set',
            moveInDate: String(activeTenancy.moveInDate || activeTenancy.contractStart || '').trim(),
            contractStart: String(activeTenancy.contractStart || '').trim(),
            contractEnd: String(activeTenancy.contractEnd || '').trim(),
            contractRent: Number(activeTenancy.contractRent || 0),
            discount: Number(activeTenancy.discount || 0),
            actualRent: Number(activeTenancy.actualRent || Math.max(Number(activeTenancy.contractRent || 0) - Number(activeTenancy.discount || 0), 0)),
            previousDue: Number(activeTenancy.previousDue || 0),
            prepaidNextMonth: Number(activeTenancy.prepaidNextMonth || 0),
            insuranceAmount: Number(activeTenancy.insuranceAmount || 0),
            insurancePaidMonth: String(activeTenancy.insurancePaidMonth || '').trim(),
            insurancePreviousAmount: 0,
            insuranceCurrentAmount: 0,
            notes: String(activeTenancy.notes || '').trim(),
            dueDay: Number(activeTenancy.dueDay || 20),
            plannedVacateDate: String(activeTenancy.plannedVacateDate || '').trim(),
            seedOrder: index,
            sourceTenantId: String(activeTenancy.sourceTenantId || '').trim()
          };
        }

        return {
          id: `vacant-${unitId || `${building.id}-${index}`}`,
          unitId,
          building: building.name,
          unit: String(unit && unit.unit || '').trim(),
          floor: normalizedFloor,
          name: 'Available unit',
          isVacant: true,
          isArchived: false,
          phone: '',
          civilId: '',
          nationality: 'Not set',
          moveInDate: '',
          contractStart: '',
          contractEnd: '',
          contractRent: 0,
          discount: Number(vacancy && vacancy.lastDiscount || 0),
          actualRent: 0,
          lastContractRent: Number(vacancy && vacancy.lastContractRent || 0),
          lastActualRent: Number(vacancy && vacancy.lastActualRent || 0),
          previousDue: 0,
          prepaidNextMonth: 0,
          insuranceAmount: 0,
          insurancePaidMonth: '',
          insurancePreviousAmount: 0,
          insuranceCurrentAmount: 0,
          notes: sanitizeSystemNoteText(vacancy && vacancy.notes || 'Vacant unit'),
          vacatedOn: String(vacancy && vacancy.vacantSince || '').trim(),
          oldTenantDuePaid: Number(vacancy && vacancy.oldTenantDuePaid || 0),
          dueDay: 20,
          seedOrder: index
        };
      });
    }

    function matchCurrentRow(snapshotRow, currentRowsByKey, currentRowsBySourceId, currentRowsByUnit, currentRowsByIndex, index) {
      const sourceTenantId = String(snapshotRow.sourceTenantId || '').trim();
      if (sourceTenantId && currentRowsBySourceId.has(sourceTenantId)) return currentRowsBySourceId.get(sourceTenantId);
      const exactKey = getTenantUnitLookupKey(snapshotRow);
      if (currentRowsByKey.has(exactKey)) return currentRowsByKey.get(exactKey);
      const unitLabel = String(snapshotRow.unit || '').trim();
      const unitMatches = currentRowsByUnit.get(unitLabel) || [];
      if (unitMatches.length === 1) return unitMatches[0];
      return currentRowsByIndex[index] || null;
    }

    function clearIdentityAndOrderOverridesForBuilding(buildingName, tenantIds) {
      ensureTenantIdentityOverridesState(state);
      ensureTenantOrderOverridesState(state);
      tenantIds.forEach((tenantId) => {
        if (Object.prototype.hasOwnProperty.call(state.tenantIdentityOverrides, tenantId)) {
          delete state.tenantIdentityOverrides[tenantId];
        }
      });
      if (Object.prototype.hasOwnProperty.call(state.tenantOrderOverrides, buildingName)) {
        delete state.tenantOrderOverrides[buildingName];
      }
    }

    const snapshotBuildings = (snapshot.buildings || []).map((building) => ({
      id: String(building && building.id || '').trim(),
      name: String(building && building.name || '').trim(),
      area: String(building && building.area || '').trim(),
      totalUnits: Number(building && building.totalUnits || 0)
    })).filter((building) => building.id && building.name);

    let changed = false;
    snapshotBuildings.forEach((building) => {
      if (building.name === 'حولي 06-161') return;
      const currentLiveRows = state.tenants
        .filter((tenant) => String(tenant.building || '').trim() === building.name && !tenant.isArchived)
        .slice()
        .sort((left, right) => Number(left.seedOrder || 0) - Number(right.seedOrder || 0));
      const snapshotRows = buildSnapshotRowsForBuilding(building);
      if (!snapshotRows.length) return;

      const shouldRepair = (
        !currentLiveRows.length
        || currentLiveRows.length !== snapshotRows.length
        || currentLiveRows.some((tenant) => (
          hasBrokenDisplayText(tenant.building)
          || hasBrokenDisplayText(tenant.unit)
          || hasBrokenDisplayText(tenant.floor)
          || hasBrokenDisplayText(tenant.name)
          || !String(tenant.floor || '').trim()
        ))
        || currentLiveRows.some((tenant, index) => {
          const snapshotRow = snapshotRows[index];
          if (!snapshotRow) return false;
          const tenantUnitId = String(tenant && tenant.unitId || '').trim();
          const snapshotUnitId = String(snapshotRow && snapshotRow.unitId || '').trim();
          if (tenantUnitId && snapshotUnitId && tenantUnitId !== snapshotUnitId) return false;
          return (
            String(tenant.unit || '').trim() !== String(snapshotRow.unit || '').trim()
            || normalizeFloorLabel(tenant.floor) !== normalizeFloorLabel(snapshotRow.floor)
          );
        })
      );
      if (!shouldRepair) return;

      const currentRowsByKey = new Map();
      const currentRowsBySourceId = new Map();
      const currentRowsByUnit = new Map();
      currentLiveRows.forEach((tenant) => {
        const lookupKey = getTenantUnitLookupKey(tenant);
        if (lookupKey && !currentRowsByKey.has(lookupKey)) currentRowsByKey.set(lookupKey, tenant);
        const sourceTenantId = String(tenant.sourceTenantId || '').trim();
        if (sourceTenantId && !currentRowsBySourceId.has(sourceTenantId)) currentRowsBySourceId.set(sourceTenantId, tenant);
        const unitLabel = String(tenant.unit || '').trim();
        if (!currentRowsByUnit.has(unitLabel)) currentRowsByUnit.set(unitLabel, []);
        currentRowsByUnit.get(unitLabel).push(tenant);
      });

      const repairedRows = snapshotRows.map((snapshotRow, index) => {
        const currentMatch = matchCurrentRow(snapshotRow, currentRowsByKey, currentRowsBySourceId, currentRowsByUnit, currentLiveRows, index);
        if (!currentMatch) {
          return Object.assign({}, snapshotRow, { seedOrder: index });
        }
        const preservedNotes = hasBrokenDisplayText(currentMatch.notes) ? String(snapshotRow.notes || '') : String(currentMatch.notes || snapshotRow.notes || '');
        const canonicalRowId = String(snapshotRow.sourceTenantId || snapshotRow.id || currentMatch.id || '').trim() || currentMatch.id;
        return Object.assign({}, snapshotRow, {
          id: canonicalRowId,
          phone: normalizePhone(currentMatch.phone || snapshotRow.phone || ''),
          civilId: String(currentMatch.civilId || snapshotRow.civilId || '').trim(),
          nationality: String(currentMatch.nationality || snapshotRow.nationality || 'Not set').trim() || 'Not set',
          moveInDate: String(currentMatch.moveInDate || snapshotRow.moveInDate || '').trim(),
          contractStart: String(currentMatch.contractStart || snapshotRow.contractStart || '').trim(),
          contractEnd: String(currentMatch.contractEnd || snapshotRow.contractEnd || '').trim(),
          contractRent: Number(currentMatch.contractRent ?? snapshotRow.contractRent ?? 0),
          discount: Number(currentMatch.discount ?? snapshotRow.discount ?? 0),
          actualRent: Number(currentMatch.actualRent ?? snapshotRow.actualRent ?? 0),
          previousDue: Number(currentMatch.previousDue ?? snapshotRow.previousDue ?? 0),
          prepaidNextMonth: Number(currentMatch.prepaidNextMonth ?? snapshotRow.prepaidNextMonth ?? 0),
          insuranceAmount: Number(currentMatch.insuranceAmount ?? snapshotRow.insuranceAmount ?? 0),
          insurancePaidMonth: String(currentMatch.insurancePaidMonth || snapshotRow.insurancePaidMonth || '').trim(),
          insurancePreviousAmount: Number(currentMatch.insurancePreviousAmount ?? snapshotRow.insurancePreviousAmount ?? 0),
          insuranceCurrentAmount: Number(currentMatch.insuranceCurrentAmount ?? snapshotRow.insuranceCurrentAmount ?? 0),
          notes: preservedNotes,
          vacatedOn: String(currentMatch.vacatedOn || snapshotRow.vacatedOn || '').trim(),
          oldTenantDuePaid: Number(currentMatch.oldTenantDuePaid ?? snapshotRow.oldTenantDuePaid ?? 0),
          dueDay: Number(currentMatch.dueDay || snapshotRow.dueDay || 20),
          plannedVacateDate: String(currentMatch.plannedVacateDate || snapshotRow.plannedVacateDate || '').trim(),
          lastPaidMonth: String(currentMatch.lastPaidMonth || snapshotRow.lastPaidMonth || '').trim(),
          lastContractRent: Number(currentMatch.lastContractRent ?? snapshotRow.lastContractRent ?? 0),
          lastActualRent: Number(currentMatch.lastActualRent ?? snapshotRow.lastActualRent ?? 0),
          sourceTenantId: String(currentMatch.sourceTenantId || snapshotRow.sourceTenantId || '').trim(),
          seedOrder: index
        });
      });

      const tenantIdsToClear = new Set(currentLiveRows.map((tenant) => String(tenant.id || '').trim()).filter(Boolean));
      repairedRows.forEach((tenant) => tenantIdsToClear.add(String(tenant.id || '').trim()));
      clearIdentityAndOrderOverridesForBuilding(building.name, [...tenantIdsToClear]);

      const archivedRows = state.tenants.filter((tenant) => String(tenant.building || '').trim() === building.name && tenant.isArchived);
      const otherRows = state.tenants.filter((tenant) => String(tenant.building || '').trim() !== building.name);
      state.tenants = otherRows.concat(archivedRows).concat(repairedRows);
      changed = true;
    });
    return changed;
  }

  function mergeRecoveryIdentityAndOrderState(state) {
    ensureAppliedFixesState(state);
    const appliedKey = 'merge-recovery-identity-order-v1';
    if (state.appliedFixes[appliedKey]) return false;
    const recovery = window.__TATRA_RECOVERY_STATE__;
    if (!recovery || typeof recovery !== 'object') return false;
    let changed = false;

    if (recovery.tenantIdentityOverrides && typeof recovery.tenantIdentityOverrides === 'object') {
      ensureTenantIdentityOverridesState(state);
      Object.keys(recovery.tenantIdentityOverrides).forEach((tenantId) => {
        const sourceTenantBucket = recovery.tenantIdentityOverrides[tenantId];
        if (!sourceTenantBucket || typeof sourceTenantBucket !== 'object') return;
        state.tenantIdentityOverrides[tenantId] = JSON.parse(JSON.stringify(sourceTenantBucket));
        changed = true;
      });
    }

    if (recovery.tenantOrderOverrides && typeof recovery.tenantOrderOverrides === 'object') {
      ensureTenantOrderOverridesState(state);
      Object.keys(recovery.tenantOrderOverrides).forEach((buildingName) => {
        const sourceBuildingBucket = recovery.tenantOrderOverrides[buildingName];
        if (!sourceBuildingBucket || typeof sourceBuildingBucket !== 'object') return;
        state.tenantOrderOverrides[buildingName] = JSON.parse(JSON.stringify(sourceBuildingBucket));
        changed = true;
      });
    }

    state.appliedFixes[appliedKey] = true;
    return changed;
  }

  function normalizeTenantInsuranceState(state) {
    let changed = false;
    state.tenants.forEach((tenant) => {
      if (!tenant || tenant.isVacant || tenant.isArchived) return;
      const paidMonth = String(tenant.insurancePaidMonth || '').trim();
      const insuranceAmount = normalizeAmount(Number(tenant.insuranceAmount || 0));
      const previousAmount = normalizeAmount(Number(tenant.insurancePreviousAmount || 0));
      const currentAmount = normalizeAmount(Number(tenant.insuranceCurrentAmount || 0));

      if (paidMonth && insuranceAmount > 0) {
        if (previousAmount !== 0) {
          tenant.insurancePreviousAmount = 0;
          changed = true;
        }
        if (currentAmount !== 0) {
          tenant.insuranceCurrentAmount = 0;
          changed = true;
        }
        return;
      }

      if (!paidMonth && !(insuranceAmount > 0)) {
        if (previousAmount !== 0) {
          tenant.insurancePreviousAmount = 0;
          changed = true;
        }
        if (currentAmount !== 0) {
          tenant.insuranceCurrentAmount = 0;
          changed = true;
        }
      }
    });
    return changed;
  }

  function clearFreeTextTenantNotes(state) {
    ensureAppliedFixesState(state);
    ensureNotesOverridesState(state);
    const appliedKey = 'clear-free-text-notes-v1';
    if (state.appliedFixes[appliedKey]) return false;
    let changed = false;

    state.tenants.forEach((tenant) => {
      if (!tenant) return;
      const sanitizedNote = sanitizeSystemNoteText(tenant.notes);
      if (String(tenant.notes || '').trim() !== sanitizedNote) {
        tenant.notes = sanitizedNote;
        changed = true;
      }
    });

    Object.keys(state.notesOverrides || {}).forEach((tenantId) => {
      const monthBucket = state.notesOverrides[tenantId];
      if (!monthBucket || typeof monthBucket !== 'object') return;
      Object.keys(monthBucket).forEach((monthKey) => {
        const sanitizedNote = sanitizeSystemNoteText(monthBucket[monthKey]);
        if (String(monthBucket[monthKey] || '').trim() !== sanitizedNote) {
          if (sanitizedNote) {
            monthBucket[monthKey] = sanitizedNote;
          } else {
            delete monthBucket[monthKey];
          }
          changed = true;
        }
      });
      if (!Object.keys(monthBucket).length) {
        delete state.notesOverrides[tenantId];
        changed = true;
      }
    });

    if (changed) {
      state.activity.unshift({
        id: `activity-clear-notes-${Date.now()}`,
        when: new Date().toISOString(),
        actor: 'system',
        action: 'Notes cleared',
        detail: 'Cleared free-text notes and kept only system vacate notes.'
      });
      state.activity = state.activity.slice(0, 100);
    }
    state.appliedFixes[appliedKey] = true;
    return changed;
  }

  function ensureVacantUnitRecord(state, tenantLike, selectedMonth) {
    if (!tenantLike) return null;
    let vacantTenant = state.tenants.find((tenant) => (
      tenant.id === tenantLike.id
      && tenant.isVacant
      && !tenant.isArchived
    ));
    if (vacantTenant) {
      if (selectedMonth) vacantTenant.vacantMonthContext = String(selectedMonth).trim();
      return vacantTenant;
    }
    vacantTenant = state.tenants.find((tenant) => (
      tenant.building === tenantLike.building
      && tenant.unit === tenantLike.unit
      && normalizeFloorLabel(tenant.floor) === normalizeFloorLabel(tenantLike.floor)
      && tenant.isVacant
      && !tenant.isArchived
    ));
    if (vacantTenant) {
      if (selectedMonth) vacantTenant.vacantMonthContext = String(selectedMonth).trim();
      return vacantTenant;
    }
    const sourceTenant = state.tenants.find((tenant) => (
      tenant.building === tenantLike.building
      && tenant.unit === tenantLike.unit
      && normalizeFloorLabel(tenant.floor) === normalizeFloorLabel(tenantLike.floor)
      && !tenant.isVacant
      && !tenant.isArchived
    ));
    const createdVacantTenant = {
      id: `vacant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      building: tenantLike.building,
      unit: tenantLike.unit,
      floor: normalizeFloorLabel((tenantLike.floor || (sourceTenant && sourceTenant.floor) || '')),
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
      dueDay: Number((sourceTenant && sourceTenant.dueDay) || 20),
      contractStart: '',
      contractEnd: '',
      contractRent: 0,
      discount: 0,
      actualRent: 0,
      previousDue: 0,
      notes: String(tenantLike.notes || 'Vacant unit').trim() || 'Vacant unit',
      vacatedOn: String(tenantLike.vacatedOn || '').trim(),
      vacantMonthContext: String(selectedMonth || '').trim(),
      prepaidNextMonth: 0,
      seedOrder: Number(
        tenantLike.seedOrder
        ?? (sourceTenant && sourceTenant.seedOrder)
        ?? 0
      ),
      lastPaidMonth: '',
      moveInDate: ''
    };
    const sourceTenantId = String(tenantLike.sourceTenantId || '').trim();
    const insertAfterTenantId = sourceTenantId || String(tenantLike.id || '').trim();
    const insertIndex = state.tenants.findIndex((tenant) => String(tenant.id || '').trim() === insertAfterTenantId);
    if (insertIndex >= 0) {
      state.tenants.splice(insertIndex + 1, 0, createdVacantTenant);
    } else {
      const buildingTenants = state.tenants
        .map((tenant, index) => ({ tenant, index }))
        .filter(({ tenant }) => String(tenant.building || '').trim() === String(createdVacantTenant.building || '').trim());
      const orderedInsertIndex = buildingTenants.find(({ tenant }) => (
        Number(tenant.seedOrder ?? Number.MAX_SAFE_INTEGER) > Number(createdVacantTenant.seedOrder ?? Number.MAX_SAFE_INTEGER)
      ));
      if (orderedInsertIndex) {
        state.tenants.splice(orderedInsertIndex.index, 0, createdVacantTenant);
      } else {
        state.tenants.push(createdVacantTenant);
      }
    }
    refreshBuildingTenantOrder(state, createdVacantTenant.building);
    return createdVacantTenant;
  }

  function removeDuplicateVacantUnits(state) {
    const bestVacantByKey = new Map();
    state.tenants
      .filter((tenant) => !tenant.isArchived && tenant.isVacant)
      .forEach((tenant) => {
        const key = `${tenant.building}::${getTenantUnitLookupKey(tenant)}`;
        const currentBest = bestVacantByKey.get(key);
        if (!currentBest) {
          bestVacantByKey.set(key, tenant);
          return;
        }
        const tenantFloor = normalizeFloorLabel(tenant.floor);
        const bestFloor = normalizeFloorLabel(currentBest.floor);
        const tenantHasRealFloor = !!tenantFloor && tenantFloor.toLowerCase() !== 'floor';
        const bestHasRealFloor = !!bestFloor && bestFloor.toLowerCase() !== 'floor';
        const tenantHasLastTenant = /last tenant:/i.test(String(tenant.notes || ''));
        const bestHasLastTenant = /last tenant:/i.test(String(currentBest.notes || ''));
        const tenantVacatedOn = String(tenant.vacatedOn || '').trim();
        const bestVacatedOn = String(currentBest.vacatedOn || '').trim();
        if (
          (tenantHasRealFloor && !bestHasRealFloor)
          || (tenantHasRealFloor === bestHasRealFloor && tenantHasLastTenant && !bestHasLastTenant)
          || (tenantHasRealFloor === bestHasRealFloor && tenantHasLastTenant === bestHasLastTenant && !!tenantVacatedOn && !bestVacatedOn)
        ) {
          bestVacantByKey.set(key, tenant);
        }
      });
    const occupiedByKey = new Map();
    state.tenants
      .filter((tenant) => !tenant.isArchived && !tenant.isVacant)
      .forEach((tenant) => {
        const key = `${tenant.building}::${getTenantUnitLookupKey(tenant)}`;
        if (!occupiedByKey.has(key)) occupiedByKey.set(key, []);
        occupiedByKey.get(key).push(tenant);
      });
    const before = state.tenants.length;
    state.tenants = state.tenants.filter((tenant) => {
      if (tenant.isArchived || !tenant.isVacant) return true;
      const key = `${tenant.building}::${getTenantUnitLookupKey(tenant)}`;
      if (bestVacantByKey.has(key) && bestVacantByKey.get(key) !== tenant) return false;
      const matchingOccupied = occupiedByKey.get(key) || [];
      if (!matchingOccupied.length) return true;
      const vacantMonth = getMonthKeyFromDate(tenant.vacatedOn) || String(tenant.vacantMonthContext || '').trim();
      if (vacantMonth) {
        const hasFutureOccupant = matchingOccupied.some((occupiedTenant) => {
          const visibleFromMonth = getTenantVisibleFromMonth(occupiedTenant);
          return visibleFromMonth && compareMonthKeys(vacantMonth, visibleFromMonth) < 0;
        });
        if (hasFutureOccupant) return true;
      }
      return false;
    });
    return state.tenants.length !== before;
  }

  function removeDuplicateSeedCurrentMonthPayments(state) {
    const currentMonth = getCurrentMonthKey();
    const paymentsByKey = new Map();
    state.payments.forEach((payment) => {
      if (String(payment.rentMonth || '') !== currentMonth) return;
      const method = String(payment.method || '');
      if (method === 'Due payment' || method === 'Advance') return;
      const key = `${String(payment.tenantId || '')}::${String(payment.rentMonth || '')}::${Number(payment.amount || 0)}`;
      if (!paymentsByKey.has(key)) paymentsByKey.set(key, []);
      paymentsByKey.get(key).push(payment);
    });

    const idsToRemove = new Set();
    paymentsByKey.forEach((payments) => {
      if (payments.length < 2) return;
      const seeded = payments.find((payment) => String(payment.method || '') === 'Seeded from Excel');
      if (!seeded) return;
      payments.forEach((payment) => {
        if (payment.id !== seeded.id) idsToRemove.add(payment.id);
      });
    });

    if (!idsToRemove.size) return false;
    state.payments = state.payments.filter((payment) => !idsToRemove.has(payment.id));
    state.activity.unshift({
      id: `activity-payment-cleanup-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Duplicate payments cleaned',
      detail: `Removed duplicate ${formatMonth(currentMonth)} payments that overlapped seeded Excel entries.`
    });
    state.activity = state.activity.slice(0, 100);
    return true;
  }

  function restoreMissingSeedCurrentMonthPayments(state) {
    const currentMonth = getCurrentMonthKey();
    const existingPaymentIds = new Set(state.payments.map((payment) => payment.id));
    let restoredCount = 0;

    getBuildingSeedConfigs().forEach((config) => {
      const built = buildSeedTenants(config.items, config.buildingName, config.idPrefix, 0, currentMonth);
      built.payments.forEach((seedPayment) => {
        const tenantExists = state.tenants.some((tenant) => tenant.id === seedPayment.tenantId && !tenant.isArchived && !tenant.isVacant);
        if (!tenantExists) return;
        const hasCurrentMonthPayment = state.payments.some((payment) => (
          payment.tenantId === seedPayment.tenantId
          && String(payment.rentMonth || '') === currentMonth
          && String(payment.method || '') !== 'Due payment'
          && String(payment.method || '') !== 'Advance'
        ));
        if (hasCurrentMonthPayment || existingPaymentIds.has(seedPayment.id)) return;
        state.payments.push(seedPayment);
        existingPaymentIds.add(seedPayment.id);
        restoredCount += 1;
      });
    });

    if (!restoredCount) return false;
    state.activity.unshift({
      id: `activity-payment-restore-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Seeded payments restored',
      detail: `Restored ${restoredCount} missing ${formatMonth(currentMonth)} seeded Excel payments.`
    });
    state.activity = state.activity.slice(0, 100);
    return true;
  }

  function collapseSeededCurrentMonthOverpayments(state) {
    const currentMonth = getCurrentMonthKey();
    const idsToRemove = new Set();

    getBuildingSeedConfigs().forEach((config) => {
      const built = buildSeedTenants(config.items, config.buildingName, config.idPrefix, 0, currentMonth);
      built.payments.forEach((seedPayment) => {
        const matching = state.payments
          .filter((payment) => payment.tenantId === seedPayment.tenantId && String(payment.rentMonth || '') === currentMonth)
          .filter((payment) => String(payment.method || '') !== 'Due payment' && String(payment.method || '') !== 'Advance');
        if (matching.length <= 1) return;
        const seedAmount = normalizeAmount(seedPayment.amount);
        if (!matching.every((payment) => normalizeAmount(payment.amount) === seedAmount)) return;
        const keep = matching.find((payment) => String(payment.method || '') === 'Seeded from Excel') || matching[0];
        matching.forEach((payment) => {
          if (payment.id !== keep.id) idsToRemove.add(payment.id);
        });
      });
    });

    if (!idsToRemove.size) return false;
    state.payments = state.payments.filter((payment) => !idsToRemove.has(payment.id));
    state.activity.unshift({
      id: `activity-payment-collapse-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Seeded overpayments collapsed',
      detail: `Collapsed duplicate ${formatMonth(currentMonth)} seeded current-month payments.`
    });
    state.activity = state.activity.slice(0, 100);
    return true;
  }

  function repairSalwa247MarchPayments(state) {
    const currentMonth = getCurrentMonthKey();
    if (currentMonth !== '2026-03') return false;
    const repairs = [
      { tenantId: 'salwa247-a6', amount: 350 },
      { tenantId: 'salwa247-b6', amount: 350 }
    ];
    let changed = false;

    repairs.forEach((repair) => {
      const tenantExists = state.tenants.some((tenant) => tenant.id === repair.tenantId && !tenant.isVacant && !tenant.isArchived);
      if (!tenantExists) return;
      const matching = state.payments.filter((payment) => (
        payment.tenantId === repair.tenantId
        && String(payment.rentMonth || '') === currentMonth
        && String(payment.method || '') !== 'Due payment'
        && String(payment.method || '') !== 'Advance'
      ));
      const total = normalizeAmount(matching.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
      const hasDuplicateOverpayment = matching.length > 1 || total > repair.amount;
      if (!hasDuplicateOverpayment) return;
      const keep = {
        id: `seed-${repair.tenantId}-${currentMonth}`,
        tenantId: repair.tenantId,
        amount: repair.amount,
        date: `${currentMonth}-01`,
        rentMonth: currentMonth,
        method: 'Seeded from Excel',
        note: ''
      };
      state.payments = state.payments.filter((payment) => !(
        payment.tenantId === repair.tenantId
        && String(payment.rentMonth || '') === currentMonth
        && String(payment.method || '') !== 'Due payment'
        && String(payment.method || '') !== 'Advance'
      ));
      state.payments.push(keep);
      changed = true;
    });

    if (!changed) return false;
    state.activity.unshift({
      id: `activity-salwa247-repair-${Date.now()}`,
      when: new Date().toISOString(),
      actor: 'system',
      action: 'Salwa 247 March payments repaired',
      detail: 'Reset A6 and B6 March current-month payments to the Excel value.'
    });
    state.activity = state.activity.slice(0, 100);
    return true;
  }
