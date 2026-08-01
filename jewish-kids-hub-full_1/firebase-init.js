/* ============================================
   Jewish Kids Hub — Firebase initialization
   Loaded on every page after the firebase-*-compat.js
   CDN scripts. Exposes window.auth and window.db.
   ============================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAYsM6O7rmWDD7UWaIsUfZGZndjhRQorGg",
  authDomain: "jewish-kids-hub.firebaseapp.com",
  databaseURL: "https://jewish-kids-hub-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jewish-kids-hub",
  storageBucket: "jewish-kids-hub.firebasestorage.app",
  messagingSenderId: "97086668339",
  appId: "1:97086668339:web:4819a5b4f0990633556d46",
  measurementId: "G-Z6F4SMBGVZ"
};
firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db = firebase.database();
window.googleProvider = new firebase.auth.GoogleAuthProvider();
// Only set on pages that also load firebase-functions-compat.js (currently just login.html) —
// guarded so pages without it don't throw an error and break the rest of this file.
window.functions = (typeof firebase.functions === 'function') ? firebase.functions() : null;
