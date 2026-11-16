import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newClock, setMode, setOptions, setDuration, startClock, tickClock,
  pauseClock, resetClock, effectiveColor, proportionRemaining,
  buildWorkBreakSequence, cleanSequence, exportClocks, restoreClocks
} from '../src/clocks.js';
import {createBackup,importBackup,restoreLibrary} from '../src/library.js';

test('stopwatch counts up and resumes after pause',()=>{
  const a=setMode(newClock({durationSeconds:60}),'stopwatch');
  assert.equal(a.mode,'stopwatch');
  const start=startClock(a,1000);
  const five=tickClock(start,6200).clock;
  assert.equal(five.elapsedMs,5200);
  const paused=pauseClock(five,7000).clock;
  assert.equal(paused.elapsedMs,6000);
  const resumed=startClock(paused,13000);
  assert.equal(tickClock(resumed,15000).clock.elapsedMs,8000);
  assert.equal(proportionRemaining(tickClock(resumed,15000).clock),8000/60000*100);
});

test('overtime counts upward after countdown ends, can pause and reset',()=>{
  const a=startClock(setOptions(newClock({durationSeconds:2}),{overtimeEnabled:true}),0);
  const ended=tickClock(a,3000);
  assert.equal(ended.completed,1);
  assert.equal(ended.clock.overtimeActive,true);
  assert.equal(ended.clock.overtimeMs,1000);
  assert.equal(ended.clock.running,true);
  const paused=pauseClock(ended.clock,5000).clock;
  assert.equal(paused.overtimeMs,3000);
  const resumed=startClock(paused,9000);
  assert.equal(tickClock(resumed,11000).clock.overtimeMs,5000);
  const reset=resetClock(resumed);
  assert.equal(reset.overtimeMs,0);
  assert.equal(reset.overtimeActive,false);
});

test('percent checkpoints fire once when threshold is crossed',()=>{
  let clock=startClock(setOptions(newClock({durationSeconds:100}),{
    checkpointEnabled:true,checkpointPercents:[50,25,10]
  }),1000);
  const a=tickClock(clock,52000);
  assert.deepEqual(a.checkpoints,[50]);
  clock=a.clock;
  assert.deepEqual(tickClock(clock,53000).checkpoints,[]);
  const b=tickClock(clock,92000);
  assert.deepEqual(b.checkpoints,[25,10]);
  assert.deepEqual(tickClock(b.clock,94000).checkpoints,[]);
  assert.deepEqual(resetClock(b.clock).notifiedCheckpoints,[]);
});

test('warning and critical colors respond to fraction remaining',()=>{
  const c=setOptions(newClock({durationSeconds:100,color:'#F20B14'}),{
    warningEnabled:true,warningPercent:30,criticalPercent:10,
    warningColor:'#FFEE00',criticalColor:'#00FF00'
  });
  assert.equal(effectiveColor(c),'#F20B14');
  const start=startClock(c,0);
  assert.equal(effectiveColor(tickClock(start,71000).clock),'#FFEE00');
  assert.equal(effectiveColor(tickClock(start,92000).clock),'#00FF00');
});

test('sequence advances across multiple timed stages and ends cleanly',()=>{
  const seq=[
    {name:'Read',durationSeconds:5,color:'#2486F2'},
    {name:'Break',durationSeconds:3,color:'#24C45E'}
  ];
  const c=setMode(newClock(),'sequence',{sequence:seq});
  assert.equal(c.durationSeconds,5);
  const started=startClock(c,0);
  const after=tickClock(started,5600);
  assert.equal(after.completed,1);
  assert.equal(after.clock.sequenceIndex,1);
  assert.equal(after.clock.durationSeconds,3);
  assert.equal(after.clock.remainingMs,2400);
  assert.equal(effectiveColor(after.clock),'#24C45E');
  const last=tickClock(after.clock,8100);
  assert.equal(last.completed,1);
  assert.equal(last.clock.ended,true);
  assert.equal(last.clock.running,false);
  assert.equal(resetClock(last.clock).sequenceIndex,0);
});

