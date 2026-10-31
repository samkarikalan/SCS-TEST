/* Persistent signed-in account indicator. Uses the existing custom auth session. */
(function () {
  'use strict';

  function text(value) {
    return value == null ? '' : String(value);
  }

  function currentClub() {
    try {
      if (typeof getMyClub === 'function') return getMyClub() || null;
    } catch (_) {}
    var id = localStorage.getItem('kbrr_my_club_id');
    var name = localStorage.getItem('kbrr_my_club_name');
    return id || name ? { id: id, name: name } : null;
  }

  function displayName(user) {
    return text(user && (user.nickname || user.displayName || user.name)) || 'Signed in';
  }

  function isScsHomeVisible() {
    var home = document.getElementById('scsActivityHome');
    if (!home || home.hidden) return false;
    var style = window.getComputedStyle(home);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function initials(name) {
    var parts = text(name).trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || 'U').slice(0, 2)).toUpperCase();
  }

  function setHidden(element, hidden) {
    if (element && element.hidden !== hidden) element.hidden = hidden;
  }

  function ensureWidget() {
    var host = document.getElementById('scsAccountStatus');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'scsAccountStatus';
    host.className = 'scs-account-status';
    host.hidden = true;
    host.innerHTML =
      '<button type="button" class="scs-account-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="scsAccountMenu">' +
        '<span class="scs-account-avatar" aria-hidden="true">U</span>' +
        '<span class="scs-account-trigger-name"></span>' +
      '</button>' +
      '<div id="scsAccountMenu" class="scs-account-menu" hidden>' +
        '<strong class="scs-account-name"></strong>' +
        '<span class="scs-account-email"></span>' +
        '<span class="scs-account-club"></span>' +
        '<button type="button" class="scs-account-logout">Logout</button>' +
      '</div>';
    document.body.appendChild(host);

    var trigger = host.querySelector('.scs-account-trigger');
    var menu = host.querySelector('.scs-account-menu');
    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    host.querySelector('.scs-account-logout').addEventListener('click', function () {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (typeof authDoLogout === 'function') authDoLogout();
    });
    document.addEventListener('click', function (event) {
      if (!host.contains(event.target)) {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    return host;
  }

  function refreshAccountStatus() {
    var host = ensureWidget();
    var user = typeof authGetUser === 'function' ? authGetUser() : null;
    setHidden(host, !user || !isScsHomeVisible());
    if (!user || host.hidden) return;

    var name = displayName(user);
    var club = currentClub();
    host.querySelector('.scs-account-trigger').setAttribute('aria-label', 'Signed in as ' + name + '. Open account menu');
    host.querySelector('.scs-account-avatar').textContent = initials(name);
    host.querySelector('.scs-account-trigger-name').textContent = name;
    host.querySelector('.scs-account-name').textContent = name;
    var email = host.querySelector('.scs-account-email');
    email.textContent = text(user.email);
    setHidden(email, !user.email);
    var clubLine = host.querySelector('.scs-account-club');
    clubLine.textContent = club && club.name ? 'Club: ' + club.name : 'No active club';
  }

  window.scsRefreshAccountStatus = refreshAccountStatus;
  document.addEventListener('DOMContentLoaded', function () {
    refreshAccountStatus();
    new MutationObserver(refreshAccountStatus).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'hidden', 'class']
    });
  });
  window.addEventListener('storage', refreshAccountStatus);
  document.addEventListener('click', function () { setTimeout(refreshAccountStatus, 0); }, true);
})();
