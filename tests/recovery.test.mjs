import test from 'node:test';
import assert from 'node:assert/strict';
import {backupSave,localBackups,rememberAccount,savedAccounts,restoreDeviceLogin} from '../public/src/save-recovery.js';
const storage=()=>{const data=new Map;return {get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const setup=()=>{globalThis.localStorage=storage();globalThis.sessionStorage=storage();};
test('recovery finds legacy progress and other accounts without changing the originals',()=>{
 setup();const old={inventory:[{id:'diamond',count:64}],xp:100};localStorage.setItem('carbon-survival-v1',JSON.stringify(old));localStorage.setItem('carbon-save-account:B',JSON.stringify({state:{inventory:[{id:'gold',count:9}]},dirty:true}));
 const list=localBackups();assert.equal(list.find(b=>b.id==='legacy').state.xp,100);assert.equal(list.find(b=>b.owner==='B').state.inventory[0].count,9);assert.deepEqual(JSON.parse(localStorage.getItem('carbon-survival-v1')),old);
});
test('bounded recovery retains the first backup and recent checkpoints per account',()=>{
 setup();for(let i=0;i<35;i++)backupSave({inventory:[],xp:i},{owner:'A'});const list=localBackups();assert.equal(list.length,20);assert.ok(list.some(b=>b.state.xp===0));assert.equal(list[0].state.xp,34);
});
test('browser restart restores the active credential but does not switch an existing tab',()=>{
 setup();rememberAccount({id:'A',token:'secret-A',name:'A'});rememberAccount({id:'B',token:'secret-B',name:'B'});localStorage.setItem('carbon-active-account','A');restoreDeviceLogin();assert.equal(sessionStorage.getItem('carbon-session-v8'),'secret-A');assert.equal(sessionStorage.getItem('carbon-expected-account'),'A');sessionStorage.setItem('carbon-session-v8','secret-B');restoreDeviceLogin();assert.equal(sessionStorage.getItem('carbon-session-v8'),'secret-B');assert.equal(savedAccounts().length,2);
});
