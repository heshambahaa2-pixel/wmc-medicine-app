import { firebaseConfig, vapidKey, adminEmails, timeZone } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
  orderBy, limit, getDocs, serverTimestamp, arrayUnion, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const LETTERS = "ABCDEFGH";
const CLASSES = ["PGY-1", "PGY-2", "PGY-3", "Chief", "Faculty", "Other"];

let me = null;        // firebase user
let profile = null;   // users/{uid}
let isAdmin = false;
let currentTab = "today";
let swReg = null;

// ---------- helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function linkify(text) {
  return esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|x\d{4,5})/g, (m, pre, num) =>
      `${pre}<a class="tel" href="tel:${num.replace(/[^\dx]/g, "").replace(/^x/, "")}">${num}</a>`);
}
function dateKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 2600);
}
function liveStreak(p) {
  if (!p?.lastAnsweredDate) return 0;
  const today = dateKey();
  return (p.lastAnsweredDate === today || p.lastAnsweredDate === addDays(today, -1)) ? (p.streak || 0) : 0;
}
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// ---------- service worker ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("firebase-messaging-sw.js", { updateViaCache: "none" }).then(r => { swReg = r; r.update().catch(() => {}); }).catch(console.error);
}

// ---------- auth ----------
onAuthStateChanged(auth, async user => {
  me = user;
  if (!user) { profile = null; renderAuth(); return; }
  isAdmin = adminEmails.map(e => e.toLowerCase()).includes((user.email || "").toLowerCase());
  const snap = await getDoc(doc(db, "users", user.uid));
  profile = snap.exists() ? snap.data() : null;
  if (!profile || !profile.name || !profile.pgy) { renderProfile(true); return; }
  startApp();
});

function renderAuth(mode = "in", err = "") {
  $("#tabs").classList.add("hidden"); $("#profileBtn").classList.add("hidden");
  view.innerHTML = `
  <div class="auth">
    <div class="card hero">
      <h1>Question of the day</h1>
      <p class="muted">A daily board-style question, your streak, rotation guides and program news for WMC internal medicine residents.</p>
    </div>
    <div class="card">
      <button class="btn gold" id="g">Continue with Google</button>
      <div class="or">or use email</div>
      <label>Email</label><input id="em" type="email" autocomplete="email">
      <label>Password</label><input id="pw" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}">
      <div style="height:14px"></div>
      <button class="btn" id="go">${mode === "in" ? "Sign in" : "Create account"}</button>
      ${err ? `<div class="err">${esc(err)}</div>` : ""}
      <p class="small muted" style="margin-top:14px">
        ${mode === "in" ? `New here? <a href="#" id="sw">Create an account</a> · <a href="#" id="rs">Reset password</a>` : `Have an account? <a href="#" id="sw">Sign in</a>`}
      </p>
    </div>
  </div>`;
  $("#g").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => renderAuth(mode, e.message));
  $("#go").onclick = async () => {
    const em = $("#em").value.trim(), pw = $("#pw").value;
    try {
      if (mode === "in") await signInWithEmailAndPassword(auth, em, pw);
      else await createUserWithEmailAndPassword(auth, em, pw);
    } catch (e) { renderAuth(mode, e.message.replace("Firebase: ", "")); }
  };
  $("#sw").onclick = e => { e.preventDefault(); renderAuth(mode === "in" ? "up" : "in"); };
  const rs = $("#rs"); if (rs) rs.onclick = async e => {
    e.preventDefault(); const em = $("#em").value.trim();
    if (!em) return renderAuth(mode, "Enter your email first.");
    await sendPasswordResetEmail(auth, em).catch(() => {}); toast("Reset email sent if the account exists");
  };
}

