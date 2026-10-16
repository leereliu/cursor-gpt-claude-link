import {runCli, requireSubscription} from './runner.mjs';

const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const usageArgs=['-p','/usage','--output-format','json','--tools','','--setting-sources','',
  '--settings','{"disableAllHooks":true}','--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
  '--no-chrome','--no-session-persistence'];

export function formatPlan(type) {
  if (!type) return 'Not available';
  const names={max:'Max',pro:'Pro',team:'Team',enterprise:'Enterprise'};
  const key=String(type).toLowerCase();
  return names[key] || String(type);
}

export function zonedDateToEpoch(year, monthIndex, day, hour, minute, timeZone) {
  const utc=Date.UTC(year, monthIndex, day, hour, minute);
  if (!timeZone) return utc;
  try {
    const fmt=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const asUtcParts=date=>{
      const p=Object.fromEntries(fmt.formatToParts(date).map(part=>[part.type,part.value]));
      return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    };
    return utc+(utc-asUtcParts(new Date(utc)));
  } catch { return utc; }
}

export function parseReset(text, now=new Date()) {
  const raw=String(text||'').trim();
  const match=raw.match(/resets\s+([A-Za-z]{3})\s+(\d{1,2}),?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:\(([^)]+)\))?/i);
  if (!match) {
    const fallback=raw.match(/resets\s+(.+)/i);
    return {resetAt:null, resetText:fallback?fallback[1].trim():null};
  }
  const monthIndex=MONTHS[match[1].toLowerCase()];
  if (monthIndex===undefined) return {resetAt:null, resetText:match[0].replace(/^resets\s+/i,'')};
  let hour=Number(match[3])%12;
  if (match[5].toLowerCase()==='pm') hour+=12;
  const minute=Number(match[4]||0);
  const timeZone=match[6]?.trim()||undefined;
  const resetText=raw.replace(/^resets\s+/i,'');
  let year=now.getFullYear();
  let resetAt=zonedDateToEpoch(year, monthIndex, Number(match[2]), hour, minute, timeZone);
  if (resetAt<now.getTime()-2*60*60*1000) resetAt=zonedDateToEpoch(year+1, monthIndex, Number(match[2]), hour, minute, timeZone);
  return {resetAt, resetText};
}

function windowMeta(name) {
  if (/session/i.test(name)) return {id:'session', label:'5-hour session'};
  if (/all models/i.test(name)) return {id:'week', label:'Weekly (all models)'};
  if (/fable/i.test(name)) return {id:'fable', label:'Weekly (Fable)'};
  if (/opus/i.test(name)) return {id:'opus', label:'Weekly (Opus)'};
  if (/sonnet/i.test(name)) return {id:'sonnet', label:'Weekly (Sonnet)'};
  if (/extra/i.test(name)) return {id:'extra', label:'Extra usage'};
  return {id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''), label:name};
}

export function parseUsageWindows(text, now=new Date()) {
  const windows=[];
  for (const line of String(text).split(/\r?\n/)) {
    const match=line.match(/^([^:]+):\s*(\d+(?:\.\d+)?)%\s+used(?:\s*[·•]\s*(.+))?$/i);
    if (!match) continue;
    const name=match[1].trim();
    if (/contribut|approximate|last \d|top mcp/i.test(name)) continue;
    const {id,label}=windowMeta(name);
    const reset=parseReset(match[3]||'', now);
    windows.push({id, label, usedPercent:Number(match[2]), resetAt:reset.resetAt, resetText:reset.resetText});
  }
  return windows;
}

export async function fetchUsage(executable, options={}) {
  const status=await requireSubscription(executable, options);
  const result=await runCli(executable, usageArgs, {...options, timeout:options.timeout??20000});
  const windows=parseUsageWindows(String(result.result||''));
  if (!windows.length) throw new Error('Claude usage data unavailable.');
  return {planType:formatPlan(status.subscriptionType), windows, checkedAt:Date.now()};
}

export function createUsage(executable, options={}) {
  let cached, expires=0, pending;
  return async()=>{
    if (cached && Date.now()<expires) return cached;
    if (!pending) pending=fetchUsage(executable, options).then(usage=>{cached=usage;expires=Date.now()+60000;return usage;}).finally(()=>{pending=undefined;});
    return pending;
  };
}
