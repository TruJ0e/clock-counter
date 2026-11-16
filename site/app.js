

(function(){
  'use strict';
  const prefix='clock-counter:web-sound:';
  const makeId=()=> 'web-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
  function pick(accept) {
    return new Promise(resolve=>{
      const input=document.createElement('input');
      input.type='file';
      input.accept=accept;
      input.style.display='none';
      document.body.append(input);
      let done=false;
      const finish=value=>{if(done)return;done=true;input.remove();resolve(value);};
      input.onchange=()=>finish(input.files?.[0]||null);
      window.addEventListener('focus',()=>{
        setTimeout(()=>{if(!input.files?.length)finish(null);},350);
      },{once:true});
      input.click();
    });
  }
  function readAsDataURL(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error('Could not read selected file'));
      reader.readAsDataURL(file);
    });
  }
  window.clockCounterWindow={
    action(name){
      if(name==='toggle-fullscreen'){
        if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
        else document.documentElement.requestFullscreen?.().catch(()=>{});
      }
      // Window controls, native tray and detach are intentionally unavailable.
    },
    onAlwaysOnTop(){return ()=>{}},
    onNativeState(){return ()=>{}},
    onTrayAction(){return ()=>{}},
    onRemoteControl(){return ()=>{}},
    onRequestSnapshot(){return ()=>{}},
    onDetachedState(){return ()=>{}},
    publishSnapshot(){},
    closeDetached(){},
    async importSound(){
      const file=await pick('.mp3,.wav,.ogg,audio/*');
      if(!file)return null;
      if(file.size>1200000)throw new Error('Browser edition supports audio files up to 1.2 MB');
      const id=makeId();
      const data=await readAsDataURL(file);
      try{
        localStorage.setItem(prefix+id,JSON.stringify({data,name:file.name.slice(0,100),
          ext:file.name.toLowerCase().split('.').pop()}));
      }catch{
        throw new Error('Browser storage is full. Choose a smaller sound.');
      }
      return {id,name:file.name.slice(0,100)};
    },
    async readSound(id){
      try{
        const data=localStorage.getItem(prefix+id);
        return data?JSON.parse(data):null;
      }catch{return null;}
    },
    async installSounds(assets){
      const map={};
      for(const asset of Array.isArray(assets)?assets.slice(0,12):[]){
        if(typeof asset.data!=='string'||asset.data.length>1800000)continue;
        const id=makeId(),ext=asset.ext||'.wav';
        const mime=ext==='.mp3'?'audio/mpeg':ext==='.ogg'?'audio/ogg':'audio/wav';
        try{
          localStorage.setItem(prefix+id,JSON.stringify({
            data:'data:'+mime+';base64,'+asset.data,
            name:String(asset.name||'Imported audio').slice(0,100),
            ext:ext.replace('.','')
          }));
          map[asset.id]=id;
        }catch { /* storage can be smaller on local file origins */ }
      }
      return map;
    },
    async exportSetup(setup){
      const safe=structuredClone(setup);
      safe.soundAssets=[];
      for(const clock of safe.clocks||[]){
        const id=clock.customSoundId;
        if(!id)continue;
        try{
          const sound=JSON.parse(localStorage.getItem(prefix+id)||'null');
          const match=sound?.data?.match(/^data:(audio\/[^;]+);base64,(.+)$/);
          if(match){
            const ext=match[1]==='audio/mpeg'?'.mp3':match[1]==='audio/ogg'?'.ogg':'.wav';
            safe.soundAssets.push({id,ext,name:sound.name||'Audio',data:match[2]});
          }
        }catch{}
      }
      const blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='clock-counter-setup.json';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),15000);
      return true;
    },
    async importSetup(){
      const file=await pick('.json,application/json');
      if(!file)return null;
      if(file.size>8000000)throw new Error('Setup too large for browser edition');
      return JSON.parse(await file.text());
    }
  };
})();


/* src/timer-core.js */
// Pure timer helpers, kept independent from Electron and the UI for testing.
const MAX_HOURS = 99;
const MAX_MINUTES = 59;
const MAX_SECONDS = 59;

function wholeInRange(value, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

function clampParts(parts = {}) {
  return {
    hours: wholeInRange(parts.hours, MAX_HOURS),
    minutes: wholeInRange(parts.minutes, MAX_MINUTES),
    seconds: wholeInRange(parts.seconds, MAX_SECONDS)
  };
}

function durationFromParts(parts) {
  const clean = clampParts(parts);
  return clean.hours * 3600 + clean.minutes * 60 + clean.seconds;
}

function partsFromDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60
  };
}

function formattedRemaining(milliseconds) {
  const wholeSeconds = Math.ceil(Math.max(0, Number(milliseconds) || 0) / 1000);
  const parts = partsFromDuration(wholeSeconds);
  const pad = (value) => String(value).padStart(2, '0');
  if (parts.hours > 0) {
    return pad(parts.hours) + ':' + pad(parts.minutes) + ':' + pad(parts.seconds);
  }
  return pad(parts.minutes) + ':' + pad(parts.seconds);
}

function elapsedPercentage(remainingMs, totalMs) {
  const duration = Number(totalMs);
  if (!Number.isFinite(duration) || duration <= 0) return 100;
  const remaining = Math.max(0, Math.min(duration, Number(remainingMs) || 0));
  return (1 - remaining / duration) * 100;
}

function remainingAtDeadline(deadlineMs, nowMs) {
  return Math.max(0, Number(deadlineMs) - Number(nowMs));
}


/* src/clocks.js */
// Pure, immutable time model. All time values are milliseconds unless named "Seconds".
const MAX_CLOCKS = 12;
const DEFAULT_COLOR = '#F20B14';
const COLOR_PALETTE = Object.freeze([
  '#F20B14','#FF7A00','#FFD23F','#24C45E','#00B9B0',
  '#2486F2','#9B5DE5','#F15BB5','#F8F8F8'
]);
const DIRECTIONS = Object.freeze(['cw','ccw']);
const ALARMS = Object.freeze(['chime','beep','bell','digital','custom','off']);
const MODES = Object.freeze(['countdown','stopwatch','sequence','workbreak']);
const TASK_ICONS = Object.freeze(['none','reading','work','break','cleanup','study','exercise']);
const MAX_STEPS = 48;

function validColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
function boundedDuration(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(359999, Math.trunc(n))) : 1800;
}
function boundedVolume(n) {
  if (n === undefined || n === null) return 70;
  const value = Number(n);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.trunc(value))) : 70;
}
function boundedPercentage(n, fallback) {
  return Number.isFinite(Number(n)) ? Math.max(0, Math.min(99, Math.round(Number(n)))) : fallback;
}
function safeName(name, max=36) {
  return typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max) : '';
}
function cleanSequence(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0,MAX_STEPS).map((step,i)=>({
    name:safeName(step?.name,30)||'Step '+(i+1),
    durationSeconds:Math.max(1,boundedDuration(step?.durationSeconds)),
    color:validColor(step?.color)?step.color.toUpperCase():DEFAULT_COLOR,
    taskIcon:TASK_ICONS.includes(step?.taskIcon)?step.taskIcon:'none'
  }));
}
function buildWorkBreakSequence(work=1500,rest=300,longRest=900,rounds=4) {
  const n=Math.max(1,Math.min(12,Math.trunc(Number(rounds)||4)));
  const result=[];
  for(let i=0;i<n;i++) {
    result.push({name:'Work '+(i+1),durationSeconds:Math.max(1,boundedDuration(work)),color:'#F20B14',taskIcon:'work'});
    result.push({name:i===n-1?'Long break':'Break '+(i+1),
      durationSeconds:Math.max(1,boundedDuration(i===n-1?longRest:rest)),
      color:'#24C45E',taskIcon:'break'});
  }
  return result;
}
function cleanCheckpoints(values) {
  if(!Array.isArray(values)) return [50,25,10];
  return [...new Set(values.map(x=>boundedPercentage(x,0)).filter(x=>x>0&&x<100))].sort((a,b)=>b-a).slice(0,8);
}
const idOK=id=>typeof id==='string'&&/^[a-z0-9_-]{1,40}$/i.test(id);

function newClock(options={},id=1) {
  const durationSeconds=boundedDuration(options.durationSeconds);
  const sequence=cleanSequence(options.sequence);
  const mode=MODES.includes(options.mode)?options.mode:'countdown';
  const stages=mode==='workbreak'&&sequence.length===0?buildWorkBreakSequence():sequence;
  const first=(mode==='sequence'||mode==='workbreak')&&stages.length ? stages[0].durationSeconds:durationSeconds;
  return {
    id:idOK(options.id)?options.id:String(id),
    name:safeName(options.name)||'Clock '+id,
    durationSeconds:first,
    remainingMs:first*1000,
    elapsedMs:0,
    overtimeMs:0,
    overtimeActive:false,
    startedAtMs:null,
    running:false,
    deadlineMs:null,
    ended:false,
    direction:DIRECTIONS.includes(options.direction)?options.direction:'cw',
    color:validColor(options.color)?options.color.toUpperCase():DEFAULT_COLOR,
    alarm:ALARMS.includes(options.alarm)?options.alarm:'chime',
    customSoundId:idOK(options.customSoundId)?options.customSoundId:null,
    repeat:options.repeat===true,
    showTime:options.showTime!==false,
    showTicks:options.showTicks!==false,
    volume:boundedVolume(options.volume),
    cycles:0,
    mode,
    sequence:stages,
    sequenceIndex:0,
    sequenceRepeat:options.sequenceRepeat===true,
    taskIcon:TASK_ICONS.includes(options.taskIcon)?options.taskIcon:'none',
    progressMarkers:options.progressMarkers===true,
    hideNumbersOnPlay:options.hideNumbersOnPlay===true,
    warningEnabled:options.warningEnabled===true,
    warningPercent:boundedPercentage(options.warningPercent,25),
    warningColor:validColor(options.warningColor)?options.warningColor.toUpperCase():'#FFD23F',
    criticalPercent:boundedPercentage(options.criticalPercent,10),
    criticalColor:validColor(options.criticalColor)?options.criticalColor.toUpperCase():'#F20B14',
    checkpointEnabled:options.checkpointEnabled===true,
    checkpointPercents:cleanCheckpoints(options.checkpointPercents),
    notifiedCheckpoints:[],
    persistentAlarm:options.persistentAlarm===true,
    alarmActive:false,
    overtimeEnabled:options.overtimeEnabled===true
  };
}

