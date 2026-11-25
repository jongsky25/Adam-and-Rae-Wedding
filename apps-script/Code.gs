/**
 * Adam & Rae photo share — Google Apps Script backend.
 *
 * - Saves guest uploads into a Google Drive folder (one sub-folder per guest).
 * - Logs every file in the "Uploads" tab and every claim slip in the "Claims" tab.
 * - Issues at most CHARM_LIMIT claim slips (one per guest phone).
 * - Serves the staff dashboard and the live photo wall (both need the staff PIN).
 *
 * First time: follow SETUP-GOOGLE-APPS-SCRIPT.md (paste, run setup, deploy).
 * Updating:   paste this file over the old one, set STAFF_PIN again, Save, then
 *             Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 *             The /exec link stays the same. Don't run setup again.
 */

const STAFF_PIN = '2468';                       // CHANGE THIS (again after every paste); staff type it on staff.html and wall.html
const CHARM_LIMIT = 100;                        // claim slips available (charms brought by Charms by AA)
const ALBUM_NAME = 'Adam & Rae — Guest Photos'; // Drive folder name
const MAX_BYTES = 36 * 1024 * 1024;             // per file, after decoding
const WALL_MAX_BYTES = 8 * 1024 * 1024;         // largest photo the wall will show

const CLAIMS_HEADER = ['Code', 'Guest name', 'Guest ID', 'Files', 'Issued', 'Redeemed at'];
const UPLOADS_HEADER = ['Time', 'Guest name', 'Guest ID', 'Type', 'File name', 'Size (KB)', 'Drive link', 'File ID', 'Hide from wall'];
// Uploads columns (1-based) used below
const U_TIME = 1, U_NAME = 2, U_GUEST = 3, U_TYPE = 4, U_LINK = 7, U_ID = 8, U_HIDE = 9;

function setup() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('FOLDER_ID');
  if (!folderId) {
    folderId = DriveApp.createFolder(ALBUM_NAME).getId();
    props.setProperty('FOLDER_ID', folderId);
  }
  let sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) {
    const ss = SpreadsheetApp.create(ALBUM_NAME + ' — Claims');
    const sh = ss.getSheets()[0];
    sh.setName('Claims');
    sh.appendRow(CLAIMS_HEADER);
    sh.setFrozenRows(1);
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(folderId));
    sheetId = ss.getId();
    props.setProperty('SHEET_ID', sheetId);
  }
  uploadsSheet();
  Logger.log('Photos folder: https://drive.google.com/drive/folders/' + folderId);
  Logger.log('Claims sheet:  https://docs.google.com/spreadsheets/d/' + sheetId);
}

function doGet() {
  return json({ ok: true, service: 'wedding-photo-share', version: 2 });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'upload': return json(upload(req));
      case 'finish': return json(finish(req));
      case 'verify': return json(verify(req, false));
      case 'redeem': return json(verify(req, true));
      case 'stats': return json(stats(req));
      case 'wallList': return json(wallList(req));
      case 'wallPhoto': return json(wallPhoto(req));
      case 'hide': return json(hidePhoto(req));
      default: throw new Error('Unknown action');
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

/* ---------- guest actions ---------- */

function upload(req) {
  const guestId = cleanId(req.guestId);
  const name = cleanText(req.name, 60) || 'Guest';
  const mime = String(req.mimeType || '');
  if (!/^(image|video)\//.test(mime)) throw new Error('Only photos and videos can be shared');
  const bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw new Error('Empty file');
  if (bytes.length > MAX_BYTES) throw new Error('File is too large');

  const folder = guestFolder(guestId, name, true);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss');
  const fileName = stamp + '_' + cleanText(req.filename, 80).replace(/[\\/]/g, '_');
  const file = folder.createFile(Utilities.newBlob(bytes, mime, fileName));
  const id = file.getId();

  withLock(() => uploadsSheet().appendRow([
    new Date(), name, guestId, mime.indexOf('video/') === 0 ? 'video' : 'photo', fileName,
    Math.round(bytes.length / 1024), 'https://drive.google.com/file/d/' + id + '/view', id, ''
  ]));
  return { ok: true, id: id };
}

function finish(req) {
  const guestId = cleanId(req.guestId);
  const name = cleanText(req.name, 60) || 'Guest';
  const folder = guestFolder(guestId, name, false);
  const count = folder ? countFiles(folder) : 0;
  if (count < 1) throw new Error('No photos received yet');

  return withLock(() => {
    const sh = claimsSheet();
    const rows = sh.getDataRange().getValues();
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][2] === guestId) {               // one slip per guest: return the same code
        sh.getRange(r + 1, 4).setValue(count);
        return { ok: true, code: rows[r][0], count: count, issued: new Date(rows[r][4]).toISOString() };
      }
    }
    if (rows.length - 1 >= CHARM_LIMIT) {         // every charm is already promised
      return { ok: true, soldOut: true, count: count };
    }
    const used = new Set(rows.map(r => r[0]));
    let code;
    do { code = randomCode(); } while (used.has(code));
    const issued = new Date();
    sh.appendRow([code, name, guestId, count, issued, '']);
    return { ok: true, code: code, count: count, issued: issued.toISOString() };
  });
}

/* ---------- staff actions (PIN) ---------- */

