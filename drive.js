/* drive.js — Google Drive sync.
   Uses Google Identity Services with the narrow `drive.file` scope, so the app
   can only ever see files it created itself. No paid service is ever called. */

import * as S from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'SuperNotes';

/* This app's own Google OAuth client.
   A browser client ID is public by design — it travels in every sign-in request the page
   makes and cannot be hidden. What actually protects it is the authorised-JavaScript-origin
   restriction on the Google project, which only accepts it from this site. Baking it in is
   what lets a brand-new device sync without being configured by hand. */
const DEFAULT_CLIENT_ID = '535908975338-epcfdu9dinndd9velufgt2cvjmp9t4kh.apps.googleusercontent.com';

export const state = {
  clientId: '', folderId: '',
  token: '', tokenExp: 0,
  signedIn: false, email: '',
  status: 'off',           // off | ready | syncing | synced | error | offline
  message: '', lastSync: 0
};

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(f => f(state));
function set(patch) { Object.assign(state, patch); emit(); }

/* ---------- setup ---------- */

export async function init() {
  state.clientId = (await S.setting('gdrive.clientId')) || DEFAULT_CLIENT_ID;
  state.folderId = (await S.setting('gdrive.folderId')) || '';
  if (!state.clientId) { set({ status: 'off', message: 'Drive not set up' }); return; }

  // Reuse a cached access token so a reload inside the hour resumes without re-consent.
  const cached = await S.setting('gdrive.token');
  if (cached && cached.exp > Date.now() + 60000) {
    set({ token: cached.t, tokenExp: cached.exp, signedIn: true, status: 'synced', message: 'Connected' });
  } else {
    set({ status: 'ready', message: 'Not connected' });
  }

  try { await loadGIS(); } catch { set({ status: 'offline', message: 'Offline — will sync later' }); return; }

  // If there is no live token, try to renew quietly. This never blocks the UI.
  if (!state.signedIn && await S.setting('gdrive.connected')) {
    signIn(true).catch(() => set({ status: 'ready', message: 'Tap to reconnect Drive' }));
  }
}

export async function saveConfig({ clientId }) {
  if (clientId !== undefined) {
    const v = clientId.trim();
    state.clientId = v || DEFAULT_CLIENT_ID;
    await S.setting('gdrive.clientId', v);
  }
  if (state.clientId) { await loadGIS(); set({ status: 'ready', message: 'Ready to connect' }); }
  else set({ status: 'off', message: 'Drive not set up' });
}

let gisPromise = null;
function loadGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load Google sign-in (are you offline?)'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

let tokenClient = null;
let inFlight = null;

/**
 * Ask Google for an access token.
 * `silent` uses prompt:'' — no UI when Google can renew on its own. That path can
 * simply never call back (blocked popup, no third-party cookies), so every attempt
 * is raced against a timeout: a hung renewal must degrade to "reconnect", never hang.
 */
export function signIn(silent = false) {
  if (inFlight) return inFlight;
  inFlight = new Promise(async (res, rej) => {
    if (!state.clientId) return rej(new Error('Add your Google client ID in Settings first.'));
    try { await loadGIS(); } catch (e) { return rej(e); }

    let settled = false;
    const finish = (fn, v) => { if (!settled) { settled = true; fn(v); } };

    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: state.clientId, scope: SCOPE, callback: () => {}
      });
    }
    tokenClient.callback = async resp => {
      if (resp.error) {
        set({ status: 'error', message: resp.error });
        return finish(rej, new Error(resp.error));
      }
      const exp = Date.now() + ((resp.expires_in || 3600) - 120) * 1000;
      set({ token: resp.access_token, tokenExp: exp, signedIn: true, status: 'synced', message: 'Connected' });
      await S.setting('gdrive.connected', true);
      await S.setting('gdrive.token', { t: resp.access_token, exp });
      try { await ensureFolder(); } catch {}
      finish(res, true);
    };
    tokenClient.error_callback = err => {
      set({ status: 'ready', message: silent ? 'Tap to reconnect Drive' : (err?.type || 'Sign-in cancelled') });
      finish(rej, new Error(err?.type || 'Sign-in did not complete'));
    };

    setTimeout(() => {
      if (settled) return;
      set({ status: 'ready', message: 'Tap to reconnect Drive' });
      finish(rej, new Error('Google sign-in timed out — tap Connect Drive to retry.'));
    }, silent ? 8000 : 120000);

    try { tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' }); }
    catch (e) { finish(rej, e); }
  }).finally(() => { inFlight = null; });
  return inFlight;
}

