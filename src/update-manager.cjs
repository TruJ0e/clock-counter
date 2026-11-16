'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const POLL_MS = 60 * 60 * 1000;

function eligibleForAutomaticCheck(state, now = Date.now()) {
  if (!state || typeof state !== 'object') return true;
  const lastSuccess = Number.isFinite(state.lastSuccessfulCheckAt)
    ? Math.max(0, state.lastSuccessfulCheckAt) : 0;
  const lastAttempt = Number.isFinite(state.lastAttemptAt)
    ? Math.max(0, state.lastAttemptAt) : 0;
  // A successful check is valid for 7 days. On network errors, retry hourly.
  return (now - lastSuccess >= WEEK_MS) && (now - lastAttempt >= RETRY_MS);
}

function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value && typeof value === 'object') return value;
  } catch {}
  return {};
}
function persistState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), {recursive:true});
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state), {encoding:'utf8',mode:0o600});
    fs.renameSync(temp, file);
  } catch (error) {
    console.warn('CLOCK COUNTER update schedule could not be saved:', error.message);
  }
}

/**
 * Only the installed NSIS build may install updates. All update downloads are
 * handled by electron-updater from GitHub releases using HTTPS + SHA-512
 * artifact verification from electron-builder's latest.yml metadata.
 *
 * A portable app or a test/dev run never installs anything automatically.
 * The app does not run installers while an active countdown is in progress:
 * installation is deferred until the user exits the installed app normally.
 */
function createUpdateManager({
  enabled,
  updater,
  stateFile,
  notify = () => {},
  now = Date.now,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval
}) {
  const state = readState(stateFile);
  let inFlight = null;
  let downloaded = false;
  let status = {
    phase: enabled ? 'idle' : 'unavailable',
    message: enabled
      ? 'Updates are checked weekly; click Update to check now'
      : 'Automatic updates require the installed Windows version',
    version: null
  };
  const send = (phase, message, extra = {}) => {
    status = {phase,message,version:null,...extra};
    notify({...status});
    return {...status};
  };
  const markSuccess = () => {
    state.lastSuccessfulCheckAt = now();
    persistState(stateFile,state);
  };

  if (enabled && updater) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;

    updater.on('checking-for-update', () =>
      send('checking', 'CHECKING FOR UPDATES'));
    updater.on('update-available', info => {
      markSuccess();
      send('available','UPDATE v'+String(info?.version||'?')+' FOUND — DOWNLOADING',
        {version:info?.version||null});
    });
    updater.on('download-progress', progress =>
      send('downloading','DOWNLOADING UPDATE — '+Math.min(100,Math.max(0,
        Math.floor(Number(progress?.percent)||0)))+'%',
        {percent:Math.min(100,Math.max(0,Math.floor(Number(progress?.percent)||0)))}));
    updater.on('update-not-available', info => {
      markSuccess();
      send('current','UP TO DATE — v'+String(info?.version||'?'),
        {version:info?.version||null});
    });
    updater.on('update-downloaded', info => {
      downloaded = true;
      send('ready','UPDATE v'+String(info?.version||'?')+
        ' READY — INSTALLS WHEN YOU QUIT',
        {version:info?.version||null});
    });
    updater.on('error', () => {
      send('error','UPDATE CHECK FAILED — TRY AGAIN');
    });
  }

  async function check({manual=false} = {}) {
    if (!enabled || !updater) return send('unavailable',
      'Install CLOCK COUNTER from the website to enable automatic updates');
    if (downloaded) return {...status};
    if (inFlight) return {...status};
    if (!manual && !eligibleForAutomaticCheck(state,now())) return {...status};
    state.lastAttemptAt=now();
    persistState(stateFile,state);
    send('checking',manual?'CHECKING FOR UPDATES (MANUAL)':'CHECKING FOR UPDATES');
    inFlight = Promise.resolve().then(()=>updater.checkForUpdates());
    try {
      await inFlight;
    } catch (error) {
      send('error','UPDATE CHECK FAILED — TRY AGAIN');
    } finally {
      inFlight=null;
    }
    return {...status};
  }
  function start() {
    // No checks while the application is not running; the next launch
    // catches up if more than a week has elapsed since the last success.
    if (!enabled) return () => {};
    const initial=setTimeoutFn(()=>{void check();},4000);
    const poll=setIntervalFn(()=>{void check();},POLL_MS);
    initial?.unref?.();
    poll?.unref?.();
    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }
  return {check,start,getStatus:()=>({...status}),getLastCheck:()=>({...state})};
}

module.exports={WEEK_MS,RETRY_MS,POLL_MS,eligibleForAutomaticCheck,createUpdateManager};
