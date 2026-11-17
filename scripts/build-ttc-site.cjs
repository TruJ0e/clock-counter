'use strict';
// Build a static, installable, offline-capable website from the shared timer engine.
// No server, account, telemetry, third-party scripts, or desktop-control endpoints.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const desktopVersion = require('../package.json').version;
const releaseRoot = 'https://github.com/TruJ0e/clock-counter/releases/download/v' + desktopVersion + '/';
const windowsURL = releaseRoot + 'TruTimeClock-Setup-' + desktopVersion + '.exe';
const macArmURL = releaseRoot + 'TruTimeClock-Mac-arm64-' + desktopVersion + '.dmg';
const macIntelURL = releaseRoot + 'TruTimeClock-Mac-x64-' + desktopVersion + '.dmg';
const companyURL = 'https://trujoedigital.com/';

execFileSync(process.execPath,[path.join(__dirname,'build-web-lite.cjs')],{cwd:root,stdio:'inherit'});
const source = fs.readFileSync(path.join(root,'web-lite','CLOCK COUNTER WEB LITE.html'),'utf8');
const cssMatch = source.match(/<style>([\s\S]*?)<\/style>/);
const jsMatch = source.match(/<script>([\s\S]*?)<\/script>/);
if(!cssMatch||!jsMatch||(source.match(/<script>/g)||[]).length!==1||(source.match(/<style>/g)||[]).length!==1)
  throw new Error('Unexpected browser edition markup: refusing to create an unchecked site');

const dir=path.join(root,'site');
const icons=path.join(dir,'icons');
fs.mkdirSync(icons,{recursive:true});

const policy=[
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src data: blob:",
  "connect-src 'none'",
  "child-src 'none'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "upgrade-insecure-requests"
].join('; ');

const installDialog = [
  '<dialog id="download-dialog" class="settings-dialog download-dialog" aria-labelledby="download-heading">',
  '  <div class="dialog-header">',
  '    <h2 id="download-heading">GET TRUTIMECLOCK</h2>',
  '    <button id="download-close" class="close-dialog" type="button" aria-label="Close download options">×</button>',
  '  </div>',
  '  <section class="download-option">',
  '    <h3>iPhone and iPad</h3>',
  '    <p>In Safari, tap Share, choose <b>Add to Home Screen</b>, turn on <b>Open as Web App</b>, then tap Add. TruTimeClock will appear as an app on your Home Screen.</p>',
  '    <button id="install-webapp" type="button" class="panel-button primary" hidden>Install Web App</button>',
  '    <p class="download-note">No App Store download or Apple ID is required. Keep the app open for scheduled alarms; iOS may suspend it in the background.</p>',
  '  </section>',
  '  <section class="download-option">',
  '    <h3>Mac</h3>',
  '    <a class="panel-button download-choice" id="download-mac-arm" href="'+macArmURL+'">Download for Apple Silicon (M1–M-series)</a>',
  '    <a class="panel-button download-choice" id="download-mac-intel" href="'+macIntelURL+'">Download for Intel Mac</a>',
  '    <p class="download-note">These builds are not Apple-signed or notarized. Gatekeeper may block them. For an easier installation on macOS Sonoma or later, open this site in Safari and choose File → Add to Dock.</p>',
  '  </section>',
  '  <section class="download-option">',
  '    <h3>Windows</h3>',
  '    <a class="panel-button download-choice" id="download-windows" href="'+windowsURL+'">Download Windows installer</a>',
  '    <p class="download-note">The installed Windows app includes its own weekly update checks.</p>',
  '  </section>',
  '  <div class="dialog-actions"><button class="panel-button primary" id="download-done" type="button">Close</button></div>',
  '</dialog>'
].join('\n');

const websiteStyles = [
  '/* Compact website navigation, install panel, and publisher footer */',
  '#download-trigger{white-space:nowrap;}',
  '.site-footer-link{margin-left:auto;flex:none;color:#e5e5e5;font-size:10px;text-decoration:underline;text-underline-offset:2px;}',
  '.site-footer-link:hover,.help-publisher a:hover{color:#16e600;}',
  '.help-publisher{padding-top:10px;border-top:1px solid #555;}',
  '.help-publisher a{color:#e5e5e5;}',
  '.download-dialog{width:min(480px,calc(100vw - 16px));}',
  '.download-option{border:1px solid #777;padding:9px 11px;margin-bottom:11px;}',
  '.download-option h3{font-size:14px;margin:0 0 7px;}',
  '.download-option p{line-height:1.5;margin:6px 0 10px;font-size:12px;}',
  '.download-option .download-note{font-size:11px;color:#bcbcbc;}',
  '.download-choice{display:block;text-align:center;text-decoration:none;margin:7px 0;font-size:12px;}',
  '#install-webapp:not([hidden]){display:block;width:100%;margin:8px 0;}',
  '@media(max-width:320px){#download-trigger{padding:0 2px;font-size:12px;}.site-footer-link{font-size:9px;}}'
].join('\n');

