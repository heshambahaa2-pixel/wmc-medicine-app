// App configuration. Firebase web config values are public identifiers, not secrets.
export const firebaseConfig = {
  apiKey: "AIzaSyBHtBSYDtcqRuf77yAPyFHpUYE2hH3jNJo",
  authDomain: "wmc-medicine-residents.firebaseapp.com",
  projectId: "wmc-medicine-residents",
  storageBucket: "wmc-medicine-residents.firebasestorage.app",
  messagingSenderId: "571702223822",
  appId: "1:571702223822:web:c6d22b23d9cc7cd771019f"
};

// Web Push certificate public key (Firebase Console > Project settings > Cloud Messaging)
export const vapidKey = "BJYD9sr2FbXfAsV4PlVVnESSp8F3cTOQ2btS1lUdf_rkctBxDPo0Rk7BJ-Ixp8A8-zPPWlQRSpD0PVgZZ_3NK78";

// Emails allowed to use the Admin panel (must match firestore.rules)
export const adminEmails = ["hesham.bahaa2@gmail.com"];

export const appName = "WMC Medicine";
export const timeZone = "America/New_York";
