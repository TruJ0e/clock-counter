'use strict';
/**
 * Native mobile timer state bridge.
 * Messages are local to the embedded WebView; no server/API is involved.
 * Only the selected clock is sent, at most once a second during a countdown.
 */
(function(){
  let lastKey='',lastAt=0;
  function snapshot(clock) {
    if(!clock||typeof clock!=='object')return null;
    const title=String(clock.name||'TruTimeClock').slice(0,36);
    const mode=String(clock.mode||'countdown');
    const deadline=Number.isFinite(clock.deadlineMs)?clock.deadlineMs:null;
    const start=Number.isFinite(clock.scheduledStartMs)?clock.scheduledStartMs:null;
    const running=clock.running===true;
    return {
      id:String(clock.id||'clock').slice(0,40),
      name:title,
      mode,
      color:/^#[0-9a-fA-F]{6}$/.test(clock.color)?clock.color:'#F20B14',
      running,
      scheduledStartMs:start,
      deadlineMs:deadline,
      startedAtMs:Number.isFinite(clock.startedAtMs)?clock.startedAtMs:null,
      remainingMs:Math.max(0,Math.round(Number(clock.remainingMs)||0)),
      elapsedMs:Math.max(0,Math.round(Number(clock.elapsedMs)||0)),
      durationMs:Math.max(0,Math.round((Number(clock.durationSeconds)||0)*1000)),
      ended:clock.ended===true
    };
  }
  function sendClock(clock) {
    const data=snapshot(clock);
    if(!data)return;
    const key=[data.id,data.name,data.mode,data.running,data.deadlineMs,
      data.scheduledStartMs,data.durationMs,data.color,data.ended].join('|');
    const now=Date.now();
    if(key===lastKey&&now-lastAt<1000)return;
    lastKey=key;lastAt=now;
    try {
      if(window.ClockBridge?.updateClock)
        window.ClockBridge.updateClock(JSON.stringify(data));
      else if(window.webkit?.messageHandlers?.clock)
        window.webkit.messageHandlers.clock.postMessage(data);
    } catch(_) {}
  }
  window.TruTimeClockMobile={clockChanged:sendClock};
})();
