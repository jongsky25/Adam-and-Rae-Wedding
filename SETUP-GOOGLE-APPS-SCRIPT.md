# Google Apps Script setup — Adam & Rae photo share

About 15 minutes. Do it once, then test with two phones.

**Use a computer if you can.** On a phone, open Chrome, tap ⋮ and tick
**Desktop site**: the Apps Script editor doesn't work in mobile view.

**Use the Google account that should keep the photos.** Everything is saved in
that account's Drive, and its storage limit applies (15 GB on a free account).

---

## Part A — Create the script

1. Go to **script.google.com** and sign in with that account.
2. Tap **New project**.
3. Click **Untitled project** at the top and rename it **Adam & Rae Photos**.
4. In the editor you'll see `Code.gs` with `function myFunction() { }`.
   Select all of it and delete it.
5. Open this repo's **`apps-script/Code.gs`** on GitHub, tap **Raw**,
   select all, copy, and paste it into the empty editor.
6. Find this line near the top and change `2468` to your own staff PIN
   (numbers only is easiest). Change it only in Apps Script, not on GitHub:
   ```js
   const STAFF_PIN = '2468';
   ```
7. Click the **Save** icon (💾), or press Ctrl+S / Cmd+S.

## Part B — Run setup once

8. In the toolbar, open the function dropdown (next to **Debug**) and pick **`setup`**.
9. Click **Run**.
10. Google asks for permission. This is normal for your own script:
    1. **Review permissions** → choose your account.
    2. On "Google hasn't verified this app", click **Advanced** →
       **Go to Adam & Rae Photos (unsafe)**.
    3. Click **Allow**. The script can then make files in your Drive and Sheets.
11. The **Execution log** at the bottom shows two links:
    - `Photos folder:` the Drive folder **Adam & Rae — Guest Photos**
    - `Claims sheet:` the Google Sheet of claim codes (stored in that folder)

    Open both to check they exist. Don't run `setup` again; it's only needed once.

## Part C — Publish it as a web app

12. Click **Deploy** (top right) → **New deployment**.
13. Click the ⚙️ gear next to "Select type" → **Web app**.
14. Fill in:
    - Description: `v1`
    - Execute as: **Me**
    - Who has access: **Anyone**
15. Click **Deploy**. Approve permissions again if it asks.
16. Copy the **Web app URL**. It looks like
    `https://script.google.com/macros/s/AKfy…/exec`
17. Check it: open that URL in a browser. You should see
    `{"ok":true,"service":"wedding-photo-share"}`

## Part D — Connect the website

18. On GitHub, open **`config.js`** in this repo and tap the ✏️ pencil.
19. Paste the URL between the quotes on this line:
    ```js
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfy…/exec";
    ```
20. Tap **Commit changes**.
21. Make the repo public (first time only). Free GitHub Pages only works on
    public repos: **Settings → General →** scroll to **Danger Zone →
    Change visibility → Public**. Your real staff PIN is only in Apps Script,
    never in this repo, so it stays private.
    Then turn on the website: **Settings → Pages**.
    Under "Build and deployment", set Source to **Deploy from a branch**,
    Branch **main**, folder **/ (root)**, then **Save**.
22. Wait 1–2 minutes, then open **https://jongsky25.github.io/Adam-and-Rae-Wedding/**.
    The "Preview mode" note at the top should be gone.

## Part E — Test with two phones (do this before Saturday)

23. **Guest phone:** open the link (or scan a printed QR), type a name, add
    2 photos, tap **Share**. A claim slip with a 6-letter code should appear.
24. Check Google: the Drive folder now has a sub-folder named after the guest,
    and the Claims sheet has a new row.
25. **Staff phone:** open **https://jongsky25.github.io/Adam-and-Rae-Wedding/staff.html**,
    enter the PIN and the code → **Check** shows "Valid, not yet claimed".
26. Tap **Give charm** → "Give the charm ✓".
    Tap it again → "Already claimed". That means it works.
27. Clean up the test: delete the test row in the Claims sheet (keep the header
    row) and the test guest folder in Drive.

---

## If you edit the script later

Use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
This keeps the same /exec link.
Don't use "New deployment" again: that makes a **new** link, and then
`config.js` has to be updated.

## If something goes wrong

| What you see | Fix |
|---|---|
| Slip never appears; "didn't go through" | `config.js` URL must end in `/exec`; access must be **Anyone** (Part C). |
| Error "Run setup() first" | Do Part B. |
| Staff page says "Wrong staff PIN" | Use the PIN from step 6. If you changed it later, redeploy as a new version. |
| Staff page says "Add the Apps Script URL to config.js first" | Do steps 18–20. |
| A video won't upload | Videos must be under 35 MB. Ask for a shorter clip, or AirDrop it. |
| Page still shows "Preview mode" | Wait a minute after committing `config.js`, then refresh. |

## On the day

- Staff phone: open `staff.html`, enter the PIN once, and keep it open.
- Check the venue's mobile signal or Wi-Fi; uploads need internet.
- After the wedding, the photos are all in **Drive → Adam & Rae — Guest Photos**.
  Share that folder with the couple.