function exportClocks(clocks) {
  return clocks.slice(0,MAX_CLOCKS).map(c=>({
    id:String(c.id), name:c.name,durationSeconds:c.durationSeconds,
    direction:c.direction,color:c.color,alarm:c.alarm,
    customSoundId:c.customSoundId,repeat:c.repeat,showTime:c.showTime,
    showTicks:c.showTicks,volume:c.volume,mode:c.mode,
    sequence:c.sequence,sequenceRepeat:c.sequenceRepeat,taskIcon:c.taskIcon,
    progressMarkers:c.progressMarkers,hideNumbersOnPlay:c.hideNumbersOnPlay,
    warningEnabled:c.warningEnabled,warningPercent:c.warningPercent,
    warningColor:c.warningColor,criticalPercent:c.criticalPercent,
    criticalColor:c.criticalColor,checkpointEnabled:c.checkpointEnabled,
    checkpointPercents:c.checkpointPercents,persistentAlarm:c.persistentAlarm,
    overtimeEnabled:c.overtimeEnabled
  }));
}

function restoreClocks(raw) {
  if(!Array.isArray(raw)||!raw.length)return [newClock()];
  const seen=new Set();
  return raw.slice(0,MAX_CLOCKS).map((entry,i)=>{
    const c=newClock(entry,i+1);
    if(!idOK(c.id)||seen.has(c.id))c.id='clock-'+(i+1);
    while(seen.has(c.id))c.id+='-x';
    seen.add(c.id);
    // Importing never silently resumes active timers.
    return c;
  });
}

function setDuration(clock,seconds) {
  const d=boundedDuration(seconds);
  return {...resetClock(clock),mode:'countdown',sequence:[],
    durationSeconds:d,remainingMs:d*1000};
}
function setDurationParts(clock,parts) {
  return setDuration(clock,durationFromParts(parts));
}
function setMode(clock,mode,options={}) {
  if(!MODES.includes(mode))return clock;
  const sequence=mode==='workbreak'
    ? cleanSequence(options.sequence?.length?options.sequence:buildWorkBreakSequence(
        options.workSeconds,options.breakSeconds,options.longBreakSeconds,options.rounds))
    : mode==='sequence'?cleanSequence(options.sequence):[];
  const next={...clock,mode,sequence,sequenceRepeat:options.sequenceRepeat===true};
  return resetClock(next);
}
function setOptions(clock,options) {
  const result={
    ...clock,
    ...(options.name!==undefined?{name:safeName(options.name)||clock.name}:{}),
    ...(DIRECTIONS.includes(options.direction)?{direction:options.direction}:{}),
    ...(ALARMS.includes(options.alarm)?{alarm:options.alarm}:{}),
    ...(validColor(options.color)?{color:options.color.toUpperCase()}:{}),
    ...(options.volume!==undefined?{volume:boundedVolume(options.volume)}:{})
  };
  for(const f of ['repeat','showTime','showTicks','sequenceRepeat','progressMarkers',
    'hideNumbersOnPlay','warningEnabled','checkpointEnabled','persistentAlarm','overtimeEnabled']) {
    if(typeof options[f]==='boolean')result[f]=options[f];
  }
  for(const f of ['warningPercent','criticalPercent']) {
    if(options[f]!==undefined)result[f]=boundedPercentage(options[f],clock[f]);
  }
  for(const f of ['warningColor','criticalColor']) {
    if(options[f]!==undefined&&validColor(options[f]))result[f]=options[f].toUpperCase();
  }
  if(options.taskIcon!==undefined&&TASK_ICONS.includes(options.taskIcon))result.taskIcon=options.taskIcon;
  if(options.checkpointPercents!==undefined)result.checkpointPercents=cleanCheckpoints(options.checkpointPercents);
  if(options.customSoundId!==undefined)result.customSoundId=idOK(options.customSoundId)?options.customSoundId:null;
  return result;
}

function startClock(clock,nowMs) {
  if(clock.running)return clock;
  if(clock.mode==='stopwatch'){
    return {...clock,running:true,ended:false,alarmActive:false,startedAtMs:nowMs-clock.elapsedMs};
  }
  if(clock.overtimeActive){
    return {...clock,running:true,startedAtMs:nowMs-clock.overtimeMs};
  }
  if(clock.durationSeconds<=0)return clock;
  const remaining=clock.remainingMs>0?clock.remainingMs:clock.durationSeconds*1000;
  return {...clock,running:true,ended:false,alarmActive:false,
    remainingMs:remaining,deadlineMs:nowMs+remaining};
}

function crossedCheckpoints(clock,previousRemaining,newRemaining) {
  if(!clock.checkpointEnabled||clock.durationSeconds<=0)return [];
  const total=clock.durationSeconds*1000;
  const crossed=[];
  for(const point of clock.checkpointPercents) {
    const target=total*point/100;
    if(previousRemaining>target&&newRemaining<=target&&!clock.notifiedCheckpoints.includes(point)) {
      crossed.push(point);
    }
  }
  return crossed;
}

function tickSequence(clock,nowMs) {
  const sequence=clock.sequence;
  if(!sequence.length)return {...tickCountdown(clock,nowMs)};
  let remaining=clock.deadlineMs-nowMs;
  if(remaining>0) {
    const checkpoints=crossedCheckpoints(clock,clock.remainingMs,remaining);
    return {clock:{...clock,remainingMs:remaining,
      notifiedCheckpoints:[...clock.notifiedCheckpoints,...checkpoints]},completed:0,checkpoints,transitioned:false};
  }
  let index=clock.sequenceIndex,deadline=clock.deadlineMs,completed=0;
  let cycles=clock.cycles;
  const loop=clock.sequenceRepeat;
  // Skip whole completed loops without iterating per second after system sleep.
  if(loop) {
    const sequenceMs=sequence.reduce((sum,step)=>sum+step.durationSeconds*1000,0);
    if(sequenceMs>0 && nowMs-deadline>=sequenceMs) {
      const whole=Math.floor((nowMs-deadline)/sequenceMs);
      completed+=whole*sequence.length;
      deadline+=whole*sequenceMs;
      cycles+=whole;
    }
  }
  // Maximum of 48 steps plus a small safety margin.
  for(let n=0;n<MAX_STEPS+2;n++) {
    completed++;
    index++;
    if(index>=sequence.length) {
      cycles++;
      if(!loop) {
        return {clock:{...clock,sequenceIndex:sequence.length-1,remainingMs:0,
          deadlineMs:null,running:false,ended:true,cycles,alarmActive:clock.persistentAlarm,
          notifiedCheckpoints:[]},completed,checkpoints:[],transitioned:true};
      }
      index=0;
    }
    deadline+=sequence[index].durationSeconds*1000;
    if(deadline>nowMs) {
      return {clock:{...clock,sequenceIndex:index,durationSeconds:sequence[index].durationSeconds,
        remainingMs:deadline-nowMs,deadlineMs:deadline,cycles,
        notifiedCheckpoints:[],ended:false},completed,checkpoints:[],transitioned:true};
    }
  }
  return {clock,completed:0,checkpoints:[],transitioned:false};
}
function tickCountdown(clock,nowMs) {
  if(clock.overtimeActive){
    return {clock:{...clock,overtimeMs:Math.max(0,nowMs-clock.startedAtMs)},completed:0,checkpoints:[],transitioned:false};
  }
  const left=clock.deadlineMs-nowMs;
  if(left>0) {
    const checkpoints=crossedCheckpoints(clock,clock.remainingMs,left);
    return {clock:{...clock,remainingMs:left,notifiedCheckpoints:[...clock.notifiedCheckpoints,...checkpoints]},
      completed:0,checkpoints,transitioned:false};
  }
  const durationMs=clock.durationSeconds*1000;
  if(clock.repeat&&durationMs>0){
    const completed=Math.max(1,Math.floor((nowMs-clock.deadlineMs)/durationMs)+1);
    const deadline=clock.deadlineMs+completed*durationMs;
    return {clock:{...clock,remainingMs:Math.max(0,deadline-nowMs),deadlineMs:deadline,
      cycles:clock.cycles+completed,notifiedCheckpoints:[],ended:false},completed,
      checkpoints:[],transitioned:true};
  }
  if(clock.overtimeEnabled) {
    const overtimeMs=Math.max(0,nowMs-clock.deadlineMs);
    return {clock:{...clock,remainingMs:0,overtimeMs,overtimeActive:true,
      startedAtMs:clock.deadlineMs,cycles:clock.cycles+1,
      notifiedCheckpoints:[],alarmActive:clock.persistentAlarm,ended:false},
      completed:1,checkpoints:[],transitioned:true};
  }
  return {clock:{...clock,remainingMs:0,running:false,deadlineMs:null,
    ended:true,cycles:clock.cycles+1,notifiedCheckpoints:[],
    alarmActive:clock.persistentAlarm},completed:1,checkpoints:[],transitioned:true};
}
function tickClock(clock,nowMs) {
  if(!clock.running)return {clock,completed:0,checkpoints:[],transitioned:false};
  if(clock.mode==='stopwatch'){
    const elapsed=Math.max(0,nowMs-clock.startedAtMs);
    return {clock:{...clock,elapsedMs:elapsed},completed:0,checkpoints:[],transitioned:false};
  }
  if(clock.mode==='sequence'||clock.mode==='workbreak')return tickSequence(clock,nowMs);
  return tickCountdown(clock,nowMs);
}
function pauseClock(clock,nowMs) {
  const res=tickClock(clock,nowMs);
  return {...res,clock:{...res.clock,running:false,deadlineMs:null,startedAtMs:null}};
}
function resetClock(clock) {
  const first=clock.mode==='sequence'||clock.mode==='workbreak'
    ?clock.sequence[0]?.durationSeconds??clock.durationSeconds:clock.durationSeconds;
  return {...clock,durationSeconds:first,remainingMs:first*1000,
    elapsedMs:0,overtimeMs:0,overtimeActive:false,startedAtMs:null,
    running:false,deadlineMs:null,ended:false,cycles:0,
    sequenceIndex:0,notifiedCheckpoints:[],alarmActive:false};
}
function acknowledgeAlarm(clock) {return {...clock,alarmActive:false};}
function proportionRemaining(clock) {
  if(clock.mode==='stopwatch') {
    return clock.durationSeconds===0?0:Math.min(100,100*clock.elapsedMs/(clock.durationSeconds*1000));
  }
  if(clock.overtimeActive)return 0;
  return Math.max(0,100-elapsedPercentage(clock.remainingMs,clock.durationSeconds*1000));
}
function effectiveColor(clock) {
  const sequenceMode=clock.mode==='sequence'||clock.mode==='workbreak';
  const base=sequenceMode?clock.sequence[clock.sequenceIndex]?.color||clock.color:clock.color;
  if(!clock.warningEnabled||clock.mode==='stopwatch'||clock.overtimeActive)return base;
  const p=proportionRemaining(clock);
  if(p<=clock.criticalPercent)return clock.criticalColor;
  if(p<=clock.warningPercent)return clock.warningColor;
  return base;
}


