// Real SQLite executes the same parameterized statements and transactional batches as D1.
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE households(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE household_members(user_id TEXT PRIMARY KEY,household_id TEXT NOT NULL,role TEXT NOT NULL);
CREATE TABLE household_invites(hash TEXT PRIMARY KEY,household_id TEXT NOT NULL,created_by TEXT NOT NULL,expires_at INTEGER NOT NULL,used_by TEXT,used_at INTEGER);
CREATE TABLE household_states(user_id TEXT PRIMARY KEY,data TEXT NOT NULL);`);
class Statement{
 constructor(query,args=[]){this.query=query;this.args=args;}
 bind(...args){return new Statement(this.query,args);}
 async first(){return sql.prepare(this.query).get(...this.args)??null;}
 async all(){return {results:sql.prepare(this.query).all(...this.args)};}
 async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
}
let queue=Promise.resolve();
globalThis.familyD1={prepare:q=>new Statement(q),batch(statements){const run=queue.then(async()=>{sql.exec('BEGIN IMMEDIATE');try{const out=[];for(const stmt of statements)out.push(await stmt.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}});queue=run.catch(()=>{});return run;}};
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const access=data(compile('../lib/household-access.ts').replace("'cloudflare:workers'",JSON.stringify(data('export const env={DB:globalThis.familyD1}'))));
const route=data(compile('../app/api/family/route.ts').replace("'@/app/chatgpt-auth'",JSON.stringify(data('export async function getChatGPTUser(){return globalThis.familyUser}'))).replace("'@/lib/household-access'",JSON.stringify(access)));
const {GET,POST}=await import(route),{resolveHousehold,hashInvite}=await import(access);
const endpoint='https://example.test/api/family';
async function action(user,body,extra={}){globalThis.familyUser=user?{userId:user}:null;return POST(new Request(endpoint,{method:'POST',headers:{origin:'https://example.test','content-type':'application/json',...extra},body:JSON.stringify(body)}));}
assert.equal((await action(null,{action:'create_invite'})).status,401);
assert.equal((await action('owner',{action:'create_invite'},{origin:'https://bad.test'})).status,403);
assert.equal((await action('owner',{action:'create_invite'},{'content-type':'text/plain'})).status,415);
assert.equal((await resolveHousehold('owner')).scopeId,'owner');
assert.equal(sql.prepare('SELECT count(*) c FROM households').get().c,0,'read has no write side effect');
sql.prepare('INSERT INTO household_states VALUES(?,?)').run('member','{"private":"untouched"}');
const invite=await (await action('owner',{action:'create_invite'})).json();
assert.ok(invite.token);assert.equal(sql.prepare('SELECT hash FROM household_invites').get().hash,await hashInvite(invite.token));
assert.equal((await action('member',{action:'accept_invite',token:invite.token})).status,400);
assert.equal((await action('member',{action:'accept_invite',token:invite.token,confirm:true})).status,200);
assert.equal((await resolveHousehold('member')).scopeId,'owner');
assert.equal(sql.prepare('SELECT data FROM household_states WHERE user_id=?').get('member').data,'{"private":"untouched"}');
assert.equal((await action('outsider',{action:'accept_invite',token:invite.token,confirm:true})).status,409);
assert.equal((await resolveHousehold('outsider')).scopeId,'outsider');
assert.equal((await action('member',{action:'rename',name:'Bad'})).status,403);
assert.equal((await action('member',{action:'create_invite'})).status,403);
assert.equal((await action('member',{action:'remove_member',userId:'owner'})).status,403);
assert.equal((await action('owner',{action:'rename',name:'Notre maison'})).status,200);
assert.equal((await resolveHousehold('member')).name,'Notre maison');
const unused=await (await action('owner',{action:'create_invite'})).json();
assert.equal((await action('member',{action:'accept_invite',token:unused.token,confirm:true})).status,409);
assert.equal(sql.prepare('SELECT used_at FROM household_invites WHERE hash=?').get(await hashInvite(unused.token)).used_at,null,'conflicting membership never consumes token');
sql.prepare('UPDATE household_invites SET expires_at=0 WHERE hash=?').run(await hashInvite(unused.token));
assert.equal((await action('outsider',{action:'accept_invite',token:unused.token,confirm:true})).status,409);
const other=await (await action('other',{action:'create_invite'})).json();
assert.equal((await action('owner',{action:'accept_invite',token:other.token,confirm:true})).status,409,'owner with dependents cannot abandon them');
assert.equal((await action('owner',{action:'leave'})).status,403);
assert.equal((await action('member',{action:'leave'})).status,200);
assert.equal((await resolveHousehold('member')).scopeId,'member');
assert.equal((await action('member',{action:'accept_invite',token:other.token,confirm:true})).status,200);
for(let i=0;i<5;i++){const inv=await (await action('owner',{action:'create_invite'})).json();assert.equal((await action('m'+i,{action:'accept_invite',token:inv.token,confirm:true})).status,200);}
assert.equal((await action('owner',{action:'create_invite'})).status,409,'six member maximum');
assert.equal((await action('owner',{action:'remove_member',userId:'m0'})).status,200);
assert.equal((await resolveHousehold('m0')).scopeId,'m0');
globalThis.familyUser={userId:'owner'};const family=await (await GET()).json();assert.equal(family.members.length,5);assert.match(family.siteSharingNotice,/Partager du Site/);
const raceInvite=await (await action('raceOwner',{action:'create_invite'})).json();
const racing=await Promise.all(['racer1','racer2'].map(u=>action(u,{action:'accept_invite',token:raceInvite.token,confirm:true})));
assert.deepEqual(racing.map(r=>r.status).sort(),[200,409],'simultaneous claim has exactly one winner');
assert.equal(sql.prepare("SELECT count(*) c FROM household_members WHERE household_id='raceOwner' AND role='member'").get().c,1);
console.log('Family API: auth, isolation, legacy preservation, token expiry/one use/conflicts, owner rules and member cap passed on real SQLite.');
