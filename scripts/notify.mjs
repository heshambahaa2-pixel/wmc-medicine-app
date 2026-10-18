// Runs on a schedule (GitHub Actions). Sends:
//  1) the daily-question push once per day, at/after 7:00 AM New York time
//  2) any announcement posted with "push" checked that hasn't been sent yet
// Needs secret FIREBASE_SERVICE_ACCOUNT (service account JSON) and APP_URL.
import admin from "firebase-admin";

const TZ = "America/New_York";
const SEND_HOUR = 7;
const APP_URL = process.env.APP_URL || "/";

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const fcm = admin.messaging();

const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"
}).formatToParts(new Date()).map(p => [p.type, p.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const hour = +parts.hour;

async function allTokens() {
  const snap = await db.collection("users").where("pushEnabled", "==", true).get();
  const list = [];
  snap.forEach(d => (d.data().fcmTokens || []).forEach(t => list.push({ uid: d.id, token: t })));
  return list;
}

async function send(title, body, link) {
  const tokens = await allTokens();
  if (!tokens.length) { console.log("No subscribers"); return; }
  let ok = 0; const dead = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await fcm.sendEachForMulticast({
      tokens: chunk.map(t => t.token),
      notification: { title, body },
      webpush: { fcmOptions: { link }, notification: { icon: `${APP_URL}icons/icon-192.png` } }
    });
    res.responses.forEach((r, j) => {
      if (r.success) ok++;
      else if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(r.error?.code)) dead.push(chunk[j]);
    });
  }
  for (const d of dead) await db.collection("users").doc(d.uid).update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(d.token) });
  console.log(`Sent "${title}" to ${ok}/${tokens.length}; removed ${dead.length} stale tokens`);
}

// 1) Daily question
if (hour >= SEND_HOUR) {
  const q = await db.collection("questions").where("publishDate", "==", today).limit(1).get();
  if (!q.empty && !q.docs[0].data().notified) {
    const data = q.docs[0].data();
    await q.docs[0].ref.update({ notified: true });
    await send(`Question of the day${data.topic ? " · " + data.topic : ""}`, "Keep your streak going. Tap to answer.", `${APP_URL}#today`);
  } else console.log(q.empty ? "No question today" : "Already notified today");
} else console.log(`Before ${SEND_HOUR}:00 ET (now ${hour}:00), skipping daily question`);

// 2) Announcements
const ann = await db.collection("announcements").where("pushed", "==", false).get();
for (const d of ann.docs) {
  const a = d.data();
  await d.ref.update({ pushed: true });
  if (a.push) await send(a.title, (a.body || "").slice(0, 140), `${APP_URL}#news`);
}
process.exit(0);
