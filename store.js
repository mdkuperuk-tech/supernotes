/* store.js — IndexedDB persistence. Everything lives on-device first;
   Drive sync (drive.js) layers on top of this. */

const DB_NAME = 'supernotes';
const DB_VER = 1;
let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('notebooks')) db.createObjectStore('notebooks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pages')) {
        const p = db.createObjectStore('pages', { keyPath: 'id' });
        p.createIndex('notebookId', 'notebookId');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}

function tx(store, mode = 'readonly') {
  return open().then(db => db.transaction(store, mode).objectStore(store));
}
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const put    = (s, v) => tx(s, 'readwrite').then(o => wrap(o.put(v)));
export const get    = (s, k) => tx(s).then(o => wrap(o.get(k)));
export const del    = (s, k) => tx(s, 'readwrite').then(o => wrap(o.delete(k)));
export const all    = s => tx(s).then(o => wrap(o.getAll()));
export const byIndex = (s, idx, key) => tx(s).then(o => wrap(o.index(idx).getAll(key)));

export const setting = async (k, v) => {
  if (v === undefined) { const r = await get('kv', k); return r ? r.v : undefined; }
  return put('kv', { k, v });
};

export const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- notebooks & pages ---------- */

export async function listNotebooks() {
  const n = await all('notebooks');
  return n.filter(x => !x.deleted).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
}

export async function getPages(notebookId) {
  const p = await byIndex('pages', 'notebookId', notebookId);
  return p.sort((a, b) => a.index - b.index);
}

export async function saveNotebook(nb) {
  nb.updatedAt = Date.now();
  nb.dirty = true;
  await put('notebooks', nb);
  return nb;
}

export async function savePage(page) {
  page.updatedAt = Date.now();
  await put('pages', page);
  const nb = await get('notebooks', page.notebookId);
  if (nb) { nb.updatedAt = Date.now(); nb.dirty = true; await put('notebooks', nb); }
  return page;
}

export async function deleteNotebook(id) {
  const nb = await get('notebooks', id);
  if (nb) { nb.deleted = true; nb.dirty = true; nb.updatedAt = Date.now(); await put('notebooks', nb); }
  const pages = await byIndex('pages', 'notebookId', id);
  for (const p of pages) await del('pages', p.id);
}

/* ---------- blobs (images + audio) ---------- */

export async function putBlob(blob, id = uid()) {
  await put('blobs', { id, blob, type: blob.type, size: blob.size });
  return id;
}
export async function getBlobURL(id) {
  const r = await get('blobs', id);
  if (!r) return null;
  return URL.createObjectURL(r.blob);
}
export const getBlob = async id => (await get('blobs', id))?.blob || null;

/* ---------- portable bundle (used by Drive sync + local backup) ---------- */

export async function exportNotebook(id) {
  const nb = await get('notebooks', id);
  if (!nb) return null;
  const pages = await getPages(id);
  const assetIds = new Set();
  for (const p of pages) for (const o of (p.objects || [])) if (o.blobId) assetIds.add(o.blobId);
  const assets = {};
  for (const aid of assetIds) {
    const b = await getBlob(aid);
    if (b) assets[aid] = { type: b.type, data: await blobToB64(b) };
  }
  return { v: 1, notebook: strip(nb), pages: pages.map(strip), assets };
}

export async function importNotebook(bundle, { keepIds = true } = {}) {
  const map = new Map();
  const nid = keepIds ? bundle.notebook.id : uid();
  map.set(bundle.notebook.id, nid);
  for (const [aid, a] of Object.entries(bundle.assets || {})) {
    const existing = await get('blobs', aid);
    if (!existing) await put('blobs', { id: aid, blob: b64ToBlob(a.data, a.type), type: a.type });
  }
  const nb = { ...bundle.notebook, id: nid, dirty: false };
  await put('notebooks', nb);
  const existing = await getPages(nid);
  for (const p of existing) await del('pages', p.id);
  for (const p of bundle.pages) await put('pages', { ...p, id: keepIds ? p.id : uid(), notebookId: nid });
  return nb;
}

const strip = o => { const c = { ...o }; delete c.dirty; delete c._cache; return c; };

export function blobToB64(blob) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.readAsDataURL(blob);
  });
}
export function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: type || 'application/octet-stream' });
}

/* ---------- storage estimate ---------- */
export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage || 0, quota: e.quota || 0 };
}
