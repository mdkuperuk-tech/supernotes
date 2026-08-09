/* drive.js — Google Drive sync + Cloud Vision handwriting OCR.
   Uses Google Identity Services with the narrow `drive.file` scope, so the app
   can only ever see files it created itself. */

import * as S from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'SuperNotes';

export const state = {
  clientId: '', visionKey: '', folderId: '',
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
  state.clientId = (await S.setting('gdrive.clientId')) || '';
  state.visionKey = (await S.setting('gdrive.visionKey')) || '';
  state.folderId = (await S.setting('gdrive.folderId')) || '';
  if (state.clientId) {
    await loadGIS();
    set({ status: 'ready', message: 'Not connected' });
    // try a silent sign-in if the user has connected before
    if (await S.setting('gdrive.connected')) signIn(true).catch(() => {});
  } else {
    set({ status: 'off', message: 'Drive not set up' });
  }
}

export async function saveConfig({ clientId, visionKey }) {
  if (clientId !== undefined) { state.clientId = clientId.trim(); await S.setting('gdrive.clientId', state.clientId); }
  if (visionKey !== undefined) { state.visionKey = visionKey.trim(); await S.setting('gdrive.visionKey', state.visionKey); }
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

export function signIn(silent = false) {
  return new Promise(async (res, rej) => {
    if (!state.clientId) return rej(new Error('Add your Google client ID in Settings first.'));
    try { await loadGIS(); } catch (e) { return rej(e); }
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: state.clientId,
        scope: SCOPE,
        callback: () => {}
      });
    }
    tokenClient.callback = async resp => {
      if (resp.error) { set({ status: 'error', message: resp.error }); return rej(new Error(resp.error)); }
      set({ token: resp.access_token, tokenExp: Date.now() + (resp.expires_in - 90) * 1000, signedIn: true, status: 'synced', message: 'Connected' });
      await S.setting('gdrive.connected', true);
      try { await ensureFolder(); } catch (e) { /* surfaced on first sync */ }
      res(true);
    };
    try {
      tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
    } catch (e) { rej(e); }
  });
}

export async function signOut() {
  if (state.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(state.token, () => {});
  await S.setting('gdrive.connected', false);
  set({ token: '', signedIn: false, status: 'ready', message: 'Disconnected' });
}

async function token() {
  if (state.token && Date.now() < state.tokenExp) return state.token;
  await signIn(true);
  return state.token;
}

/* ---------- REST helpers ---------- */

async function api(url, opts = {}) {
  const t = await token();
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
  if (r.status === 401) { state.token = ''; throw new Error('Google session expired — reconnect in Settings.'); }
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

/* ---------- handwriting → text (Google Cloud Vision) ---------- */

export async function ocr(canvas) {
  if (!state.visionKey) throw new Error('Add a Cloud Vision API key in Settings to convert handwriting to text.');
  const dataURL = canvas.toDataURL('image/png');
  const b64 = dataURL.split(',')[1];
  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(state.visionKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: b64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['en', 'es'] }
      }]
    })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  const resp = j.responses?.[0];
  if (resp?.error) throw new Error(resp.error.message);
  return (resp?.fullTextAnnotation?.text || '').trim();
}