let html=source
  .replace(cssMatch[0],'<link rel="stylesheet" href="/styles.css">')
  .replace(jsMatch[0],'<script defer src="/app.js"></script>\n<script defer src="/pwa.js"></script>')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
    '<meta http-equiv="Content-Security-Policy" content="'+policy+'">')
  .replace(/<title>.*?<\/title>/,'<title>TruTimeClock | Free Visual Timer</title>')
  .replace('<head>','<head>\n'+[
    '  <meta name="description" content="An accessible visual timer you can install on iPhone, iPad, Mac, or Windows.">',
    '  <meta name="application-name" content="TruTimeClock">',
    '  <meta name="apple-mobile-web-app-capable" content="yes">',
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black">',
    '  <meta name="apple-mobile-web-app-title" content="TruTimeClock">',
    '  <link rel="manifest" href="/manifest.webmanifest">',
    '  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
    '  <link rel="icon" type="image/png" href="/icons/icon-192.png">',
    '  <link rel="canonical" href="https://ttc.trujoedigital.com/">'
  ].join('\n'))
  .replace(/<span class="app-name">CLOCK COUNTER<\/span>/,'<span class="app-name">TRUTIMECLOCK</span>')
  .replace(/<button id="update-trigger"[^>]*>Update<\/button>/,
    '<button id="download-trigger" class="menu-trigger download-trigger" type="button" aria-haspopup="dialog" aria-controls="download-dialog">Download</button>')
  .replace('<span class="status-hint">Drag corner to resize</span>',
    '<a id="site-trujoe-link" class="site-footer-link" href="'+companyURL+'" target="_blank" rel="noopener noreferrer">TruJoe Digital</a>\n      <span class="status-hint">Drag corner to resize</span>')
  .replace('<button id="help-done"',
    '<p class="help-publisher">Made by <a id="help-trujoe-link" href="'+companyURL+'" target="_blank" rel="noopener noreferrer">TruJoe Digital</a></p>\n    <button id="help-done"')
  .replace('</body>',installDialog+'\n</body>');
if(!html.includes('id="download-trigger"')||html.includes('id="update-trigger"')||
   !html.includes('id="site-trujoe-link"')||!html.includes('id="help-trujoe-link"'))
  throw new Error('Download and TruJoe Digital links failed to render');

fs.writeFileSync(path.join(dir,'index.html'),html);
fs.writeFileSync(path.join(dir,'styles.css'),cssMatch[1].trimEnd()+'\n'+websiteStyles+'\n');
fs.writeFileSync(path.join(dir,'app.js'),jsMatch[1].trimEnd()+'\n');
fs.writeFileSync(path.join(dir,'pwa.js'),fs.readFileSync(path.join(root,'src','pwa-site.js'),'utf8'));
const workerTemplate=fs.readFileSync(path.join(root,'src','pwa-worker.js'),'utf8');
const staticHash=crypto.createHash('sha256')
  .update(html).update(cssMatch[1]).update(jsMatch[1])
  .update(fs.readFileSync(path.join(root,'src','pwa-site.js')))
  .digest('hex').slice(0,12);
fs.writeFileSync(path.join(dir,'sw.js'),
  workerTemplate.replace('TRUTIMECLOCK_STATIC_CACHE_NAME','trutimeclock-static-'+staticHash));
const manifest={
  name:'TruTimeClock',
  short_name:'TruTimeClock',
  description:'Accessible visual timers, activity schedules and stopwatches',
  start_url:'/',
  scope:'/',
  display:'standalone',
  background_color:'#050505',
  theme_color:'#050505',
  orientation:'any',
  lang:'en',
  categories:['productivity','education','utilities'],
  icons:[
    {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},
    {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}
  ]
};
fs.writeFileSync(path.join(dir,'manifest.webmanifest'),JSON.stringify(manifest,null,2)+'\n');
for(const [file,sourceName] of [
  ['icon-192.png','app-icon-192.png'],
  ['icon-512.png','app-icon-512.png'],
  ['apple-touch-icon.png','apple-touch-icon.png']
])fs.copyFileSync(path.join(root,'assets',sourceName),path.join(icons,file));
const workerCsp="default-src 'none'; connect-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'";
const headers=[
  '/*',
  '  Content-Security-Policy: '+policy+"; frame-ancestors 'none'",
  '  Strict-Transport-Security: max-age=31536000',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)',
  '  Cross-Origin-Resource-Policy: same-origin',
  '  Cross-Origin-Opener-Policy: same-origin',
  '  Cache-Control: public, no-transform, max-age=300',
  '',
  '/index.html',
  '  Cache-Control: public, no-transform, max-age=0, must-revalidate',
  '',
  '/sw.js',
  '  Content-Security-Policy: '+workerCsp,
  '  Cache-Control: public, no-transform, max-age=0, must-revalidate',
  '',
  '/manifest.webmanifest',
  '  Cache-Control: public, no-transform, max-age=300',
  ''
].join('\n');
fs.writeFileSync(path.join(dir,'_headers'),headers);
fs.writeFileSync(path.join(dir,'robots.txt'),
  ['User-agent: *','Allow: /','Sitemap: https://ttc.trujoedigital.com/sitemap.xml',''].join('\n'));
fs.writeFileSync(path.join(dir,'sitemap.xml'),
  ['<?xml version="1.0" encoding="UTF-8"?>',
   '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ttc.trujoedigital.com/</loc></url></urlset>',''].join('\n'));
fs.writeFileSync(path.join(dir,'404.html'),
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>404 | TruTimeClock</title></head>'+
  '<body><h1>404 - Page not found</h1><p><a href="/">Return to TruTimeClock</a></p></body></html>');
for(const name of fs.readdirSync(dir)){
  const file=path.join(dir,name);
  if(fs.statSync(file).isFile())console.log(name+' '+fs.statSync(file).size+' bytes');
}
console.log('Static site output: '+dir);