/* src/library.js */
const BACKUP_VERSION=1;
const MAX_PRESETS=100;
const MAX_COLLECTIONS=30;
function safeId(id) {
  return typeof id==='string'&&/^[a-z0-9_-]{1,40}$/i.test(id)?id:null;
}
function cleanPreset(value,index=0) {
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
function cleanCollection(value,index=0) {
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
function restoreLibrary(value) {
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
function createBackup(clocks,library,settings={}) {
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
function importBackup(value) {
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


/* src/alarms.js */
// Synthetic, offline alarm sounds. No audio files, subscriptions, or permissions required.
// Profiles are also exposed for deterministic unit testing.
function alarmNotes(name) {
  switch (name) {
    case 'beep':
      return [{ at: 0, frequency: 880, duration: 0.32, wave: 'sine' }];
    case 'bell':
      return [
        { at: 0, frequency: 1046.5, duration: 0.78, wave: 'triangle' },
        { at: 0.03, frequency: 1568, duration: 0.64, wave: 'sine' }
      ];
    case 'digital':
      return [
        { at: 0, frequency: 740, duration: 0.10, wave: 'square' },
        { at: 0.16, frequency: 740, duration: 0.10, wave: 'square' },
        { at: 0.32, frequency: 988, duration: 0.21, wave: 'square' }
      ];
    case 'chime':
      return [
        { at: 0, frequency: 660, duration: 0.31, wave: 'sine' },
        { at: 0.30, frequency: 880, duration: 0.31, wave: 'sine' },
        { at: 0.61, frequency: 1108.73, duration: 0.48, wave: 'sine' }
      ];
    case 'off':
    default:
      return [];
  }
}

let context;
function getContext() {
  if (context) return context;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  try { context = new AudioCtor(); } catch { return null; }
  return context;
}

function primeAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function playAlarm(name, volume = 70) {
  const notes = alarmNotes(name);
  if (!notes.length) return false;
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const level = Math.max(0, Math.min(100, Number(volume) || 0)) / 100;
  if (level <= 0) return false;
  const peak = Math.min(0.17, 0.18 * level / Math.sqrt(notes.length));
  for (const note of notes) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + note.at + 0.02;
      osc.type = note.wave;
      osc.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + note.duration + 0.02);
    } catch {
      // Sound errors must never interfere with countdown accuracy.
    }
  }
  return true;
}


/* src/renderer.js */
const $ = id => document.getElementById(id);
const board = $('clock-board');
const tileTemplate = $('clock-template');
const settings = $('settings-dialog');
const desktop = window.clockCounterWindow;
const storageKey = 'clock-counter:clocks:v3';
const libraryStorageKey = 'clock-counter:library:v1';
function loadLibrary() {
  try { return restoreLibrary(JSON.parse(localStorage.getItem(libraryStorageKey) || 'null')); }
  catch { return restoreLibrary(null); }
}
function saveLibrary() {
  localStorage.setItem(libraryStorageKey, JSON.stringify(state.library));
}
function uid(prefix) {
  return prefix+'-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*65535).toString(36);
}
const taskVisuals = {
  none:['',''], reading:['BOOK','M6 4h10v16H6zm12 0h10v16H18z'],
  work:['WORK','M6 5h20v17H6zM11 3v3m10-3v3M6 13h20'],
  break:['REST','M7 9h17v5a8 8 0 0 1-17 0zM24 10h3a3 3 0 0 1 0 6h-3'],
  cleanup:['CLEAN','M13 3h6l-1 9H9L8 8h8M10 12h8l4 17H6z'],
  study:['STUDY','M5 7l11-4 11 4-11 5zM9 11v9l7 4 7-4v-9'],
  exercise:['MOVE','M16 5a3 3 0 1 1 0 6a3 3 0 0 1 0-6M10 29l4-10 6-4m-7 1-6 5m12-3 6 10']
};
function taskPictogram(key) {
  const [label,path] = taskVisuals[key] || taskVisuals.none;
  if (!path) return '';
  return '<svg viewBox="0 0 32 32" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg><span>'+label+'</span>';
}
const tileRefs = new Map();
let tickingHandle = null;

// Idle clocks do not need a running interval. This also keeps countdown
// timing independent from window animations and tests that mock the clock.
function syncTicker() {
  const needed = state.clocks.some(clock => clock.running || clock.alarmActive);
  if (needed && tickingHandle === null) tickingHandle = setInterval(() => advanceAll(), 50);
  if (!needed && tickingHandle !== null) {
    clearInterval(tickingHandle);
    tickingHandle = null;
  }
}

function loadSavedClocks() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(stored)) return restoreClocks(stored);
  } catch { /* corrupt preferences must not block startup */ }
  const legacyDuration = Number.parseInt(localStorage.getItem('clock-counter:duration') || '1800', 10);
  const legacySoundOff = localStorage.getItem('clock-counter:sound') === 'off';
  return [newClock({
    durationSeconds: Number.isFinite(legacyDuration) ? legacyDuration : 1800,
    alarm: legacySoundOff ? 'off' : 'chime'
  }, 1)];
}

const state = {
  clocks: loadSavedClocks(),
  activeId: '',
  settingsClockId: null,
  sequence: 0,
  library: loadLibrary(),
  locked: false,
  trayEnabled: false,
  detached: new Set(),
  customSoundCache: new Map(),
  alarmLastPlayed: new Map(),
  drafts: []
};
state.activeId = state.clocks[0].id;
let clockOnly = false;

function updateFocusTarget() {
  for (const [id, refs] of tileRefs) {
    refs.root.classList.toggle('focus-clock', id === state.activeId);
  }
}

function setClockOnly(enabled) {
  clockOnly = Boolean(enabled);
  if (clockOnly) closeFileMenu();
  $('app-shell').classList.toggle('clock-only', clockOnly);
  $('focus-restore').hidden = !clockOnly;
  $('clock-only').setAttribute('aria-pressed', String(clockOnly));
  updateFocusTarget();
  try { localStorage.setItem('clock-counter:clock-only', clockOnly ? 'true' : 'false'); } catch { /* optional preference */ }
  action('set-focus-mode', { enabled: clockOnly });
}

function nextId() {
  let id;
  do { id = 'clock-' + Date.now().toString(36) + '-' + (++state.sequence).toString(36); }
  while (state.clocks.some(clock => clock.id === id));
  return id;
}

function getClock(id) {
  return state.clocks.find(clock => clock.id === id);
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(exportClocks(state.clocks))); }
  catch { updateStatus('Unable to save settings (storage unavailable)'); }
}

function updateStatus(message) {
  $('global-status').textContent = message;
}

function action(name, payload) {
  desktop?.action?.(name, payload);
}

