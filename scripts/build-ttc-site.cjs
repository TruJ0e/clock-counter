'use strict';
// Generate a static website from the proven offline browser edition.
// Only three browser assets are published; no Electron/native services.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname,'build-web-lite.cjs')], {cwd:root,stdio:'inherit'});
const source = fs.readFileSync(path.join(root,'web-lite','CLOCK COUNTER WEB LITE.html'),'utf8');
const cssMatch = source.match(/<style>([\s\S]*?)<\/style>/);
const jsMatch = source.match(/<script>([\s\S]*?)<\/script>/);
if (!cssMatch || !jsMatch || (source.match(/<script>/g)||[]).length!==1 || (source.match(/<style>/g)||[]).length!==1)
  throw new Error('Unexpected browser-edition markup: refusing to produce unverified output');
const dir = path.join(root,'site');
fs.mkdirSync(dir,{recursive:true});
const brand = 'TruTimeClock';
const description = 'A tiny, private, accessible visual clock with independent timers, stopwatch, schedules, presets and offline alarms.';
const policy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src data: blob:",
  "connect-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "upgrade-insecure-requests"
].join('; ');
let html=source.replace(cssMatch[0],'<link rel="stylesheet" href="/styles.css">')
  .replace(jsMatch[0],'<script defer src="/app.js"></script>')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
    '<meta http-equiv="Content-Security-Policy" content="'+policy+'">')
  .replace(/<title>.*?<\/title>/,'<title>'+brand+' | Free Visual Timer</title>')
  .replace('<head>','<head>\n  <meta name="description" content="'+description+'">\n  <meta name="application-name" content="'+brand+'">\n  <link rel="canonical" href="https://ttc.trujoedigital.com/">')
  .replace(/<span class="app-name">CLOCK COUNTER<\/span>/,'<span class="app-name">TRUTIMECLOCK</span>');
fs.writeFileSync(path.join(dir,'index.html'),html);
fs.writeFileSync(path.join(dir,'styles.css'),cssMatch[1].trimEnd()+'\n');
fs.writeFileSync(path.join(dir,'app.js'),jsMatch[1].trimEnd()+'\n');
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
  ''
].join('\n');
fs.writeFileSync(path.join(dir,'_headers'),headers);
fs.writeFileSync(path.join(dir,'robots.txt'),
  ['User-agent: *','Allow: /','Sitemap: https://ttc.trujoedigital.com/sitemap.xml',''].join('\n'));
fs.writeFileSync(path.join(dir,'sitemap.xml'),
  ['<?xml version="1.0" encoding="UTF-8"?>',
   '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://ttc.trujoedigital.com/</loc></url></urlset>',''].join('\n'));
// A top-level 404.html disables Cloudflare Pages' implicit SPA fallback.
// Unknown routes must be 404, not the timer app with a misleading 200 status.
const notFound='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>404 | TruTimeClock</title></head><body>'+
  '<h1>404 — Page not found</h1><p><a href="/">Return to TruTimeClock</a></p>'+
  '</body></html>';
fs.writeFileSync(path.join(dir,'404.html'),notFound);
for (const name of fs.readdirSync(dir)) {
  const file=path.join(dir,name);
  console.log(name+' '+fs.statSync(file).size+' bytes');
}
console.log('Output directory: '+dir);
