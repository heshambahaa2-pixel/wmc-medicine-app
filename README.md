# WMC Medicine Residents app

Daily board-style question, streaks and leaderboard, archive, rotation guide/phone directory, and announcements for WMC internal medicine residents. Installable on iPhone/Android from the browser (Add to Home Screen).

**Live app:** https://heshambahaa2-pixel.github.io/wmc-medicine-app/

## How it works
- **Front end:** static web app on GitHub Pages (`index.html`, `app.js`, `styles.css`).
- **Back end:** Firebase project `wmc-medicine-residents` (Authentication, Firestore, Cloud Messaging). Security rules are in `firestore.rules`.
- **Notifications:** `.github/workflows/notify.yml` runs every 15 min and sends the daily question push at 7:00 AM ET plus any announcement posted with "push" checked.

## Adding questions
Sign in with an admin account → **Admin** tab → add one question, or **Bulk import** a CSV using `question-template.csv`:

`date,topic,stem,a,b,c,d,e,answer,explanation,reference,author`

Leave `date` blank to auto-schedule into the next open days. `answer` is a letter.

## Admins
Admin emails are listed in **both** `config.js` (`adminEmails`) and `firestore.rules` (`isAdmin`). Update both, then republish the rules in the Firebase console.

## Turning on push notifications (one-time)
1. Firebase console → Project settings → Service accounts → Generate new private key.
2. GitHub repo → Settings → Secrets and variables → Actions:
   - Secret `FIREBASE_SERVICE_ACCOUNT` = full contents of the key file
   - Variable `APP_URL` = `https://heshambahaa2-pixel.github.io/wmc-medicine-app/`
   - Variable `PUSH_ENABLED` = `true`
3. Delete the downloaded key file from your computer.

No patient information (PHI) should ever be entered into this app.