test('looping sequence catches up after a delayed update',()=>{
  const c=setMode(newClock(),'sequence',{sequence:[
    {name:'One',durationSeconds:2},{name:'Two',durationSeconds:3}
  ],sequenceRepeat:true});
  const started=startClock(c,0);
  const a=tickClock(started,11700);
  assert.equal(a.clock.sequenceIndex,0);
  assert.equal(a.clock.remainingMs,300);
  assert.equal(a.clock.cycles,2);
  assert.equal(a.completed,4);
});

test('work/break scheduling generates work, short breaks, and a long break',()=>{
  const seq=buildWorkBreakSequence(1200,240,900,3);
  assert.deepEqual(seq.map(s=>s.durationSeconds),[1200,240,1200,240,1200,900]);
  const mode=setMode(newClock(),'workbreak',{workSeconds:1200,breakSeconds:240,longBreakSeconds:900,rounds:3});
  assert.equal(mode.mode,'workbreak');
  assert.equal(mode.sequence.length,6);
  assert.equal(mode.sequence[5].name,'Long break');
});

test('backup is versioned, sanitized and never serializes active runtime',()=>{
  const running=startClock(newClock({id:'reading',name:'Read',durationSeconds:45}),5000);
  const library=restoreLibrary({
    presets:[{id:'p1',name:'Read 5 minutes',durationSeconds:300}],
    collections:[{id:'c1',name:'Focus plan',steps:[{name:'Work',durationSeconds:1500}]}]
  });
  const backup=createBackup([running],library,{locked:true,trayEnabled:true});
  assert.equal(backup.kind,'clock-counter-setup');
  assert.equal(backup.clocks[0].deadlineMs,undefined);
  const restored=importBackup(backup);
  assert.equal(restored.clocks[0].running,false);
  assert.equal(restored.library.presets[0].durationSeconds,300);
  assert.equal(restored.preferences.locked,true);
  assert.throws(()=>importBackup({kind:'bad'}),/setup/);
  assert.throws(()=>importBackup({...backup,version:45}),/version/);
});

test('configuration saves optional advanced features and sequence',()=>{
  const c=setMode(newClock({id:'test'}),'sequence',{sequence:[
    {name:'Read',durationSeconds:12,taskIcon:'reading',color:'#FF00AA'}
  ]});
  const enabled=setOptions(c,{hideNumbersOnPlay:true,progressMarkers:true,
    persistentAlarm:true,warningEnabled:true,checkpointEnabled:true,
    overtimeEnabled:true,taskIcon:'study',customSoundId:'sound-id'});
  const restored=restoreClocks(exportClocks([enabled]))[0];
  assert.equal(restored.mode,'sequence');
  assert.equal(restored.sequence[0].name,'Read');
  assert.equal(restored.progressMarkers,true);
  assert.equal(restored.persistentAlarm,true);
  assert.equal(restored.customSoundId,'sound-id');
  assert.equal(restored.running,false);
});

test('preset library sanitizes imported oversized data',()=>{
  const value=restoreLibrary({
    presets:Array.from({length:105},(_,i)=>({name:'Preset '+i,durationSeconds:i})),
    collections:Array.from({length:35},(_,i)=>({name:'Group '+i,steps:Array.from({length:60},(_,j)=>({name:'Step '+j,durationSeconds:3}))}))
  });
  assert.equal(value.presets.length,100);
  assert.equal(value.collections.length,30);
  assert.equal(value.collections[0].steps.length,48);
  assert.equal(value.presets[0].durationSeconds,1);
});

test('custom sound ID only accepts safe filename token',()=>{
  const c=setOptions(newClock(),{customSoundId:'../../etc/passwd'});
  assert.equal(c.customSoundId,null);
  const d=setOptions(c,{customSoundId:'12345678-1234-1234-1234-123456789012'});
  assert.equal(d.customSoundId,'12345678-1234-1234-1234-123456789012');
});
