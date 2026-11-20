import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';

const root=path.resolve(import.meta.dirname,'..');
const android=path.join(root,'mobile','android','app','src','main','assets');
const apple=path.join(root,'mobile','ios','Web');
for(const name of ['index.html','styles.css','app.js','mobile-bridge.js','bundle.json']) {
  const a=await fs.readFile(path.join(android,name));
  const b=await fs.readFile(path.join(apple,name));
  assert.deepEqual(a,b,'Android/iOS bundle differs: '+name);
}
const html=await fs.readFile(path.join(android,'index.html'),'utf8');
assert.ok(html.includes('src="./mobile-bridge.js"'));
assert.ok(html.includes('src="./app.js"'));
assert.ok(!html.includes('id="download-dialog"'));
assert.ok(html.includes("connect-src 'none'"));
const server=http.createServer(async(req,res)=>{
  const name=req.url?.replace(/^\//,'')||'index.html';
  if(!/^(index\.html|app\.js|styles\.css|mobile-bridge\.js|icons\/(icon-192|icon-512|apple-touch-icon)\.png)$/.test(name)){
    res.writeHead(404);res.end();return;
  }
  const file=await fs.readFile(path.join(android,name));
  res.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript':
    name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html'});
  res.end(file);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/index.html';
const browser=await chromium.launch({
  executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless:true
});
try {
  for(const platform of ['android','ios']){
    const context=await browser.newContext();
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.addInitScript(p=>{
      window.__mobileCaptures=[];
      if(p==='android') window.ClockBridge={
        updateClock(payload){window.__mobileCaptures.push(JSON.parse(payload));}
      };
      else window.webkit={messageHandlers:{clock:{
        postMessage(payload){window.__mobileCaptures.push(payload);}
      }}};
    },platform);
    const resp=await page.goto(url,{waitUntil:'load'});
    assert.equal(resp.status(),200);
    await page.locator('.clock-tile').first().waitFor();
    assert.equal(await page.locator('.time-readout').first().textContent(),'30:00');
    await page.waitForFunction(()=>window.__mobileCaptures.length>0);
    const initial=await page.evaluate(()=>window.__mobileCaptures.at(-1));
    assert.equal(initial.remainingMs,1800000);
    assert.equal(initial.running,false);
    await page.locator('.clock-tile').first().locator('.play-pause').click();
    await page.waitForFunction(()=>window.__mobileCaptures.some(s=>s.running===true));
    const running=await page.evaluate(()=>window.__mobileCaptures.at(-1));
    assert.equal(running.running,true);
    assert.ok('startedAtMs' in running,'Native bridge must include stopwatch baseline');
    assert.ok(running.deadlineMs>Date.now());
    assert.ok(running.deadlineMs<Date.now()+1810000);
    assert.deepEqual(errors,[],'uncaught error in '+platform+' web bridge');
    await context.close();
    console.log('PASS '+platform+' bundled clock bridge receives running timer without network APIs');
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
console.log('PASS identical offline bundles for Android and iOS');
