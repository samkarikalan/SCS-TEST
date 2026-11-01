import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const roles = await readFile(new URL('./role-workspaces.js', import.meta.url), 'utf8');

test('shared page titles cover every manager destination', () => {
  for (const [id, title] of Object.entries({
    scsActivityHome: 'Club Manager',
    settingsPage: 'Settings',
    vaultModifyPage: 'Player Manager',
    roundsPage: 'Round Manager',
    vaultPage: 'Slot Manager',
    dashboardPage: 'Dashboard',
  })) {
    assert.match(html, new RegExp(`${id}:'${title}'`), `${id} must render ${title}`);
  }
  assert.match(html, /scs-tmgr-simple-brand">Tournament Manager</);
});

test('role menus expose the correct destinations', () => {
  const manager = ['Club Manager Home', 'Members &amp; Players', 'Round Manager', 'Slot Manager', 'Tournaments', 'Dashboard', 'Settings', 'Account'];
  const member = ['Member Home', 'My Clubs', 'My Slots', 'Round Manager', 'Tournaments', 'Settings', 'Account'];
  for (const label of manager) assert.ok(html.includes(label), `manager menu missing ${label}`);
  for (const label of member) assert.ok(html.includes(label), `member menu missing ${label}`);
  assert.match(html, /data-scs-roles="manager"[^>]*onclick="scsRoleMenuNavigate\('players'\)"/);
  assert.match(html, /data-scs-roles="member"[^>]*onclick="scsRoleMenuNavigate\('my-slots'\)"/);
});

test('home routes close competing overlays and use role-aware returns', () => {
  assert.match(roles, /TournamentNavigation\.close/);
  assert.match(roles, /scsActivityShowHome/);
  assert.match(roles, /scsReturnToRoleHome/);
  assert.match(html, /id="vaultModifyPage"[\s\S]*?onclick="scsReturnToRoleHome\(\)"/);
  assert.match(html, /id="dashboardPage"[\s\S]*?onclick="scsReturnToRoleHome\(\)"/);
  assert.match(html, /document\.body\.dataset\.scsRoleWorkspace==='member'[\s\S]*?scsRoleMenuNavigate\('member-home'\)/);
  assert.match(roles, /practiceHub\.checked = true/, 'Round Manager must hide the Practice welcome overlay');
  assert.match(html, /id="playersBackBtn" onclick="scsCloseVisiblePlayerManager\(\)"/);
  assert.match(html, /id="scsRoundPlayersDone"[\s\S]*?onclick="scsCloseVisiblePlayerManager\(\)"/);
});

test('settings and active club use the role-aware canonical flows', () => {
  assert.match(roles, /__scsSettingsReturnState = \{ activityHome:true \}/);
  assert.match(roles, /getMyClub/);
  assert.match(html, /var activeClub=null;try\{if\(typeof getMyClub==='function'\)activeClub=getMyClub\(\)\}/);
});
