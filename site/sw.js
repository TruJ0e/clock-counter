'use strict';
const CACHE_NAME='trutimeclock-static-aabec89d3f89';
const CACHE_PREFIX='trutimeclock-static-';
const STATIC_ASSETS=[
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/pwa.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];
const ALLOWED=new Set(STATIC_ASSETS);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache=>cache.addAll(STATIC_ASSETS))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(names=>Promise.all(
      names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME)
        .map(name=>caches.delete(name))
    )).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const filename=url.pathname==='/'?'/':url.pathname;
  if(!ALLOWED.has(filename))return;
  event.respondWith(
    caches.match(request,{ignoreSearch:true}).then(cached=>{
      if(cached)return cached;
      return fetch(request).then(response=>{
        if(response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).catch(()=>{});
        }
        return response;
      });
    })
  );
});
