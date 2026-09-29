import fs from 'fs'; import path from 'path';
const files=[];(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())w(p);else if(/\.(svelte|ts)$/.test(e.name))files.push(p)}})('src');
for(const f of files){const L=fs.readFileSync(f,'utf8').split('\n');L.forEach((l,i)=>{
 if(!/\brounded(-(sm|md|lg|xl|2xl))?\b/.test(l))return;
 if(!/(^|[\s"'`{])border(-dashed)?([\s"'`}]|$)/.test(l))return;
 if(/\bbg-/.test(l))return;
 if(/border-input/.test(l))return;
 const tag=(l.match(/<(\w+)/)||[])[1]||'?';
 if(['button','a','span','img','input','select','textarea','kbd','code'].includes(tag))return;
 console.log(`${f}:${i+1} [${tag}] ${l.trim().slice(0,140)}`)})}
