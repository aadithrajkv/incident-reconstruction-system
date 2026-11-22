import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Real embedded PostgreSQL; Auth/Storage schemas below model Supabase's SQL
// boundary. This does not exercise GoTrue, SMS, Edge Functions or hosted settings.
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 -- Supabase grants service_role default access; private migrations revoke it.
 alter default privileges grant all on tables to service_role;
 alter default privileges grant all on sequences to service_role;
 grant usage on schema auth,storage to anon,authenticated,service_role;
 create table auth.users(
  id uuid primary key, aud text, role text, email text, encrypted_password text,
  raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now(),updated_at timestamptz default now(),
  phone text unique,phone_confirmed_at timestamptz,is_anonymous boolean default false
 );
 create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as
  $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
`);
const migrationDir = new URL('../supabase/migrations/',import.meta.url);
for (const file of readdirSync(migrationDir).filter(x=>x.endsWith('.sql')).sort()) {
 try { await db.exec(readFileSync(new URL(file,migrationDir),'utf8')); }
 catch (error) { throw new Error(`Migration ${file}: ${error.message}`, {cause:error}); }
}
console.log('All migrations applied to embedded PostgreSQL.');
const q = async (sql,params=[]) => (await db.query(sql,params)).rows;
const A='a1000000-0000-4000-8000-000000000001', B='b1000000-0000-4000-8000-000000000002', M='c1000000-0000-4000-8000-000000000003', U='d1000000-0000-4000-8000-000000000004';
async function asUser(id,action) {
 await db.exec('begin; set local role authenticated;');
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
 try { const result=await action();await db.exec('commit');return result; }
 catch(error){await db.exec('rollback');throw error;}
}
async function denied(action,code='42501') { await assert.rejects(action,error=>error.code===code); }
await q(`insert into auth.users(id,phone,phone_confirmed_at) values($1,'919000000001',now()),($2,'919000000002',now()),($3,'919000000003',now()),($4,'919000000004',null)`,[A,B,M,U]);
let username,offerId;
await test('phone enrollment is idempotent and usernames are unique and private', async()=>{
 username=(await asUser(A,()=>q('select public.ensure_phone_account() as account')))[0].account.username;
 const again=(await asUser(A,()=>q('select public.ensure_phone_account() as account')))[0].account.username;
 const second=(await asUser(B,()=>q('select public.ensure_phone_account() as account')))[0].account.username;
 await asUser(M,()=>q('select public.ensure_phone_account()'));
 assert.equal(username,again);assert.notEqual(username,second);assert.match(username,/^neighbor_[a-f0-9]{32}$/);
 assert.equal((await asUser(A,()=>q('select username from public.profiles where user_id=$1',[B]))).length,0);
 await denied(()=>asUser(A,()=>q("update public.profiles set username='changed' where user_id=$1",[A])));
 await denied(()=>asUser(A,()=>q('select phone from auth.users')));
});
await test('unverified numbers cannot enroll or write shared data',async()=>{
 await denied(()=>asUser(U,()=>q('select public.ensure_phone_account()')));
 await denied(()=>asUser(U,()=>q("insert into public.grid_subscriptions(grid_id) values('0,0')")));
});
await q("update public.profiles set home_grid_id='0,0' where user_id in ($1,$2,$3)",[A,B,M]);
await test('a second user reads the first user’s shared thought but cannot edit it',async()=>{
 await asUser(A,()=>q('select public.refresh_my_thought_seeds()'));
 await asUser(A,()=>q("insert into public.thoughts(grid_id,body) values('0,0','Visible to a second account')"));
 const rows=await asUser(B,()=>q("select body from public.thoughts where author_id=$1",[A]));assert.equal(rows[0].body,'Visible to a second account');
 await denied(()=>asUser(B,()=>q("update public.thoughts set body='changed' where author_id=$1",[A])));
 const deleted=await asUser(B,()=>q('delete from public.thoughts where author_id=$1 returning id',[A]));assert.equal(deleted.length,0);
});
await test('pending issues are isolated; published issues are shared',async()=>{
 const [issue]=await asUser(A,()=>q("insert into public.grid_issues(grid_id,category,body) values('0,0','roads_paths','Private until review') returning id"));
 assert.equal((await asUser(B,()=>q('select id from public.grid_issues where id=$1',[issue.id]))).length,0);
 await q("update public.grid_issues set moderation_status='published' where id=$1",[issue.id]);
 assert.equal((await asUser(B,()=>q('select id from public.grid_issues where id=$1',[issue.id]))).length,1);
});
await test('private issue photos follow issue visibility for two users',async()=>{
 const imageId='e1000000-0000-4000-8000-000000000005',path=`${A}/0,0/${imageId}.webp`;
 await asUser(A,()=>q('insert into storage.objects(bucket_id,name,owner) values(\'grid-issue-images\',$1,$2)',[path,A]));
 const [issue]=await asUser(A,()=>q("insert into public.grid_issues(grid_id,category,body,image_path) values('0,0','roads_paths','Photo awaits review',$1) returning id",[path]));
 assert.equal((await asUser(B,()=>q('select name from storage.objects where name=$1',[path]))).length,0);
 await q("update public.grid_issues set moderation_status='published' where id=$1",[issue.id]);
 assert.equal((await asUser(B,()=>q('select name from storage.objects where name=$1',[path]))).length,1);
});
await test('business submission is atomic and owner-only before review',async()=>{
 const [result]=await asUser(A,()=>q("select public.submit_business_offer('Corner Chai','street','Fresh tea',0,0,'09:00','18:00',true) as result"));offerId=result.result.offerId;
 assert.equal((await asUser(A,()=>q('select id from public.offers where id=$1',[offerId]))).length,1);
 assert.equal((await asUser(B,()=>q('select id from public.offers where id=$1',[offerId]))).length,0);
 await denied(()=>asUser(A,()=>q("update public.offers set moderation_status='approved' where id=$1",[offerId])));
 await denied(()=>asUser(A,()=>q("insert into public.business_profiles(public_name,category) values('Bypass','street')")));
 await denied(()=>asUser(A,()=>q("select public.review_business_offer($1,'approve')",[offerId])));
});
await test('moderator approval shares the business; hiding removes it for other users',async()=>{
 await q('insert into private.moderators(user_id) values($1)',[M]);
 assert.equal((await asUser(M,()=>q('select id from public.offers where id=$1',[offerId]))).length,1);
 await asUser(M,()=>q("select public.review_business_offer($1,'approve')",[offerId]));
 assert.equal((await asUser(B,()=>q('select id from public.offers where id=$1',[offerId]))).length,1);
 await asUser(M,()=>q("select public.review_business_offer($1,'hide')",[offerId]));
 assert.equal((await asUser(B,()=>q('select id from public.offers where id=$1',[offerId]))).length,0);
 assert.equal((await q('select count(*)::int as count from private.business_review_actions'))[0].count,2);
});
await test('wrong-grid and invalid business submissions leave no partial business',async()=>{
 const before=(await q('select count(*)::int as count from public.business_profiles'))[0].count;
 await denied(()=>asUser(A,()=>q("select public.submit_business_offer('Wrong grid','street','Tea',13,80,'09:00','18:00',true)")));
 await denied(()=>asUser(A,()=>q("select public.submit_business_offer('Bad hours','street','Tea',0,0,'99:00','18:00',true)")),'22023');
 assert.equal((await q('select count(*)::int as count from public.business_profiles'))[0].count,before);
});
await test('business submission cap is enforced in the database',async()=>{
 for(let i=0;i<3;i++)await asUser(A,()=>q("select public.submit_business_offer($1,'street','Local update',0,0,'09:00','18:00',true)",['Vendor '+i]));
 await denied(()=>asUser(A,()=>q("select public.submit_business_offer('Fourth','street','Update',0,0,'09:00','18:00',true)")),'23514');
});
await test('phone linking retires the former anonymous restore credential',async()=>{
 await q('insert into private.pilot_recovery_tokens(user_id,token_digest) values($1,repeat(\'a\',64))',[U]);
 await q('update auth.users set phone_confirmed_at=now() where id=$1',[U]);
 assert.equal((await q('select * from private.pilot_recovery_tokens where user_id=$1',[U])).length,0);
});
await test('deleting an Auth account cascades its shared contributions and businesses',async()=>{
 await q('delete from auth.users where id=$1',[A]);
 for(const [table,owner] of [['thoughts','author_id'],['grid_issues','author_id'],['business_profiles','owner_id'],['offers','owner_id']]){
  assert.equal((await q(`select count(*)::int as count from public.${table} where ${owner}=$1`,[A]))[0].count,0);
 }
});
await test('existing regression SQL scenarios still pass after phone migration',async()=>{
 for(const file of ['pilot_rls.test.sql','anonymous_restore.test.sql'])await db.exec(readFileSync(new URL('../supabase/tests/database/'+file,import.meta.url),'utf8'));
});
await db.close();