function selectClock(id) {
  if (!getClock(id)) return;
  state.activeId = id;
  for (const [clockId, refs] of tileRefs) refs.root.classList.toggle('selected', clockId === id);
  updateFocusTarget();
}

// Each timer has its own bottom control drawer, independent of its countdown.
function setDrawerCollapsed(id, collapsed) {
  const refs = tileRefs.get(id);
  if (!refs) return;
  const next = Boolean(collapsed);
  refs.drawer.classList.toggle('collapsed', next);
  refs.drawer.dataset.collapsed = String(next);
  refs.drawerToggle.setAttribute('aria-expanded', String(!next));
  refs.drawerToggle.setAttribute('aria-label', next ? 'Show timer controls' : 'Hide timer controls');
  refs.drawerToggle.title = next ? 'Slide timer controls up' : 'Slide timer controls down';
  refs.drawerArrow.textContent = next ? '▲' : '▼';

  // Hidden controls must not remain keyboard focus targets or receive clicks.
  refs.controls.inert = next;
  if (next && refs.controls.contains(document.activeElement)) {
    refs.root.focus({ preventScroll: true });
  }
}

function rejectLocked() {
  if (!state.locked) return false;
  updateStatus('CONTROLS LOCKED — UNLOCK IN FILE MENU');
  return true;
}
function publishDetached(clock, immediate=false) {
  if (!state.detached.has(clock.id)) return;
  const now=Date.now();
  const refs=tileRefs.get(clock.id);
  if (!immediate && now-(refs?.lastSnapshot||0)<130) return;
  if (refs) refs.lastSnapshot=now;
  desktop?.publishSnapshot?.({...clock});
}

function changeClock(id, update, persist = false) {
  const index = state.clocks.findIndex(clock => clock.id === id);
  if (index < 0) return null;
  const next = update(state.clocks[index]);
  state.clocks[index] = next;
  renderClock(next);
  publishDetached(next);
  syncTicker();
  if (persist) save();
  return next;
}

function paintMarkers(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 12; i += 1) {
    const cardinal = i % 3 === 0;
    for (const [color, width] of [['#050505', cardinal ? 13 : 9], ['#f7f7f4', cardinal ? 8 : 5]]) {
      const mark = document.createElementNS(ns, 'line');
      mark.setAttribute('x1', '200');
      mark.setAttribute('y1', cardinal ? '3' : '9');
      mark.setAttribute('x2', '200');
      mark.setAttribute('y2', cardinal ? '34' : '25');
      mark.setAttribute('stroke', color);
      mark.setAttribute('stroke-width', String(width));
      mark.setAttribute('stroke-linecap', 'square');
      mark.setAttribute('transform', 'rotate(' + i * 30 + ' 200 200)');
      svg.append(mark);
    }
  }
}

function paintProgressMarkers(svg,clock) {
  svg.replaceChildren();
  if (!clock.progressMarkers || clock.mode==='stopwatch') return;
  const ns='http://www.w3.org/2000/svg';
  for(const percent of [75,50,25]) {
    const degrees=360*(100-percent)/100-90;
    const angle=degrees*Math.PI/180;
    const x=200+Math.cos(angle)*164;
    const y=200+Math.sin(angle)*164;
    const x2=200+Math.cos(angle)*182;
    const y2=200+Math.sin(angle)*182;
    const line=document.createElementNS(ns,'line');
    line.setAttribute('x1',String(x));line.setAttribute('y1',String(y));
    line.setAttribute('x2',String(x2));line.setAttribute('y2',String(y2));
    line.setAttribute('stroke','#16e600');line.setAttribute('stroke-width','6');
    line.setAttribute('stroke-linecap','square');
    const title=document.createElementNS(ns,'title');
    title.textContent=percent+'% remaining ('+formattedRemaining(clock.durationSeconds*1000*percent/100)+')';
    line.append(title);
    svg.append(line);
  }
}
function formatElapsed(ms) {
  return formattedRemaining(Math.floor(Math.max(0,ms)/1000)*1000);
}
function displayLabel(clock) {
  if(clock.mode==='stopwatch')return formatElapsed(clock.elapsedMs);
  if(clock.overtimeActive)return '+'+formatElapsed(clock.overtimeMs);
  return formattedRemaining(clock.remainingMs);
}
function nameOfStep(clock) {
  return clock.sequence?.[clock.sequenceIndex]?.name||'Activity';
}

function syncFields(clock) {
  const refs = tileRefs.get(clock.id);
  if (!refs) return;
  const parts = partsFromDuration(clock.durationSeconds);
  for (const name of ['hours', 'minutes', 'seconds']) refs.fields[name].value = String(parts[name]);
}

function renderClock(clock) {
  const refs = tileRefs.get(clock.id);
  if (!refs) return;
  const ratio=proportionRemaining(clock);
  const remaining=ratio.toFixed(5);
  const spent=(100-ratio).toFixed(5);
  const color=effectiveColor(clock);
  const base=clock.direction==='cw'
    ? 'conic-gradient(from 0deg, #050505 0% '+spent+'%, '+color+' '+spent+'% 100%)'
    : 'conic-gradient(from 0deg, '+color+' 0% '+remaining+'%, #050505 '+remaining+'% 100%)';
  refs.dial.style.setProperty('--remaining',remaining+'%');
  refs.dial.style.setProperty('--elapsed',spent+'%');
  refs.dial.style.setProperty('--fill',color);
  refs.dial.style.background=clock.mode==='stopwatch'
    ? (clock.direction==='cw'
      ? 'conic-gradient(from 0deg, '+color+' 0% '+remaining+'%, #050505 '+remaining+'% 100%)'
      : 'conic-gradient(from 0deg, #050505 0% '+spent+'%, '+color+' '+spent+'% 100%)')
    : base;
  refs.dial.dataset.direction=clock.direction;
  refs.dial.dataset.color=color;
  refs.dial.dataset.mode=clock.mode;
  refs.dial.classList.toggle('ended',clock.ended);
  refs.dial.setAttribute('aria-label',clock.name+': '+Math.round(ratio)+' percent '+(clock.mode==='stopwatch'?'elapsed':'remaining'));
  const label=displayLabel(clock);
  refs.readout.textContent=label;
  refs.readout.setAttribute('aria-label',label+(clock.mode==='stopwatch'?' elapsed':clock.overtimeActive?' overtime':' remaining'));
  refs.readout.classList.toggle('long',label.length>5);
  refs.readout.hidden=!clock.showTime||(clock.hideNumbersOnPlay&&clock.running);
  refs.markings.toggleAttribute('hidden',!clock.showTicks);
  refs.timeUp.hidden=!clock.ended;
  refs.progress.toggleAttribute('hidden',!clock.progressMarkers||clock.mode==='stopwatch');
  if(refs.progress.dataset.duration!==String(clock.durationSeconds)||
      refs.progress.dataset.enabled!==String(clock.progressMarkers)) {
    paintProgressMarkers(refs.progress,clock);
    refs.progress.dataset.duration=String(clock.durationSeconds);
    refs.progress.dataset.enabled=String(clock.progressMarkers);
  }
  const stageMode=clock.mode==='sequence'||clock.mode==='workbreak';
  refs.stepLabel.hidden=!stageMode;
  refs.stepLabel.textContent=stageMode?(clock.sequenceIndex+1)+'/'+clock.sequence.length:'';
  refs.modeText.hidden=!(stageMode||clock.mode==='stopwatch'||clock.overtimeActive);
  refs.modeText.textContent=clock.overtimeActive?'OVERTIME':
    stageMode?nameOfStep(clock).toUpperCase():clock.mode==='stopwatch'?'STOPWATCH':'';
  const icon=stageMode?clock.sequence[clock.sequenceIndex]?.taskIcon||clock.taskIcon:clock.taskIcon;
  refs.taskSymbol.hidden=icon==='none';
  const iconData=taskPictogram(icon);
  if(refs.taskSymbol.dataset.type!==icon){
    refs.taskSymbol.innerHTML=iconData;
    refs.taskSymbol.dataset.type=icon;
  }
  if(document.activeElement!==refs.name)refs.name.value=clock.name;
  refs.play.setAttribute('aria-label',clock.running?'Pause clock':'Start clock');
  refs.play.title=clock.running?'Pause clock (Space)':'Start clock (Space)';
  refs.play.querySelector('.play-icon').hidden=clock.running;
  refs.play.querySelector('.pause-icon').hidden=!clock.running;
  refs.play.disabled=(clock.mode==='countdown'&&clock.durationSeconds===0)||state.locked;
  refs.root.dataset.running=String(clock.running);
  refs.root.dataset.repeat=String(clock.repeat);
  refs.root.dataset.cycles=String(clock.cycles);
  refs.root.dataset.duration=String(clock.durationSeconds);
  refs.root.dataset.mode=clock.mode;
  refs.root.dataset.alarmActive=String(clock.alarmActive);
  refs.cycleCount.hidden=!((clock.repeat||clock.sequenceRepeat)&&clock.cycles>0);
  refs.cycleCount.textContent=clock.cycles+'×';
  refs.ack.hidden=!clock.alarmActive;
  refs.name.readOnly=state.locked;
  refs.root.draggable=false;
}