function renderProfile(first = false) {
  $("#tabs").classList.toggle("hidden", first);
  view.innerHTML = `
  <div class="card">
    <h2>${first ? "Set up your profile" : "Your profile"}</h2>
    <p class="small muted">Your name and class appear on the leaderboard.</p>
    <label>Name</label><input id="nm" value="${esc(profile?.name || me.displayName || "")}">
    <label>Class</label>
    <select id="pg">${CLASSES.map(c => `<option ${profile?.pgy === c ? "selected" : ""}>${c}</option>`).join("")}</select>
    <label style="display:flex;gap:8px;align-items:center;font-weight:500">
      <input type="checkbox" id="lb" style="width:auto" ${profile?.hideFromBoard ? "" : "checked"}> Show me on the leaderboard
    </label>
    <div style="height:14px"></div>
    <button class="btn" id="sv">Save</button>
    ${first ? "" : `<div style="height:10px"></div><button class="btn line" id="so">Sign out</button>
      <p class="small muted" style="margin-top:12px">Signed in as ${esc(me.email)}</p>`}
  </div>`;
  $("#sv").onclick = async () => {
    const name = $("#nm").value.trim(); if (!name) return toast("Add your name");
    const data = { name, pgy: $("#pg").value, hideFromBoard: !$("#lb").checked };
    if (!profile) Object.assign(data, { streak: 0, bestStreak: 0, answered: 0, correct: 0, createdAt: serverTimestamp() });
    await setDoc(doc(db, "users", me.uid), data, { merge: true });
    profile = { ...(profile || {}), ...data };
    toast("Saved"); first ? startApp() : go("today");
  };
  const so = $("#so"); if (so) so.onclick = () => signOut(auth);
}

// ---------- shell ----------
function startApp() {
  $("#tabs").classList.remove("hidden");
  $("#profileBtn").classList.remove("hidden");
  $("#adminTab").classList.toggle("hidden", !isAdmin);
  $("#profileBtn").onclick = () => { setActive(null); renderProfile(); };
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => go(b.dataset.tab));
  const hash = location.hash.slice(1);
  go(["today", "archive", "board", "guide", "news", "admin"].includes(hash) ? hash : "today");
  listenForeground();
  // refresh token silently if permission already granted
  if ("Notification" in window && Notification.permission === "granted") enablePush(true);
}
function setActive(tab) {
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
}
function go(tab) {
  currentTab = tab; setActive(tab); history.replaceState(null, "", "#" + tab);
  window.scrollTo(0, 0);
  view.innerHTML = `<div class="loading">Loading…</div>`;
  ({ today: renderToday, archive: renderArchive, board: renderBoard, guide: renderGuide, news: renderNews, admin: renderAdmin }[tab] || renderToday)();
}

// ---------- push ----------
async function enablePush(silent = false) {
  try {
    if (!(await isSupported())) {
      if (!silent) toast(isIOS() && !isStandalone() ? "Add to Home Screen first, then enable" : "Notifications aren't supported in this browser");
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { if (!silent) toast("Notifications blocked in settings"); return false; }
    const reg = swReg || await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(fb), { vapidKey, serviceWorkerRegistration: reg });
    if (token) {
      await setDoc(doc(db, "users", me.uid), { fcmTokens: arrayUnion(token), pushEnabled: true }, { merge: true });
      profile.pushEnabled = true;
      if (!silent) { toast("Daily reminders on"); if (currentTab === "today") renderToday(); }
      return true;
    }
  } catch (e) { console.error(e); if (!silent) toast("Couldn't enable notifications"); }
  return false;
}
async function listenForeground() {
  if (!(await isSupported().catch(() => false))) return;
  onMessage(getMessaging(fb), p => toast(p.notification?.title || "New update"));
}
// Android/desktop Chrome hand us the install prompt; we show it from our own button.
let installPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; if (currentTab === "today" && profile) renderToday(); });
window.addEventListener("appinstalled", () => { installPrompt = null; toast("Installed. Open it from your home screen"); if (currentTab === "today") renderToday(); });

