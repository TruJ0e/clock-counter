'use strict';
// Conservative audit before publishing repository history. Never print secret values.
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const git=(args,options={})=>execFileSync('git',args,{cwd:root,maxBuffer:12*1024*1024,...options});
const commits=git(['rev-list','--all'],{encoding:'utf8'}).trim().split(/\s+/);
const checks=[
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['github-token',/(?:github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,})/],
  ['openai-key',/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{38,}/],
  ['cloudflare-key',/(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{18,}/i],
  ['aws-access-key',/AKIA[0-9A-Z]{16}/],
  ['jwt',/eyJ[A-Za-z0-9_-]{25,}\.eyJ[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{15,}/],
  ['credentials',/(?:client_secret|private_key|access_token)\s*[:=]\s*['"][A-Za-z0-9_+\/-]{24,}/i],
  ['hardcoded-personal-path',/C:\\Users\\[^\\]+\\(?:AppData|\.ssh|\.aws|Documents\\(?:Private|Secrets))/i]
];
const unsafePath=/(^|\/)(?:\.env(?:\..+)?|\.npmrc|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|credentials(?:\.json)?|secrets(?:\.json)?|.*\.(?:pem|p12|pfx|key|sqlite|db))$/i;
const seen=new Set();
const findings=[];
let bytes=0;
for(const commit of commits){
  const files=git(['ls-tree','-r','--name-only',commit],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  for(const file of files){
    if(unsafePath.test(file))findings.push({reason:'sensitive-path',commit:commit.slice(0,8),file});
    if(seen.has(commit+':'+file))continue;
    seen.add(commit+':'+file);
    const buffer=git(['show',commit+':'+file]);
    bytes+=buffer.length;
    if(buffer.length>2*1024*1024||buffer.includes(0))continue;
    const content=buffer.toString('utf8');
    for(const [reason,re] of checks){
      if(re.test(content))findings.push({reason,commit:commit.slice(0,8),file});
    }
  }
}
console.log(JSON.stringify({commits:commits.length,objectsScanned:seen.size,
  inspectedMiB:+(bytes/1024/1024).toFixed(2),findings},null,2));
if(findings.length)process.exitCode=1;
