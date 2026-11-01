/* V600: two user-facing workspaces over the existing compatible app modes. */
(function () {
  'use strict';

  var CACHE_KEY = 'scs_role_access_v1';
  var ACTIVE_KEY = 'scs_active_role_workspace';
  var SESSION_KEY = 'scs_role_chosen_session';
  var access = { member:true, manager:false, managerClubIds:[] };

  function user() { return typeof authGetUser === 'function' ? authGetUser() : null; }
  function unique(values) { return values.filter(function (value, index, list) { return value && list.indexOf(value) === index; }); }
  function cacheKey(account) { return CACHE_KEY + '_' + String(account && account.id || 'guest'); }
  function readCache(account) {
    try { return JSON.parse(localStorage.getItem(cacheKey(account)) || 'null'); } catch (_) { return null; }
  }
  function writeCache(account, value) {
    try { localStorage.setItem(cacheKey(account), JSON.stringify(value)); } catch (_) {}
  }

  async function loadAccess(force) {
    var account = user();
    if (!account || !account.id) { access = { member:true, manager:false, managerClubIds:[] }; return access; }
    if (!force) {
      var cached = readCache(account);
      if (cached && Date.now() - Number(cached.updatedAt || 0) < 5 * 60 * 1000) { access = cached; return access; }
    }
    try {
      var rows = await sbGet('user_club_roles', 'user_account_id=eq.' + encodeURIComponent(account.id) + '&vault_verified=eq.true&select=club_id');
      var owned = await sbGet('clubs', 'created_by=eq.' + encodeURIComponent(account.id) + '&select=id').catch(function () { return []; });
      var ids = unique((rows || []).map(function (row) { return String(row.club_id || ''); }).concat((owned || []).map(function (club) { return String(club.id || ''); })));
      access = { member:true, manager:ids.length > 0, managerClubIds:ids, updatedAt:Date.now() };
      writeCache(account, access);
    } catch (_) {
      access = readCache(account) || { member:true, manager:false, managerClubIds:[] };
    }
    return access;
  }

  function currentRole() {
    return localStorage.getItem(ACTIVE_KEY) === 'manager' && access.manager ? 'manager' : 'member';
  }

  function activeClubName(role) {
    var name = '';
    // Club Manager has its own selected club. Prefer it over the shared
    // member club so the drawer always identifies the workspace in use.
    if (role === 'manager') name = localStorage.getItem('kbrr_vault_club_name') || '';
    if (typeof getMyClub === 'function') {
      try { var club = getMyClub(); if (!name) name = club && club.name || ''; } catch (_) {}
    }
    if (!name) name = localStorage.getItem('kbrr_my_club_name') || '';
    return name || 'No active club';
  }

  function syncMenu(role) {
    role = role || currentRole();
    var activeClub = null;
    try { activeClub = typeof getMyClub === 'function' ? getMyClub() : null; } catch (_) {}
    var hasActiveClub = !!(activeClub && activeClub.id) || !!localStorage.getItem('kbrr_vault_club_id');
    document.body.dataset.scsRoleWorkspace = role;
    document.querySelectorAll('[data-scs-roles]').forEach(function (element) {
      var roles = String(element.getAttribute('data-scs-roles') || '').split(/\s+/);
      element.hidden = roles.indexOf(role) < 0 || (element.hasAttribute('data-scs-club-logged-in') && !hasActiveClub);
    });
    document.querySelectorAll('[data-scs-manager-only]').forEach(function (element) { element.hidden = !access.manager; });
    var drawerClub = document.querySelector('#scsPracticeSharedHeader .scs-phase1-ref-panel-title strong');
    if (drawerClub) drawerClub.textContent = activeClubName(role);
    var title = document.getElementById('scsPracticeSharedTitle');
    var activityHome = document.getElementById('scsActivityHome');
    if (title && role === 'manager' && activityHome && !activityHome.hidden) title.textContent = 'Club Manager';
    if (title && document.getElementById('scsPracticeSharedHeader') && !document.getElementById('scsPracticeSharedHeader').hidden) {
      title.dataset.roleWorkspace = role;
    }
  }

  function closeChooser() {
    var overlay = document.getElementById('scsRoleWorkspaceChooser');
    if (overlay) overlay.remove();
  }

  async function selectRole(role) {
    if (role === 'manager' && !access.manager) throw Error('Club Manager access is not available for this account.');
    role = role === 'manager' ? 'manager' : 'member';
    localStorage.setItem(ACTIVE_KEY, role);
    sessionStorage.setItem(SESSION_KEY, '1');
    closeChooser();
    syncMenu(role);
    if (role === 'manager') {
      if (typeof saveVisibleWorkspaces === 'function') saveVisibleWorkspaces(['vault']);
      if (typeof requestVaultMode === 'function') requestVaultMode();
      if (typeof scsActivityShowHome === 'function') scsActivityShowHome();
      // Do not schedule a second home opening: it can cover a page selected immediately after login.
    } else {
      if (typeof saveVisibleWorkspaces === 'function') saveVisibleWorkspaces(['viewer']);
      window.scsActivityMode = 'member';
      var activityHome = document.getElementById('scsActivityHome');
      if (activityHome) activityHome.hidden = true;
      if (typeof switchMode === 'function') switchMode('viewer');
      var memberHub = document.getElementById('scsPracticeShowHub');
      if (memberHub) {
        memberHub.checked = true;
        memberHub.dispatchEvent(new Event('change', { bubbles:true }));
      }
      if (typeof showHomeScreen === 'function') showHomeScreen();
    }
  }

  function showChooser() {
    closeChooser();
    var overlay = document.createElement('div');
    overlay.id = 'scsRoleWorkspaceChooser';
    overlay.className = 'scs-role-chooser';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'scsRoleChooserTitle');
    overlay.innerHTML = '<section class="scs-role-chooser-card"><small>SCS ACCOUNT</small><h2 id="scsRoleChooserTitle">How will you use SCS?</h2><p>Choose a workspace. You can switch later from the menu.</p><button type="button" data-role-choice="member"><span>♙</span><b>Member</b><em>Join slots, play tournaments and organise rounds</em></button>' +
      (access.manager ? '<button type="button" data-role-choice="manager"><span>▦</span><b>Club Manager</b><em>Manage players, slots, tournaments and your club</em></button>' : '') + '</section>';
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-role-choice]').forEach(function (button) {
      button.addEventListener('click', function () { selectRole(button.getAttribute('data-role-choice')).catch(function (error) { if (typeof showToast === 'function') showToast(error.message); }); });
    });
  }

  async function routeAfterLogin() {
    await loadAccess(true);
    // Do not recreate the chooser when another login callback finishes after
    // the user already selected a workspace in this tab.
    if (access.manager && sessionStorage.getItem(SESSION_KEY) !== '1') showChooser();
    else if (access.manager) await selectRole(currentRole());
    else await selectRole('member');
    return true;
  }

  async function switchWorkspace() {
    await loadAccess(false);
    if (access.manager) { sessionStorage.removeItem(SESSION_KEY); showChooser(); }
    else if (typeof showToast === 'function') showToast('This account has Member access only.');
  }

  function menuNavigate(target) {
    var drawer = document.querySelector('#scsPracticeSharedHeader details');
    if (drawer) drawer.open = false;
    if ((target === 'workspace-home' || target === 'member-home') && window.TournamentNavigation && typeof window.TournamentNavigation.close === 'function') {
      window.TournamentNavigation.close();
    }
    var activityHome = document.getElementById('scsActivityHome');
    if (activityHome && target !== 'workspace-home') {
      var closeActivityHome = function () { activityHome.hidden = true; };
      closeActivityHome();
      // Close synchronously. Delayed writes used to race against later navigation.
    }
    // A drawer selection owns the navigation. Retire the previous workspace
    // before calling a destination's loader: otherwise that loader can briefly
    // reveal the previous page (or a stale tournament overlay) underneath it.
    // The destination itself remains responsible for showing its own page.
    if (target !== 'member-home' && target !== 'workspace-home' &&
        target !== 'club-access' && target !== 'club-logout') {
      var oldHome = document.getElementById('homePageOverlay');
      if (oldHome) oldHome.style.display = 'none';
      document.querySelectorAll('.page').forEach(function (page) {
        page.style.display = 'none';
      });
      ['scsTournamentManager', 'scsTournamentContinue', 'scsTournamentLive',
       'scsTournamentTypePicker'].forEach(function (id) {
        var overlay = document.getElementById(id);
        if (overlay) overlay.hidden = true;
      });
    }
    if (target === 'member-home') { selectRole('member'); return; }
    if (target === 'workspace-home') { selectRole(currentRole()); return; }
    if (target === 'club-access') {
      if (typeof _showClubSetupSheet === 'function') _showClubSetupSheet('vault');
      else if (typeof showToast === 'function') showToast('Club login is not available yet.');
      return;
    }
    if (target === 'club-logout') {
      if (typeof welcomeLogoutWorkspace === 'function') welcomeLogoutWorkspace('vault');
      else if (typeof vaultLogoutClub === 'function') vaultLogoutClub();
      syncMenu('manager');
      if (typeof scsActivityShowHome === 'function') scsActivityShowHome();
      return;
    }
    if (target === 'clubs' || target === 'account') { if (typeof scsOpenStandaloneClubPage === 'function') scsOpenStandaloneClubPage(); return; }
    if (target === 'my-slots') {
      // Round Manager leaves appMode='organiser'. My Slots belongs to the
      // viewer workspace, so restore it before selecting the slots tab.
      // Do not call selectRole('member'): it resets the member home tab.
      if (typeof appMode !== 'undefined' && appMode !== 'viewer' &&
          typeof switchMode === 'function') switchMode('viewer');
      if (typeof homeOpenViewerSlots === 'function') homeOpenViewerSlots();
      return;
    }
    if (target === 'rounds') {
      // Prevent showHomeScreen() from treating this as an unset activity and
      // reopening Club Manager Home over Round Manager.
      window.scsActivityMode = 'practice';
      // The unchecked legacy hub switch displays the full-screen Practice
      // welcome layer. Round Manager shares that overlay, so hide the welcome.
      var practiceHub = document.getElementById('scsPracticeShowHub');
      if (practiceHub) practiceHub.checked = true;
      var id = currentRole() === 'manager'
        ? (localStorage.getItem('kbrr_vault_club_id') || localStorage.getItem('kbrr_org_club_id') || localStorage.getItem('kbrr_my_club_id') || '')
        : (localStorage.getItem('kbrr_org_club_id') || localStorage.getItem('kbrr_my_club_id') || '');
      if (typeof openOrganiserWorkspaceForMember === 'function') openOrganiserWorkspaceForMember(id);
      return;
    }
    if (target === 'tournaments') { if (typeof scsOpenTournamentManager === 'function') scsOpenTournamentManager(); return; }
    if (target === 'players') {
      // Open the requested page directly. scsPrimaryNavigate('vault') first
      // opens Slot Manager and can asynchronously repaint it over Players.
      if (typeof homeGo === 'function') homeGo('vaultModifyPage',null);
      if (typeof vaultRenderModify === 'function') vaultRenderModify();
      return;
    }
    if (target === 'slots') { if (typeof scsPrimaryNavigate === 'function') scsPrimaryNavigate('vault'); return; }
    if (target === 'dashboard') { if (typeof homeGo === 'function') homeGo('dashboardPage','tabBtnDashboard'); return; }
    if (target === 'settings') {
      if (typeof homeGo === 'function') homeGo('settingsPage', 'tabBtnSettings');
      if (currentRole() === 'manager') window.__scsSettingsReturnState = { activityHome:true };
    }
  }

  function closeVisiblePlayerManager() {
    var modify = document.getElementById('vaultModifyPage');
    if (modify && getComputedStyle(modify).display !== 'none') {
      modify.style.display = 'none';
      menuNavigate('workspace-home');
      return;
    }
    var players = document.getElementById('playersPage');
    if (players && getComputedStyle(players).display !== 'none' && typeof navBack === 'function') {
      navBack();
      return;
    }
    menuNavigate(currentRole() === 'manager' ? 'workspace-home' : 'member-home');
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadAccess(false).then(function () { syncMenu(); });
    var drawer = document.querySelector('#scsPracticeSharedHeader details');
    if (drawer) drawer.addEventListener('toggle', function () { if (drawer.open) syncMenu(); });
    var title = document.getElementById('scsPracticeSharedTitle');
    var activityHome = document.getElementById('scsActivityHome');
    if (title && activityHome && typeof MutationObserver === 'function') {
      var enforceTitle = function () {
        if (currentRole() === 'manager' && !activityHome.hidden && title.textContent !== 'Club Manager') title.textContent = 'Club Manager';
      };
      new MutationObserver(enforceTitle).observe(title, { childList:true, characterData:true, subtree:true });
      new MutationObserver(enforceTitle).observe(activityHome, { attributes:true, attributeFilter:['hidden'] });
    }
    var authOverlay = document.getElementById('authOverlay');
    if (authOverlay && activityHome && typeof MutationObserver === 'function') {
      var protectLoggedOutHome = function () {
        if (getComputedStyle(authOverlay).display !== 'none') activityHome.hidden = true;
      };
      new MutationObserver(protectLoggedOutHome).observe(authOverlay, { attributes:true, attributeFilter:['style','class','hidden'] });
      protectLoggedOutHome();
    }
  });
  window.addEventListener('storage', function (event) {
    if (!event.key || event.key === ACTIVE_KEY || /kbrr_(my|org|vault)_club_(id|name)/.test(event.key)) syncMenu();
  });

  window.SCSRoleWorkspaces = Object.freeze({ loadAccess:loadAccess, routeAfterLogin:routeAfterLogin, select:selectRole, switchWorkspace:switchWorkspace, syncMenu:syncMenu, current:currentRole, menuNavigate:menuNavigate });
  window.scsRouteAfterLoginByRole = routeAfterLogin;
  window.scsSwitchRoleWorkspace = switchWorkspace;
  window.scsRoleMenuNavigate = menuNavigate;
  window.scsCloseVisiblePlayerManager = closeVisiblePlayerManager;
  window.scsReturnToRoleHome = function () { menuNavigate(currentRole() === 'member' ? 'member-home' : 'workspace-home'); };
})();