function pushState() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "granted" && profile?.pushEnabled) return "on";
  return "off";
}
function pushCard() {
  const installed = isStandalone();
  const push = pushState();
  if (installed && push === "on") return "";
  const row = (done, label, btn) => `<div class="setup-row ${done ? "done" : ""}"><span class="tick">${done ? "✓" : "○"}</span><span class="lbl">${label}</span>${done ? "" : btn}</div>`;
  let installBtn;
  if (installPrompt) installBtn = `<button class="btn" id="installBtn">Install</button>`;
  else if (isIOS()) installBtn = `<button class="btn line" id="iosHelp">How</button>`;
  else installBtn = `<button class="btn line" id="androidHelp">How</button>`;
  let pushBtn;
  if (push === "blocked") pushBtn = `<button class="btn line" id="blockedHelp">Unblock</button>`;
  else if (isIOS() && !installed) pushBtn = `<span class="small muted">after install</span>`;
  else pushBtn = `<button class="btn" id="pushBtn">Enable</button>`;
  return `<div class="card setup">
    <b>Set up in 2 taps</b>
    ${row(installed, "Add the app to your home screen", installBtn)}
    ${row(push === "on", "Get the daily question as a notification", pushBtn)}
    <div id="setupHelp" class="small muted hidden"></div>
  </div>`;
}
function bindPush() {
  const help = msg => { const h = $("#setupHelp"); if (h) { h.innerHTML = msg; h.classList.remove("hidden"); } };
  const b = $("#pushBtn"); if (b) b.onclick = () => enablePush();
  const i = $("#installBtn"); if (i) i.onclick = async () => { i.disabled = true; try { installPrompt.prompt(); await installPrompt.userChoice; } catch {} installPrompt = null; renderToday(); };
  const ios = $("#iosHelp"); if (ios) ios.onclick = () => help("In <b>Safari</b>: tap the Share button (square with arrow) → <b>Add to Home Screen</b> → Add. Then open the app from your home screen and come back here.");
  const an = $("#androidHelp"); if (an) an.onclick = () => help("In <b>Chrome</b>: tap the ⋮ menu (top right) → <b>Add to Home screen</b> or <b>Install app</b>. If you don't see it, this page may be open in another browser; open the link in Chrome.");
  const bl = $("#blockedHelp"); if (bl) bl.onclick = () => help(isIOS()
    ? "Notifications were turned off for this app. Go to iPhone <b>Settings → Notifications → WMC Medicine</b> and allow them, then reopen the app."
    : "Notifications are blocked for this site. Tap the <b>lock icon</b> in Chrome's address bar → Permissions → Notifications → Allow, or phone <b>Settings → Apps → Chrome → Notifications</b>. Then tap Enable again.");
}

// ---------- questions ----------
async function getQuestionFor(dateK) {
  const s = await getDocs(query(collection(db, "questions"), where("publishDate", "==", dateK), limit(1)));
  return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
}
async function getMyResponse(qid) {
  const s = await getDoc(doc(db, "responses", `${qid}_${me.uid}`));
  return s.exists() ? s.data() : null;
}
async function getDistribution(q) {
  const s = await getDocs(query(collection(db, "responses"), where("qid", "==", q.id)));
  const counts = new Array(q.choices.length).fill(0);
  s.forEach(d => { const c = d.data().choice; if (c >= 0 && c < counts.length) counts[c]++; });
  return { counts, total: s.size };
}

async function renderToday() {
  const today = dateKey();
  const [q] = await Promise.all([getQuestionFor(today)]);
  const st = liveStreak(profile);
  const acc = profile.answered ? Math.round(100 * (profile.correct || 0) / profile.answered) : 0;
  let html = `
  <div class="card hero">
    <div class="muted small">${prettyDate(today)}</div>
    <h1>Hi, ${esc((profile.name || "").split(" ")[0])}</h1>
    <div class="stats">
      <div class="stat"><b>${st}🔥</b><span>Streak</span></div>
      <div class="stat"><b>${profile.answered || 0}</b><span>Answered</span></div>
      <div class="stat"><b>${acc}%</b><span>Accuracy</span></div>
    </div>
  </div>
  ${pushCard()}`;
  if (!q) {
    html += `<div class="card"><h2>No question today</h2><p class="muted">Check the archive for earlier questions.</p>
      <button class="btn line" onclick="location.hash='archive';location.reload()">Open archive</button></div>`;
    view.innerHTML = html; bindPush(); return;
  }
  view.innerHTML = html + `<div id="qwrap"></div>`;
  bindPush();
  await renderQuestion($("#qwrap"), q, true);
}

