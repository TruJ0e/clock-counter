import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import updaterModule from '../src/update-manager.cjs';

const {WEEK_MS,RETRY_MS,eligibleForAutomaticCheck,createUpdateManager}=updaterModule;
const TODAY=Date.UTC(2026,10,16,15,0,0);

function fixture(t, override={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ttc-update-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'update-state.json');
  const events=[];
  const updater=new EventEmitter();
  let count=0, current=TODAY;
  updater.checkForUpdates=async()=>{
    count++;
    updater.emit('checking-for-update');
    updater.emit('update-not-available',{version:'0.5.0'});
  };
  const manager=createUpdateManager({
    enabled:true,updater,stateFile:file,
    notify:status=>events.push(status),
    now:()=>current,
    ...override
  });
  return {
    manager,file,events,updater,
    setTime:time=>{current=time;},
    count:()=>count
  };
}

test('weekly eligibility permits first check, then waits seven full days',()=>{
  assert.equal(eligibleForAutomaticCheck({},TODAY),true);
  assert.equal(eligibleForAutomaticCheck({lastSuccessfulCheckAt:TODAY-1},TODAY),false);
  assert.equal(eligibleForAutomaticCheck({lastSuccessfulCheckAt:TODAY-WEEK_MS+1,lastAttemptAt:TODAY-RETRY_MS-1},TODAY),false);
  assert.equal(eligibleForAutomaticCheck({lastSuccessfulCheckAt:TODAY-WEEK_MS,lastAttemptAt:TODAY-RETRY_MS},TODAY),true);
});
test('failed checks retry in one hour, not after a week',()=>{
  assert.equal(eligibleForAutomaticCheck({lastAttemptAt:TODAY-RETRY_MS+1},TODAY),false);
  assert.equal(eligibleForAutomaticCheck({lastAttemptAt:TODAY-RETRY_MS},TODAY),true);
});
test('first automatic scan checks GitHub, records success and suppresses follow-up scans',async t=>{
  const f=fixture(t);
  await f.manager.check();
  assert.equal(f.count(),1);
  assert.equal(f.manager.getStatus().phase,'current');
  assert.equal(f.updater.autoDownload,true);
  assert.equal(f.updater.autoInstallOnAppQuit,true);
  assert.equal(f.updater.allowPrerelease,false);
  assert.equal(f.updater.allowDowngrade,false);
  assert.equal(JSON.parse(fs.readFileSync(f.file,'utf8')).lastSuccessfulCheckAt,TODAY);
  await f.manager.check();
  assert.equal(f.count(),1,'automatic scan should remain throttled for a week');
  f.setTime(TODAY+WEEK_MS);
  await f.manager.check();
  assert.equal(f.count(),2);
});
test('clicking Update forces a scan regardless of weekly schedule',async t=>{
  const f=fixture(t);
  await f.manager.check();
  await f.manager.check({manual:true});
  assert.equal(f.count(),2);
  assert.ok(f.events.some(x=>x.message==='CHECKING FOR UPDATES (MANUAL)'));
});
test('manual and scheduled simultaneous requests cannot duplicate download',async t=>{
  const f=fixture(t);
  let done;
  f.updater.checkForUpdates=()=>new Promise(resolve=>{done=resolve;});
  const first=f.manager.check({manual:true});
  await Promise.resolve(); await Promise.resolve();
  const second=f.manager.check({manual:true});
  const snapshot=await second;
  assert.equal(snapshot.phase,'checking');
  done();
  await first;
  assert.equal(f.manager.getStatus().phase,'checking');
});
test('download progress and completed download are surfaced; no duplicate update checks',async t=>{
  const f=fixture(t);
  f.updater.emit('update-available',{version:'0.6.0'});
  f.updater.emit('download-progress',{percent:48.5});
  assert.equal(f.manager.getStatus().phase,'downloading');
  assert.equal(f.manager.getStatus().percent,48);
  f.updater.emit('update-downloaded',{version:'0.6.0'});
  assert.equal(f.manager.getStatus().phase,'ready');
  await f.manager.check({manual:true});
  assert.equal(f.count(),0,'ready-to-install download should not be fetched again');
});
test('error does not mark successful check and allows retry after an hour',async t=>{
  const f=fixture(t);
  f.updater.checkForUpdates=async()=>{throw new Error('offline');};
  await f.manager.check();
  assert.equal(f.manager.getStatus().phase,'error');
  assert.equal(f.manager.getLastCheck().lastSuccessfulCheckAt,undefined);
  f.setTime(TODAY+RETRY_MS);
  await f.manager.check();
  assert.equal(f.manager.getStatus().phase,'error');
});
test('portable and development sessions never run an update installer',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ttc-update-disabled-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const updater=new EventEmitter();
  let called=0;
  updater.checkForUpdates=()=>{called++;};
  const m=createUpdateManager({
    enabled:false,updater,stateFile:path.join(dir,'update-state.json'),
    notify:()=>{},now:()=>TODAY
  });
  const result=await m.check({manual:true});
  assert.equal(result.phase,'unavailable');
  assert.equal(called,0);
});