function setClockDurationFromFields(id) {
  const refs = tileRefs.get(id);
  if (!refs) return;
  const clock = getClock(id);
  if (!clock || rejectLocked()) return;
  const parts = clampParts({
    hours: refs.fields.hours.value,
    minutes: refs.fields.minutes.value,
    seconds: refs.fields.seconds.value
  });
  const updated = changeClock(id, old => setDurationParts(old, parts), true);
  syncFields(updated);
  updateStatus(updated.name.toUpperCase() + ' — TIMER SET');
}

function spinField(id, field, step) {
  if (rejectLocked()) return;
  const refs = tileRefs.get(id);
  if (!refs) return;
  const input = refs.fields[field];
  const max = field === 'hours' ? 99 : 59;
  input.value = String(Math.max(0, Math.min(max, (Number.parseInt(input.value,10) || 0) + step)));
  setClockDurationFromFields(id);
}

function prepareStart() {
  primeAudio();
}
async function soundFor(clock, checkpoint=false) {
  if (checkpoint) {
    playAlarm('beep',Math.min(clock.volume,45));
    return;
  }
  if (clock.alarm!=='custom') {
    playAlarm(clock.alarm,clock.volume);
    return;
  }
  if (!clock.customSoundId || !desktop?.readSound) return;
  try {
    let data=state.customSoundCache.get(clock.customSoundId);
    if (!data) {
      const info=await desktop.readSound(clock.customSoundId);
      data=info?.data;
      if (!data) return;
      state.customSoundCache.set(clock.customSoundId,data);
    }
    const audio=new Audio(data);
    audio.volume=Math.min(1,Math.max(0,clock.volume/100));
    await audio.play();
  } catch(error) {
    updateStatus('Could not play imported alarm');
  }
}
function acknowledgeOne(id) {
  changeClock(id,clock=>acknowledgeAlarm(clock));
  state.alarmLastPlayed.delete(id);
  updateStatus('ALARM ACKNOWLEDGED');
}
function announceCompletion(clock, completed) {
  soundFor(clock).catch(()=>{});
  state.alarmLastPlayed.set(clock.id,Date.now());
  const stage=(clock.mode==='sequence'||clock.mode==='workbreak')&&clock.running;
  const label=stage?'NEXT: '+nameOfStep(clock):clock.repeat?'ROUND '+clock.cycles:clock.overtimeActive?'OVERTIME':'TIME UP';
  updateStatus(clock.name.toUpperCase()+' — '+label);
  action('notify',{title:clock.name,body:label});
}
function advanceAll(now=Date.now()) {
  for(const old of state.clocks) {
    if(old.running){
      const {clock,completed,checkpoints}=tickClock(old,now);
      changeClock(old.id,()=>clock);
      if(completed) {
        announceCompletion(clock,completed);
        if(clock.mode==='sequence'||clock.mode==='workbreak')syncFields(clock);
      }
      if(checkpoints?.length) {
        soundFor(clock,true).catch(()=>{});
        const text=checkpoints.join(', ')+'% remaining';
        updateStatus(clock.name.toUpperCase()+' — '+text);
        action('notify',{title:clock.name,body:text});
      }
    }
    const current=getClock(old.id);
    if(current?.alarmActive) {
      const last=state.alarmLastPlayed.get(old.id)||0;
      if(now-last>=3500){
        soundFor(current).catch(()=>{});
        state.alarmLastPlayed.set(old.id,now);
      }
    }
  }
}

function toggleClock(id) {
  if (rejectLocked()) return;
  const clock = getClock(id);
  if (!clock) return;
  selectClock(id);
  if (clock.running) {
    const { clock: paused, completed } = pauseClock(clock, Date.now());
    changeClock(id, () => paused);
    if (completed) announceCompletion(paused, completed);
    else updateStatus(clock.name.toUpperCase() + ' — PAUSED');
  } else {
    prepareStart();
    const started = changeClock(id, old => startClock(old, Date.now()));
    if (started?.running) setDrawerCollapsed(id, true);
    updateStatus(clock.name.toUpperCase() + ' — RUNNING');
  }
}

function resetOne(id) {
  if (rejectLocked()) return;
  state.alarmLastPlayed.delete(id);
  const clock = changeClock(id, resetClock);
  if (clock) updateStatus(clock.name.toUpperCase() + ' — RESET');
}

function applyPreset(id, seconds) {
  if (rejectLocked()) return;
  const clock = changeClock(id, old => setDuration(old, seconds), true);
  if (clock) {
    syncFields(clock);
    updateStatus(clock.name.toUpperCase() + ' — ' + (seconds/60) + ' MINUTES');
  }
  closeFileMenu();
}

function detachClock(id) {
  if (rejectLocked()) return;
  if(!getClock(id))return;
  if(state.detached.has(id)) {
    action('close-detached',{id});
    state.detached.delete(id);
  } else {
    state.detached.add(id);
    action('detach-clock',{id});
    publishDetached(getClock(id),true);
  }
}
function setupDragDrop(id,refs) {
  const handle=refs.dragHandle;
  handle.addEventListener('dragstart',event=>{
    if(state.locked){event.preventDefault();return;}
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',id);
    refs.root.classList.add('dragging');
  });
  handle.addEventListener('dragend',()=>refs.root.classList.remove('dragging'));
  refs.root.addEventListener('dragover',event=>{
    if(state.locked)return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
  });
  refs.root.addEventListener('drop',event=>{
    if(state.locked)return;
    event.preventDefault();
    const source=event.dataTransfer.getData('text/plain');
    const from=state.clocks.findIndex(c=>c.id===source);
    const target=state.clocks.findIndex(c=>c.id===id);
    if(from<0||target<0||from===target)return;
    const moved=state.clocks.splice(from,1)[0];
    state.clocks.splice(target,0,moved);
    for(const clock of state.clocks) {
      const tile=tileRefs.get(clock.id)?.root;
      if(tile)board.append(tile);
    }
    save();
    updateStatus('CLOCK ORDER UPDATED');
  });
}

function createTile(clock) {
  const tile = tileTemplate.content.firstElementChild.cloneNode(true);
  tile.dataset.clockId = clock.id;
  tile.setAttribute('aria-label', clock.name);
  const refs = {
    root: tile,
    progress: tile.querySelector('.progress-markings'),
    stepLabel: tile.querySelector('.step-label'),
    taskSymbol: tile.querySelector('.task-symbol'),
    modeText: tile.querySelector('.mode-readout'),
    ack: tile.querySelector('.ack-alarm'),
    dragHandle: tile.querySelector('.drag-handle'),
    detachButton: tile.querySelector('.detach-clock'),
    name: tile.querySelector('.clock-name'),
    dial: tile.querySelector('.dial'),
    markings: tile.querySelector('.dial-markings'),
    readout: tile.querySelector('.time-readout'),
    timeUp: tile.querySelector('.time-up'),
    cycleCount: tile.querySelector('.cycle-count'),
    drawer: tile.querySelector('.controls-drawer'),
    drawerToggle: tile.querySelector('.drawer-toggle'),
    drawerArrow: tile.querySelector('.drawer-arrow'),
    controls: tile.querySelector('.timer-controls'),
    play: tile.querySelector('.play-pause'),
    reset: tile.querySelector('.reset'),
    fields: {
      hours: tile.querySelector('.hours-field'),
      minutes: tile.querySelector('.minutes-field'),
      seconds: tile.querySelector('.seconds-field')
    }
  };
  refs.controls.id = 'timer-controls-' + clock.id;
  refs.drawerToggle.setAttribute('aria-controls', refs.controls.id);
  tileRefs.set(clock.id, refs);
  paintMarkers(refs.markings);
  refs.ack.addEventListener('click',()=>acknowledgeOne(clock.id));
  refs.detachButton.addEventListener('click',()=>detachClock(clock.id));
  setupDragDrop(clock.id,refs);

  tile.addEventListener('focusin', () => selectClock(clock.id));
  tile.addEventListener('pointerdown', () => selectClock(clock.id));

  refs.name.addEventListener('change', () => {
    const current = changeClock(clock.id, old => setOptions(old, { name: refs.name.value }), true);
    if (current) {
      refs.name.value = current.name;
      tile.setAttribute('aria-label', current.name);
    }
  });
  refs.name.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); refs.name.blur(); }
  });

  for (const [field, input] of Object.entries(refs.fields)) {
    input.setAttribute('aria-label', field[0].toUpperCase() + field.slice(1) + ' for ' + clock.name);
    input.addEventListener('input', () => {
      const cleaned = input.value.replace(/[^0-9]/g, '').slice(0,2);
      if (input.value !== cleaned) input.value = cleaned;
    });
    input.addEventListener('change', () => setClockDurationFromFields(clock.id));
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        spinField(clock.id, field, event.key === 'ArrowUp' ? 1 : -1);
      }
    });
  }
  tile.querySelectorAll('[data-field][data-step]').forEach(button => {
    button.addEventListener('click', () => spinField(clock.id, button.dataset.field, Number(button.dataset.step)));
  });

  refs.drawerToggle.addEventListener('click', () => {
    setDrawerCollapsed(clock.id, !refs.drawer.classList.contains('collapsed'));
  });
  refs.play.addEventListener('click', () => toggleClock(clock.id));
  refs.reset.addEventListener('click', () => resetOne(clock.id));
  tile.querySelector('.tile-settings').addEventListener('click', () => openSettings(clock.id));
  tile.querySelector('.tile-remove').addEventListener('click', () => removeClock(clock.id));
  board.append(tile);
  syncFields(clock);
  renderClock(clock);
}

