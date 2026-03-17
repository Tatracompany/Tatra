  function renderSidebarUser() {
    document.querySelectorAll('#sidebarUser').forEach((node) => {
      const role = getCurrentRole();
      node.textContent = role ? `${getCurrentUser()} (${role})` : getCurrentUser();
    });
    document.querySelectorAll('[data-admin-link]').forEach((node) => {
      node.style.display = getCurrentRole() === 'admin' ? '' : 'none';
    });
    renderWorkingMonthCard();
  }

  function getCurrentInterfaceMonth() {
    const currentPage = String((document.body && document.body.dataset.page) || '');
    if (currentPage === 'buildings') return getSelectedBuildingMonth();
    if (currentPage === 'tenants') return getSelectedTenantMonth();
    if (currentPage === 'due') return getSelectedDueMonth();
    if (currentPage === 'vacant') return getSelectedVacantMonth();
    return getActiveMonthKey();
  }

  function syncPageMonthToActive(activeMonth) {
    const currentPage = String((document.body && document.body.dataset.page) || '');
    if (currentPage === 'buildings') {
      window.__selectedBuildingMonth = activeMonth;
      saveBuildingViewPreference();
    }
    if (currentPage === 'tenants') window.__selectedTenantMonth = activeMonth;
    if (currentPage === 'due') window.__selectedDueMonth = activeMonth;
    if (currentPage === 'vacant') window.__selectedVacantMonth = activeMonth;
  }

  function handleWorkingMonthChange(nextMonth) {
    const activeMonth = setActiveMonthKey(nextMonth);
    syncPageMonthToActive(activeMonth);
    if (!window.__appState) return;
    const selectedBuilding = window.__selectedBuildingName || getDefaultBuildingName(window.__appState);
    renderAll(window.__appState, selectedBuilding);
  }

  function renderWorkingMonthCard() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const card = sidebar.querySelector('[data-working-month-card]');
    if (card) card.remove();
  }

  function renderMonthPhaseBanner() {
    const pageShell = document.querySelector('.page-shell');
    if (!pageShell) return;
    let banner = pageShell.querySelector('[data-month-phase-banner]');
    if (!banner) {
      banner = document.createElement('section');
      banner.className = 'month-phase-banner';
      banner.setAttribute('data-month-phase-banner', 'true');
      const hero = pageShell.querySelector('.hero');
      if (hero && hero.nextSibling) {
        pageShell.insertBefore(banner, hero.nextSibling);
      } else {
        pageShell.insertBefore(banner, pageShell.firstChild);
      }
    }
    const selectedMonth = getCurrentInterfaceMonth();
    const isPreview = isPreviewOnlyMonth(selectedMonth);
    banner.classList.toggle('is-preview', isPreview);
    banner.innerHTML = isPreview
      ? `<strong>${escapeHtml(formatMonth(selectedMonth))} preview month.</strong><span>This month is not currently open for editing.</span>`
      : `<strong>${escapeHtml(formatMonth(selectedMonth))} working month.</strong><span>You are working directly in January.</span>`;
  }

  function renderAdminAccounts() {
    const list = document.getElementById('accountList');
    const summary = document.getElementById('accountSummary');
    if (!list) return;
    const accounts = loadAccounts();
    if (summary) {
      summary.innerHTML = [
        `<span class="metric-pill">Admins ${accounts.filter((account) => account.role === 'admin').length}</span>`,
        `<span class="metric-pill">Employees ${accounts.filter((account) => account.role !== 'admin').length}</span>`,
        `<span class="metric-pill">Active ${accounts.filter((account) => account.active).length}</span>`
      ].join('');
    }
    list.innerHTML = accounts.map((account) => `
      <article class="account-card${account.active ? '' : ' is-inactive'}">
        <div class="account-main">
          <div>
            <strong>${escapeHtml(account.username)}</strong>
            <div class="small-note">${escapeHtml(account.role)}</div>
          </div>
          <span class="badge ${account.active ? 'badge-paid' : 'badge-unpaid'}">${account.active ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="account-grid">
          <label>Username<input type="text" value="${escapeHtml(account.username)}" data-account-username="${escapeHtml(account.id)}"${account.role === 'admin' ? ' readonly' : ''}></label>
          <label>Password<input type="text" value="${escapeHtml(account.password)}" data-account-password="${escapeHtml(account.id)}"></label>
          <label>Role<select data-account-role="${escapeHtml(account.id)}"${account.role === 'admin' ? ' disabled' : ''}><option value="employee"${account.role === 'employee' ? ' selected' : ''}>Employee</option><option value="admin"${account.role === 'admin' ? ' selected' : ''}>Admin</option></select></label>
        </div>
        <div class="account-actions">
          <button type="button" class="secondary-action" data-save-account="${escapeHtml(account.id)}">Save account</button>
          ${account.role === 'admin' ? '' : `<button type="button" class="secondary-action" data-toggle-account="${escapeHtml(account.id)}">${account.active ? 'Disable' : 'Enable'}</button><button type="button" class="secondary-action" data-delete-account="${escapeHtml(account.id)}">Delete</button>`}
        </div>
      </article>
    `).join('');
  }

  function bindAdminActions() {
    const form = document.getElementById('accountForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const username = String(formData.get('username') || '').trim().toLowerCase();
        const password = String(formData.get('password') || '');
        const role = String(formData.get('role') || 'employee') === 'admin' ? 'admin' : 'employee';
        if (!username || !password) {
          showFlashMessage('Enter username and password.');
          return;
        }
        const accounts = loadAccounts();
        if (accounts.some((account) => account.username === username)) {
          showFlashMessage('Username already exists.');
          return;
        }
        accounts.push({
          id: `account-${Date.now()}`,
          username,
          password,
          role,
          active: true,
          createdAt: new Date().toISOString()
        });
        saveAccounts(accounts);
        form.reset();
        renderAdminAccounts();
        bindAdminActions();
        showFlashMessage(`Account created for ${username}.`);
      });
    }

    const list = document.getElementById('accountList');
    if (!list || list.dataset.bound === 'true') return;
    list.dataset.bound = 'true';
    list.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const saveId = target.getAttribute('data-save-account');
      const toggleId = target.getAttribute('data-toggle-account');
      const deleteId = target.getAttribute('data-delete-account');
      if (saveId) {
        const accounts = loadAccounts();
        const account = accounts.find((item) => item.id === saveId);
        if (!account) return;
        const usernameInput = document.querySelector(`[data-account-username="${saveId}"]`);
        const passwordInput = document.querySelector(`[data-account-password="${saveId}"]`);
        const roleInput = document.querySelector(`[data-account-role="${saveId}"]`);
        const previousUsername = String(account.username || '');
        const nextUsername = String(usernameInput && usernameInput.value || account.username).trim().toLowerCase();
        if (!nextUsername) {
          showFlashMessage('Username cannot be empty.');
          return;
        }
        if (accounts.some((item) => item.id !== saveId && item.username === nextUsername)) {
          showFlashMessage('Username already exists.');
          return;
        }
        account.username = nextUsername;
        account.password = String(passwordInput && passwordInput.value || account.password);
        if (account.role !== 'admin') {
          account.role = String(roleInput && roleInput.value || account.role) === 'admin' ? 'admin' : 'employee';
        }
        saveAccounts(accounts);
        if (getCurrentUser() === previousUsername) {
          safeStorageSet(CURRENT_USER_KEY, account.username);
          safeStorageSet(AUTH_ROLE_KEY, account.role);
        }
        renderAdminAccounts();
        bindAdminActions();
        showFlashMessage(`Saved ${account.username}.`);
        return;
      }
      if (toggleId) {
        const accounts = loadAccounts();
        const account = accounts.find((item) => item.id === toggleId);
        if (!account || account.role === 'admin') return;
        account.active = !account.active;
        saveAccounts(accounts);
        renderAdminAccounts();
        bindAdminActions();
        showFlashMessage(`${account.username} ${account.active ? 'enabled' : 'disabled'}.`);
        return;
      }
      if (deleteId) {
        const accounts = loadAccounts();
        const account = accounts.find((item) => item.id === deleteId);
        if (!account || account.role === 'admin') return;
        if (!window.confirm(`Delete account ${account.username}?`)) return;
        saveAccounts(accounts.filter((item) => item.id !== deleteId));
        renderAdminAccounts();
        bindAdminActions();
        showFlashMessage(`Deleted ${account.username}.`);
      }
    });
  }

  function buildStateExportFilename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `tatra-state-${stamp}.json`;
  }

  function exportCurrentAppState() {
    const state = window.__appState;
    if (!state || typeof state !== 'object') {
      showFlashMessage('No live app state was found to export.');
      return;
    }
    const stateRaw = JSON.stringify(state, null, 2);
    const blob = new Blob([stateRaw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildStateExportFilename();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    const message = document.getElementById('stateExportMessage');
    if (message) {
      message.textContent = 'State JSON downloaded. You can import it with: npm run db:import-state -- <path-to-file>';
    }
    showFlashMessage('State JSON downloaded.');
  }

  function bindStateExportActions() {
    const button = document.querySelector('[data-export-app-state]');
    if (!button || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      exportCurrentAppState();
    });
  }
