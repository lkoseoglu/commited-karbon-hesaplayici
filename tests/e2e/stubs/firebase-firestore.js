// Test saplamasi: bellek ici Firestore. window.__fbTest.db = { "yol": {alanlar} }
const S = (window.__fbTest = window.__fbTest || { users: {}, current: null, listeners: [], calls: [] });
S.db = S.db || {};
let seq = 0;
export function getFirestore() { return { __db: true }; }
export function doc(db, ...parts) { return { path: parts.join('/') }; }
export function collection(db, ...parts) { return { path: parts.join('/'), isCol: true }; }
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
  const pre = q.path + '/';
  const docs = Object.keys(S.db).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
    .map((k) => ({ id: k.slice(pre.length), data: () => JSON.parse(JSON.stringify(S.db[k])) }));
  return { docs, empty: !docs.length, forEach: (f) => docs.forEach(f) };
}