function refreshBoard() {
  const single = state.clocks.length === 1;
  board.classList.toggle('single', single);
  document.querySelectorAll('.menubar .multi-only').forEach(button => button.hidden = single);
  $('add-clock').disabled = state.clocks.length >= MAX_CLOCKS;
  $('duplicate-clock').disabled = state.clocks.length >= MAX_CLOCKS;
  $('delete-clock').disabled = single;

  for (const id of tileRefs.keys()) {
    if (!getClock(id)) {
      tileRefs.get(id).root.remove();
      tileRefs.delete(id);
    }
  }
  for (const clock of state.clocks) {
    if (!tileRefs.has(clock.id)) createTile(clock);
    else renderClock(clock);
  }
  selectClock(state.activeId);
  applyLockVisual();
}

function addClock(source = null) {
  if (rejectLocked()) return;
  if (clockOnly) setClockOnly(false);
  if (state.clocks.length >= MAX_CLOCKS) { updateStatus('LIMIT: ' + MAX_CLOCKS + ' CLOCKS'); return; }
  const id = nextId();
  const options = source ? {
    ...source, id,
    name: (source.name + ' copy').slice(0,36)
  } : { id, name: 'Clock ' + (state.clocks.length + 1) };
  const clock = newClock(options, state.clocks.length + 1);
  state.clocks.push(clock);
  state.activeId = id;
  refreshBoard();
  save();
  // Grow automatically so the second clock can appear next to the first.
  action('fit-clocks', { count: state.clocks.length });
  updateStatus(clock.name.toUpperCase() + ' — ADDED');
}

function removeClock(id) {
  if (rejectLocked() || state.clocks.length <= 1) return;
  const clock = getClock(id);
  if (!clock) return;
  if (clock.running && !window.confirm('Remove the running timer "' + clock.name + '"?')) return;
  state.clocks = state.clocks.filter(t => t.id !== id);
  syncTicker();
  if (state.settingsClockId === id) closeSettings();
  if (state.activeId === id) state.activeId = state.clocks[0].id;
  refreshBoard();
  save();
  updateStatus(clock.name.toUpperCase() + ' — REMOVED');
}

function startAll() {
  if (rejectLocked()) return;
  prepareStart();
  const now = Date.now();
  state.clocks = state.clocks.map(clock => startClock(clock, now));
  syncTicker();
  for (const clock of state.clocks) {
    renderClock(clock);
    if (clock.running) setDrawerCollapsed(clock.id, true);
  }
  updateStatus('ALL TIMERS STARTED');
}

function pauseAll() {
  if (rejectLocked()) return;
  const now = Date.now();
  for (const old of state.clocks) {
    if (!old.running) continue;
    const { clock, completed } = pauseClock(old, now);
    changeClock(old.id, () => clock);
    if (completed) announceCompletion(clock, completed);
  }
  updateStatus('ALL TIMERS PAUSED');
}

function resetAll() {
  if (rejectLocked()) return;
  for (const clock of state.clocks) state.alarmLastPlayed.delete(clock.id);
  state.clocks = state.clocks.map(resetClock);
  syncTicker();
  for (const clock of state.clocks) renderClock(clock);
  updateStatus('ALL TIMERS RESET');
}

// Saved presets, activity sequences, and complete clock layout collections.
function renderPresetMenu() {
  const root=$('custom-preset-menu');
  root.replaceChildren();
  for(const preset of state.library.presets) {
    const button=document.createElement('button');
    button.className='preset-item';
    button.textContent=preset.name+' ('+formattedRemaining(preset.durationSeconds*1000)+')';
    button.title='Apply saved duration to selected clock';
    button.addEventListener('click',()=>{
      if(rejectLocked())return;
      const clock=changeClock(state.activeId,old=>setOptions(setDuration(old,preset.durationSeconds),{
        color:preset.color,taskIcon:preset.icon
      }),true);
      if(clock)syncFields(clock);
      closeFileMenu();
    });
    root.append(button);
  }
  root.hidden=state.library.presets.length===0;
}
function libraryItem(parent,label,onApply,onDelete) {
  const row=document.createElement('div');
  row.className='library-item';
  const text=document.createElement('span');text.textContent=label;
  row.append(text);
  const use=document.createElement('button');use.className='panel-button';use.textContent='Use';
  use.addEventListener('click',onApply);row.append(use);
  const del=document.createElement('button');del.className='panel-button danger';del.textContent='Delete';
  del.addEventListener('click',onDelete);row.append(del);
  parent.append(row);
}
function renderLibrary() {
  renderPresetMenu();
  const presetList=$('presets-list'),collectionsList=$('collections-list'),draft=$('steps-list');
  presetList.replaceChildren();collectionsList.replaceChildren();draft.replaceChildren();
  for(const preset of state.library.presets) {
    libraryItem(presetList,preset.name+' — '+formattedRemaining(preset.durationSeconds*1000),
      ()=>{
        if(rejectLocked())return;
        const clock=changeClock(state.activeId,old=>setOptions(setDuration(old,preset.durationSeconds),{
          color:preset.color,taskIcon:preset.icon}),true);
        if(clock)syncFields(clock);
      },()=>{
        state.library.presets=state.library.presets.filter(p=>p.id!==preset.id);
        saveLibrary();renderLibrary();
      });
  }
  for(const [i,step] of state.drafts.entries()) {
    const row=document.createElement('div');row.className='library-item';
    const title=document.createElement('span');
    title.textContent=(i+1)+'. '+step.name+' — '+formattedRemaining(step.durationSeconds*1000);
    const remove=document.createElement('button');remove.className='panel-button danger';
    remove.textContent='Remove';
    remove.addEventListener('click',()=>{state.drafts.splice(i,1);renderLibrary();});
    row.append(title,remove);draft.append(row);
  }
  for(const collection of state.library.collections) {
    libraryItem(collectionsList,collection.name+
      (collection.type==='layout'?' — '+collection.clocks.length+' clocks':' — '+collection.steps.length+' steps'),
      ()=>{
        if(rejectLocked())return;
        if(collection.type==='layout'){
          if(state.clocks.some(clock=>clock.running)&&
            !window.confirm('Replace your current clock layout? Running clocks will stop.'))return;
          for(const id of state.detached)action('close-detached',{id});
          state.detached.clear();
          state.clocks=restoreClocks(collection.clocks);
          state.activeId=state.clocks[0].id;
          refreshBoard();syncTicker();save();
        }else{
          const clock=changeClock(state.activeId,old=>setMode(old,'sequence',{
            sequence:collection.steps,sequenceRepeat:old.sequenceRepeat
          }),true);
          if(clock)syncFields(clock);
        }
        $('library-dialog').close();
      },()=>{
        state.library.collections=state.library.collections.filter(c=>c.id!==collection.id);
        saveLibrary();renderLibrary();
      });
  }
  updateSequenceSelect();
}
function updateSequenceSelect() {
  const select=$('setting-sequence'),old=select.value;
  select.replaceChildren();
  for(const collection of state.library.collections.filter(c=>c.type==='sequence')){
    const opt=document.createElement('option');opt.value=collection.id;opt.textContent=collection.name;
    select.append(opt);
  }
  if([...select.options].some(o=>o.value===old))select.value=old;
}
function openLibrary() {
  if(rejectLocked())return;
  closeFileMenu();
  renderLibrary();
  $('library-dialog').showModal();
}
function safeMinutes(id,fallback=5) {
  const n=Number($(id).value);
  return Number.isFinite(n)?Math.max(1,Math.min(5999,Math.round(n))):fallback;
}
function updateAdvancedVisibility() {
  const mode=$('setting-mode').value;
  $('stopwatch-goal-field').hidden=mode!=='stopwatch';
  $('sequence-options').hidden=mode!=='sequence';
  $('workbreak-options').hidden=mode!=='workbreak';
}
function applyModeFromSettings() {
  if(rejectLocked())return;
  const mode=$('setting-mode').value;
  const old=getClock(state.settingsClockId);
  if(!old)return;
  let next;
  if(mode==='sequence') {
    const selected=state.library.collections.find(c=>c.id===$('setting-sequence').value&&c.type==='sequence');
    const sequence=selected?.steps?.length?selected.steps:
      [{name:'Activity',durationSeconds:600,color:'#2486F2',taskIcon:'study'},
       {name:'Break',durationSeconds:300,color:'#24C45E',taskIcon:'break'}];
    next=setMode(old,mode,{sequence,sequenceRepeat:$('setting-sequence-repeat').checked});
  } else if(mode==='workbreak') {
    next=setMode(old,mode,{
      workSeconds:safeMinutes('setting-work-min',25)*60,
      breakSeconds:safeMinutes('setting-break-min',5)*60,
      longBreakSeconds:safeMinutes('setting-long-min',15)*60,
      rounds:Math.max(1,Math.min(12,Math.round(Number($('setting-rounds').value)||4))),
      sequenceRepeat:$('setting-work-repeat').checked
    });
  } else {
    next=setMode(old,mode);
    if(mode==='stopwatch'){
      next=resetClock({...next,durationSeconds:safeMinutes('setting-stopwatch-goal',30)*60});
    }
  }
  changeClock(old.id,()=>next,true);
  syncFields(next);
  updateAdvancedVisibility();
}
async function importCustomSound() {
  if(rejectLocked()||!desktop?.importSound)return;
  try{
    const sound=await desktop.importSound();
    if(!sound)return;
    applySetting({alarm:'custom',customSoundId:sound.id});
    $('setting-alarm').value='custom';
    $('custom-sound-status').textContent=sound.name;
  }catch(err){
    updateStatus('AUDIO IMPORT FAILED: '+String(err.message||err).slice(0,65));
  }
}
async function exportSetup() {
  if(!desktop?.exportSetup)return;
  try{
    const data=createBackup(state.clocks,state.library,{
      clockOnly,locked:state.locked,trayEnabled:state.trayEnabled
    });
    const ok=await desktop.exportSetup(data);
    updateStatus(ok?'SETUP EXPORTED':'EXPORT CANCELLED');
  }catch(err){updateStatus('EXPORT FAILED: '+String(err.message||err).slice(0,65));}
}
async function importSetup() {
  if(rejectLocked()||!desktop?.importSetup)return;
  try{
    const raw=await desktop.importSetup();
    if(raw===null)return;
    const backup=importBackup(raw);
    if(!window.confirm('Replace current timers and presets? Running clocks will stop.'))return;
    const soundAssets=Array.isArray(raw.soundAssets)?raw.soundAssets:[];
    const installed=await desktop.installSounds?.(soundAssets)||{};
    for(const clock of backup.clocks) {
      if(clock.customSoundId && installed[clock.customSoundId]) {
        clock.customSoundId=installed[clock.customSoundId];
      } else if(clock.alarm==='custom' && clock.customSoundId && soundAssets.length) {
        clock.alarm='off';
        clock.customSoundId=null;
      }
    }
    for(const id of state.detached)action('close-detached',{id});
    state.detached.clear();
    state.clocks=backup.clocks;
    state.library=backup.library;
    state.activeId=state.clocks[0].id;
    for(const tile of tileRefs.values())tile.root.remove();
    tileRefs.clear();
    state.alarmLastPlayed.clear();
    save();saveLibrary();renderLibrary();
    refreshBoard();syncTicker();
    setClockOnly(backup.preferences.clockOnly);
    if(state.trayEnabled!==backup.preferences.trayEnabled){
      state.trayEnabled=backup.preferences.trayEnabled;
      action('set-tray',{enabled:state.trayEnabled});
    }
    state.locked=backup.preferences.locked;
    applyLockVisual();
    action('set-lock',{enabled:state.locked});
    updateStatus('SETUP IMPORTED');
  }catch(err){updateStatus('IMPORT FAILED: '+String(err.message||err).slice(0,70));}
}
function applyLockVisual() {
  $('lock-check').textContent=state.locked?'✓':'';
  $('menu-lock').setAttribute('aria-pressed',String(state.locked));
  $('add-clock').disabled=state.locked||state.clocks.length>=MAX_CLOCKS;
  $('all-start').disabled=state.locked;
  $('all-pause').disabled=state.locked;
  $('all-reset').disabled=state.locked;
  $('resize-grip').classList.toggle('locked',state.locked);
  for(const clock of state.clocks) {
    const refs=tileRefs.get(clock.id);
    if(!refs)continue;
    refs.name.readOnly=state.locked;
    refs.root.classList.toggle('locked',state.locked);
    refs.fields.hours.disabled=state.locked;
    refs.fields.minutes.disabled=state.locked;
    refs.fields.seconds.disabled=state.locked;
    refs.play.disabled=state.locked||(clock.mode==='countdown'&&clock.durationSeconds===0);
    refs.reset.disabled=state.locked;
    refs.dragHandle.draggable=!state.locked;
    refs.detachButton.disabled=state.locked;
    refs.root.querySelector('.tile-settings').disabled=state.locked;
    refs.root.querySelector('.tile-remove').disabled=state.locked;
  }
}
function toggleLock() {
  state.locked=!state.locked;
  action('set-lock',{enabled:state.locked});
  applyLockVisual();closeFileMenu();
  updateStatus(state.locked?'CONTROLS AND LAYOUT LOCKED':'CONTROLS UNLOCKED');
}
function toggleTray(){
  state.trayEnabled=!state.trayEnabled;
  action('set-tray',{enabled:state.trayEnabled});
  $('tray-check').textContent=state.trayEnabled?'✓':'';
  $('menu-tray').setAttribute('aria-pressed',String(state.trayEnabled));
  closeFileMenu();
}
function syncColorSwatches() {
  const clock = getClock(state.settingsClockId);
  if (!clock) return;
  $('color-swatches').querySelectorAll('.color-swatch').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.color === clock.color));
  });
}