async function renderQuestion(el, q, isToday) {
  const resp = await getMyResponse(q.id);
  let selected = null;
  const draw = async (answered) => {
    let dist = null;
    if (answered) dist = await getDistribution(q).catch(() => null);
    el.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <span class="pill">${esc(q.topic || "Question")}</span>
        <span class="small muted">${prettyDate(q.publishDate)}</span>
      </div>
      <div class="stem">${esc(q.stem)}</div>
      ${q.choices.map((c, i) => {
        let cls = "";
        if (answered) { if (i === q.answer) cls = "right"; else if (i === answered.choice) cls = "wrong"; }
        else if (i === selected) cls = "sel";
        const pct = dist && dist.total ? `<span class="pct">${Math.round(100 * dist.counts[i] / dist.total)}%</span>` : "";
        return `<button class="choice ${cls}" data-i="${i}" ${answered ? "disabled" : ""}><span class="l">${LETTERS[i]}</span><span>${esc(c)}</span>${pct}</button>`;
      }).join("")}
      ${answered ? `
        <div class="result ${answered.correct ? "ok" : "bad"}">${answered.correct ? "Correct" : `Incorrect. Answer: ${LETTERS[q.answer]}`}</div>
        ${dist ? `<div class="small muted">${dist.total} resident${dist.total === 1 ? "" : "s"} answered</div>` : ""}
        ${q.explanation ? `<div class="expl"><b>Explanation</b>\n${linkify(q.explanation)}</div>` : ""}
        ${q.reference ? `<p class="small muted" style="margin-top:10px">Reference: ${linkify(q.reference)}</p>` : ""}
        ${q.author ? `<p class="small muted">Written by ${esc(q.author)}</p>` : ""}`
      : `<button class="btn" id="submit" ${selected === null ? "disabled" : ""}>Submit answer</button>`}
    </div>`;
    if (!answered) {
      el.querySelectorAll(".choice").forEach(b => b.onclick = () => { selected = +b.dataset.i; draw(null); });
      $("#submit", el).onclick = () => submit(q, selected, isToday).then(r => draw(r));
    }
  };
  await draw(resp);
}

async function submit(q, choice, isToday) {
  const correct = choice === q.answer;
  const r = { qid: q.id, uid: me.uid, choice, correct, date: q.publishDate, answeredOn: dateKey(), at: serverTimestamp() };
  await setDoc(doc(db, "responses", `${q.id}_${me.uid}`), r);
  const upd = { answered: increment(1), correct: increment(correct ? 1 : 0) };
  if (isToday) {
    const today = dateKey();
    if (profile.lastAnsweredDate !== today) {
      const streak = profile.lastAnsweredDate === addDays(today, -1) ? (profile.streak || 0) + 1 : 1;
      Object.assign(upd, { streak, lastAnsweredDate: today, bestStreak: Math.max(streak, profile.bestStreak || 0) });
      profile.streak = streak; profile.lastAnsweredDate = today; profile.bestStreak = upd.bestStreak;
    }
  }
  await updateDoc(doc(db, "users", me.uid), upd);
  profile.answered = (profile.answered || 0) + 1; profile.correct = (profile.correct || 0) + (correct ? 1 : 0);
  toast(correct ? "Correct!" : "Not quite. See the explanation");
  return r;
}

async function renderArchive() {
  const today = dateKey();
  const s = await getDocs(query(collection(db, "questions"), where("publishDate", "<=", today), orderBy("publishDate", "desc"), limit(200)));
  const qs = s.docs.map(d => ({ id: d.id, ...d.data() }));
  const mine = await getDocs(query(collection(db, "responses"), where("uid", "==", me.uid)));
  const done = {}; mine.forEach(d => done[d.data().qid] = d.data().correct);
  const topics = [...new Set(qs.map(q => q.topic).filter(Boolean))].sort();
  let filter = "All";
  const draw = () => {
    const list = qs.filter(q => filter === "All" || q.topic === filter || (filter === "Unanswered" && !(q.id in done)));
    view.innerHTML = `
      <h1>Archive</h1>
      <div class="seg">${["All", "Unanswered", ...topics].map(t => `<button class="${t === filter ? "active" : ""}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <div class="card">${list.length ? list.map(q => `
        <div class="list-item" data-id="${q.id}" style="cursor:pointer">
          <div><div class="small muted">${prettyDate(q.publishDate)} · ${esc(q.topic || "")}</div>
          <div>${esc(q.stem.slice(0, 90))}${q.stem.length > 90 ? "…" : ""}</div></div>
          <span>${q.id in done ? (done[q.id] ? "✅" : "❌") : "○"}</span>
        </div>`).join("") : `<p class="muted">No questions yet.</p>`}</div>`;
    view.querySelectorAll(".seg button").forEach(b => b.onclick = () => { filter = b.dataset.t; draw(); });
    view.querySelectorAll(".list-item").forEach(it => it.onclick = async () => {
      const q = qs.find(x => x.id === it.dataset.id);
      view.innerHTML = `<button class="btn line" id="back" style="width:auto;margin-bottom:12px">← Archive</button><div id="qwrap"></div>`;
      $("#back").onclick = () => go("archive");
      await renderQuestion($("#qwrap"), q, q.publishDate === today);
    });
  };
  draw();
}

async function renderBoard() {
  const s = await getDocs(query(collection(db, "users"), orderBy("correct", "desc"), limit(300)));
  const users = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => !u.hideFromBoard && u.name);
  let mode = "streak", cls = "All";
  const draw = () => {
    let list = users.filter(u => cls === "All" || u.pgy === cls).map(u => ({ ...u, live: liveStreak(u) }));
    list.sort((a, b) => mode === "streak" ? (b.live - a.live || (b.correct || 0) - (a.correct || 0)) : ((b.correct || 0) - (a.correct || 0)));
    list = list.slice(0, 50);
    view.innerHTML = `
      <h1>Leaderboard</h1>
      <div class="seg">${[["streak", "Streak"], ["correct", "Total correct"]].map(([k, l]) => `<button data-m="${k}" class="${k === mode ? "active" : ""}">${l}</button>`).join("")}</div>
      <div class="seg">${["All", ...CLASSES.slice(0, 3)].map(c => `<button data-c="${c}" class="${c === cls ? "active" : ""}">${c}</button>`).join("")}</div>
      <div class="card">${list.length ? list.map((u, i) => `
        <div class="list-item"><div style="display:flex;gap:10px;align-items:center">
          <span class="rank">${i + 1}</span>
          <div><div>${esc(u.name)}${u.id === me.uid ? " <span class='pill soft'>You</span>" : ""}</div>
          <div class="small muted">${esc(u.pgy || "")}</div></div></div>
          <b>${mode === "streak" ? u.live + "🔥" : (u.correct || 0)}</b></div>`).join("") : `<p class="muted">No one yet.</p>`}</div>`;
    view.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    view.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { cls = b.dataset.c; draw(); });
  };
  draw();
}

