'use strict';
/** Produce identical offline web assets for Android and iOS native wrappers. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
cp.execFileSync(process.execPath,[path.join(__dirname,'build-ttc-site.cjs')],
  {cwd:root,stdio:'inherit'});
const source=path.join(root,'site');
const output=[
  path.join(root,'mobile','android','app','src','main','assets'),
  path.join(root,'mobile','ios','Web')
];
const files=['app.js','styles.css'];
let html=fs.readFileSync(path.join(source,'index.html'),'utf8');
html=html
  .replace(/<script defer src="\/pwa.js"><\/script>/,'')
  .replace(/<script defer src="\/app.js"><\/script>/,
    '<script defer src="./mobile-bridge.js"></script>\n<script defer src="./app.js"></script>')
  .replace(/href="\/styles.css"/g,'href="./styles.css"')
  .replace(/href="\/manifest.webmanifest"/g,'href="./manifest.webmanifest"')
  .replace(/href="\/icons\//g,'href="./icons/')
  .replace(/<link rel="canonical"[^>]*>/,'')
  .replace(/<button id="download-trigger"[^>]*>Download<\/button>/,'')
  .replace(/<dialog id="download-dialog"[\s\S]*?<\/dialog>/,'')
  .replace(/<a id="site-trujoe-link"[^>]*>TruJoe Digital<\/a>/,
    '<a id="site-trujoe-link" class="site-footer-link" href="https://trujoedigital.com/" target="_blank" rel="noopener noreferrer">TruJoe Digital</a>');
// Web app is bundled inside the native app and never loads scripts from network.
if(html.includes('src="/app.js"')||html.includes('id="download-dialog"'))
  throw new Error('Unexpected native bundle layout');
const js=fs.readFileSync(path.join(source,'app.js'),'utf8');
const css=fs.readFileSync(path.join(source,'styles.css'),'utf8')+'\n.window-controls,#download-trigger{display:none!important;}\n';
const bridge=fs.readFileSync(path.join(root,'mobile','shared','mobile-bridge.js'),'utf8');
const meta={version:require('../package.json').version,sha256:crypto.createHash('sha256')
  .update(html).update(js).update(css).update(bridge).digest('hex')};
const androidIcon=path.join(root,'mobile','android','app','src','main','res','drawable-nodpi');
fs.mkdirSync(androidIcon,{recursive:true});
fs.copyFileSync(path.join(source,'icons','icon-192.png'),path.join(androidIcon,'app_icon.png'));
const appIconPath=path.join(root,'mobile','ios','TruTimeClock','Assets.xcassets','AppIcon.appiconset');
fs.mkdirSync(appIconPath,{recursive:true});
fs.copyFileSync(path.join(root,'assets','app-icon-1024.png'),path.join(appIconPath,'icon-1024.png'));
for(const dst of output){
  fs.mkdirSync(path.join(dst,'icons'),{recursive:true});
  fs.writeFileSync(path.join(dst,'index.html'),html);
  for(const name of files)fs.copyFileSync(path.join(source,name),path.join(dst,name));
  fs.copyFileSync(path.join(root,'mobile','shared','mobile-bridge.js'),
    path.join(dst,'mobile-bridge.js'));
  for(const icon of ['icon-192.png','icon-512.png','apple-touch-icon.png'])
    fs.copyFileSync(path.join(source,'icons',icon),path.join(dst,'icons',icon));
  fs.writeFileSync(path.join(dst,'bundle.json'),JSON.stringify(meta,null,2)+'\n');
  console.log('Mobile offline bundle: '+path.relative(root,dst));
}
