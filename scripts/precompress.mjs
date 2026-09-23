import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
// Compress once during deployment; the small Render instance only streams files.
async function build(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())await build(p);else if(/\.(js|css|html)$/.test(p)){const data=await readFile(p);await writeFile(p+'.gz',gzipSync(data,{level:9}));await writeFile(p+'.br',brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:9}}));}}}
await build('public');console.log('Static assets compressed.');
