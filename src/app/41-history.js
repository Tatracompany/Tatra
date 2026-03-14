  function buildTenantHistoryRecords() {
    const profileRows = typeof getDbSnapshotTenantProfiles === 'function' ? getDbSnapshotTenantProfiles() : [];
    const tenancyRows = typeof getDbSnapshotTenancyHistory === 'function' ? getDbSnapshotTenancyHistory() : [];
    const profilesById = new Map(profileRows.map((profile) => [String(profile && profile.id || '').trim(), profile]));
    const recordsByKey = new Map();

    function buildStayIdentity(entry) {
      return [
        String(entry && entry.profileId || '').trim(),
        String(entry && entry.civilId || '').trim(),
        String(entry && entry.phone || '').trim(),
        String(entry && entry.tenantName || '').trim(),
        String(entry && entry.unitId || '').trim(),
        String(entry && entry.buildingName || '').trim(),
        String(entry && entry.moveInDate || '').trim(),
        String(entry && entry.contractStart || '').trim()
      ].join('::');
    }

    function getStayRecency(entry) {
      return String(
        entry && (
          entry.updatedAt
          || entry.archivedOn
          || entry.contractEnd
          || entry.contractStart
          || entry.moveInDate
          || entry.createdAt
        ) || ''
      ).trim();
    }

    tenancyRows.forEach((entry) => {
      const profileId = String(entry && entry.profileId || '').trim();
      const fallbackKey = String(entry && (entry.civilId || entry.phone || entry.sourceTenantId || entry.id) || '').trim();
      const recordKey = profileId || fallbackKey;
      if (!recordKey) return;
      if (!recordsByKey.has(recordKey)) {
        const profile = profileId ? profilesById.get(profileId) : null;
        recordsByKey.set(recordKey, {
          key: recordKey,
          profileId,
          fullName: String(profile && profile.fullName || entry && entry.tenantName || '').trim(),
          civilId: String(profile && profile.civilId || entry && entry.civilId || '').trim(),
          phone: String(profile && profile.phone || entry && entry.phone || '').trim(),
          nationality: String(profile && profile.nationality || entry && entry.nationality || 'Not set').trim() || 'Not set',
          createdAt: String(profile && profile.createdAt || entry && entry.createdAt || '').trim(),
          lastSeenAt: String(profile && profile.lastSeenAt || entry && entry.updatedAt || '').trim(),
          stays: []
        });
      }
      const record = recordsByKey.get(recordKey);
      const nextStay = {
        id: String(entry && entry.id || '').trim(),
        sourceTenantId: String(entry && entry.sourceTenantId || '').trim(),
        unitId: String(entry && entry.unitId || '').trim(),
        tenantName: String(entry && entry.tenantName || '').trim(),
        buildingName: String(entry && entry.buildingName || '').trim(),
        unit: String(entry && entry.unit || '').trim(),
        floor: String(entry && entry.floor || '').trim(),
        moveInDate: String(entry && entry.moveInDate || '').trim(),
        contractStart: String(entry && entry.contractStart || '').trim(),
        contractEnd: String(entry && entry.contractEnd || '').trim(),
        archivedOn: String(entry && entry.archivedOn || '').trim(),
        contractRent: Number(entry && entry.contractRent || 0),
        actualRent: Number(entry && entry.actualRent || 0),
        isActive: Number(entry && entry.isActive || 0) === 1 && Number(entry && entry.isArchived || 0) !== 1,
        isArchived: Number(entry && entry.isArchived || 0) === 1,
        createdAt: String(entry && entry.createdAt || '').trim(),
        updatedAt: String(entry && entry.updatedAt || '').trim(),
        notes: String(entry && entry.notes || '').trim()
      };
      const stayIdentity = buildStayIdentity(nextStay);
      const existingIndex = record.stays.findIndex((stay) => buildStayIdentity(stay) === stayIdentity);
      if (existingIndex < 0) {
        record.stays.push(nextStay);
        return;
      }
      const existingStay = record.stays[existingIndex];
      const existingRecency = getStayRecency(existingStay);
      const nextRecency = getStayRecency(nextStay);
      const shouldReplace = (
        (nextStay.isArchived && !existingStay.isArchived)
        || (nextStay.archivedOn && !existingStay.archivedOn)
        || nextRecency.localeCompare(existingRecency) > 0
      );
      if (shouldReplace) {
        record.stays[existingIndex] = nextStay;
      }
    });

    return Array.from(recordsByKey.values())
      .map((record) => {
        record.stays.sort((left, right) => String(right.archivedOn || right.contractStart || right.moveInDate || '').localeCompare(String(left.archivedOn || left.contractStart || left.moveInDate || '')));
        const latest = record.stays[0] || null;
        if (latest) {
          if (!record.fullName) record.fullName = String(latest.tenantName || '').trim();
          record.lastSeenAt = String(latest.archivedOn || latest.contractEnd || latest.contractStart || latest.moveInDate || record.lastSeenAt || '').trim();
        }
        record.activeStay = record.stays.find((stay) => stay.isActive) || null;
        return record;
      })
      .sort((left, right) => String(left.fullName || '').localeCompare(String(right.fullName || ''), 'en'));
  }

  function getTenantHistoryBuildingOptions(records) {
    const seen = new Set();
    return records
      .flatMap((record) => (record.stays || []).map((stay) => String(stay && stay.buildingName || '').trim()))
      .filter((buildingName) => {
        if (!buildingName || seen.has(buildingName)) return false;
        seen.add(buildingName);
        return true;
      })
      .sort((left, right) => left.localeCompare(right, 'en'));
  }

  function syncTenantHistoryBuildingFilter(records) {
    const filterNode = document.getElementById('tenantHistoryBuildingFilter');
    if (!filterNode) return 'all';
    const previousValue = String(filterNode.value || 'all').trim() || 'all';
    const options = getTenantHistoryBuildingOptions(records);
    filterNode.innerHTML = `<option value="all">All buildings</option>${options.map((buildingName) => `<option value="${escapeHtml(buildingName)}">${escapeHtml(getBuildingDisplayLabel(buildingName))}</option>`).join('')}`;
    const nextValue = options.includes(previousValue) ? previousValue : 'all';
    filterNode.value = nextValue;
    return nextValue;
  }

  function renderTenantHistoryPage() {
    const list = document.getElementById('tenantHistoryList');
    const summary = document.getElementById('tenantHistorySummary');
    const searchNode = document.getElementById('tenantHistorySearch');
    if (!list) return;

    const records = buildTenantHistoryRecords();
    const selectedBuilding = syncTenantHistoryBuildingFilter(records);
    const search = String(searchNode && searchNode.value || '').trim().toLowerCase();
    const filtered = records.filter((record) => {
      const matchesBuilding = selectedBuilding === 'all' || (record.stays || []).some((stay) => String(stay && stay.buildingName || '').trim() === selectedBuilding);
      if (!matchesBuilding) return false;
      if (!search) return true;
      const haystack = [
        record.fullName,
        record.civilId,
        record.phone,
        record.nationality,
        ...(record.stays || []).map((stay) => `${stay.buildingName} ${stay.unit} ${stay.floor} ${stay.notes}`)
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });

    if (summary) {
      const activeCount = filtered.filter((record) => record.activeStay).length;
      const stayCount = filtered.reduce((total, record) => total + Number(record.stays && record.stays.length || 0), 0);
      summary.innerHTML = `
        <span class="metric-pill">Profiles ${escapeHtml(String(filtered.length))}</span>
        <span class="metric-pill">Active now ${escapeHtml(String(activeCount))}</span>
        <span class="metric-pill">Stays ${escapeHtml(String(stayCount))}</span>
      `;
    }

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">No tenant history found.</div>';
      return;
    }

    list.innerHTML = filtered.map((record) => {
      const latestStay = record.stays[0] || null;
      const statusLabel = record.activeStay ? `Active in ${record.activeStay.buildingName}` : 'Archived';
      const stayRows = record.stays.map((stay) => `
        <tr>
          <td>
            <div class="tenant-history-building-cell">
              <strong>${escapeHtml(getBuildingDisplayLabel(stay.buildingName || '-'))}</strong>
              <span class="small-note">${escapeHtml(stay.isActive ? 'Current stay' : 'Archived stay')}</span>
            </div>
          </td>
          <td>${escapeHtml(stay.unit || '-')}</td>
          <td>${escapeHtml(stay.floor || '-')}</td>
          <td>${escapeHtml(stay.moveInDate ? formatDate(stay.moveInDate) : '-')}</td>
          <td>${escapeHtml(stay.contractStart ? formatDate(stay.contractStart) : '-')}</td>
          <td>${escapeHtml(stay.contractEnd ? formatDate(stay.contractEnd) : '-')}</td>
          <td>${escapeHtml(stay.archivedOn ? formatDate(stay.archivedOn) : (stay.contractEnd ? formatDate(stay.contractEnd) : '-'))}</td>
          <td>${stay.contractRent > 0 ? escapeHtml(formatCurrency(stay.contractRent)) : '-'}</td>
          <td><span class="badge ${stay.isActive ? 'badge-paid' : 'badge-vacant'}">${escapeHtml(stay.isActive ? 'Active' : 'Past')}</span></td>
        </tr>
      `).join('');

      return `
        <article class="history-card">
          <div class="history-card-header">
            <div>
              <h3>${escapeHtml(record.fullName || latestStay && latestStay.sourceTenantId || 'Unnamed tenant')}</h3>
              <div class="small-note">${escapeHtml(statusLabel)}</div>
            </div>
            <div class="history-card-meta">
              <div class="small-note">Civil ID: ${escapeHtml(record.civilId || '-')}</div>
              <div class="small-note">Phone: ${escapeHtml(record.phone || '-')}</div>
              <div class="small-note">Nationality: ${escapeHtml(record.nationality || '-')}</div>
            </div>
          </div>
          <div class="table-scroll">
            <table class="building-table tenant-history-table">
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Unit</th>
                  <th>Floor</th>
                  <th>Move in</th>
                  <th>Contract start</th>
                  <th>Contract end</th>
                  <th>Left</th>
                  <th>Rent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${stayRows}</tbody>
            </table>
          </div>
        </article>
      `;
    }).join('');
  }

  function bindTenantHistoryPage() {
    const searchNode = document.getElementById('tenantHistorySearch');
    const buildingFilterNode = document.getElementById('tenantHistoryBuildingFilter');
    if (!searchNode) return;
    searchNode.addEventListener('input', () => renderTenantHistoryPage());
    if (buildingFilterNode) {
      buildingFilterNode.addEventListener('change', () => renderTenantHistoryPage());
    }
  }
