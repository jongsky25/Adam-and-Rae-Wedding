/**
 * Wedding photo share — Google Apps Script backend.
 *
 * Saves guest uploads into a Google Drive folder (one sub-folder per guest)
 * and keeps a "Claims" Google Sheet of claim codes for the charm station.
 *
 * Setup (once):
 *   1. Go to script.google.com → New project → paste this file as Code.gs.
 *   2. Change STAFF_PIN and ALBUM_NAME below.
 *   3. Select the function `setup` → Run → allow access. It creates the Drive
 *      folder and the Claims sheet and prints their links in the log.
 *   4. Deploy → New deployment → type "Web app"
 *        Execute as: Me      Who has access: Anyone
 *      Copy the URL ending in /exec into CONFIG.scriptUrl (index.html)
 *      and into SCRIPT_URL (staff.html).
 *   5. After editing this file later: Deploy → Manage deployments → Edit →
 *      Version: New version. (The /exec URL stays the same.)
 */

const STAFF_PIN = '2468';                       // CHANGE THIS before the wedding; staff type it on staff.html
const ALBUM_NAME = 'Adam & Rae — Guest Photos'; // Drive folder name
const MAX_BYTES = 36 * 1024 * 1024;             // per file, after decoding

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
    sh.appendRow(['Code', 'Guest name', 'Guest ID', 'Files', 'Issued', 'Redeemed at']);
    sh.setFrozenRows(1);
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(folderId));
    sheetId = ss.getId();
    props.setProperty('SHEET_ID', sheetId);
  }
  Logger.log('Photos folder: https://drive.google.com/drive/folders/' + folderId);
  Logger.log('Claims sheet:  https://docs.google.com/spreadsheets/d/' + sheetId);
}

function doGet() {
  return json({ ok: true, service: 'wedding-photo-share' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'upload': return json(upload(req));
      case 'finish': return json(finish(req));
      case 'verify': return json(verify(req, false));
      case 'redeem': return json(verify(req, true));
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
  return { ok: true, id: file.getId() };
}

function finish(req) {
  const guestId = cleanId(req.guestId);
  const name = cleanText(req.name, 60) || 'Guest';
  const folder = guestFolder(guestId, name, false);
  const count = folder ? countFiles(folder) : 0;
  if (count < 1) throw new Error('No photos received yet');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = claimsSheet();
    const rows = sh.getDataRange().getValues();
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][2] === guestId) {               // one slip per guest: return the same code
        sh.getRange(r + 1, 4).setValue(count);
        return { ok: true, code: rows[r][0], count: count, issued: new Date(rows[r][4]).toISOString() };
      }
    }
    const used = new Set(rows.map(r => r[0]));
    let code;
    do { code = randomCode(); } while (used.has(code));
    const issued = new Date();
    sh.appendRow([code, name, guestId, count, issued, '']);
    return { ok: true, code: code, count: count, issued: issued.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- staff actions ---------- */

function verify(req, redeem) {
  if (String(req.pin) !== STAFF_PIN) throw new Error('Wrong staff PIN');
  const code = String(req.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
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
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */

function rootFolder() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw new Error('Run setup() first');
  return DriveApp.getFolderById(id);
}

function claimsSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first');
  return SpreadsheetApp.openById(id).getSheetByName('Claims');
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
