import {formattedRemaining} from './timer-core.js';
import {proportionRemaining,effectiveColor} from './clocks.js';
const $=id=>document.getElementById(id);
const desktop=window.clockCounterWindow;
const id=new URLSearchParams(window.location.search).get('clock');
let current=null;

function draw(snapshot) {
  if(!snapshot||snapshot.id!==id)return;
  current=snapshot;
  $('float-name').textContent=snapshot.name||'CLOCK';
  const percent=proportionRemaining(snapshot);
  const spent=100-percent;
  const color=effectiveColor(snapshot);
  if(snapshot.mode==='stopwatch') {
    $('float-dial').style.background=snapshot.direction==='cw'
      ? 'conic-gradient(from 0deg, '+color+' 0% '+percent+'%, #050505 '+percent+'% 100%)'
      : 'conic-gradient(from 0deg, #050505 0% '+spent+'%, '+color+' '+spent+'% 100%)';
  } else {
    $('float-dial').style.background=snapshot.direction==='cw'
      ? 'conic-gradient(from 0deg, #050505 0% '+spent+'%, '+color+' '+spent+'% 100%)'
      : 'conic-gradient(from 0deg, '+color+' 0% '+percent+'%, #050505 '+percent+'% 100%)';
  }
  let label=snapshot.mode==='stopwatch'?formattedRemaining(snapshot.elapsedMs):
    snapshot.overtimeActive?'+'+formattedRemaining(snapshot.overtimeMs):formattedRemaining(snapshot.remainingMs);
  $('float-readout').textContent=label;
  $('float-readout').classList.toggle('long',label.length>5);
  $('float-readout').hidden=!snapshot.showTime||(snapshot.hideNumbersOnPlay&&snapshot.running);
  $('float-play').textContent=snapshot.running?'Pause':'Play';
  $('float-play').setAttribute('aria-label',snapshot.running?'Pause floating clock':'Start floating clock');
  $('float-ack').hidden=!snapshot.alarmActive;
  $('float-status').textContent=snapshot.alarmActive?'ALARM — ACKNOWLEDGE':
    snapshot.mode==='sequence'||snapshot.mode==='workbreak'?
      snapshot.sequence?.[snapshot.sequenceIndex]?.name||'ACTIVITY':
      snapshot.overtimeActive?'OVERTIME':
      snapshot.ended?'TIME UP':snapshot.running?'RUNNING':'READY';
}
desktop?.onClockSnapshot?.(draw);
$('float-play').addEventListener('click',()=>desktop?.detachedCommand?.('start-pause'));
$('float-reset').addEventListener('click',()=>desktop?.detachedCommand?.('reset'));
$('float-ack').addEventListener('click',()=>desktop?.detachedCommand?.('ack'));
$('float-close').addEventListener('click',()=>desktop?.action?.('close'));
