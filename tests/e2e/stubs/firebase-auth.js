// Test saplamasi: bellek ici kullanici deposu. window.__fbTest uzerinden testten yonetilir.
const S = (window.__fbTest = window.__fbTest || { users: {}, current: null, listeners: [], calls: [] });
const notify = () => S.listeners.forEach((f) => f(S.current));
export const browserLocalPersistence = {};
export class GoogleAuthProvider {}
export function getAuth() { return { get currentUser() { return S.current; } }; }
export async function setPersistence() {}
export async function getRedirectResult() { return null; }
export function onAuthStateChanged(auth, cb) { S.listeners.push(cb); setTimeout(() => cb(S.current), 0); return () => {}; }
export async function createUserWithEmailAndPassword(auth, email, pw) {
  S.calls.push(['create', email]);
  if (S.users[email]) { const e = new Error('exists'); e.code = 'auth/email-already-in-use'; throw e; }
  if ((pw || '').length < 6) { const e = new Error('weak'); e.code = 'auth/weak-password'; throw e; }
  S.users[email] = pw; S.current = { uid: 'u_' + email.replace(/\W/g, ''), email, emailVerified: false };
  setTimeout(notify, 0); return { user: S.current };
}
export async function signInWithEmailAndPassword(auth, email, pw) {
  S.calls.push(['login', email]);
  if (S.users[email] !== pw) { const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; }
  S.current = { uid: 'u_' + email.replace(/\W/g, ''), email, emailVerified: true };
  setTimeout(notify, 0); return { user: S.current };
}
export async function signInWithPopup() { const e = new Error('popup'); e.code = 'auth/popup-closed-by-user'; throw e; }
export async function signInWithRedirect() {}
export async function sendEmailVerification() { S.calls.push(['verify']); }
export async function sendPasswordResetEmail(a, email) { S.calls.push(['reset', email]); }
export async function signOut() { S.current = null; setTimeout(notify, 0); }
