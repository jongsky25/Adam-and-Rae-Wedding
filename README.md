# Adam & Rae — Wedding Photo Share (28.11.26)

Guests scan a QR code on the table card, upload photos/videos, and get a
**claim slip** (6-letter code + live clock) they show at the Stuffy Cute Charms booth
for a free charm (by Charms by AA). Photos land in your Google Drive. No server or paid app.

**Live site:** https://jongsky25.github.io/Adam-and-Rae-Wedding/ ·
**Staff page:** https://jongsky25.github.io/Adam-and-Rae-Wedding/staff.html

**Setup:** follow [SETUP-GOOGLE-APPS-SCRIPT.md](SETUP-GOOGLE-APPS-SCRIPT.md).

| File | What it is |
|---|---|
| `index.html` | Guest upload page + claim slip |
| `staff.html` | Stuffy Cute Charms booth: check / redeem codes + live dashboard (PIN) |
| `wall.html` | Live photo wall for a TV/projector (PIN) |
| `config.js` | **The one file to edit:** Apps Script link, names, wording |
| `apps-script/Code.gs` | Backend to paste into Google Apps Script |
| `qr-card.html` / `print/qr-card.pdf` | 4×6 in table card |
| `print/qr-cards-a4.*` | 15 seat cards on one A4 (3 × 5, 66 × 57 mm), ink-saving, cut on dashed lines |
| `print/welcome-sign.*` | 18×24 in welcome sign (PDF ready to print) |
| `print/booth-sign.*` | A4 charm booth sign (PDF ready to print) |
| `assets/` | AR monogram, charm video, Charms by AA logo |
| `tests/apps-script-test.js` | Offline check of the backend logic |

The printed QR codes use the couple's bit.ly QR (`assets/qr-bitly.png`), which opens
https://bit.ly/AdamRae?r=qr and forwards to the guest page. The short link is also
printed as text: **bit.ly/AdamRae** (case-sensitive). If the bit.ly link changes, replace
`assets/qr-bitly.png`, update `SHORT_LINK` in `print/qr.js` and the text in `qr-card.html`,
then re-export the PDFs.

## How it works

1. Guest opens `index.html`, types their name, picks photos/videos.
2. Photos are resized on the phone (max 2560 px) and sent one by one to Apps Script,
   which saves them to `Drive › <album> › <guest name · id>`.
3. Once at least `minFiles` (in `config.js`) arrive, Apps Script issues a code and logs it in the
   **Claims** sheet. One code per phone; sharing more photos keeps the same code.
4. At the station, staff type the code in `staff.html` → **Give charm** marks it
   claimed. A second attempt shows **Already claimed**.
5. The slip shows a ticking clock, so a forwarded screenshot is easy to spot.
6. Slips stop after `CHARM_LIMIT` (100) in `apps-script/Code.gs`; later guests still
   upload and see "all charms claimed".
7. Every file is logged in the **Uploads** tab; the staff page shows a live dashboard,
   and `wall.html` shows guest photos as a slideshow.

## Limits to know

- Apps Script accepts about 50 MB per request; videos are capped at 35 MB each.
  Long 4K videos should go by AirDrop/Drive link instead.
- Apps Script consumer quotas are generous for one wedding (a few hundred guests).
- Clearing the browser or switching phones gives a guest a new code. Staff can
  see the guest name on every check, which is the practical guard.
- The Drive folder is private to you. Share it with guests after the wedding if you like.