async function renderGuide() {
  const s = await getDocs(query(collection(db, "guide"), orderBy("order", "asc")));
  const items = s.docs.map(d => ({ id: d.id, ...d.data() }));
  const cats = [...new Set(items.map(i => i.category || "General"))];
  let term = "";
  const draw = () => {
    const t = term.toLowerCase();
    const list = items.filter(i => !t || (i.title + " " + i.body + " " + i.category).toLowerCase().includes(t));
    $("#glist").innerHTML = list.length ? cats.map(c => {
      const sec = list.filter(i => (i.category || "General") === c);
      return sec.length ? `<h3 style="margin:18px 0 8px">${esc(c)}</h3>` + sec.map(i => `
        <details class="card" ${t ? "open" : ""}><summary>${esc(i.title)}</summary><div class="body">${linkify(i.body)}</div></details>`).join("") : "";
    }).join("") : `<div class="card muted">${items.length ? "No matches." : "The guide is empty. Admins can add rotation guides and phone numbers in the Admin tab."}</div>`;
  };
  view.innerHTML = `<h1>Guide</h1><input id="gs" placeholder="Search guides, phone numbers…"><div id="glist"></div>`;
  $("#gs").oninput = e => { term = e.target.value; draw(); };
  draw();
}

async function renderNews() {
  const s = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50)));
  view.innerHTML = `<h1>Announcements</h1>` + (s.empty ? `<div class="card muted">No announcements yet.</div>` :
    s.docs.map(d => { const a = d.data(); const when = a.createdAt?.toDate?.().toLocaleDateString("en-US", { month: "short", day: "numeric" }) || "";
      return `<div class="card"><div class="small muted">${when}${a.author ? " · " + esc(a.author) : ""}</div><h3>${esc(a.title)}</h3><div class="body">${linkify(a.body)}</div></div>`; }).join(""));
}

