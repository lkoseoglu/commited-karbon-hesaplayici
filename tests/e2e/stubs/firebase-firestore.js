// Test saplamasi: bellek ici Firestore. window.__fbTest.db = { "yol": {alanlar} }
// S.denyGroup = true: collectionGroup sorgusu izin hatasi verir (yonetim panelinin yedek okuma yolu icin).
const S = (window.__fbTest = window.__fbTest || { users: {}, current: null, listeners: [], calls: [] });
S.db = S.db || {};
let seq = 0;
export function getFirestore() { return { __db: true }; }
export function doc(db, ...parts) { return { path: parts.join('/') }; }
export function collection(db, ...parts) { return { path: parts.join('/'), isCol: true }; }
export function collectionGroup(db, name) { return { group: name }; }
export function query(col, ...c) { return { ...col, order: c.find((x) => x && x.__order) }; }
export function orderBy(field, dir) { return { __order: true, field, dir }; }
export function serverTimestamp() { return { __ts: Date.now() }; }
export async function getDoc(ref) {
  const v = S.db[ref.path];
  return { exists: () => v !== undefined, data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined), id: ref.path.split('/').pop() };
}
export async function setDoc(ref, data, opts) {
  S.calls.push(['setDoc', ref.path]);
  S.db[ref.path] = opts && opts.merge ? { ...(S.db[ref.path] || {}), ...data } : { ...data };
}
export async function addDoc(col, data) {
  const id = 'id' + ++seq; S.calls.push(['addDoc', col.path]);
  S.db[col.path + '/' + id] = { ...data, createdAt: { seconds: Math.floor(Date.now() / 1000) } };
  return { id };
}
export async function getDocs(q) {
  S.calls.push(['getDocs', q.group ? 'group:' + q.group : q.path]);
  let keys;
  if (q.group) {
    if (S.denyGroup) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
    keys = Object.keys(S.db).filter((k) => { const p = k.split('/'); return p.length >= 2 && p.length % 2 === 0 && p[p.length - 2] === q.group; });
  } else {
    const pre = q.path + '/';
    keys = Object.keys(S.db).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/'));
  }
  const docs = keys.map((k) => {
    const p = k.split('/');
    return { id: p[p.length - 1], ref: { path: k, id: p[p.length - 1] }, data: () => JSON.parse(JSON.stringify(S.db[k])) };
  });
  return { docs, empty: !docs.length, size: docs.length, forEach: (f) => docs.forEach(f) };
}
