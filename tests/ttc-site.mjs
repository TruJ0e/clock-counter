import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const base=path.join(root,'site');
const headersFile=await fs.readFile(path.join(base,'_headers'),'utf8');
const lines=headersFile.split(/\r?\n/);
const headers={};
for(const line of lines){
  const match=line.match(/^\s{2}([A-Za-z-]+):\s*(.+)$/);
  if(match&&!(match[1] in headers))headers[match[1]]=match[2];
}
const swSection=lines.indexOf('/sw.js');
const swCsp=swSection<0 ? null : (
  lines.slice(swSection+1).find(line=>line.trim().startsWith('Content-Security-Policy: '))||''
).trim().replace(/^Content-Security-Policy:\s*/, '');
const mime={'index.html':'text/html;charset=utf-8','app.js':'application/javascript;charset=utf-8',
  'pwa.js':'application/javascript;charset=utf-8','sw.js':'application/javascript;charset=utf-8',
  'styles.css':'text/css;charset=utf-8','robots.txt':'text/plain;charset=utf-8',
  'manifest.webmanifest':'application/manifest+json;charset=utf-8',
  'icons/icon-192.png':'image/png','icons/icon-512.png':'image/png',
  'icons/apple-touch-icon.png':'image/png'};
const allowed=new Set(Object.keys(mime));
const server=http.createServer(async(req,res)=>{
  const name=req.url==='/'?'index.html':req.url?.slice(1).split('?')[0];
  if(!allowed.has(name)||!['GET','HEAD'].includes(req.method)){
    res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Not found');return;
  }
  const file=await fs.readFile(path.join(base,name));
  res.writeHead(200,{'Content-Type':mime[name],...headers,
    ...(name==='sw.js'&&swCsp?{'Content-Security-Policy':swCsp}:{})});
  if(req.method==='HEAD')res.end();else res.end(file);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const origin='http://127.0.0.1:'+port;
const browser=await chromium.launch({
  executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true
});
const page=await browser.newPage({acceptDownloads:true});
const errors=[],externalRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('request',request=>{
  if(!request.url().startsWith(origin+'/'))externalRequests.push(request.url());
});
try{
  const response=await page.goto(origin+'/');
  assert.equal(response.status(),200);
  assert.ok(response.headers()['content-security-policy'].includes("script-src 'self'"));
  assert.ok(response.headers()['content-security-policy'].includes("connect-src 'none'"));
  assert.equal(response.headers()['x-frame-options'],'DENY');
  assert.equal(response.headers()['x-content-type-options'],'nosniff');
  assert.equal(response.headers()['referrer-policy'],'no-referrer');
  assert.equal(await page.title(),'TruTimeClock | Free Visual Timer');

  const downloadButton=page.locator('#download-trigger');
  await downloadButton.waitFor({state:'visible'});
  assert.equal(await downloadButton.textContent(),'Download');
  assert.equal(await page.locator('#update-trigger').count(),0);
  const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
  const release='https://github.com/TruJ0e/clock-counter/releases/download/v'+version+'/';
  const helpRect=await page.locator('#help-trigger').boundingBox();
  const downloadRect=await downloadButton.boundingBox();
  assert.ok(downloadRect.x>=helpRect.x+helpRect.width-1,'Download must be right of Help');
  await downloadButton.click();
  assert.equal(await page.locator('#download-dialog').isVisible(),true);
  assert.equal(await page.locator('#download-windows').getAttribute('href'),
    release+'TruTimeClock-Setup-'+version+'.exe');
  assert.equal(await page.locator('#download-mac-arm').getAttribute('href'),
    release+'TruTimeClock-Mac-arm64-'+version+'.dmg');
  assert.equal(await page.locator('#download-mac-intel').getAttribute('href'),
    release+'TruTimeClock-Mac-x64-'+version+'.dmg');
  assert.ok((await page.locator('#download-dialog').textContent()).includes('Add to Home Screen'));
  await page.locator('#download-done').click();
  assert.equal(await page.locator('#download-dialog').isVisible(),false);
  const company='https://trujoedigital.com/';
  assert.equal(await page.locator('#site-trujoe-link').getAttribute('href'),company);
  await page.locator('#help-trigger').click();
  assert.equal(await page.locator('#help-trujoe-link').getAttribute('href'),company);
  await page.locator('#help-done').click();
  const manifestResponse=await page.request.get(origin+'/manifest.webmanifest');
  assert.equal(manifestResponse.status(),200);
  const manifest=await manifestResponse.json();
  assert.equal(manifest.name,'TruTimeClock');
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.length>=2);
  assert.ok((await page.request.get(origin+'/icons/apple-touch-icon.png')).ok());
  assert.ok((await page.request.get(origin+'/sw.js')).ok());
  assert.ok(response.headers()['content-security-policy'].includes("worker-src 'self'"));

  // Cache the full app as a service worker, then launch without network.
  await page.waitForFunction(()=>{
    if(!('serviceWorker' in navigator))return false;
    return !!navigator.serviceWorker.controller;
  },undefined,{timeout:12000});
  await page.context().setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.clock-tile').first().waitFor({timeout:10000});
  assert.equal(await page.title(),'TruTimeClock | Free Visual Timer');
  await page.context().setOffline(false);
  // CSS and app script remain cached offline. All paths are same-origin.

  await page.locator('.clock-tile').first().waitFor({timeout:15000});
  assert.equal(await page.locator('.clock-tile .time-readout').first().textContent(),'30:00');
  await page.locator('#add-clock').click();
  assert.equal(await page.locator('.clock-tile').count(),2);
  await page.locator('.clock-tile').nth(1).locator('.minutes-field').fill('4');
  await page.locator('.clock-tile').nth(1).locator('.minutes-field').blur();
  assert.equal(await page.locator('.clock-tile').nth(1).locator('.time-readout').textContent(),'04:00');
  await page.locator('.clock-tile').nth(1).locator('.play-pause').click();
  assert.equal(await page.locator('.clock-tile').nth(1).getAttribute('data-running'),'true');
  await page.locator('#file-trigger').click();
  await page.locator('#menu-library').click();
  await page.locator('#preset-name').fill('Reading');
  await page.locator('#preset-minutes').fill('6');
  await page.locator('#preset-save').click();
  assert.ok((await page.locator('#presets-list').textContent()).includes('Reading'));
  await page.locator('#library-done').click();
  await page.locator('#file-trigger').click();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#menu-export').click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'clock-counter-setup.json');

  // The published website uses exactly the same wall-clock scheduling model.
  await page.locator('#all-reset').click();
  await page.clock.install({time:new Date(2026,10,16,16,56)});
  const scheduledTile=page.locator('.clock-tile').first();
  await scheduledTile.locator('.schedule-time').fill('17:00');
  await scheduledTile.locator('.schedule-set').click();
  assert.equal(await scheduledTile.getAttribute('data-scheduled'),'true');
  assert.equal(await scheduledTile.getAttribute('data-running'),'false');
  assert.match(await scheduledTile.locator('.mode-readout').textContent(),/START.*5:00\s*PM/);
  await page.clock.fastForward(4*60000+2000);
  await page.clock.runFor(300);
  assert.equal(await scheduledTile.getAttribute('data-scheduled'),'false');
  assert.equal(await scheduledTile.getAttribute('data-running'),'true');
  const timed=await scheduledTile.locator('.time-readout').textContent();
  assert.ok(['29:57','29:58','29:59'].includes(timed),'site should count from 5 PM, got '+timed);

  // This app must not expose a backend or a path to the user's computer.
  const api=await page.request.post(origin+'/api/remote-control');
  assert.equal(api.status(),404);
  const src=await page.request.get(origin+'/.env');
  assert.equal(src.status(),404);
  const cloud=await page.request.get(origin+'/main.cjs');
  assert.equal(cloud.status(),404);
  // Scripts supplied by visitors are blocked by the browser's CSP.
  const attempted=await page.evaluate(async()=>{
    document.head.insertAdjacentHTML('beforeend','<script>window.__ttcInjected = true;<\/script>');
    await Promise.resolve();
    return window.__ttcInjected===true;
  });
  assert.equal(attempted,false);
  assert.deepEqual(externalRequests,[]);
  // CSP deliberately blocks our injected XSS test; ignore that expected browser console warning.
  assert.deepEqual(errors.filter(s=>!s.includes('Content Security Policy')&&!s.includes('Content-Security-Policy')&&!s.includes('404 (Not Found)')),[]);
  console.log('PASS TruTimeClock static site: security headers, CSP, no third-party requests, no API, timer controls, saved presets and downloads.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
