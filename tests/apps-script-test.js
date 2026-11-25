// Run: node tests/apps-script-test.js apps-script/Code.gs
// Checks the backend (upload → claim → redeem, charm limit, dashboard, photo wall)
// against small fakes of the Google services. No Google account needed.
const fs = require('fs'); const vm = require('vm');

let idn = 0; const folders = {}, files = {}, props = {};
function Folder(name) { this.id = 'F' + (++idn) + 'xxxxxxxxxx'; this.name = name; this.files = []; folders[this.id] = this; }
Folder.prototype = {
  getId() { return this.id; }, createFolder(n) { return new Folder(n); },
  createFile(b) { const f = { id: 'file' + (++idn) + 'abcdefghij', blob: b, getId() { return this.id; },
    getBlob() { return { getContentType: () => b.m, getBytes: () => b.b }; } }; files[f.id] = f; this.files.push(f); return f; },
  getFiles() { let i = 0; const a = this.files; return { hasNext: () => i < a.length, next: () => a[i++] }; }
};
function Sheet() { this.rows = []; }
Sheet.prototype = {
  appendRow(r) { this.rows.push(r.slice()); }, setName() {}, setFrozenRows() {},
  getDataRange() { return { getValues: () => this.rows.map(r => r.slice()) }; },
  getRange(r, c) { const rows = this.rows; return { setValue(v) { rows[r - 1][c - 1] = v; } }; }
};
const sheets = { Claims: new Sheet() };
const ss = { getSheets: () => [sheets.Claims], getId: () => 'S1', getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = new Sheet()) };
const ctx = {
  DriveApp: { createFolder: n => new Folder(n), getFolderById: id => folders[id], getFileById: id => files[id] || { moveTo() {} } },
  SpreadsheetApp: { create: () => ss, openById: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { base64Decode: s => Array.from(Buffer.from(s, 'base64')), base64Encode: b => Buffer.from(b).toString('base64'),
    newBlob: (b, m, n) => ({ b, m, n }), formatDate: () => '120000' },
  Session: { getScriptTimeZone: () => 'Asia/Manila' },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType() { return t; } }) },
  Logger: { log() {} }, console,
};
vm.createContext(ctx);
const src = fs.readFileSync(process.argv[2] || 'apps-script/Code.gs', 'utf8').replace(/const CHARM_LIMIT = \d+;/, 'const CHARM_LIMIT = 3;');
vm.runInContext(src, ctx);
const PIN = vm.runInContext('STAFF_PIN', ctx);
const post = o => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }));
let failed = 0;
const ok = (c, m) => { console.log((c ? 'pass ' : 'FAIL ') + m); if (!c) failed++; };
const img = Buffer.from('fakejpeg').toString('base64');
const up = (g, name, mime = 'image/jpeg') => post({ action: 'upload', guestId: g, name, filename: 'a.jpg', mimeType: mime, data: img });

ok(!post({ action: 'finish', guestId: 'guest-aaaa1111', name: 'A' }).ok, 'finish before setup fails');
ctx.setup();
ok(!!sheets.Uploads, 'setup creates Uploads tab');
const g = 'guest-aaaa1111';
ok(!post({ action: 'finish', guestId: g, name: 'Tita' }).ok, 'no slip before any upload');
ok(!up(g, 'Tita', 'application/pdf').ok, 'non-photo rejected');
const p1 = up(g, 'Tita'); ok(p1.ok, 'photo upload');
ok(up(g, 'Tita', 'video/mp4').ok, 'video upload');
ok(sheets.Uploads.rows.length === 3 && sheets.Uploads.rows[2][3] === 'video', 'each file logged in Uploads');
const s1 = post({ action: 'finish', guestId: g, name: 'Tita' });
ok(s1.ok && /^[A-Z0-9]{6}$/.test(s1.code) && s1.count === 2, 'slip issued ' + s1.code);
ok(post({ action: 'finish', guestId: g, name: 'Tita' }).code === s1.code, 'same guest keeps same code');
ok(!post({ action: 'verify', code: s1.code, pin: 'nope' }).ok, 'wrong PIN rejected');
const v = post({ action: 'verify', code: s1.code.slice(0, 3) + ' ' + s1.code.slice(3).toLowerCase(), pin: PIN });
ok(v.found && !v.redeemed, 'verify finds code (spaces/lowercase ok)');
ok(post({ action: 'redeem', code: s1.code, pin: PIN }).redeemed, 'first redeem gives charm');
ok(post({ action: 'redeem', code: s1.code, pin: PIN }).alreadyRedeemed, 'second redeem says already claimed');
ok(!post({ action: 'verify', code: 'ZZZZZZ', pin: PIN }).found, 'unknown code not found');

// charm limit (set to 3 for this test)
for (const id of ['guest-bbbb2222', 'guest-cccc3333']) { up(id, 'G'); ok(!!post({ action: 'finish', guestId: id, name: 'G' }).code, 'slip within limit for ' + id); }
up('guest-dddd4444', 'Late');
const late = post({ action: 'finish', guestId: 'guest-dddd4444', name: 'Late' });
ok(late.ok && late.soldOut && !late.code, 'guest after the limit gets "all claimed", no code');
ok(post({ action: 'finish', guestId: g, name: 'Tita' }).code === s1.code, 'earlier guest still gets their code after limit');

// dashboard
ok(!post({ action: 'stats', pin: 'nope' }).ok, 'stats needs PIN');
const st = post({ action: 'stats', pin: PIN });
ok(st.ok && st.guests === 4 && st.photos === 4 && st.videos === 1, 'stats counts guests/photos/videos');
ok(st.slips === 3 && st.redeemed === 1 && st.charmsLeft === 2 && st.slipsLeft === 0, 'stats counts slips and charms left');
ok(st.latest.length === 5 && st.latest[0].name === 'Late', 'stats lists newest uploads first');

// photo wall
ok(!post({ action: 'wallList', pin: 'nope' }).ok, 'wall needs PIN');
const wl = post({ action: 'wallList', pin: PIN });
ok(wl.ok && wl.photos.length === 4 && wl.photos.every(p => p.id), 'wall lists photos only (no videos)');
const wp = post({ action: 'wallPhoto', pin: PIN, id: p1.id });
ok(wp.ok && Buffer.from(wp.data, 'base64').toString() === 'fakejpeg', 'wall gets photo bytes');
ok(!post({ action: 'wallPhoto', pin: PIN, id: 'someOtherDriveFile123' }).ok, 'wall refuses files guests did not upload');
ok(post({ action: 'hide', pin: PIN, id: p1.id }).ok, 'hide a photo');
ok(post({ action: 'wallList', pin: PIN }).photos.length === 3, 'hidden photo leaves the wall');
ok(!post({ action: 'wallPhoto', pin: PIN, id: p1.id }).ok, 'hidden photo cannot be fetched');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exitCode = failed ? 1 : 0;
