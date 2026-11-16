// Local wall-clock scheduling helpers. No network calls or timezone database required.
export function nextLocalStartTime(text, nowMs=Date.now()) {
  if(typeof text!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)||!Number.isFinite(nowMs))
    return null;
  const [hours,minutes]=text.split(':').map(Number);
  const now=new Date(nowMs);
  const candidate=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hours,minutes,0,0);
  // Spring DST skips certain local minutes; never silently change the requested time.
  if(candidate.getHours()!==hours||candidate.getMinutes()!==minutes)return null;
  if(candidate.getTime()<=nowMs)candidate.setDate(candidate.getDate()+1);
  if(candidate.getHours()!==hours||candidate.getMinutes()!==minutes)return null;
  return candidate.getTime();
}
export function nextHourInput(nowMs=Date.now()) {
  const d=new Date(nowMs);
  d.setHours(d.getHours()+1,0,0,0);
  return String(d.getHours()).padStart(2,'0')+':00';
}
export function scheduledTimeText(epochMs,nowMs=Date.now()) {
  if(!Number.isFinite(epochMs))return '';
  const target=new Date(epochMs);
  const time=target.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  const start=new Date(nowMs);start.setHours(0,0,0,0);
  const targetDay=new Date(epochMs);targetDay.setHours(0,0,0,0);
  const which=targetDay.getTime()===start.getTime()?'TODAY':'TOMORROW';
  return time+' '+which;
}
