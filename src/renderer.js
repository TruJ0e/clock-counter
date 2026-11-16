import {
  MAX_CLOCKS, COLOR_PALETTE, newClock, restoreClocks, exportClocks,
  setDurationParts, setDuration, setOptions, startClock, tickClock,
  pauseClock, resetClock, proportionRemaining, setMode,
  buildWorkBreakSequence, effectiveColor, acknowledgeAlarm,
  TASK_ICONS
} from './clocks.js';
import { restoreLibrary, cleanPreset, cleanCollection, createBackup, importBackup } from './library.js';
import { clampParts, partsFromDuration, formattedRemaining, elapsedPercentage } from './timer-core.js';
import { primeAudio, playAlarm } from './alarms.js';

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

const updateButton=$('update-trigger');
function displayUpdateStatus(info){
  if(!updateButton||!info||typeof info.phase!=='string')return;
  const busy=info.phase==='checking'||info.phase==='downloading';
  updateButton.textContent=info.phase==='ready'?'Update ready':
    info.phase==='downloading'?'Updating…':busy?'Checking…':'Update';
  updateButton.disabled=busy;
  if(info.message) {
    updateButton.title=info.message;
    updateStatus(String(info.message).slice(0,100));
  }
}
updateButton?.addEventListener('click',async()=>{
  if(!desktop?.checkForUpdates){
    updateStatus('Updates require the Windows installer');
    return;
  }
  displayUpdateStatus({phase:'checking',message:'CHECKING FOR UPDATES'});
  try{
    const result=await desktop.checkForUpdates();
    if(result)displayUpdateStatus(result);
  }catch{
    displayUpdateStatus({phase:'error',message:'UPDATE CHECK FAILED — TRY AGAIN'});
  }
});
desktop?.onUpdateStatus?.(displayUpdateStatus);
desktop?.getUpdateStatus?.().then(info=>{
  if(info&&info.phase!=='idle'&&info.phase!=='unavailable')displayUpdateStatus(info);
}).catch(()=>{});

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
