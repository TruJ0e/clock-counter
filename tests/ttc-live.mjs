import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import fs from 'node:fs';
const url='https://ttc.trujoedigital.com/';
const browser=await chromium.launch({
  executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true
});
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage();
const errors=[],thirdParty=[],failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
page.on('request',request=>{
  if(!request.url().startsWith(url)&&!request.url().startsWith('https://trutimeclock.pages.dev/'))thirdParty.push(request.url());
});
page.on('requestfailed',request=>failed.push({url:request.url(),reason:request.failure()?.errorText}));
try{
  const response=await page.goto(url,{waitUntil:'networkidle',timeout:25000});
  assert.equal(response.status(),200);
  const headers=response.headers();
  assert.ok(headers['content-security-policy'].includes("connect-src 'none'"));
  assert.ok(headers['content-security-policy'].includes("script-src 'self'"));
  assert.equal(headers['x-frame-options'],'DENY');
  assert.equal(headers['x-content-type-options'],'nosniff');
  assert.equal(headers['referrer-policy'],'no-referrer');
  assert.equal(await page.title(),'TruTimeClock | Free Visual Timer');

  const desktopVersion=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
  const installerUrl='https://github.com/TruJ0e/clock-counter/releases/download/v'+
    desktopVersion+'/TruTimeClock-Setup-'+desktopVersion+'.exe';
  const installerLink=page.locator('#download-trigger');
  await installerLink.waitFor({state:'visible'});
  assert.equal(await installerLink.getAttribute('href'),installerUrl);
  assert.equal(await installerLink.textContent(),'Download');
  assert.equal(await page.locator('#update-trigger').count(),0);

  await page.locator('.clock-tile').first().waitFor();
  assert.equal(await page.locator('.time-readout').first().textContent(),'30:00');
  await page.locator('#add-clock').click();
  assert.equal(await page.locator('.clock-tile').count(),2);
  await page.locator('.clock-tile').nth(1).locator('.minutes-field').fill('12');
  await page.locator('.clock-tile').nth(1).locator('.minutes-field').blur();
  assert.equal(await page.locator('.clock-tile').nth(1).locator('.time-readout').textContent(),'12:00');
  await page.locator('.clock-tile').nth(1).locator('.play-pause').click();
  assert.equal(await page.locator('.clock-tile').nth(1).getAttribute('data-running'),'true');
  await page.locator('#file-trigger').click();
  await page.locator('#menu-library').click();
  assert.equal(await page.locator('#library-dialog').isVisible(),true);
  await page.locator('#library-done').click();
  const privateCode=await page.request.get(url+'main.cjs');
  const api=await page.request.post(url+'api/control');
  const apiGet=await page.request.get(url+'api/control');
  assert.equal(privateCode.status(),404);
  assert.equal(apiGet.status(),404);
  assert.ok([404,405].includes(api.status()));
  // Filter only expected 404 browser console errors caused by negative tests.
  const unexpected=errors.filter(e=>!e.includes('404 (Not Found)'));
  console.log(JSON.stringify({
    status:response.status(),title:await page.title(),
    csp:headers['content-security-policy'],
    hsts:headers['strict-transport-security'],
    contentType:headers['content-type'],
    unexpectedBrowserErrors:unexpected,
    thirdPartyRequests:thirdParty,
    requestFailures:failed,
    apiStatus:api.status(),apiGetStatus:apiGet.status(),sourceStatus:privateCode.status()
  },null,2));
  assert.deepEqual(unexpected,[]);
  assert.deepEqual(thirdParty,[]);
  console.log('PASS LIVE DOMAIN END-TO-END');
}finally{await browser.close();}
