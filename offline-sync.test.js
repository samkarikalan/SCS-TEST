const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const tables = new Map();
const operations = new Map();
const events = [];
let operationCounter = 0;
const storeFor = name => {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
};

const offlineDb = {
  mirroredTables: ['clubs','players','memberships','sessions','matches','slots','slot_claims'],
  async saveTableRows(table, rows) {
    const store = storeFor(table);
    (Array.isArray(rows) ? rows : [rows]).forEach(row => { if (row && row.id != null) store.set(row.id, structuredClone(row)); });
  },
  async getTableRows(table) { return [...storeFor(table).values()].map(structuredClone); },
  async deleteTableRow(table, id) { storeFor(table).delete(id); },
  async enqueuePracticeOperation(operation) {
    const item = {...operation, operation_id:operation.operation_id || `operation-${++operationCounter}`, status:operation.status || 'pending', created_at:operation.created_at || new Date().toISOString()};
    operations.set(item.operation_id, structuredClone(item));
    return item;
  },
  async getPracticeOperations(status) { return [...operations.values()].filter(item => !status || item.status === status).map(structuredClone); },
  async updatePracticeOperation(id, changes) { const next = {...operations.get(id), ...changes}; operations.set(id, next); return next; },
  async completePracticeOperation(id) { operations.delete(id); }
};

const context = vm.createContext({
  console,
  URLSearchParams,
  structuredClone,
  Math,
  Date,
  Set,
  Map,
  Promise,
  navigator: { onLine: false },
  crypto: { randomUUID: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })() },
  CustomEvent: function(type, init) { this.type = type; this.detail = init && init.detail; },
  setTimeout: () => 0,
  clearTimeout: () => {},
  document: {},
  SCSOfflineDB: offlineDb,
  window: {
    SCSOfflineDB: offlineDb,
    crypto: null,
    addEventListener() {},
    dispatchEvent(event) { events.push(event); }
  }
});
context.window.crypto = context.crypto;

const service = fs.readFileSync('supabase.js', 'utf8');
const genericLayer = service.split('// ─────────────────────────────────────────────────────────────\n//  TOURNAMENTS')[0];
vm.runInContext(genericLayer, context, { filename: 'supabase.js' });

(async () => {
  const created = await vm.runInContext(`sbPost('sessions',{club_id:'club-1',status:'live',updated_at:'2026-01-01'})`, context);
  assert.equal(created.length, 1);
  const sessionId = created[0].id;
  assert.ok(sessionId);

  let rows = await vm.runInContext(`sbGet('sessions','club_id=eq.club-1&status=eq.live&select=*')`, context);
  assert.equal(rows.length, 1);

  rows = await vm.runInContext(`sbPatch('sessions','id=eq.${sessionId}',{status:'completed'})`, context);
  assert.equal(rows[0].status, 'completed');

  await vm.runInContext(`sbUpsert('players',{id:'player-1',club_id:'club-1',nickname:'Kari'},'id')`, context);
  rows = await vm.runInContext(`sbGet('players','club_id=eq.club-1&nickname=ilike.kari&select=*')`, context);
  assert.equal(rows.length, 1);

  await vm.runInContext(`sbDelete('sessions','id=eq.${sessionId}')`, context);
  rows = await vm.runInContext(`sbGet('sessions','id=eq.${sessionId}&select=*')`, context);
  assert.equal(rows.length, 0);

  assert.deepEqual([...operations.values()].map(item => item.method), ['post','patch','upsert','delete']);
  assert.equal(events.filter(event => event.type === 'scs:practice-sync-pending').length, 4);

  context.navigator.onLine = true;
  context.remoteCalls = [];
  vm.runInContext(`_sbFetch=async function(url,body){ remoteCalls.push({url:url,body:body}); return {ok:true,json:async()=>body.data?(Array.isArray(body.data)?body.data:[body.data]):[]}; }`, context);
  const flushed = await vm.runInContext(`scsFlushPracticeOutbox()`, context);
  assert.equal(flushed, true);
  assert.equal(context.remoteCalls.length, 4);
  assert.equal(operations.size, 0);
  assert.equal(events.filter(event => event.type === 'scs:practice-synced').length, 1);

  console.log('PASS offline create/read/update/upsert/delete');
  console.log('PASS durable ordered outbox');
  console.log('PASS reconnect flush and queue completion');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
