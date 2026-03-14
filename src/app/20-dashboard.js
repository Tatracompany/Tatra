  function renderStatsGrid(state) {
    const container = document.getElementById('statsGrid');
    if (!container) return;
    const selectedMonth = getActiveMonthKey();
    const tenants = getTenantViews(state, selectedMonth).filter((tenant) => !tenant.isVacant);
    const totalIncome = tenants.reduce((sum, tenant) => sum + tenant.paidCurrent, 0);
    const unpaid = tenants.filter((tenant) => tenant.status === 'upcoming').length;
    const late = tenants.filter((tenant) => tenant.status === 'overdue').length;
    const partial = tenants.filter((tenant) => tenant.status === 'partial').length;
    const alerts = tenants.filter((tenant) => tenant.contractAlert || tenant.contractExpired).length;
    const openDue = tenants.reduce((sum, tenant) => sum + tenant.totalDue, 0);
    const cards = [
      { label: 'Collected', value: formatCurrency(totalIncome), note: formatMonth(selectedMonth) },
      { label: 'Open due', value: formatCurrency(openDue), note: 'Current + previous balances' },
      { label: 'Late', value: late, note: 'Has old due amount' },
      { label: 'Unpaid', value: unpaid + partial, note: `${unpaid} unpaid · ${partial} partial` },
      { label: 'Contracts', value: alerts, note: 'Need follow-up' }
    ];
    container.innerHTML = cards.map((card) => `<article class="stat-card"><span class="stat-label">${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small class="stat-note">${escapeHtml(card.note)}</small></article>`).join('');
    const chip = document.getElementById('currentMonthLabel');
    if (chip) chip.textContent = formatMonth(selectedMonth);
  }

  function renderDashboardStatusGraph(state) {
    const container = document.getElementById('dashboardStatusGraph');
    if (!container) return;
    const tenants = getTenantViews(state, getActiveMonthKey());
    const items = [
      { key: 'paid', label: 'Paid', value: tenants.filter((tenant) => tenant.status === 'paid').length, tone: 'paid' },
      { key: 'partial', label: 'Partial', value: tenants.filter((tenant) => tenant.status === 'partial').length, tone: 'partial' },
      { key: 'upcoming', label: 'Unpaid', value: tenants.filter((tenant) => tenant.status === 'upcoming').length, tone: 'unpaid' },
      { key: 'overdue', label: 'Late', value: tenants.filter((tenant) => tenant.status === 'overdue').length, tone: 'late' }
    ];
    const max = Math.max(1, ...items.map((item) => item.value));
    container.innerHTML = items.map((item) => {
      const width = `${Math.max(10, Math.round((item.value / max) * 100))}%`;
      return `<div class="graph-row">
        <div class="graph-label-group">
          <span class="graph-label">${escapeHtml(item.label)}</span>
          <strong class="graph-value">${escapeHtml(String(item.value))}</strong>
        </div>
        <div class="graph-track"><span class="graph-fill graph-fill-${item.tone}" style="width:${width}"></span></div>
      </div>`;
    }).join('');
  }

  function renderDashboardAreaGraph(state) {
    const container = document.getElementById('dashboardAreaGraph');
    if (!container) return;
    const currentMonth = getActiveMonthKey();
    const areas = getAreaSummaries(state, currentMonth).map((area) => {
      const buildings = state.buildings.filter((building) => building.area === area.area);
      const collected = buildings.reduce((sum, building) => sum + getBuildingSummary(state, building.name, currentMonth).collected, 0);
      return {
        area: area.area,
        due: area.totalDue,
        collected
      };
    });
    const max = Math.max(1, ...areas.flatMap((item) => [item.due, item.collected]));
    container.innerHTML = areas.map((item) => {
      const collectedWidth = `${Math.max(8, Math.round((item.collected / max) * 100))}%`;
      const dueWidth = `${Math.max(8, Math.round((item.due / max) * 100))}%`;
      return `<div class="area-graph-card">
        <div class="area-graph-head">
          <strong>${escapeHtml(item.area)}</strong>
          <span class="small-note">Collected ${escapeHtml(formatCurrency(item.collected))} · Due ${escapeHtml(formatCurrency(item.due))}</span>
        </div>
        <div class="graph-stack">
          <div class="graph-metric">
            <span class="graph-metric-label">Collected</span>
            <div class="graph-track"><span class="graph-fill graph-fill-paid" style="width:${collectedWidth}"></span></div>
          </div>
          <div class="graph-metric">
            <span class="graph-metric-label">Due</span>
            <div class="graph-track"><span class="graph-fill graph-fill-late" style="width:${dueWidth}"></span></div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function renderBuildingMiniGrid(state) {
    const container = document.getElementById('buildingMiniGrid');
    if (!container) return;
    const selectedMonth = getActiveMonthKey();
    const orderedBuildings = state.buildings
      .map((building) => ({ building, summary: getBuildingSummary(state, building.name, selectedMonth) }))
      .sort((a, b) => b.summary.totalDue - a.summary.totalDue || b.summary.late - a.summary.late)
      .slice(0, 6);
    container.innerHTML = orderedBuildings.map(({ building, summary }) => {
      return `<article class="mini-building-card">
        <strong>${escapeHtml(building.name)}</strong>
        <div class="inline-metrics">
          <span class="metric-pill">Tenants ${summary.occupied}/${summary.totalUnits}</span>
          <span class="metric-pill">Late ${summary.late}</span>
          <span class="metric-pill">Due ${formatCurrency(summary.totalDue)}</span>
        </div>
      </article>`;
    }).join('');
  }

  function renderContractAlerts(state) {
    const dashboardContainer = document.getElementById('contractAlert');
    const summaryContainer = document.getElementById('contractSummary');
    const contractsContainer = document.getElementById('contractList');
    const buildingFilterNode = document.getElementById('contractBuildingFilter');
    const searchNode = document.getElementById('contractSearch');
    const isContractsPage = !!document.querySelector('body[data-page="contracts"]');
    const alerts = getTenantViews(state, getActiveMonthKey())
      .filter((tenant) => !tenant.isVacant)
      .filter((tenant) => tenant.contractAlert || tenant.contractExpired)
      .sort((a, b) => {
        if (a.contractExpired !== b.contractExpired) return a.contractExpired ? 1 : -1;
        return new Date(a.contractEnd) - new Date(b.contractEnd);
      });
    const dashboardHtml = alerts.length ? alerts.slice(0, 6).map((tenant) => {
      const text = tenant.contractExpired ? `Expired ${Math.abs(tenant.daysToEnd)} days ago` : `Ends in ${tenant.daysToEnd} days`;
      return `<article class="contract-card"><strong>${escapeHtml(tenant.building)} - ${escapeHtml(tenant.unit)}</strong><div>${escapeHtml(tenant.name)}</div><div class="small-note">${text} - ${formatDate(tenant.contractEnd)}</div></article>`;
    }).join('') : '<div class="empty-state">No contract alerts.</div>';
    if (dashboardContainer) dashboardContainer.innerHTML = dashboardHtml;
    if (!contractsContainer) return;

    if (buildingFilterNode) {
      const buildingOptions = Array.from(new Set(alerts.map((tenant) => tenant.building).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ar'));
      const currentValue = buildingFilterNode.value || 'all';
      buildingFilterNode.innerHTML = '<option value="all">All buildings</option>' + buildingOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      buildingFilterNode.value = buildingOptions.includes(currentValue) ? currentValue : 'all';
    }

    const filterValue = ((document.getElementById('contractFilter') || {}).value || 'all');
    const searchValue = String(searchNode && searchNode.value || '').trim().toLowerCase();
    const filteredAlerts = alerts.filter((tenant) => {
      if (filterValue === 'expired') return tenant.contractExpired;
      if (filterValue === '30days') return !tenant.contractExpired && tenant.daysToEnd != null && tenant.daysToEnd <= 30;
      if (filterValue === '60days') return !tenant.contractExpired && tenant.daysToEnd != null && tenant.daysToEnd > 30 && tenant.daysToEnd <= 60;
      return true;
    }).filter((tenant) => {
      const buildingValue = buildingFilterNode ? buildingFilterNode.value || 'all' : 'all';
      if (buildingValue !== 'all' && tenant.building !== buildingValue) return false;
      if (!searchValue) return true;
      return `${tenant.building} ${tenant.unit} ${tenant.name}`.toLowerCase().includes(searchValue);
    });
    const expiredCount = alerts.filter((tenant) => tenant.contractExpired).length;
    const warning30Count = alerts.filter((tenant) => !tenant.contractExpired && tenant.daysToEnd != null && tenant.daysToEnd <= 30).length;
    const warning60Count = alerts.filter((tenant) => !tenant.contractExpired && tenant.daysToEnd != null && tenant.daysToEnd > 30 && tenant.daysToEnd <= 60).length;
    if (summaryContainer) {
      if (isContractsPage) {
        const buildingValue = buildingFilterNode ? buildingFilterNode.value || 'all' : 'all';
        summaryContainer.innerHTML = [
          { label: 'Expired', value: String(expiredCount), note: 'Already past end date' },
          { label: 'Ending in 30 days', value: String(warning30Count), note: 'Highest priority renewals' },
          { label: 'Ending in 60 days', value: String(warning60Count), note: 'Upcoming watchlist' },
          { label: 'Showing', value: String(filteredAlerts.length), note: buildingValue === 'all' ? 'All buildings' : buildingValue }
        ].map((card) => `<article class="contracts-summary-card"><span class="contracts-summary-label">${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.note)}</small></article>`).join('');
      } else {
        summaryContainer.innerHTML = `
          <span class="metric-pill">Expired ${expiredCount}</span>
          <span class="metric-pill">30 days ${warning30Count}</span>
          <span class="metric-pill">60 days ${warning60Count}</span>
          <span class="metric-pill">Showing ${filteredAlerts.length}</span>
        `;
      }
    }
    contractsContainer.innerHTML = filteredAlerts.length ? filteredAlerts.map((tenant) => {
      const statusText = tenant.contractExpired ? `Expired ${Math.abs(tenant.daysToEnd)} days ago` : `Ends in ${tenant.daysToEnd} days`;
      const badgeClass = tenant.contractExpired ? 'badge-late' : 'badge-unpaid';
      const badgeText = tenant.contractExpired ? 'Expired' : tenant.daysToEnd <= 30 ? '30 days' : '60 days';
      const actualRent = Math.max(Number(tenant.contractRent || 0) - Number(tenant.discount || 0), 0);
      if (!isContractsPage) {
        return `<article class="contract-card">
          <div class="tenant-card-head">
            <div>
              <strong>${escapeHtml(tenant.building)} - ${escapeHtml(tenant.unit)}</strong>
              <div>${escapeHtml(tenant.name)}</div>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="small-note">${statusText}</div>
          <div class="small-note">Contract end ${formatDate(tenant.contractEnd)}</div>
          <div class="small-note">Contract start ${formatDate(tenant.contractStart)}</div>
        </article>`;
      }
      return `<article class="contract-card contract-page-card">
        <div class="tenant-card-head">
          <div>
            <strong>${escapeHtml(tenant.building)} - ${escapeHtml(tenant.unit)}</strong>
            <div>${escapeHtml(tenant.name)}</div>
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="small-note">${statusText}</div>
        <div class="contract-page-grid">
          <div><span class="contract-meta-label">Contract start</span><strong>${formatDate(tenant.contractStart)}</strong></div>
          <div><span class="contract-meta-label">Contract end</span><strong>${formatDate(tenant.contractEnd)}</strong></div>
          <div><span class="contract-meta-label">Actual rent</span><strong>${formatCurrency(actualRent)}</strong></div>
          <div><span class="contract-meta-label">Contract rent</span><strong>${formatCurrency(tenant.contractRent || 0)}</strong></div>
        </div>
      </article>`;
    }).join('') : '<div class="empty-state">No contracts found for this filter.</div>';
  }
