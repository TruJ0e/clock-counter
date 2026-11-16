// Pure, immutable time model. All time values are milliseconds unless named "Seconds".
import { durationFromParts, elapsedPercentage } from './timer-core.js';

export const MAX_CLOCKS = 12;
export const DEFAULT_COLOR = '#F20B14';
export const COLOR_PALETTE = Object.freeze([
  '#F20B14','#FF7A00','#FFD23F','#24C45E','#00B9B0',
  '#2486F2','#9B5DE5','#F15BB5','#F8F8F8'
]);
export const DIRECTIONS = Object.freeze(['cw','ccw']);
export const ALARMS = Object.freeze(['chime','beep','bell','digital','custom','off']);
export const MODES = Object.freeze(['countdown','stopwatch','sequence','workbreak']);
export const TASK_ICONS = Object.freeze(['none','reading','work','break','cleanup','study','exercise']);
export const MAX_STEPS = 48;
export const MAX_SCHEDULE_AHEAD_MS = 48 * 60 * 60 * 1000;

export function validColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
export function boundedDuration(value) {
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
export function safeName(name, max=36) {
  return typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max) : '';
}
export function cleanSequence(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0,MAX_STEPS).map((step,i)=>({
    name:safeName(step?.name,30)||'Step '+(i+1),
    durationSeconds:Math.max(1,boundedDuration(step?.durationSeconds)),
    color:validColor(step?.color)?step.color.toUpperCase():DEFAULT_COLOR,
    taskIcon:TASK_ICONS.includes(step?.taskIcon)?step.taskIcon:'none'
  }));
}
export function buildWorkBreakSequence(work=1500,rest=300,longRest=900,rounds=4) {
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

export function newClock(options={},id=1) {
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
    scheduledStartMs:null,
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

export function exportClocks(clocks) {
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
    overtimeEnabled:c.overtimeEnabled,
    scheduledStartMs:c.scheduledStartMs??null
  }));
}

export function restoreClocks(raw,{preserveUpcomingSchedules=false,nowMs=Date.now()}={}) {
  if(!Array.isArray(raw)||!raw.length)return [newClock()];
  const seen=new Set();
  return raw.slice(0,MAX_CLOCKS).map((entry,i)=>{
    const c=newClock(entry,i+1);
    if(!idOK(c.id)||seen.has(c.id))c.id='clock-'+(i+1);
    while(seen.has(c.id))c.id+='-x';
    seen.add(c.id);
    // Only local preference restoration preserves future appointments.
    // Importing a setup never silently arms timers from another machine.
    const requested=entry?.scheduledStartMs;
    if(preserveUpcomingSchedules && Number.isSafeInteger(requested) &&
        requested>nowMs && requested<=nowMs+MAX_SCHEDULE_AHEAD_MS &&
        (c.mode!=='countdown'||c.durationSeconds>0)) {
      c.scheduledStartMs=requested;
    }
    return c;
  });
}

export function scheduleClock(clock,startMs,nowMs=Date.now()) {
  if(!Number.isSafeInteger(startMs) || startMs<=nowMs ||
      startMs>nowMs+MAX_SCHEDULE_AHEAD_MS ||
      (clock.mode==='countdown' && clock.durationSeconds<=0))return clock;
  // Scheduling a running clock resets it first, then holds the full duration.
  return {...resetClock(clock),scheduledStartMs:startMs};
}
export function cancelScheduledStart(clock) {
  return clock.scheduledStartMs===null ? clock : {...clock,scheduledStartMs:null};
}

export function setDuration(clock,seconds) {
  const d=boundedDuration(seconds);
  return {...resetClock(clock),mode:'countdown',sequence:[],
    durationSeconds:d,remainingMs:d*1000};
}
export function setDurationParts(clock,parts) {
  return setDuration(clock,durationFromParts(parts));
}
export function setMode(clock,mode,options={}) {
  if(!MODES.includes(mode))return clock;
  const sequence=mode==='workbreak'
    ? cleanSequence(options.sequence?.length?options.sequence:buildWorkBreakSequence(
        options.workSeconds,options.breakSeconds,options.longBreakSeconds,options.rounds))
    : mode==='sequence'?cleanSequence(options.sequence):[];
  const next={...clock,mode,sequence,sequenceRepeat:options.sequenceRepeat===true};
  return resetClock(next);
}
export function setOptions(clock,options) {
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

export function startClock(clock,nowMs) {
  if(clock.running)return clock;
  // Pressing Play starts now and supersedes any pending Start At time.
  if(clock.scheduledStartMs!==null)clock={...clock,scheduledStartMs:null};
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
export function tickClock(clock,nowMs) {
  if(!clock.running){
    if(clock.scheduledStartMs===null||nowMs<clock.scheduledStartMs)
      return {clock,completed:0,checkpoints:[],transitioned:false,scheduledStarted:false};
    // Use the intended wall-clock time, not the delayed browser render tick.
    // This catches up correctly after sleep or background tab throttling.
    const started=startClock(clock,clock.scheduledStartMs);
    const result=tickClock(started,nowMs);
    return {...result,scheduledStarted:true};
  }
  if(clock.mode==='stopwatch'){
    const elapsed=Math.max(0,nowMs-clock.startedAtMs);
    return {clock:{...clock,elapsedMs:elapsed},completed:0,checkpoints:[],transitioned:false};
  }
  if(clock.mode==='sequence'||clock.mode==='workbreak')return tickSequence(clock,nowMs);
  return tickCountdown(clock,nowMs);
}
export function pauseClock(clock,nowMs) {
  const res=tickClock(clock,nowMs);
  return {...res,clock:{...res.clock,running:false,deadlineMs:null,startedAtMs:null,scheduledStartMs:null}};
}
export function resetClock(clock) {
  const first=clock.mode==='sequence'||clock.mode==='workbreak'
    ?clock.sequence[0]?.durationSeconds??clock.durationSeconds:clock.durationSeconds;
  return {...clock,durationSeconds:first,remainingMs:first*1000,
    elapsedMs:0,overtimeMs:0,overtimeActive:false,startedAtMs:null,
    running:false,deadlineMs:null,scheduledStartMs:null,ended:false,cycles:0,
    sequenceIndex:0,notifiedCheckpoints:[],alarmActive:false};
}
export function acknowledgeAlarm(clock) {return {...clock,alarmActive:false};}
export function proportionRemaining(clock) {
  if(clock.mode==='stopwatch') {
    return clock.durationSeconds===0?0:Math.min(100,100*clock.elapsedMs/(clock.durationSeconds*1000));
  }
  if(clock.overtimeActive)return 0;
  return Math.max(0,100-elapsedPercentage(clock.remainingMs,clock.durationSeconds*1000));
}
export function effectiveColor(clock) {
  const sequenceMode=clock.mode==='sequence'||clock.mode==='workbreak';
  const base=sequenceMode?clock.sequence[clock.sequenceIndex]?.color||clock.color:clock.color;
  if(!clock.warningEnabled||clock.mode==='stopwatch'||clock.overtimeActive)return base;
  const p=proportionRemaining(clock);
  if(p<=clock.criticalPercent)return clock.criticalColor;
  if(p<=clock.warningPercent)return clock.warningColor;
  return base;
}
