import {MAX_CLOCKS,boundedDuration,cleanSequence,exportClocks,restoreClocks,safeName} from './clocks.js';

export const BACKUP_VERSION=1;
export const MAX_PRESETS=100;
export const MAX_COLLECTIONS=30;
function safeId(id) {
  return typeof id==='string'&&/^[a-z0-9_-]{1,40}$/i.test(id)?id:null;
}
export function cleanPreset(value,index=0) {
  if(!value||typeof value!=='object')return null;
  const name=safeName(value.name,42);
  if(!name)return null;
  return {
    id:safeId(value.id)||'preset-'+(index+1),
    name,
    durationSeconds:Math.max(1,boundedDuration(value.durationSeconds)),
    color:/^#[A-F0-9]{6}$/i.test(value.color||'')?value.color.toUpperCase():'#F20B14',
    icon:['none','reading','work','break','cleanup','study','exercise'].includes(value.icon)?value.icon:'none'
  };
}
export function cleanCollection(value,index=0) {
  if(!value||typeof value!=='object')return null;
  const name=safeName(value.name,42);
  if(!name)return null;
  return {
    id:safeId(value.id)||'collection-'+(index+1),name,
    type:value.type==='layout'?'layout':'sequence',
    steps:cleanSequence(value.steps),
    clocks:value.type==='layout'&&Array.isArray(value.clocks)
      ?exportClocks(restoreClocks(value.clocks.slice(0,MAX_CLOCKS))):[]
  };
}
export function restoreLibrary(value) {
  const raw=value&&typeof value==='object'?value:{};
  const presets=(Array.isArray(raw.presets)?raw.presets:[]).slice(0,MAX_PRESETS)
    .map((p,i)=>cleanPreset(p,i)).filter(Boolean);
  const collections=(Array.isArray(raw.collections)?raw.collections:[]).slice(0,MAX_COLLECTIONS)
    .map((p,i)=>cleanCollection(p,i)).filter(Boolean);
  const uniq=(arr)=> {
    const used=new Set();
    return arr.map((v,i)=>{
      let id=v.id;
      while(used.has(id)) id=v.id+'-'+i;
      used.add(id);
      return {...v,id};
    });
  };
  return {presets:uniq(presets),collections:uniq(collections)};
}
export function createBackup(clocks,library,settings={}) {
  return {
    kind:'clock-counter-setup',
    version:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    clocks:exportClocks(clocks),
    library:restoreLibrary(library),
    preferences:{
      clockOnly:settings.clockOnly===true,
      locked:settings.locked===true,
      trayEnabled:settings.trayEnabled===true
    }
  };
}
export function importBackup(value) {
  if(!value||typeof value!=='object'||value.kind!=='clock-counter-setup') {
    throw new Error('Not a CLOCK COUNTER setup file.');
  }
  if(value.version!==BACKUP_VERSION)throw new Error('Unsupported setup version.');
  if(!Array.isArray(value.clocks)||value.clocks.length===0)
    throw new Error('A setup must contain at least one clock.');
  return {
    clocks:restoreClocks(value.clocks),
    library:restoreLibrary(value.library),
    preferences:{
      clockOnly:value.preferences?.clockOnly===true,
      locked:value.preferences?.locked===true,
      trayEnabled:value.preferences?.trayEnabled===true
    }
  };
}