function openSettings(id) {
  if (rejectLocked()) return;
  if (clockOnly) setClockOnly(false);
  if (!getClock(id)) return;
  closeFileMenu();
  state.settingsClockId = id;
  selectClock(id);
  const clock = getClock(id);
  $('settings-heading').textContent = clock.name.toUpperCase() + ' SETTINGS';
  $('setting-direction').value = clock.direction;
  $('setting-color').value = clock.color.toLowerCase();
  $('setting-alarm').value = clock.alarm;
  $('setting-volume').value = String(clock.volume);
  $('setting-repeat').checked = clock.repeat;
  $('setting-show-time').checked = clock.showTime;
  $('setting-show-ticks').checked = clock.showTicks;
  $('setting-mode').value=clock.mode;
  $('setting-stopwatch-goal').value=String(Math.max(1,Math.round(clock.durationSeconds/60)));
  $('setting-sequence-repeat').checked=clock.sequenceRepeat;
  $('setting-work-repeat').checked=clock.sequenceRepeat;
  $('setting-task-icon').value=clock.taskIcon;
  $('setting-progress-markers').checked=clock.progressMarkers;
  $('setting-hide-on-play').checked=clock.hideNumbersOnPlay;
  $('setting-warning').checked=clock.warningEnabled;
  $('setting-warning-percent').value=String(clock.warningPercent);
  $('setting-warning-color').value=clock.warningColor.toLowerCase();
  $('setting-critical-percent').value=String(clock.criticalPercent);
  $('setting-critical-color').value=clock.criticalColor.toLowerCase();
  $('setting-checkpoints').checked=clock.checkpointEnabled;
  $('setting-checkpoint-values').value=clock.checkpointPercents.join(',');
  $('setting-overtime').checked=clock.overtimeEnabled;
  $('setting-persistent').checked=clock.persistentAlarm;
  $('custom-sound-status').textContent=clock.customSoundId?'Imported audio selected':'No custom sound selected';
  if(clock.mode==='workbreak'&&clock.sequence.length>=2){
    $('setting-work-min').value=String(Math.round(clock.sequence[0].durationSeconds/60));
    $('setting-break-min').value=String(Math.round(clock.sequence[1].durationSeconds/60));
    $('setting-long-min').value=String(Math.round(clock.sequence.at(-1).durationSeconds/60));
    $('setting-rounds').value=String(Math.ceil(clock.sequence.length/2));
  }
  updateSequenceSelect();
  updateAdvancedVisibility();
  syncColorSwatches();
  settings.showModal();
}

function closeSettings() {
  if (settings.open) settings.close();
  state.settingsClockId = null;
}

function applySetting(changes) {
  if (rejectLocked()) return;
  const clock = changeClock(state.settingsClockId, old => setOptions(old, changes), true);
  if (clock) syncColorSwatches();
}

for (const color of COLOR_PALETTE) {
  const button = document.createElement('button');
  button.className = 'color-swatch';
  button.dataset.color = color;
  button.style.setProperty('--swatch', color);
  button.title = color;
  button.setAttribute('aria-label', 'Color ' + color);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    applySetting({ color });
    $('setting-color').value = color.toLowerCase();
  });
  $('color-swatches').append(button);
}

$('setting-direction').addEventListener('change', event => applySetting({ direction: event.target.value }));
$('setting-color').addEventListener('input', event => applySetting({ color: event.target.value }));
$('setting-alarm').addEventListener('change', event => applySetting({ alarm: event.target.value }));
$('setting-volume').addEventListener('input', event => applySetting({ volume: Number(event.target.value) }));
$('setting-repeat').addEventListener('change', event => applySetting({ repeat: event.target.checked }));
$('setting-show-time').addEventListener('change', event => applySetting({ showTime: event.target.checked }));
$('setting-show-ticks').addEventListener('change', event => applySetting({ showTicks: event.target.checked }));