// ---------- admin ----------
let adminSeg = "questions";
async function renderAdmin() {
  if (!isAdmin) return go("today");
  view.innerHTML = `<h1>Admin</h1>
    <div class="seg">${[["questions", "Questions"], ["import", "Bulk import"], ["news", "Announce"], ["guide", "Guide"]]
      .map(([k, l]) => `<button data-s="${k}" class="${k === adminSeg ? "active" : ""}">${l}</button>`).join("")}</div><div id="adm"></div>`;
  view.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { adminSeg = b.dataset.s; renderAdmin(); });
  ({ questions: admQuestions, import: admImport, news: admNews, guide: admGuide }[adminSeg])($("#adm"));
}

async function nextFreeDates(n) {
  const s = await getDocs(query(collection(db, "questions"), where("publishDate", ">=", dateKey()), orderBy("publishDate", "asc")));
  const used = new Set(s.docs.map(d => d.data().publishDate));
  const out = []; let k = dateKey();
  while (out.length < n) { if (!used.has(k)) { out.push(k); used.add(k); } k = addDays(k, 1); }
  return out;
}

async function admQuestions(el) {
  const [free] = await nextFreeDates(1);
  el.innerHTML = `
  <div class="card"><h2>Add a question</h2>
    <label>Publish date</label><input id="qd" type="date" value="${free}">
    <label>Topic</label><input id="qt" placeholder="e.g. Cardiology">
    <label>Question stem</label><textarea id="qs"></textarea>
    <div id="chs"></div>
    <button class="btn line" id="addc" style="margin-top:6px">+ Add choice</button>
    <label>Correct answer</label><select id="qa"></select>
    <label>Explanation</label><textarea id="qe"></textarea>
    <label>Reference (optional)</label><input id="qr">
    <label>Written by (optional)</label><input id="qw">
    <div style="height:14px"></div><button class="btn" id="qsave">Save question</button>
  </div>
  <div class="card"><h2>Scheduled</h2><div id="upc" class="muted">Loading…</div></div>`;
  let n = 5;
  const drawChoices = () => {
    const prev = [...el.querySelectorAll(".chi")].map(i => i.value);
    $("#chs", el).innerHTML = Array.from({ length: n }, (_, i) => `<label>Choice ${LETTERS[i]}</label><input class="chi" value="${esc(prev[i] || "")}">`).join("");
    $("#qa", el).innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}">${LETTERS[i]}</option>`).join("");
  };
  drawChoices();
  $("#addc", el).onclick = () => { if (n < 8) { n++; drawChoices(); } };
  $("#qsave", el).onclick = async () => {
    const choices = [...el.querySelectorAll(".chi")].map(i => i.value.trim()).filter(Boolean);
    const q = { publishDate: $("#qd", el).value, topic: $("#qt", el).value.trim(), stem: $("#qs", el).value.trim(), choices,
      answer: +$("#qa", el).value, explanation: $("#qe", el).value.trim(), reference: $("#qr", el).value.trim(), author: $("#qw", el).value.trim() };
    const err = validateQ(q); if (err) return toast(err);
    await addDoc(collection(db, "questions"), { ...q, createdBy: me.email, createdAt: serverTimestamp(), notified: false });
    toast("Question saved"); renderAdmin();
  };
  loadUpcoming($("#upc", el));
}
function validateQ(q) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.publishDate || "")) return "Missing date";
  if (!q.stem) return "Missing stem";
  if (q.choices.length < 2) return "Need at least 2 choices";
  if (!(q.answer >= 0 && q.answer < q.choices.length)) return "Answer must match a filled choice";
  return "";
}
async function loadUpcoming(el) {
  const s = await getDocs(query(collection(db, "questions"), where("publishDate", ">=", dateKey()), orderBy("publishDate", "asc"), limit(100)));
  el.classList.remove("muted");
  el.innerHTML = s.empty ? `<p class="muted">Nothing scheduled. Add questions above or use Bulk import.</p>` :
    `<p class="small muted">${s.size} question${s.size === 1 ? "" : "s"} scheduled, through ${prettyDate(s.docs[s.size - 1].data().publishDate)}</p>` +
    s.docs.map(d => { const q = d.data(); return `<div class="list-item"><div><div class="small muted">${prettyDate(q.publishDate)} · ${esc(q.topic || "")}</div>${esc(q.stem.slice(0, 70))}…</div>
      <button class="btn line" style="width:auto;padding:6px 10px" data-del="${d.id}">Remove</button></div>`; }).join("");
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (b.dataset.armed) { await deleteDoc(doc(db, "questions", b.dataset.del)); toast("Removed"); loadUpcoming(el); }
    else { b.dataset.armed = 1; b.textContent = "Tap to confirm"; }
  });
}

