/* V600: two user-facing workspaces over the existing compatible app modes. */
(function () {
  'use strict';

  var ACTIVE_KEY = 'scs_active_role_workspace';
  var SESSION_KEY = 'scs_role_chosen_session';
  // Both workspaces are included in the single SCS license.
  var access = { member:true, manager:true, managerClubIds:[] };

  async function loadAccess() { return access; }

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
    // One rule for the existing menu: a selected club disables Club Login.
    // Use the same selected-club state already displayed in this drawer.
    document.querySelectorAll('[data-scs-club-login]').forEach(function (button) {
      button.disabled = hasActiveClub;
      button.setAttribute('aria-disabled', String(hasActiveClub));
      button.title = hasActiveClub ? 'A club is already selected' : '';
    });
    // Refresh existing drawer labels from the selected app language.
    var menuLanguage = (typeof currentLang !== 'undefined' && currentLang) || localStorage.getItem('appLanguage') || 'en';
    var menuDictionary = typeof translations !== 'undefined' ? (translations[menuLanguage] || translations.en || {}) : {};
    document.querySelectorAll('#scsPracticeSharedHeader [data-i18n]').forEach(function (element) {
      var value = menuDictionary[element.dataset.i18n];
      if (value) element.textContent = value;
    });
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
    if (title && role === 'manager' && activityHome && !activityHome.hidden) title.textContent = (typeof translations!=='undefined'&&translations[(typeof currentLang!=='undefined'&&currentLang)||localStorage.getItem('appLanguage')||'en']||{}).scsClubManagerRole || 'Club Manager';
    if (title && document.getElementById('scsPracticeSharedHeader') && !document.getElementById('scsPracticeSharedHeader').hidden) {
      title.dataset.roleWorkspace = role;
    }
  }

  function closeChooser() {
    var overlay = document.getElementById('scsRoleWorkspaceChooser');
    if (overlay) overlay.remove();
  }

  async function selectRole(role) {
    role = role === 'manager' ? 'manager' : 'member';
    localStorage.setItem(ACTIVE_KEY, role);
    sessionStorage.setItem(SESSION_KEY, '1');
    closeChooser();
    syncMenu(role);
    if (role === 'manager') {
      if (typeof saveVisibleWorkspaces === 'function') saveVisibleWorkspaces(['vault']);
      // Home is not a Vault login operation. Never invoke requestVaultMode
      // while restoring an already-authorised manager workspace.
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
    // The existing Settings language selection also applies to this dynamic chooser.
    overlay.innerHTML = '<section class="scs-role-chooser-card"><small data-i18n="scsAccount">SCS ACCOUNT</small><h2 id="scsRoleChooserTitle" data-i18n="scsWorkspaceQuestion">How will you use SCS?</h2><p data-i18n="scsWorkspaceHint">Choose a workspace. You can switch later from the menu.</p><button type="button" data-role-choice="member"><span>♙</span><b data-i18n="scsMemberRole">Member</b><em data-i18n="scsMemberRoleDesc">Join slots, play tournaments and organise rounds</em></button>' +
      '<button type="button" data-role-choice="manager"><span>▦</span><b data-i18n="scsClubManagerRole">Club Manager</b><em data-i18n="scsClubManagerRoleDesc">Manage players, slots, tournaments and your club</em></button></section>';
    var language = (typeof currentLang !== 'undefined' && currentLang) || localStorage.getItem('appLanguage') || 'en';
    var dictionary = typeof translations !== 'undefined' ? (translations[language] || translations.en || {}) : {};
    overlay.querySelectorAll('[data-i18n]').forEach(function (element) {
      var translated = dictionary[element.dataset.i18n];
      if (translated) element.textContent = translated;
    });
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-role-choice]').forEach(function (button) {
      button.addEventListener('click', function () { selectRole(button.getAttribute('data-role-choice')).catch(function (error) { if (typeof showToast === 'function') showToast(error.message); }); });
    });
  }

  async function routeAfterLogin() {
    await loadAccess(true);
    // Do not recreate the chooser when another login callback finishes after
    // the user already selected a workspace in this tab.
    if (sessionStorage.getItem(SESSION_KEY) !== '1') showChooser();
    else await selectRole(currentRole());
    return true;
  }

  async function switchWorkspace() {
    await loadAccess(false);
    sessionStorage.removeItem(SESSION_KEY);
    showChooser();
  }

  function menuNavigate(target) {
    // A destination selected from the shared hamburger closes Club Login.
    // Opening/dismissing the hamburger itself never changes the current page.
    if (target !== 'club-access') {
      var clubSetup = document.getElementById('clubSetupSheetOverlay');
      if (clubSetup && typeof _clubSetupClose === 'function') _clubSetupClose(false);
    }

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
      // Do not navigate or authenticate when already connected to a club.
      var memberClub = null;
      try { memberClub = typeof getMyClub === 'function' ? getMyClub() : null; } catch (_) {}
      if ((memberClub && memberClub.id) || localStorage.getItem('kbrr_vault_club_id')) {
        syncMenu();
        return;
      }
      // No selected club: open the proven Club Login / Create page directly.
      if (typeof _showClubSetupSheet === 'function') _showClubSetupSheet('vault');
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
        if (currentRole() === 'manager' && !activityHome.hidden && title.textContent !== ((typeof translations!=='undefined'&&translations[(typeof currentLang!=='undefined'&&currentLang)||localStorage.getItem('appLanguage')||'en']||{}).scsClubManagerRole || 'Club Manager')) title.textContent = (typeof translations!=='undefined'&&translations[(typeof currentLang!=='undefined'&&currentLang)||localStorage.getItem('appLanguage')||'en']||{}).scsClubManagerRole || 'Club Manager';
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