$('setting-mode').addEventListener('change',applyModeFromSettings);
for(const id of ['setting-stopwatch-goal','setting-sequence','setting-sequence-repeat',
  'setting-work-min','setting-break-min','setting-long-min','setting-rounds','setting-work-repeat']) {
  $(id).addEventListener('change',applyModeFromSettings);
}
for(const [id,key] of [
  ['setting-progress-markers','progressMarkers'],
  ['setting-hide-on-play','hideNumbersOnPlay'],
  ['setting-warning','warningEnabled'],
  ['setting-checkpoints','checkpointEnabled'],
  ['setting-overtime','overtimeEnabled'],
  ['setting-persistent','persistentAlarm']
]) $(id).addEventListener('change',event=>applySetting({[key]:event.target.checked}));
for(const [id,key] of [
  ['setting-warning-percent','warningPercent'],
  ['setting-critical-percent','criticalPercent']
]) $(id).addEventListener('change',event=>applySetting({[key]:Number(event.target.value)}));
for(const [id,key] of [
  ['setting-warning-color','warningColor'],['setting-critical-color','criticalColor']
]) $(id).addEventListener('input',event=>applySetting({[key]:event.target.value}));
$('setting-task-icon').addEventListener('change',event=>applySetting({taskIcon:event.target.value}));
$('setting-checkpoint-values').addEventListener('change',event=>{
  const values=event.target.value.split(/[,\s]+/).filter(Boolean).map(Number);
  applySetting({checkpointPercents:values});
});
$('import-custom-sound').addEventListener('click',importCustomSound);
$('open-sequence-library').addEventListener('click',()=>{
  closeSettings();openLibrary();
});
$('menu-library').addEventListener('click',openLibrary);
$('menu-detach').addEventListener('click',()=>{const id=state.activeId;closeFileMenu();detachClock(id);});
$('menu-export').addEventListener('click',()=>{closeFileMenu();exportSetup();});
$('menu-import').addEventListener('click',()=>{closeFileMenu();importSetup();});
$('menu-lock').addEventListener('click',toggleLock);
$('menu-tray').addEventListener('click',toggleTray);
$('menu-hide-tray').addEventListener('click',()=>{
  if(!state.trayEnabled){
    state.trayEnabled=true;
    action('set-tray',{enabled:true});
    $('tray-check').textContent='✓';
  }
  closeFileMenu();
  action('hide-to-tray');
});
$('menu-exit').textContent='Quit application';
$('menu-exit').onclick=()=>action('quit');

$('library-close').addEventListener('click',()=>$('library-dialog').close());
$('library-done').addEventListener('click',()=>$('library-dialog').close());
$('preset-save').addEventListener('click',()=>{
  if(rejectLocked())return;
  const name=$('preset-name').value.trim();
  if(!name)return updateStatus('ENTER PRESET NAME');
  const active=getClock(state.activeId);
  const preset=cleanPreset({id:uid('preset'),name,
    durationSeconds:safeMinutes('preset-minutes',10)*60,
    color:active?.color,icon:active?.taskIcon},state.library.presets.length);
  if(!preset||state.library.presets.length>=100)return updateStatus('PRESET LIMIT REACHED');
  state.library.presets.push(preset);saveLibrary();renderLibrary();
  $('preset-name').value='';
});
$('step-add').addEventListener('click',()=>{
  if(rejectLocked())return;
  if(state.drafts.length>=48)return updateStatus('STEP LIMIT REACHED');
  const name=$('step-name').value.trim()||'Activity '+(state.drafts.length+1);
  state.drafts.push({name,durationSeconds:safeMinutes('step-minutes')*60,
    color:$('step-color').value,taskIcon:$('step-icon').value});
  $('step-name').value='';renderLibrary();
});
$('collection-save').addEventListener('click',()=>{
  if(rejectLocked())return;
  const name=$('collection-name').value.trim();
  if(!name||!state.drafts.length)return updateStatus('ADD A COLLECTION NAME AND STEPS');
  if(state.library.collections.length>=30)return updateStatus('COLLECTION LIMIT REACHED');
  const col=cleanCollection({id:uid('collection'),name,type:'sequence',steps:state.drafts},state.library.collections.length);
  if(!col)return;
  state.library.collections.push(col);state.drafts=[];
  $('collection-name').value='';saveLibrary();renderLibrary();
});
$('layout-save').addEventListener('click',()=>{
  if(rejectLocked())return;
  const name=$('layout-name').value.trim();
  if(!name||state.library.collections.length>=30)return updateStatus('ENTER LAYOUT NAME / CHECK LIMIT');
  const layout=cleanCollection({id:uid('layout'),name,type:'layout',clocks:exportClocks(state.clocks)},
    state.library.collections.length);
  state.library.collections.push(layout);
  $('layout-name').value='';saveLibrary();renderLibrary();
});
desktop?.onTrayAction?.(command=>{
  if(command==='start-all')startAll();
  if(command==='pause-all')pauseAll();
});
desktop?.onNativeState?.(value=>{
  state.trayEnabled=value?.trayEnabled===true;
  state.locked=value?.locked===true;
  $('tray-check').textContent=state.trayEnabled?'✓':'';
  applyLockVisual();
});
desktop?.onRequestSnapshot?.(id=>{
  const clock=getClock(id);
  if(clock){
    state.detached.add(id);
    publishDetached(clock,true);
  }
});
desktop?.onDetachedState?.(value=>{
  if(!value?.id)return;
  if(value.open)state.detached.add(value.id);
  else state.detached.delete(value.id);
});
desktop?.onRemoteControl?.(value=>{
  if(!value||!getClock(value.id))return;
  if(value.command==='start-pause')toggleClock(value.id);
  if(value.command==='reset')resetOne(value.id);
  if(value.command==='ack')acknowledgeOne(value.id);
});

$('preview-alarm').addEventListener('click', () => {
  primeAudio();
  const clock = getClock(state.settingsClockId);
  if (clock) playAlarm(clock.alarm, clock.volume);
});
$('settings-close').addEventListener('click', closeSettings);
$('done-settings').addEventListener('click', closeSettings);
$('duplicate-clock').addEventListener('click', () => {
  const source = getClock(state.settingsClockId);
  closeSettings();
  if (source) addClock(source);
});
$('delete-clock').addEventListener('click', () => removeClock(state.settingsClockId));
settings.addEventListener('close', () => { state.settingsClockId = null; });

function closeFileMenu() {
  $('file-menu').hidden = true;
  $('file-trigger').setAttribute('aria-expanded', 'false');
}
function toggleFileMenu() {
  const menu = $('file-menu');
  menu.hidden = !menu.hidden;
  $('file-trigger').setAttribute('aria-expanded', String(!menu.hidden));
}

$('clock-only').addEventListener('click', () => setClockOnly(true));
$('focus-restore').addEventListener('click', () => setClockOnly(false));
$('menu-clock-only').addEventListener('click', () => setClockOnly(true));
$('menu-timer-toggle').addEventListener('click', () => { closeFileMenu(); toggleClock(state.activeId); });
$('menu-timer-reset').addEventListener('click', () => { closeFileMenu(); resetOne(state.activeId); });
$('menu-timer-settings').addEventListener('click', () => { closeFileMenu(); openSettings(state.activeId); });
$('file-trigger').addEventListener('click', toggleFileMenu);
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.menu-wrap')) closeFileMenu();
});
$('add-clock').addEventListener('click', () => addClock());
$('menu-new').addEventListener('click', () => { closeFileMenu(); addClock(); });
$('all-start').addEventListener('click', startAll);
$('all-pause').addEventListener('click', pauseAll);
$('all-reset').addEventListener('click', resetAll);
$('menu-start-all')?.addEventListener('click', () => { startAll(); closeFileMenu(); });
$('menu-pause-all')?.addEventListener('click', () => { pauseAll(); closeFileMenu(); });
$('menu-reset-all')?.addEventListener('click', () => { resetAll(); closeFileMenu(); });
document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => applyPreset(state.activeId, Number(button.dataset.preset)));
});
$('menu-top').addEventListener('click', () => { action('toggle-always-on-top'); closeFileMenu(); });
$('menu-fullscreen').addEventListener('click', () => { action('toggle-fullscreen'); closeFileMenu(); });
$('menu-exit').addEventListener('click', () => action('close'));
desktop?.onAlwaysOnTop?.(value => {
  $('top-check').textContent = value ? '✓' : '';
  $('menu-top').setAttribute('aria-pressed', String(value));
});
for (const [id, command] of [
  ['window-minimize','minimize'], ['window-maximize','maximize'],['window-close','close']
]) $(id).addEventListener('click', () => action(command));

$('menu-help').addEventListener('click', () => { closeFileMenu(); $('help-dialog').showModal(); });
$('help-trigger').addEventListener('click', () => { closeFileMenu(); $('help-dialog').showModal(); });
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('help-done').addEventListener('click', () => $('help-dialog').close());

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (clockOnly && !$('help-dialog').open && !settings.open) {
      event.preventDefault();
      setClockOnly(false);
    } else closeFileMenu();
    return;
  }
  if ($('help-dialog').open || settings.open) return;
  if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); addClock(); return; }
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input,select,textarea,[contenteditable="true"]')) return;
  if (event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    setClockOnly(!clockOnly);
    return;
  }
  if (event.code === 'Space' && !(target instanceof HTMLElement && target.closest('button'))) {
    event.preventDefault(); toggleClock(state.activeId);
  }
  if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault(); resetOne(state.activeId);
  }
  if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault(); action('toggle-fullscreen');
  }
});
document.addEventListener('visibilitychange', () => advanceAll());

const grip = $('resize-grip');
let resizing = null;
grip.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = {
    x: event.screenX, y: event.screenY,
    width: window.innerWidth, height: window.innerHeight
  };
  grip.setPointerCapture(event.pointerId);
});
grip.addEventListener('pointermove', event => {
  if (!resizing) return;
  action('resize-to', {
    width: resizing.width + event.screenX - resizing.x,
    height: resizing.height + event.screenY - resizing.y
  });
});
grip.addEventListener('pointerup', () => { resizing = null; });
grip.addEventListener('pointercancel', () => { resizing = null; });
grip.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action('resize-to', { width: window.innerWidth + 100, height: window.innerHeight + 70 });
});

refreshBoard();
renderPresetMenu();
if (localStorage.getItem('clock-counter:clock-only') === 'true') setClockOnly(true);
updateStatus('READY — ' + state.clocks.length + ' CLOCK' + (state.clocks.length === 1 ? '' : 'S'));
