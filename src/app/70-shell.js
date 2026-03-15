  function bindBuildingFilters(state) {
    [['buildingSearch', 'input'], ['buildingUnitFilter', 'change'], ['buildingStatusFilter', 'change']].forEach(([id, eventName]) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener(eventName, () => renderBuildingDetails(state, window.__selectedBuildingName || getDefaultBuildingName(state)));
    });

    const getSortToggleSymbol = (mode) => (mode === 'reset' ? '\u21BA' : mode === 'asc' ? '\u2191' : '\u2193');
    const cycle = { reset: 'asc', asc: 'desc', desc: 'reset' };
    const unitButton = document.getElementById('sortUnitButton');
    const statusButton = document.getElementById('sortStatusButton');
    if (unitButton) {
      unitButton.textContent = getSortToggleSymbol(window.__buildingUnitSortState || 'reset');
      unitButton.classList.toggle('active', (window.__buildingUnitSortState || 'reset') !== 'reset');
      unitButton.addEventListener('click', () => {
        window.__buildingUnitSortState = cycle[window.__buildingUnitSortState || 'reset'];
        unitButton.textContent = getSortToggleSymbol(window.__buildingUnitSortState);
        unitButton.classList.toggle('active', window.__buildingUnitSortState !== 'reset');
        renderBuildingDetails(state, window.__selectedBuildingName || getDefaultBuildingName(state));
      });
    }
    if (statusButton) {
      statusButton.textContent = getSortToggleSymbol(window.__buildingStatusSortState || 'reset');
      statusButton.classList.toggle('active', (window.__buildingStatusSortState || 'reset') !== 'reset');
      statusButton.addEventListener('click', () => {
        window.__buildingStatusSortState = cycle[window.__buildingStatusSortState || 'reset'];
        statusButton.textContent = getSortToggleSymbol(window.__buildingStatusSortState);
        statusButton.classList.toggle('active', window.__buildingStatusSortState !== 'reset');
        renderBuildingDetails(state, window.__selectedBuildingName || getDefaultBuildingName(state));
      });
    }
    const printButton = document.getElementById('printBuildingButton');
    if (printButton) {
      printButton.addEventListener('click', () => printCurrentBuilding(state));
    }
  }

  async function runOneTimeMonthResetsBeforeLoad() {
    return;
  }

  function bindBuildingCards(state) {
    document.querySelectorAll('[data-building-card]').forEach((card) => {
      card.addEventListener('click', () => {
        const selected = card.getAttribute('data-building-card');
        const buildingMeta = state.buildings.find((building) => building.name === selected);
        window.__selectedBuildingName = selected;
        if (buildingMeta) window.__selectedAreaName = buildingMeta.area;
        saveBuildingViewPreference();
        renderAll(state, selected);
      });
    });
  }

  function bindAreaCards(state) {
    document.querySelectorAll('[data-area-card]').forEach((card) => {
      card.addEventListener('click', () => {
        const selectedArea = card.getAttribute('data-area-card');
        const preferredBuilding = getPreferredBuildingForArea(state, selectedArea);
        window.__selectedAreaName = selectedArea;
        window.__selectedBuildingName = preferredBuilding;
        saveBuildingViewPreference();
        renderAll(state, preferredBuilding);
      });
    });
  }

  function bindStaleStateWarning() {
    return;
  }

  function ensureFrozenTableHeaderHost() {
    let host = document.getElementById('frozenTableHeaderHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'frozenTableHeaderHost';
    host.className = 'frozen-table-header-host';
    document.body.appendChild(host);
    return host;
  }

  function ensureFrozenMonthTabsHost() {
    let host = document.getElementById('frozenMonthTabsHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'frozenMonthTabsHost';
    host.className = 'frozen-month-tabs-host';
    document.body.appendChild(host);
    return host;
  }

  function getFrozenTopOffset() {
    const monthTabsHost = document.getElementById('frozenMonthTabsHost');
    if (!monthTabsHost || !monthTabsHost.classList.contains('is-visible')) return 0;
    const rect = monthTabsHost.getBoundingClientRect();
    return Math.ceil(rect.height || 0);
  }

  function getFrozenMonthTabsTarget() {
    const currentPage = String((document.body && document.body.dataset.page) || '');
    if (currentPage !== 'buildings' && currentPage !== 'tenants') return null;
    const containers = [
      document.getElementById('buildingMonthTabs'),
      document.getElementById('tenantMonthTabs')
    ].filter(Boolean);
    for (const container of containers) {
      if (!container || !container.children.length) continue;
      const rect = container.getBoundingClientRect();
      if (rect.top >= 0) continue;
      return { container, rect };
    }
    return null;
  }

  function syncFrozenMonthTabs() {
    const host = ensureFrozenMonthTabsHost();
    const target = getFrozenMonthTabsTarget();
    if (!target) {
      host.classList.remove('is-visible');
      host.innerHTML = '';
      host.removeAttribute('data-source-id');
      return;
    }

    const { container, rect } = target;
    const sourceId = String(container.id || '').trim();
    if (!sourceId) return;

    if (host.getAttribute('data-source-id') !== sourceId) {
      host.innerHTML = `<div class="month-tabs">${container.innerHTML}</div>`;
      host.setAttribute('data-source-id', sourceId);
    } else {
      const frozenTabs = host.querySelector('.month-tabs');
      if (frozenTabs && frozenTabs.innerHTML !== container.innerHTML) {
        frozenTabs.innerHTML = container.innerHTML;
      }
    }

    host.style.left = `${Math.round(rect.left)}px`;
    host.style.width = `${Math.round(rect.width)}px`;
    const sourceButtons = Array.from(container.querySelectorAll('.month-tab'));
    const clonedButtons = Array.from(host.querySelectorAll('.month-tab'));
    clonedButtons.forEach((button, index) => {
      const sourceButton = sourceButtons[index];
      if (!sourceButton) return;
      const width = Math.ceil(sourceButton.getBoundingClientRect().width);
      button.style.width = `${width}px`;
      button.style.minWidth = `${width}px`;
      button.style.maxWidth = `${width}px`;
      button.onclick = (event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        sourceButton.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        window.requestAnimationFrame(() => window.requestAnimationFrame(syncFrozenUi));
      };
    });
    host.classList.add('is-visible');
  }

  function getFrozenHeaderTarget() {
    const currentPage = String((document.body && document.body.dataset.page) || '');
    if (currentPage !== 'buildings' && currentPage !== 'tenants') return null;
    const tables = Array.from(document.querySelectorAll('.table-scroll > table.building-table, .table-scroll > table.tenant-table'));
    const freezeTop = getFrozenTopOffset();
    for (const table of tables) {
      const wrapper = table.parentElement;
      const thead = table.querySelector('thead');
      if (!wrapper || !thead) continue;
      const wrapperRect = wrapper.getBoundingClientRect();
      const theadRect = thead.getBoundingClientRect();
      if (wrapperRect.bottom <= freezeTop + 12) continue;
      if (theadRect.top >= freezeTop) continue;
      return { table, wrapper, thead };
    }
    return null;
  }

  function syncFrozenTableHeader() {
    const host = ensureFrozenTableHeaderHost();
    const target = getFrozenHeaderTarget();
    if (!target) {
      host.classList.remove('is-visible');
      host.innerHTML = '';
      host.removeAttribute('data-source-key');
      return;
    }

    const { table, wrapper, thead } = target;
    const wrapperRect = wrapper.getBoundingClientRect();
    const sourceKey = `${table.className}::${table.querySelectorAll('thead th').length}`;
    const sourceHeaderCells = Array.from(thead.querySelectorAll('th'));
    const sourceWidths = sourceHeaderCells.map((cell) => Math.ceil(cell.getBoundingClientRect().width));

    if (host.getAttribute('data-source-key') !== sourceKey) {
      const colgroup = table.querySelector('colgroup');
      const clonedTable = document.createElement('table');
      clonedTable.className = `${table.className} frozen-table-header-table`;
      clonedTable.innerHTML = `${colgroup ? colgroup.outerHTML : ''}${thead.outerHTML}`;
      host.innerHTML = '';
      host.appendChild(clonedTable);
      host.setAttribute('data-source-key', sourceKey);
    }

    const clonedTable = host.querySelector('table');
    if (!clonedTable) return;
    const clonedHeaderCells = Array.from(clonedTable.querySelectorAll('thead th'));
    clonedHeaderCells.forEach((cell, index) => {
      if (sourceWidths[index]) {
        cell.style.width = `${sourceWidths[index]}px`;
        cell.style.minWidth = `${sourceWidths[index]}px`;
        cell.style.maxWidth = `${sourceWidths[index]}px`;
      }
    });

    host.style.left = `${Math.round(wrapperRect.left)}px`;
    host.style.top = `${getFrozenTopOffset()}px`;
    host.style.width = `${Math.round(wrapperRect.width)}px`;
    clonedTable.style.width = `${Math.ceil(table.getBoundingClientRect().width)}px`;
    clonedTable.style.transform = `translateX(${-wrapper.scrollLeft}px)`;
    host.classList.add('is-visible');
  }

  function syncFrozenUi() {
    syncFrozenMonthTabs();
    syncFrozenTableHeader();
  }

  function bindFrozenTableHeader() {
    if (window.__tatraFrozenHeaderBound) return;
    window.__tatraFrozenHeaderBound = true;
    ensureFrozenTableHeaderHost();
    const sync = () => window.requestAnimationFrame(syncFrozenUi);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    document.addEventListener('scroll', (event) => {
      const target = event && event.target;
      if (target && target.classList && target.classList.contains('table-scroll')) {
        sync();
      }
    }, true);
  }

  function bindFrozenMonthTabs() {
    if (window.__tatraFrozenMonthTabsBound) return;
    window.__tatraFrozenMonthTabsBound = true;
    ensureFrozenMonthTabsHost();
    const sync = () => window.requestAnimationFrame(syncFrozenUi);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
  }

  function renderAll(state, selectedBuilding) {
    window.__appState = state;
    const currentPage = String((document.body && document.body.dataset.page) || '');
    resetRenderCache();
    renderSidebarUser();

    if (currentPage === 'dashboard') {
      renderStatsGrid(state);
      renderDashboardStatusGraph(state);
      renderDashboardAreaGraph(state);
      renderBuildingMiniGrid(state);
      renderContractAlerts(state);
    }

    if (currentPage === 'tenants') {
      populateTenantSelectors(state);
      renderTenantMonthTabs();
      renderTenants(state);
    }

    if (currentPage === 'history') {
      renderTenantHistoryPage();
    }

    if (currentPage === 'due') {
      populateTenantSelectors(state);
      renderDueMonthTabs();
      renderDueTenants(state);
    }

    if (currentPage === 'vacant') {
      populateTenantSelectors(state);
      renderVacantMonthTabs();
      renderVacantUnits(state);
    }

    if (currentPage === 'payments') {
      populateTenantSelectors(state);
      renderPayments(state);
    }

    if (currentPage === 'contracts') {
      renderContractAlerts(state);
    }

    if (currentPage === 'activity') {
      renderActivity(state);
    }

    if (currentPage === 'admin') {
      renderAdminAccounts();
      bindStateExportActions();
    }

    if (currentPage === 'buildings') renderBuildingsPage(state, selectedBuilding);
    if (typeof renderMonthPhaseBanner === 'function') renderMonthPhaseBanner();
    window.requestAnimationFrame(syncFrozenUi);
  }

  function resetBuildingFiltersForDeepLink() {
    const search = document.getElementById('buildingSearch');
    const unitFilter = document.getElementById('buildingUnitFilter');
    const statusFilter = document.getElementById('buildingStatusFilter');
    if (search) search.value = '';
    if (unitFilter) unitFilter.value = 'all';
    if (statusFilter) statusFilter.value = 'all';
    window.__buildingUnitSortState = 'reset';
    window.__buildingStatusSortState = 'reset';
  }

  function findTenantRowByUnit(unit) {
    if (!unit) return null;
    return Array.from(document.querySelectorAll('[data-tenant-row]')).find((row) => {
      const unitCell = row.querySelector('td');
      return unitCell && String(unitCell.textContent || '').trim() === String(unit).trim();
    }) || null;
  }

  function openBuildingTenantFromQuery(state, tenantId, buildingName, unit) {
    if ((!tenantId && !unit) || !buildingName || String((document.body && document.body.dataset.page) || '') !== 'buildings') return;
    resetBuildingFiltersForDeepLink();
    renderBuildingDetails(state, buildingName);
    const row = findTenantRow(tenantId) || findTenantRowByUnit(unit);
    if (!row) return;
    const existing = row.nextElementSibling;
    if (!(existing && existing.matches('[data-tenant-detail]'))) {
      toggleTenantRowDetail(state, row.dataset.tenantRow || tenantId);
    }
    const detailRow = row.nextElementSibling && row.nextElementSibling.matches('[data-tenant-detail]')
      ? row.nextElementSibling
      : row;
    detailRow.scrollIntoView({ block: 'center', behavior: 'auto' });
    history.replaceState({}, document.title, `buildings.html?building=${encodeURIComponent(buildingName)}&month=${encodeURIComponent(getSelectedBuildingMonth())}`);
  }

  async function init() {
    try {
      bindLoginForm();
      if (!requireAuthForPage()) return;
      if (!requireAdminForPage()) return;
      bindLogoutButton();
      await runOneTimeMonthResetsBeforeLoad();
      if (typeof refreshDbSnapshotFromServer === 'function') {
        await refreshDbSnapshotFromServer();
      }
      const state = loadState();
      window.__tatraInitStage = 'loadState';
    bindStaleStateWarning();
    bindFrozenTableHeader();
    bindFrozenMonthTabs();
      const params = new URLSearchParams(window.location.search);
      window.__tatraInitStage = 'queryParams';
      const queryBuilding = params.get('building') || '';
      const queryMonth = params.get('month') || '';
      const queryTenant = params.get('tenant') || '';
      const queryUnit = params.get('unit') || '';
      const savedView = loadBuildingViewPreference();
      const savedTenantView = loadTenantViewPreference();
      window.__tatraInitStage = 'preferences';
      if (savedView) {
        if (savedView.area) window.__selectedAreaName = savedView.area;
        if (savedView.building) window.__selectedBuildingName = savedView.building;
        if (savedView.month) window.__selectedBuildingMonth = savedView.month;
      }
      if (savedTenantView && savedTenantView.building) {
        window.__selectedTenantBuildingFilter = savedTenantView.building;
      }
      if (queryMonth) window.__selectedBuildingMonth = queryMonth;
      const initialBuilding = queryBuilding || window.__selectedBuildingName || getDefaultBuildingName(state);
      window.__tatraInitStage = 'renderAll';
      renderAll(state, initialBuilding);
      window.__tatraInitStage = 'postRender';
      if (queryBuilding && queryMonth) saveBuildingViewPreference();
      window.__tatraInitStage = 'openQuery';
      openBuildingTenantFromQuery(state, queryTenant, queryBuilding || initialBuilding, queryUnit);
      window.__tatraInitStage = 'bindFilters';
      bindBuildingFilters(state);
      handlePaymentForm(state);
      bindContractPresetControls();
      bindTenantActualRentPreview();

      const tenantSearch = document.getElementById('tenantSearch');
      const statusFilter = document.getElementById('statusFilter');
      const tenantBuildingFilter = document.getElementById('tenantBuildingFilter');
      const tenantHistorySearch = document.getElementById('tenantHistorySearch');
      const dueBuildingFilter = document.getElementById('dueBuildingFilter');
      const dueScopeFilter = document.getElementById('dueScopeFilter');
      const dueTenantSelect = document.getElementById('dueTenantSelect');
      const addDueButton = document.getElementById('addDueButton');
      const payDueButton = document.getElementById('payDueButton');
      const paymentBuildingFilter = document.getElementById('paymentBuildingFilter');
      const paymentMethodFilter = document.getElementById('paymentMethodFilter');
      const paymentMonthFilter = document.getElementById('paymentMonthFilter');
      const paymentSearch = document.getElementById('paymentSearch');
      const contractFilter = document.getElementById('contractFilter');
      const contractBuildingFilter = document.getElementById('contractBuildingFilter');
      const contractSearch = document.getElementById('contractSearch');
      const vacantBuildingFilter = document.getElementById('vacantBuildingFilter');
      if (tenantSearch) tenantSearch.addEventListener('input', () => renderTenants(state));
      if (statusFilter) statusFilter.addEventListener('change', () => renderTenants(state));
      if (tenantBuildingFilter) tenantBuildingFilter.addEventListener('change', () => {
        window.__selectedTenantBuildingFilter = tenantBuildingFilter.value || 'all';
        saveTenantViewPreference(window.__selectedTenantBuildingFilter);
        renderTenants(state);
      });
      if (tenantHistorySearch) bindTenantHistoryPage();
      if (dueBuildingFilter) dueBuildingFilter.addEventListener('change', () => {
        populateDueTenantSelect(state);
        renderDueTenants(state);
      });
      if (dueScopeFilter) dueScopeFilter.addEventListener('change', () => {
        populateDueTenantSelect(state);
        renderDueTenants(state);
      });
      if (dueTenantSelect) dueTenantSelect.addEventListener('change', () => {
        const amountInput = document.getElementById('dueAddAmount');
        if (amountInput && !amountInput.value) amountInput.focus();
      });
      if (addDueButton) addDueButton.addEventListener('click', () => addDueAmount(state));
      if (payDueButton) payDueButton.addEventListener('click', () => payDueAmount(state));
      if (contractFilter) contractFilter.addEventListener('change', () => renderContractAlerts(state));
      if (contractBuildingFilter) contractBuildingFilter.addEventListener('change', () => renderContractAlerts(state));
      if (contractSearch) contractSearch.addEventListener('input', () => renderContractAlerts(state));
      if (paymentBuildingFilter) paymentBuildingFilter.addEventListener('change', () => renderPayments(state));
      if (paymentMethodFilter) paymentMethodFilter.addEventListener('change', () => renderPayments(state));
      if (paymentMonthFilter) paymentMonthFilter.addEventListener('change', () => renderPayments(state));
      if (paymentSearch) paymentSearch.addEventListener('input', () => renderPayments(state));
      if (vacantBuildingFilter) vacantBuildingFilter.addEventListener('change', () => renderVacantUnits(state));
    bindAdminActions();
    bindStateExportActions();
    } catch (error) {
      const stage = window.__tatraInitStage || 'unknown';
      document.body.innerHTML = `<main class="landing-shell"><section class="landing-card"><p class="eyebrow">Runtime error</p><h1>Dashboard failed to load</h1><p class="muted">Startup failed during: ${stage}</p><p class="muted">${String(error && error.message || error || 'Unknown error')}</p></section></main>`;
      throw error;
    }
  }

  document.addEventListener('DOMContentLoaded', () => void init());
})();