function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function rowsToQuestions(text) {
  text = text.trim();
  if (text.startsWith("[")) {
    return JSON.parse(text).map(o => ({
      publishDate: o.date || o.publishDate || "", topic: o.topic || "", stem: o.stem || o.question || "",
      choices: (o.choices || []).filter(Boolean),
      answer: typeof o.answer === "number" ? o.answer : LETTERS.indexOf(String(o.answer || "").trim().toUpperCase()),
      explanation: o.explanation || "", reference: o.reference || "", author: o.author || ""
    }));
  }
  const rows = parseCSV(text);
  const head = rows.shift().map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  return rows.map(r => {
    const get = n => (col(n) >= 0 ? (r[col(n)] || "").trim() : "");
    const choices = ["a", "b", "c", "d", "e", "f"].map(get).filter(Boolean);
    return { publishDate: get("date"), topic: get("topic"), stem: get("stem") || get("question"), choices,
      answer: LETTERS.indexOf(get("answer").toUpperCase()), explanation: get("explanation"), reference: get("reference"), author: get("author") };
  });
}
function admImport(el) {
  el.innerHTML = `
  <div class="card"><h2>Bulk import</h2>
    <p class="small muted">Paste CSV with a header row:<br><code>date,topic,stem,a,b,c,d,e,answer,explanation,reference,author</code><br>
    <b>answer</b> is a letter (A–E). Leave <b>date</b> blank to auto-schedule into the next open days. JSON arrays with the same fields also work.</p>
    <label>Or choose a .csv file</label><input type="file" id="f" accept=".csv,.json,.txt">
    <label>Paste here</label><textarea id="t" style="min-height:180px"></textarea>
    <div style="height:12px"></div><button class="btn line" id="pv">Preview</button>
    <div id="out"></div>
  </div>`;
  $("#f", el).onchange = async e => { const file = e.target.files[0]; if (file) $("#t", el).value = await file.text(); };
  $("#pv", el).onclick = async () => {
    let qs;
    try { qs = rowsToQuestions($("#t", el).value); } catch (e) { return toast("Couldn't read that: " + e.message); }
    const undated = qs.filter(q => !q.publishDate);
    const dates = await nextFreeDates(undated.length);
    undated.forEach((q, i) => q.publishDate = dates[i]);
    const errs = qs.map((q, i) => [i + 1, validateQ(q)]).filter(x => x[1]);
    $("#out", el).innerHTML = `<p style="margin-top:14px"><b>${qs.length}</b> questions read${errs.length ? `, <span class="err">${errs.length} with problems</span>` : ""}.</p>
      ${errs.map(([n, e]) => `<div class="err">Row ${n}: ${esc(e)}</div>`).join("")}
      ${qs.slice(0, 5).map(q => `<div class="list-item"><div><div class="small muted">${prettyDate(q.publishDate)} · ${esc(q.topic)} · Ans ${LETTERS[q.answer] || "?"}</div>${esc(q.stem.slice(0, 80))}</div></div>`).join("")}
      ${qs.length > 5 ? `<p class="small muted">…and ${qs.length - 5} more</p>` : ""}
      ${!errs.length && qs.length ? `<button class="btn" id="imp">Import ${qs.length} questions</button>` : ""}`;
    const imp = $("#imp", el);
    if (imp) imp.onclick = async () => {
      imp.disabled = true;
      for (let i = 0; i < qs.length; i += 400) {
        const b = writeBatch(db);
        qs.slice(i, i + 400).forEach(q => b.set(doc(collection(db, "questions")), { ...q, createdBy: me.email, createdAt: serverTimestamp(), notified: false }));
        await b.commit();
      }
      toast(`Imported ${qs.length}`); adminSeg = "questions"; renderAdmin();
    };
  };
}

