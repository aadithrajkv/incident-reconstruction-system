import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const read=source.slice(source.indexOf('async function refreshSharedGrid('),source.indexOf('async function refreshVisibleSharedData('));
const availability=source.slice(source.indexOf('function adAvailable('),source.indexOf('function directionsUrl('));
function setup(delay){
 const cells=new Map(),filters=[];
 const data={thoughts:[{id:'thought',author_id:'A',body:'Shared thought',created_at:'2026-11-22',moderation_status:'published'}],grid_issues:[],
 offers:[{id:'offer',business_id:'business',owner_id:'A',message:'Tea',active_hours:{open:'09:00',close:'18:00',timezone:'Asia/Kolkata'},moderation_status:'approved',starts_at:'2026-11-21',ends_at:'2026-12-01'}],
 business_profiles:[{id:'business',public_name:'Corner Chai',category:'street',verification_status:'approved'}]};
 const context={activeSharedEpoch:1,currentUserId:'B',TPC:15,realAuth:true,sharedReady:()=>true,sharedGridCache:new Set(),sharedGridLoads:new Map(),toast(){},
  cell:id=>{if(!cells.has(id))cells.set(id,{});return cells.get(id)},
  authClient:{from(table){const query={select(){return query},eq(key,value){filters.push([table,key,value]);return query},gt(){return query},order(){return query},limit(){return query},in(){return query},then(resolve,reject){return Promise.resolve(delay).then(()=>({data:data[table],error:null})).then(resolve,reject)}};return query}},
 };
 vm.createContext(context);vm.runInContext(read+'\n'+availability,context);return{context,cells,filters};
}
test('shared feed loads server thoughts and approved business data for another user',async()=>{
 const h=setup();await h.context.refreshSharedGrid('0,0');const cell=h.cells.get('0,0');assert.equal(cell.th[0].txt,'Shared thought');assert.equal(cell.th[0].isMine,false);assert.equal(cell.ads[0].name,'Corner Chai');
 assert(h.filters.some(x=>x[0]==='offers'&&x[1]==='grid_id'&&x[2]==='0,0'));
});
test('responses from an old account cannot populate the next account cache',async()=>{
 let release;const h=setup(new Promise(resolve=>release=resolve));const pending=h.context.refreshSharedGrid('0,0');h.context.activeSharedEpoch++;h.context.currentUserId='C';release();await pending;assert.equal(h.cells.size,0);assert.equal(h.context.sharedGridCache.size,0);
});
test('business visibility respects approval, schedule and India timezone',()=>{
 const h=setup(),offer={exp:Date.parse('2026-12-01'),starts:Date.parse('2026-11-21'),moderationStatus:'approved',businessStatus:'approved',openTime:'09:00',closeTime:'18:00',timeZone:'Asia/Kolkata'};
 assert.equal(h.context.adAvailable(offer,new Date('2026-11-22T03:30:00Z')),true);
 assert.equal(h.context.adAvailable(offer,new Date('2026-11-22T14:00:00Z')),false);
 assert.equal(h.context.adAvailable({...offer,moderationStatus:'pending_review'},new Date('2026-11-22T03:30:00Z')),false);
});
