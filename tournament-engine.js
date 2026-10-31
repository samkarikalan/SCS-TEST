/* Authenticated client for authoritative Tournament Manager computations. */
(function () {
  'use strict';

  async function run(action, payload) {
    if (navigator.onLine === false) throw new Error('Tournament engine requires a connection.');
    var user = typeof authGetUser === 'function' ? authGetUser() : null;
    var token = typeof _getLocalToken === 'function' ? _getLocalToken() : null;
    if (!user || !user.id || !token) throw new Error('Sign in again to use the tournament engine.');
    var response = await fetch(WORKER_URL + '/tournament/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        payload: payload || {},
        userAccountId: user.id,
        sessionToken: token
      })
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(data.error || ('Tournament engine failed (' + response.status + ')'));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  window.SCSTournamentEngine = Object.freeze({ run: run });
})();