function admNews(el) {
  el.innerHTML = `
  <div class="card"><h2>Post an announcement</h2>
    <label>Title</label><input id="at">
    <label>Message</label><textarea id="ab"></textarea>
    <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="ap" style="width:auto" checked> Send as a push notification</label>
    <div style="height:12px"></div><button class="btn" id="as">Post</button>
    <p class="small muted" style="margin-top:10px">Push announcements go out within about 15 minutes.</p>
  </div>`;
  $("#as", el).onclick = async () => {
    const title = $("#at", el).value.trim(), body = $("#ab", el).value.trim();
    if (!title) return toast("Add a title");
    await addDoc(collection(db, "announcements"), { title, body, push: $("#ap", el).checked, pushed: false, author: profile.name, createdAt: serverTimestamp() });
    toast("Posted"); go("news");
  };
}

async function admGuide(el) {
  const s = await getDocs(query(collection(db, "guide"), orderBy("order", "asc")));
  const items = s.docs.map(d => ({ id: d.id, ...d.data() }));
  let editing = null;
  const draw = () => {
    const it = editing ? items.find(i => i.id === editing) : {};
    el.innerHTML = `
    <div class="card"><h2>${editing ? "Edit entry" : "Add guide entry"}</h2>
      <label>Category</label><input id="gc" list="cats" value="${esc(it.category || "")}" placeholder="e.g. MICU, Wards, Phone numbers">
      <datalist id="cats">${[...new Set(items.map(i => i.category))].map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <label>Title</label><input id="gt" value="${esc(it.title || "")}">
      <label>Content</label><textarea id="gb" style="min-height:160px" placeholder="Links and 10-digit phone numbers become tappable.">${esc(it.body || "")}</textarea>
      <label>Order (lower shows first)</label><input id="go" type="number" value="${it.order ?? items.length + 1}">
      <div style="height:12px"></div><div class="row"><button class="btn" id="gsv">Save</button>${editing ? `<button class="btn line" id="gx">Cancel</button>` : ""}</div>
    </div>
    <div class="card"><h2>Entries</h2>${items.length ? items.map(i => `<div class="list-item"><div><div class="small muted">${esc(i.category)}</div>${esc(i.title)}</div>
      <div class="row" style="width:auto"><button class="btn line" style="width:auto;padding:6px 10px" data-e="${i.id}">Edit</button>
      <button class="btn line" style="width:auto;padding:6px 10px" data-d="${i.id}">Delete</button></div></div>`).join("") : `<p class="muted">None yet.</p>`}</div>`;
    $("#gsv", el).onclick = async () => {
      const data = { category: $("#gc", el).value.trim() || "General", title: $("#gt", el).value.trim(), body: $("#gb", el).value, order: +$("#go", el).value || 0, updatedAt: serverTimestamp() };
      if (!data.title) return toast("Add a title");
      if (editing) await setDoc(doc(db, "guide", editing), data, { merge: true });
      else await addDoc(collection(db, "guide"), data);
      toast("Saved"); admGuide(el);
    };
    const gx = $("#gx", el); if (gx) gx.onclick = () => { editing = null; draw(); };
    el.querySelectorAll("[data-e]").forEach(b => b.onclick = () => { editing = b.dataset.e; draw(); window.scrollTo(0, 0); });
    el.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => {
      if (b.dataset.armed) { await deleteDoc(doc(db, "guide", b.dataset.d)); toast("Deleted"); admGuide(el); }
      else { b.dataset.armed = 1; b.textContent = "Confirm"; }
    });
  };
  draw();
}
