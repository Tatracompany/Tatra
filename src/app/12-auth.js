  function getCurrentUser() {
    const stored = safeStorageGet(CURRENT_USER_KEY);
    if (stored) return stored;
    safeStorageSet(CURRENT_USER_KEY, ADMIN_USERNAME);
    return ADMIN_USERNAME;
  }

  function isAuthenticated() {
    return safeStorageGet(AUTH_KEY) === 'ok';
  }

  function getCurrentRole() {
    return String(safeStorageGet(AUTH_ROLE_KEY) || '');
  }

  function setAuthenticatedUser(username, role) {
    safeStorageSet(AUTH_KEY, 'ok');
    safeStorageSet(CURRENT_USER_KEY, String(username || ADMIN_USERNAME));
    safeStorageSet(AUTH_ROLE_KEY, String(role || 'employee'));
  }

  function logoutCurrentUser() {
    safeStorageSet(AUTH_KEY, '');
    safeStorageSet(CURRENT_USER_KEY, '');
    safeStorageSet(AUTH_ROLE_KEY, '');
    window.location.href = 'index.html';
  }

  function getDefaultAccounts() {
    return [{
      id: 'account-admin-yousef',
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString()
    }];
  }

  function loadAccounts() {
    try {
      const raw = safeStorageGet(ACCOUNTS_KEY);
      if (!raw) {
        const accounts = getDefaultAccounts();
        safeStorageSet(ACCOUNTS_KEY, JSON.stringify(accounts));
        return accounts;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Invalid accounts');
      const accounts = parsed
        .filter((account) => account && account.username)
        .map((account, index) => Object.assign({
          id: `account-${index}`,
          password: '',
          role: 'employee',
          active: true,
          createdAt: new Date().toISOString()
        }, account, {
          username: String(account.username || '').trim().toLowerCase(),
          password: String(account.password || ''),
          role: String(account.role || 'employee') === 'admin' ? 'admin' : 'employee',
          active: account.active !== false
        }));
      if (!accounts.some((account) => account.username === ADMIN_USERNAME)) {
        accounts.unshift(getDefaultAccounts()[0]);
      }
      safeStorageSet(ACCOUNTS_KEY, JSON.stringify(accounts));
      return accounts;
    } catch (error) {
      const accounts = getDefaultAccounts();
      safeStorageSet(ACCOUNTS_KEY, JSON.stringify(accounts));
      return accounts;
    }
  }

  function saveAccounts(accounts) {
    safeStorageSet(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function requireAuthForPage() {
    const currentPage = String((document.body && document.body.dataset.page) || '');
    if (currentPage === 'index') return true;
    if (isAuthenticated()) return true;
    window.location.href = 'index.html';
    return false;
  }

  function requireAdminForPage() {
    const currentPage = String((document.body && document.body.dataset.page) || '');
    if (currentPage !== 'admin') return true;
    if (getCurrentRole() === 'admin') return true;
    window.location.href = 'dashboard.html';
    return false;
  }

  function bindLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    if (isAuthenticated()) {
      window.location.href = 'dashboard.html';
      return;
    }
    const message = document.getElementById('loginMessage');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const username = String(formData.get('username') || '').trim().toLowerCase();
      const password = String(formData.get('password') || '');
      const account = loadAccounts().find((item) => item.username === username && item.password === password && item.active);
      if (account) {
        setAuthenticatedUser(account.username, account.role);
        if (message) {
          message.textContent = 'Login successful. Opening dashboard...';
          message.classList.remove('is-error');
        }
        window.setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 150);
        return;
      }
      if (message) {
        message.textContent = 'Invalid username or password.';
        message.classList.add('is-error');
      }
    });
  }

  function bindLogoutButton() {
    const button = document.querySelector('[data-logout-button]');
    if (!button) return;
    button.addEventListener('click', () => {
      logoutCurrentUser();
    });
  }
