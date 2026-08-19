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
  signedIn: false, linked: false, email: '',
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

  /* Two separate ideas, and conflating them is what made this feel like being
     logged out constantly:
       - the GRANT: you allowed this app access. It lasts until you revoke it.
       - the ACCESS TOKEN: a 1-hour key. Expiring is routine, not a sign-out.
     `linked` is the grant. The UI follows the grant, never the token. */
  state.linked = !!(await S.setting('gdrive.connected'));

  const cached = await S.setting('gdrive.token');
  if (cached && cached.exp > Date.now() + 60000) {
    set({ token: cached.t, tokenExp: cached.exp, signedIn: true, status: 'synced', message: 'Connected' });
  } else if (state.linked) {
    // Grant is still good; we just need a fresh key. Say connected, renew on the
    // first gesture. Google refuses a token request that isn't inside a user
    // gesture, so asking here on page load would only fail and look broken.
    set({ signedIn: true, status: 'synced', message: 'Connected' });
  } else {
    set({ status: 'ready', message: 'Not connected' });
  }

  try { await loadGIS(); } catch { set({ status: 'offline', message: 'Offline — will sync later' }); return; }

  if (state.linked) armGestureRenew();
}

/* Renew the access token on the next real tap, and never more than once at a time.
   A token request outside a user gesture is blocked by the browser as a popup, so
   we wait for a gesture we know we have. With the grant already on file Google
   returns the token without showing anything. */
let renewArmed = false;
export function armGestureRenew() {
  if (renewArmed || !state.linked) return;
  renewArmed = true;
  const go = () => {
    if (needsToken()) silentRenew();
    if (!needsToken()) disarm();
  };
  const disarm = () => {
    renewArmed = false;
    for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, go, true);
  };
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, go, true);
}

const needsToken = () => !state.token || Date.now() > state.tokenExp - 5 * 60 * 1000;

let renewing = null;
function silentRenew() {
  if (renewing) return renewing;
  renewing = signIn(true)
    .catch(() => {
      /* Silent renewal can fail for reasons that are not the user's problem —
         Safari blocking third-party cookies is the common one. Keep the grant,
         keep working locally, let the next sync attempt ask properly. */
    })
    .finally(() => { renewing = null; });
  return renewing;
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
      state.linked = true;
      set({ token: resp.access_token, tokenExp: exp, signedIn: true, status: 'synced', message: 'Connected' });
      await S.setting('gdrive.connected', true);
      await S.setting('gdrive.token', { t: resp.access_token, exp });
      try { await ensureFolder(); } catch {}
      finish(res, true);
    };
    /* A failed renewal while the grant still stands is not a sign-out. Stay
       "Connected", keep saving locally, and try again on the next gesture. */
    const softFail = msg => {
      if (state.linked) { set({ status: 'synced', message: 'Connected' }); armGestureRenew(); }
      else set({ status: 'ready', message: msg });
    };
    tokenClient.error_callback = err => {
      softFail(err?.type || 'Sign-in cancelled');
      finish(rej, new Error(err?.type || 'Sign-in did not complete'));
    };

    setTimeout(() => {
      if (settled) return;
      softFail('Tap to connect Drive');
      finish(rej, new Error('Google sign-in timed out — tap Connect Drive to retry.'));
    }, silent ? 8000 : 120000);

    /* prompt:'' means "only show me something if you actually have to". Google skips
       the account chooser and the consent screen when the grant is already on file.
       prompt:'consent' would force the whole approval flow every single time — which
       is exactly what made this look like it had signed you out. Only ask for consent
       explicitly the very first time, when there is no grant yet. */
    const prompt = state.linked ? '' : 'consent';
    try { tokenClient.requestAccessToken({ prompt, hint: state.email || undefined }); }
    catch (e) { finish(rej, e); }
  }).finally(() => { inFlight = null; });
  return inFlight;
}

export async function signOut() {
  if (state.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(state.token, () => {});
  state.linked = false;
  await S.setting('gdrive.connected', false);
  await S.setting('gdrive.token', null);
  set({ token: '', tokenExp: 0, signedIn: false, status: 'ready', message: 'Disconnected' });
}

/** Disconnecting is the only real sign-out. Everything else is just a stale key. */
async function token() {
  if (state.token && Date.now() < state.tokenExp) return state.token;
  await silentRenew();
  if (!state.token) { armGestureRenew(); throw new NeedsTap(); }
  return state.token;
}

/* A "we need a tap before we can sync" signal, distinct from a real failure, so
   the sync loop can skip quietly instead of shouting at you. */
export class NeedsTap extends Error {
  constructor() { super('Waiting for a tap to refresh the Drive connection'); this.needsTap = true; }
}

/* ---------- REST helpers ---------- */

async function api(url, opts = {}) {
  const t = await token();
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (r.status === 401) {
    // The key went stale early. Drop it, keep the grant, get a new one on the next tap.
    state.token = ''; state.tokenExp = 0;
    await S.setting('gdrive.token', null);
    if (state.linked) { set({ status: 'synced', message: 'Connected' }); armGestureRenew(); throw new NeedsTap(); }
    set({ signedIn: false, status: 'ready', message: 'Tap to connect Drive' });
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
  if (!state.linked) return { skipped: true };
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
