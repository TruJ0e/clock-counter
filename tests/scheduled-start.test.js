import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newClock, setMode, exportClocks, restoreClocks,
  scheduleClock, cancelScheduledStart, startClock, tickClock,
  pauseClock, resetClock
} from '../src/clocks.js';
import {nextLocalStartTime,nextHourInput,scheduledTimeText} from '../src/schedule.js';

const at=(h,m,s=0)=>new Date(2026,10,16,h,m,s,0).getTime();

test('4:56 PM schedules precisely at 5:00 PM, without consuming timer duration beforehand',()=>{
  const now=at(16,56);
  const start=nextLocalStartTime('17:00',now);
  assert.equal(start,at(17,0));
  const scheduled=scheduleClock(newClock({durationSeconds:1800}),start,now);
  assert.equal(scheduled.running,false);
  assert.equal(scheduled.remainingMs,1800000);
  const before=tickClock(scheduled,start-1);
  assert.strictEqual(before.clock,scheduled);
  assert.equal(before.scheduledStarted,false);
  const fired=tickClock(scheduled,start);
  assert.equal(fired.scheduledStarted,true);
  assert.equal(fired.clock.scheduledStartMs,null);
  assert.equal(fired.clock.running,true);
  assert.equal(fired.clock.deadlineMs,start+1800000);
  assert.equal(fired.clock.remainingMs,1800000);
});
test('a delayed tick after sleep or inactive browser tab catches up from scheduled wall time',()=>{
  const now=at(16,56),start=at(17,0);
  const scheduled=scheduleClock(newClock({durationSeconds:300}),start,now);
  const late=tickClock(scheduled,start+120000);
  assert.equal(late.scheduledStarted,true);
  assert.equal(late.clock.remainingMs,180000);
  assert.equal(late.clock.deadlineMs,start+300000);
  const finish=tickClock(scheduled,start+310000);
  assert.equal(finish.scheduledStarted,true);
  assert.equal(finish.completed,1);
  assert.equal(finish.clock.running,false);
  assert.equal(finish.clock.remainingMs,0);
});
test('time already passed schedules the following day and default picker shows next full hour',()=>{
  const now=at(16,56);
  assert.equal(nextHourInput(now),'17:00');
  const tomorrow=nextLocalStartTime('16:30',now);
  const d=new Date(tomorrow);
  assert.equal(d.getDate(),17);
  assert.equal(d.getHours(),16);
  assert.equal(d.getMinutes(),30);
  assert.match(scheduledTimeText(tomorrow,now),/TOMORROW$/);
  assert.match(scheduledTimeText(at(17,0),now),/TODAY$/);
});
test('invalid time, past target, and zero-length countdown cannot arm',()=>{
  assert.equal(nextLocalStartTime('25:00',at(16,0)),null);
  assert.equal(nextLocalStartTime('17:69',at(16,0)),null);
  assert.equal(nextLocalStartTime('5:00 PM',at(16,0)),null);
  const c=newClock({durationSeconds:0});
  assert.strictEqual(scheduleClock(c,at(17,0),at(16,0)),c);
  const x=newClock({durationSeconds:30});
  assert.strictEqual(scheduleClock(x,at(15,0),at(16,0)),x);
  assert.strictEqual(scheduleClock(x,at(16,0)+3*86400000,at(16,0)),x);
});
test('manual Play cancels Start At and begins immediately',()=>{
  const c=scheduleClock(newClock({durationSeconds:60}),at(17,0),at(16,56));
  const now=at(16,57);
  const started=startClock(c,now);
  assert.equal(started.scheduledStartMs,null);
  assert.equal(started.running,true);
  assert.equal(started.deadlineMs,now+60000);
});
test('reset, pause and explicit Cancel prevent a queued automatic start',()=>{
  const queued=scheduleClock(newClock({durationSeconds:60}),at(17,0),at(16,56));
  const cancelled=cancelScheduledStart(queued);
  assert.equal(cancelled.scheduledStartMs,null);
  assert.equal(tickClock(cancelled,at(17,1)).clock.running,false);
  assert.equal(resetClock(queued).scheduledStartMs,null);
  assert.equal(pauseClock(queued,at(16,59)).clock.scheduledStartMs,null);
});
test('scheduling a running timer resets it and waits with the full duration',()=>{
  const c=newClock({durationSeconds:300});
  const running=tickClock(startClock(c,at(16,0)),at(16,1)).clock;
  const queued=scheduleClock(running,at(17,0),at(16,2));
  assert.equal(queued.running,false);
  assert.equal(queued.remainingMs,300000);
  assert.equal(queued.scheduledStartMs,at(17,0));
});
test('each timer has its own independent scheduled start',()=>{
  const first=scheduleClock(newClock({id:'first',durationSeconds:60}),at(17,0),at(16,56));
  const second=scheduleClock(newClock({id:'second',durationSeconds:60}),at(17,5),at(16,56));
  const a=tickClock(first,at(17,0,5));
  const b=tickClock(second,at(17,0,5));
  assert.equal(a.clock.running,true);
  assert.equal(b.clock.running,false);
  assert.equal(b.clock.scheduledStartMs,at(17,5));
});
test('future local schedules survive app restart but imports never automatically arm timers',()=>{
  const now=at(16,56),target=at(17,0);
  const pending=scheduleClock(newClock({durationSeconds:60}),target,now);
  const serialized=exportClocks([pending]);
  assert.equal(serialized[0].scheduledStartMs,target);
  const restored=restoreClocks(serialized,{preserveUpcomingSchedules:true,nowMs:now})[0];
  assert.equal(restored.scheduledStartMs,target);
  assert.equal(restored.running,false);
  const backup=restoreClocks(serialized)[0];
  assert.equal(backup.scheduledStartMs,null);
  const stale=restoreClocks(serialized,{preserveUpcomingSchedules:true,nowMs:target+1})[0];
  assert.equal(stale.scheduledStartMs,null);
});
test('stopwatch and sequential stages can start from a scheduled local time',()=>{
  const target=at(17,0),now=at(16,56);
  const stopwatch=scheduleClock(setMode(newClock(),'stopwatch'),target,now);
  const sw=tickClock(stopwatch,target+4000);
  assert.equal(sw.scheduledStarted,true);
  assert.equal(sw.clock.elapsedMs,4000);
  const sequence=setMode(newClock(),'sequence',{sequence:[
    {name:'Work',durationSeconds:3},
    {name:'Break',durationSeconds:4}
  ]});
  const seq=tickClock(scheduleClock(sequence,target,now),target+4000);
  assert.equal(seq.scheduledStarted,true);
  assert.equal(seq.clock.sequenceIndex,1);
  assert.equal(seq.clock.remainingMs,3000);
});