export async function signOut() {
  if (state.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(state.token, () => {});
  await S.setting('gdrive.connected', false);
  await S.setting('gdrive.token', null);
  set({ token: '', tokenExp: 0, signedIn: false, status: 'ready', message: 'Disconnected' });
}

async function token() {
  if (state.token && Date.now() < state.tokenExp) return state.token;
  await signIn(true);
  if (!state.token) throw new Error('Google session expired — tap Connect Drive.');
  return state.token;
}

/* ---------- REST helpers ---------- */

async function api(url, opts = {}) {
  const t = await token();
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (r.status === 401) {
    state.token = ''; state.tokenExp = 0;
    await S.setting('gdrive.token', null);
    set({ signedIn: false, status: 'ready', message: 'Tap to reconnect Drive' });
    throw new Error('Google session expired — tap Connect Drive.');
  }
  if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function ensureFolder() {
  if (state.folderId) {
    try { await api(`https://www.googleapis.com/drive/v3/files/${state.folderId}?fields=id,trashed`); return state.folderId; }
    catch { state.folderId = ''; }
  }
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`);
  const j = await r.json();
  let id = j.files?.[0]?.id;
  if (!id) {
    const c = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
    });
    id = (await c.json()).id;
  }
  state.folderId = id;
  await S.setting('gdrive.folderId', id);
  return id;
}

function multipart(metadata, body, mime) {
  const b = '----supernotes' + Math.random().toString(36).slice(2);
  const pre = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`;
  const post = `\r\n--${b}--`;
  return { body: new Blob([pre, body, post]), type: `multipart/related; boundary=${b}` };
}

/* ---------- notebook sync ---------- */

export async function pushNotebook(nbId) {
  const bundle = await S.exportNotebook(nbId);
  if (!bundle) return;
  const folderId = await ensureFolder();
  const nb = bundle.notebook;
  const name = `${sanitize(nb.title || 'Notebook')}.snb.json`;
  const json = JSON.stringify(bundle);
  const meta = { name, appProperties: { nbId, updatedAt: String(nb.updatedAt || Date.now()) } };

  let fileId = nb.driveFileId;
  if (!fileId) fileId = await findByNbId(nbId);

  let r;
  if (fileId) {
    const mp = multipart({ name, appProperties: meta.appProperties }, json, 'application/json');
    r = await api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`,
      { method: 'PATCH', headers: { 'Content-Type': mp.type }, body: mp.body });
  } else {
    const mp = multipart({ ...meta, parents: [folderId] }, json, 'application/json');
    r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
  }
  const id = (await r.json()).id;
  const live = await S.get('notebooks', nbId);
  if (live) { live.driveFileId = id; live.dirty = false; live.syncedAt = Date.now(); await S.put('notebooks', live); }
  return id;
}

async function findByNbId(nbId) {
  const q = encodeURIComponent(`appProperties has { key='nbId' and value='${nbId}' } and trashed=false`);
  const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime,appProperties)`);
  return (await r.json()).files?.[0]?.id || '';
}

export async function listRemote() {
  await ensureFolder();
  const q = encodeURIComponent(`'${state.folderId}' in parents and trashed=false and name contains '.snb'`);
  const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,appProperties)&pageSize=200`);
  return (await r.json()).files || [];
}

export async function pullNotebook(fileId) {
  const r = await api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const bundle = await r.json();
  bundle.notebook.driveFileId = fileId;
  bundle.notebook.syncedAt = Date.now();
  return S.importNotebook(bundle);
}

/** Two-way sync: newest wins per notebook. */
export async function syncAll() {
  if (!state.signedIn) return { skipped: true };
  if (!navigator.onLine) { set({ status: 'offline', message: 'Offline — will sync later' }); return { skipped: true }; }
  set({ status: 'syncing', message: 'Syncing…' });
  try {
    const local = await S.all('notebooks');
    const remote = await listRemote();
    const rByNb = new Map();
    for (const f of remote) { const k = f.appProperties?.nbId; if (k) rByNb.set(k, f); }

    let up = 0, down = 0;
    for (const nb of local) {
      const rf = rByNb.get(nb.id);
      const rTime = rf ? Number(rf.appProperties?.updatedAt || Date.parse(rf.modifiedTime)) : 0;
      if (nb.deleted) { if (rf) { try { await api(`https://www.googleapis.com/drive/v3/files/${rf.id}`, { method: 'DELETE' }); } catch {} } continue; }
      if (!rf || (nb.updatedAt || 0) > rTime + 1500) { await pushNotebook(nb.id); up++; }
      else if (rTime > (nb.updatedAt || 0) + 1500) { await pullNotebook(rf.id); down++; }
      else if (nb.dirty) { await pushNotebook(nb.id); up++; }
      rByNb.delete(nb.id);
    }
    for (const [, rf] of rByNb) { await pullNotebook(rf.id); down++; }

    set({ status: 'synced', message: `Synced${up || down ? ` · ↑${up} ↓${down}` : ''}`, lastSync: Date.now() });
    return { up, down };
  } catch (e) {
    set({ status: 'error', message: e.message.slice(0, 120) });
    throw e;
  }
}

/** Upload an arbitrary file (e.g. an exported PDF) to the SuperNotes folder. */
export async function uploadFile(blob, name, mime) {
  const folderId = await ensureFolder();
  const mp = multipart({ name, parents: [folderId] }, blob, mime || blob.type || 'application/octet-stream');
  const r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { 'Content-Type': mp.type }, body: mp.body });
  return r.json();
}

const sanitize = s => String(s).replace(/[\\/:*?"<>|]/g, '-').slice(0, 90).trim() || 'Notebook';

/* Handwriting-to-text is intentionally not implemented.
   Every browser-reachable engine (Google Cloud Vision, MyScript, Azure Read) is a paid
   cloud service, and this app is built to cost nothing to run. On iPad, write with the
   Apple Pencil directly into a text box instead: iPadOS Scribble converts it on-device,
   free, with no network call and no account. */
