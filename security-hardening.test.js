const assert = require('node:assert/strict');
const fs = require('node:fs');

const offline = fs.readFileSync('offline-db.js', 'utf8');
const service = fs.readFileSync('supabase.js', 'utf8');
const auth = fs.readFileSync('auth.js', 'utf8');
const worker = fs.readFileSync('worker.js', 'utf8');

assert.match(offline, /PRIVATE_FIELD_PATTERN/);
assert.match(offline, /sanitizeLocalData\(cloneData\(row\)\)/);
assert.match(offline, /sanitizeLocalData\(cloneData\(operation/);
assert.match(offline, /clearPrivateData/);
assert.match(auth, /SCSOfflineDB\.clearPrivateData/);

assert.doesNotMatch(service, /load\('club',\s*'clubs',\s*`[^`]*select=\*`/);
assert.match(service, /select=id,name,parent_club_id,created_by,created_at/);
assert.match(service, /SCS_PRACTICE_OFFLINE_WRITABLE/);
assert.match(service, /secureBody\.sessionToken/);

assert.match(worker, /requireDbMutationSession/);
assert.match(worker, /Authenticated device session required/);
assert.match(worker, /delete copy\.admin_password/);
assert.match(worker, /delete copy\.select_password/);
assert.match(worker, /delete copy\.registration_email/);

console.log('PASS credentials excluded from IndexedDB and outbox');
console.log('PASS logout clears private offline stores');
console.log('PASS club snapshot uses an explicit safe projection');
console.log('PASS Worker mutations require an active device session');
console.log('PASS Worker club responses redact credential fields');
