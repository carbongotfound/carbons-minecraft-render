import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountSaves,accountSaveKey} from '../public/src/account-saves.js';
const storage=()=>{const data=new Map;return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
function fixture(){globalThis.localStorage=storage();globalThis.sessionStorage=storage();const rows=new Map;let conflict=null;
 const g={net:{client:{rpc:async(_name,p)=>{let row=rows.get(p.p_id);if(!row){row={state:null,revision:0};rows.set(p.p_id,row);}if(p.p_op==='load'){row.writer=p.p_writer;return {data:{owner:p.p_id,state:row.state,revision:row.revision}};}if(row.writer!==p.p_writer)return {data:{ok:false,reason:'account_open_elsewhere'}};assert.equal(p.p_revision,row.revision);row.state=p.p_state;row.revision++;return {data:{ok:true,owner:p.p_id,revision:row.revision}};}}}};
 const make=()=>{const client=new AccountSaves(g,{apply:s=>client.loaded=s,onConflict:r=>conflict=r});return client;};return {g,rows,make,get conflict(){return conflict}};}
test('account saves follow the account ID across devices and never inherit another account',async()=>{
 const f=fixture(),a=f.make();await a.load({id:'A',token:'A'});a.queue({inventory:[{id:'diamond',count:4}],xp:20});await a.flush();
 const b=f.make();await b.load({id:'B',token:'B'},{legacy:{inventory:[{id:'diamond',count:99}]}});assert.deepEqual(b.loaded,{});
 const other=f.make();await other.load({id:'A',token:'A'});assert.equal(other.loaded.inventory[0].count,4);
 a.queue({inventory:[],xp:0});await assert.rejects(a.flush(),/opened elsewhere/);assert.equal(f.conflict,'account_open_elsewhere');assert.equal(f.rows.get('A').state.xp,20);
});
test('legacy saves migrate only with explicit verified ownership',async()=>{
 const f=fixture(),a=f.make();await a.load({id:'A',token:'A'},{legacy:{xp:6},allowLegacy:true});assert.equal(a.loaded.xp,6);
 const b=f.make();await b.load({id:'B',token:'B'},{legacy:{xp:6},allowLegacy:false});assert.deepEqual(b.loaded,{});
});
test('newer server data wins over stale local recovery',async()=>{
 const f=fixture();f.rows.set('A',{revision:3,state:{inventory:[],xp:40}});
 localStorage.setItem(accountSaveKey('A'),JSON.stringify({revision:2,dirty:true,state:{inventory:[],xp:8}}));
 const a=f.make();await a.load({id:'A',token:'A'});assert.equal(a.loaded.xp,40);
});
test('saving during an in-flight write preserves the newer snapshot',async()=>{
 const f=fixture(),a=f.make();await a.load({id:'A',token:'A'});const original=f.g.net.client.rpc;let release;f.g.net.client.rpc=async(...args)=>{await new Promise(r=>release=r);return original(...args);};
 a.queue({inventory:[],xp:1});const first=a.flush();a.queue({inventory:[],xp:2});f.g.net.client.rpc=original;release();await first;assert.equal(f.rows.get('A').state.xp,2);assert.equal(f.rows.get('A').revision,2);
});
