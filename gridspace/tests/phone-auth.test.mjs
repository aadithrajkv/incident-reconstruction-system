import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('let pendingPhone='),source.indexOf('function initTurnstile()'));
function setup({legacy=false,verifyError=null,rpcError=null}={}){
 const nodes=new Map(),calls=[],phone='919000000001';let session=legacy?{user:{id:'legacy',is_anonymous:true}}:null,now=Date.now();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,hidden:false,disabled:false,textContent:'',focus(){}});return nodes.get(id)};
 node('#phone-number').value='9000000001';node('#phone-consent').checked=true;
 class Clock extends Date{static now(){return now}}
 const context={Date:Clock,window:{GRIDSPACE_AUTH_CONFIG:{turnstileSiteKey:''}},captchaToken:null,turnstileId:null,activeSharedEpoch:1,realAuth:false,currentUserId:null,accountUsername:'',
  $:node,optionalHidden:(id,value)=>node(id).hidden=value,optionalText:(id,value)=>node(id).textContent=value,authMessage:(id,value)=>node(id).textContent=value,
  setInterval:()=>1,clearInterval(){},
  authClient:{auth:{
   getSession:async()=>({data:{session},error:null}),
   signInWithOtp:async input=>{calls.push(['send',input]);return {error:null}},
   updateUser:async input=>{calls.push(['link',input]);return{error:null}},
   verifyOtp:async input=>{calls.push(['verify',input]);if(verifyError)return{error:verifyError};session={user:{id:legacy?'legacy':'phone-user',phone,phone_confirmed_at:'2026-11-22',is_anonymous:false}};return{data:{session},error:null}},
  },rpc:async name=>{calls.push(['rpc',name]);return{data:{username:'neighbor_'+'a'.repeat(32)},error:rpcError}}},
  beginApp:(verified,id)=>{calls.push(['app',verified,id]);context.realAuth=true;context.currentUserId=id;node('#authgate').hidden=true},
 };
 vm.createContext(context);vm.runInContext(functions,context);
 return{context,node,calls,advance:ms=>{now+=ms}};
}
const event={preventDefault(){}};
test('Indian numbers normalize; other countries and malformed numbers are rejected',()=>{
 const h=setup();assert.equal(h.context.normalizeIndianPhone('+91 90000-00001'),'+919000000001');
 for(const value of ['+12025550147','123','9000000001x','19000000001'])assert.equal(h.context.normalizeIndianPhone(value),null);
});
test('phone-use acknowledgement is required before any SMS request',async()=>{
 const h=setup();h.node('#phone-consent').checked=false;await h.context.sendPhoneOtp(event);assert.equal(h.calls.length,0);assert.match(h.node('#auth-msg').textContent,/acknowledge/);
});
test('send, cooldown and verification use the Supabase OTP methods',async()=>{
 const h=setup();await h.context.sendPhoneOtp(event);assert.equal(h.calls[0][1].phone,'+919000000001');
 assert.equal(h.node('#phone-form').hidden,true);assert.match(h.node('#otp-destination').textContent,/0001/);
 await h.context.sendPhoneOtp(event);assert.equal(h.calls.filter(x=>x[0]==='send').length,1);
 h.node('#otp-code').value='246810';await h.context.verifyPhoneOtp(event);
 const verify=h.calls.find(x=>x[0]==='verify')[1];assert.equal(verify.type,'sms');assert.equal(verify.token,'246810');
 assert.equal(h.calls.find(x=>x[0]==='rpc')[1],'ensure_phone_account');assert.deepEqual(h.calls.at(-1),['app',true,'phone-user']);
 assert.equal(h.node('#phone-number').value,'');assert.equal(h.node('#otp-code').value,'');
});
test('wrong OTP does not enter the app',async()=>{
 const h=setup({verifyError:{code:'otp_expired'}});await h.context.sendPhoneOtp(event);h.node('#otp-code').value='000000';await h.context.verifyPhoneOtp(event);
 assert(!h.calls.some(x=>x[0]==='app'));assert.match(h.node('#auth-msg').textContent,/invalid or expired/);
});
test('legacy anonymous account links a number and retains its user ID',async()=>{
 const h=setup({legacy:true});await h.context.sendPhoneOtp(event);assert.equal(h.calls[0][0],'link');assert(!h.calls.some(x=>x[0]==='send'));
 h.node('#otp-code').value='246810';await h.context.verifyPhoneOtp(event);assert.equal(h.calls.find(x=>x[0]==='verify')[1].type,'phone_change');assert.deepEqual(h.calls.at(-1),['app',true,'legacy']);
});
test('verified phone alone cannot enter when server account provisioning fails',async()=>{
 const h=setup({rpcError:{code:'42883'}});await h.context.sendPhoneOtp(event);h.node('#otp-code').value='246810';await h.context.verifyPhoneOtp(event);
 assert(!h.calls.some(x=>x[0]==='app'));assert.match(h.node('#auth-msg').textContent,/setup could not finish/);
});
test('a resend is possible after the cooldown',async()=>{
 const h=setup();await h.context.sendPhoneOtp(event);h.advance(61000);await h.context.sendPhoneOtp(event);assert.equal(h.calls.filter(x=>x[0]==='send').length,2);
});