function verify(req, redeem) {
  checkPin(req);
  const code = String(req.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return withLock(() => {
    const sh = claimsSheet();
    const rows = sh.getDataRange().getValues();
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][0] !== code) continue;
      let redeemedAt = rows[r][5];
      const already = !!redeemedAt;
      if (redeem && !already) {
        redeemedAt = new Date();
        sh.getRange(r + 1, 6).setValue(redeemedAt);
      }
      return {
        ok: true, found: true, code: code, name: rows[r][1], count: rows[r][3],
        redeemed: !!redeemedAt, alreadyRedeemed: already,
        redeemedAt: redeemedAt ? new Date(redeemedAt).toISOString() : null
      };
    }
    return { ok: true, found: false, code: code };
  });
}

function stats(req) {
  checkPin(req);
  const claims = claimsSheet().getDataRange().getValues().slice(1);
  const uploads = uploadsSheet().getDataRange().getValues().slice(1);
  const guests = new Set();
  let photos = 0, videos = 0, kb = 0;
  uploads.forEach(r => {
    guests.add(r[U_GUEST - 1]);
    if (r[U_TYPE - 1] === 'video') videos++; else photos++;
    kb += Number(r[5]) || 0;
  });
  const latest = uploads.slice(-10).reverse().map(r => ({
    time: new Date(r[U_TIME - 1]).toISOString(), name: r[U_NAME - 1], type: r[U_TYPE - 1], link: r[U_LINK - 1]
  }));
  const redeemed = claims.filter(r => r[5]).length;
  return {
    ok: true, guests: guests.size, photos: photos, videos: videos, mb: Math.round(kb / 1024),
    slips: claims.length, redeemed: redeemed, limit: CHARM_LIMIT,
    charmsLeft: Math.max(0, CHARM_LIMIT - redeemed), slipsLeft: Math.max(0, CHARM_LIMIT - claims.length),
    latest: latest
  };
}

/** Newest photos first, skipping videos and anything marked in "Hide from wall". */
function wallList(req) {
  checkPin(req);
  const rows = uploadsSheet().getDataRange().getValues().slice(1);
  const out = [];
  for (let i = rows.length - 1; i >= 0 && out.length < 300; i--) {
    const r = rows[i];
    if (r[U_TYPE - 1] !== 'photo' || String(r[U_HIDE - 1]).trim()) continue;
    out.push({ id: r[U_ID - 1], name: r[U_NAME - 1], time: new Date(r[U_TIME - 1]).toISOString() });
  }
  return { ok: true, photos: out };
}

function wallPhoto(req) {
  checkPin(req);
  const id = String(req.id || '');
  const row = findUpload(id);                     // only files guests uploaded, never other Drive files
  if (!row || row.values[U_TYPE - 1] !== 'photo' || String(row.values[U_HIDE - 1]).trim()) throw new Error('Photo not available');
  const blob = DriveApp.getFileById(id).getBlob();
  const type = blob.getContentType();
  if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) throw new Error('Photo type not shown on wall');
  const bytes = blob.getBytes();
  if (bytes.length > WALL_MAX_BYTES) throw new Error('Photo too large for wall');
  return { ok: true, mime: type, data: Utilities.base64Encode(bytes) };
}

function hidePhoto(req) {
  checkPin(req);
  return withLock(() => {
    const row = findUpload(String(req.id || ''));
    if (!row) throw new Error('Photo not found');
    uploadsSheet().getRange(row.index, U_HIDE).setValue('hidden ' + new Date().toISOString());
    return { ok: true };
  });
}

/* ---------- helpers ---------- */

function checkPin(req) {
  if (String(req.pin) !== STAFF_PIN) throw new Error('Wrong staff PIN');
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function rootFolder() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw new Error('Run setup() first');
  return DriveApp.getFolderById(id);
}

function spreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first');
  return SpreadsheetApp.openById(id);
}

function claimsSheet() {
  return spreadsheet().getSheetByName('Claims');
}

/** The Uploads tab; created automatically the first time it's needed. */
function uploadsSheet() {
  const ss = spreadsheet();
  let sh = ss.getSheetByName('Uploads');
  if (!sh) {
    sh = ss.insertSheet('Uploads');
    sh.appendRow(UPLOADS_HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function findUpload(id) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return null;
  const rows = uploadsSheet().getDataRange().getValues();
  for (let r = rows.length - 1; r >= 1; r--) {
    if (rows[r][U_ID - 1] === id) return { index: r + 1, values: rows[r] };
  }
  return null;
}

function guestFolder(guestId, name, create) {
  const props = PropertiesService.getScriptProperties();
  const key = 'G_' + guestId;
  const known = props.getProperty(key);
  if (known) return DriveApp.getFolderById(known);
  if (!create) return null;
  const folder = rootFolder().createFolder(name + ' · ' + guestId.slice(0, 6));
  props.setProperty(key, folder.getId());
  return folder;
}

function countFiles(folder) {
  let n = 0;
  const it = folder.getFiles();
  while (it.hasNext()) { it.next(); n++; }
  return n;
}

function randomCode() {
  const a = 'ACDEFGHJKMNPQRTUVWXY34679'; // no look-alike characters (0/O, 1/I, 5/S, 8/B)
  let s = '';
  for (let i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}

function cleanId(v) {
  const s = String(v || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  if (s.length < 8) throw new Error('Missing guest ID');
  return s;
}

function cleanText(v, max) {
  return String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
