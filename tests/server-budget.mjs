import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
execFileSync(process.execPath,['scripts/precompress.mjs']);
const server=spawn(process.execPath,['--max-old-space-size=128','--require','./tests/server-metrics.cjs','server.mjs'],{env:{...process.env,PORT:'10004',NODE_ENV:'production'},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
const base='http://127.0.0.1:10004',metrics=()=>new Promise(resolve=>{server.once('message',resolve);server.send('metrics');});
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const response=await fetch(base+'/src/engine.js',{headers:{'accept-encoding':'br,gzip'}});assert.equal(response.headers.get('content-encoding'),'br');const text=await response.text();assert.equal(text,await readFile('public/src/engine.js','utf8'));
 const cached=await fetch(base+'/src/engine.js',{headers:{'accept-encoding':'br','if-none-match':response.headers.get('etag')}});assert.equal(cached.status,304);
 const head=await fetch(base+'/src/engine.js',{method:'HEAD',headers:{'accept-encoding':'gzip'}});assert.equal(head.headers.get('content-encoding'),'gzip');assert.equal(await head.text(),'');
 const before=await metrics(),start=performance.now();let peak=before.rss;
 // Ten asset requests/second, including repeated large bundles, on the production server.
 for(let i=0;i<50;i++){const r=await fetch(base+(i%2?'/src/engine.js':'/src/main.js'),{headers:{'accept-encoding':'br'}});assert.equal(r.status,200);await r.arrayBuffer();if(i%10===0)peak=Math.max(peak,(await metrics()).rss);await new Promise(r=>setTimeout(r,100));}
 const after=await metrics(),seconds=(performance.now()-start)/1000;peak=Math.max(peak,after.rss);const cpuSeconds=(after.cpu.user+after.cpu.system-before.cpu.user-before.cpu.system)/1e6;
 assert.ok(peak<512*1024*1024,'Server exceeded the 512 MB target');
 const report={requests:50,seconds:+seconds.toFixed(2),peakRSS_MB:+(peak/1024/1024).toFixed(2),cpuSeconds:+cpuSeconds.toFixed(3),averageCPUCores:+(cpuSeconds/seconds).toFixed(4),heapLimitMB:128,note:'Local Node measurement, not a Render production capacity guarantee.'};await writeFile('artifacts/server-budget.json',JSON.stringify(report,null,2));console.log('PASS:',report);
}finally{server.kill();}
