// Run node tests/integration-ledger.mjs: actual household route and ledger on transactional SQLite.
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url), sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE households(id TEXT PRIMARY KEY,owner_id TEXT,name TEXT,created_at TEXT);
CREATE TABLE household_members(user_id TEXT PRIMARY KEY,household_id TEXT,role TEXT);
CREATE TABLE household_states(user_id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT);
CREATE TABLE mutation_receipts(key TEXT PRIMARY KEY,scope_id TEXT,request_id TEXT,actor_id TEXT,fingerprint TEXT,created_at TEXT);
CREATE TABLE order_drafts(user_id TEXT,created_at INTEGER);`);
class Statement{
 constructor(query,args=[]){this.query=query;this.args=args;}
 bind(...args){return new Statement(this.query,args);}
 async first(){return sql.prepare(this.query).get(...this.args)??null;}
 async all(){return {results:sql.prepare(this.query).all(...this.args)};}
 async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
 execute(){const statement=sql.prepare(this.query);const results=/RETURNING/i.test(this.query)?statement.all(...this.args):[];const meta=/RETURNING/i.test(this.query)?{changes:Number(sql.prepare('SELECT changes() c').get().c)}:{changes:Number(statement.run(...this.args).changes)};return {results,meta};}
}
let queue=Promise.resolve();
globalThis.ledgerD1={prepare:q=>new Statement(q),batch(statements){const p=queue.then(()=>{if(globalThis.beforeLedgerBatch){const callback=globalThis.beforeLedgerBatch;globalThis.beforeLedgerBatch=null;callback();}sql.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>s.execute());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}});queue=p.catch(()=>{});return p;}};
globalThis.ledgerReadDb={select:()=>({from:()=>({where:condition=>({limit:async()=>{const row=sql.prepare('SELECT user_id userId,data,version,updated_at updatedAt FROM household_states WHERE user_id=?').get(condition.value);return row?[row]:[];}})})})};
const encode=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const domain=encode(compile('../lib/domain.ts'));
const reducer=encode(compile('../lib/household.ts').replace("'./domain'",JSON.stringify(domain)).replace("'zod'",JSON.stringify(pathToFileURL(require.resolve('zod')).href)));
const access=encode(compile('../lib/household-access.ts').replace("'cloudflare:workers'",JSON.stringify(encode('export const env={DB:globalThis.ledgerD1}'))));
const ledger=encode(compile('../lib/mutation-ledger.ts').replace("'./household-access'",JSON.stringify(access)).replace("'./household'",JSON.stringify(reducer)));
const modules={
 'drizzle-orm':encode('export const eq=(col,value)=>({col,value})'),
 'cloudflare:workers':encode('export const env={DB:globalThis.ledgerD1}'),
 '@/app/chatgpt-auth':encode('export async function getChatGPTUser(){return {userId:globalThis.ledgerActor}}'),
 '@/db':encode('export const getDb=()=>globalThis.ledgerReadDb'),
 '@/db/schema':encode('export const householdStates={userId:"user_id"}'),
 '@/lib/backups':encode('export async function saveBackup(){}'),
 '@/lib/mutation-ledger':ledger,'@/lib/domain':domain,'@/lib/household':reducer,'@/lib/household-access':access,
};
let source=compile('../app/api/household/route.ts');for(const [name,url] of Object.entries(modules))source=source.replaceAll(`'${name}'`,JSON.stringify(url));
const {POST}=await import(encode(source)),{emptyState}=await import(domain);
globalThis.ledgerActor='owner';
const action=(name='Riz',requestId=crypto.randomUUID())=>({action:'add_item',requestId,item:{name}});
const post=body=>POST(new Request('https://test.example/api/household',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:JSON.stringify(body)}));
const state=()=>JSON.parse(sql.prepare('SELECT data FROM household_states WHERE user_id=?').get('owner').data);
const first=action();assert.equal((await post(first)).status,200);assert.equal(state().items.length,1);assert.equal(sql.prepare('SELECT count(*) c FROM mutation_receipts').get().c,1);
assert.equal((await post(first)).status,200);assert.equal(state().items.length,1);
assert.equal((await post({...first,item:{name:'Autre'}})).status,409);
const simultaneous=action('Lait');assert.deepEqual((await Promise.all([post(simultaneous),post(simultaneous)])).map(r=>r.status),[200,200]);assert.equal(state().items.length,2);
// A permanent receipt survives the bounded request cache and a restored/cleared state.
for(let i=0;i<105;i++)assert.equal((await post(action('Produit '+i))).status,200);
assert.ok(!state().requests.some(r=>r.id===first.requestId));const before=state().items.length;
assert.equal((await post(first)).status,200);assert.equal(state().items.length,before);
sql.prepare('UPDATE household_states SET data=?,version=version+1 WHERE user_id=?').run(JSON.stringify(emptyState()),'owner');
assert.equal((await post(first)).status,200);assert.equal(state().items.length,0);
// The receipt must roll back the state write if receipt persistence fails.
sql.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END;");
const retry=action('Shampooing');assert.equal((await post(retry)).status,503);assert.equal(state().items.length,0);
sql.exec('DROP TRIGGER fail_receipt');assert.equal((await post(retry)).status,200);assert.equal(state().items.length,1);
// Membership revoked after JS access resolution is denied by the SQL guard.
sql.prepare('INSERT INTO households VALUES(?,?,?,?)').run('owner','owner','Notre maison','now');
sql.prepare('INSERT INTO household_members VALUES(?,?,?)').run('member','owner','member');
globalThis.ledgerActor='member';globalThis.beforeLedgerBatch=()=>sql.prepare('DELETE FROM household_members WHERE user_id=?').run('member');
const revoked=action('Interdit');assert.equal((await post(revoked)).status,409);assert.equal(state().items.length,1);assert.equal(sql.prepare('SELECT count(*) c FROM mutation_receipts WHERE request_id=?').get(revoked.requestId).c,0);
console.log('Household transaction ledger: concurrent same-request replay, changed payload, >100 history replay, restore replay, rollback after receipt failure and atomic revoked-member denial passed.');

// A stale browser must never apply the former household list to its new personal scope.
const stale=action('Ancien foyer');assert.equal((await post({...stale,expectedScopeId:'owner'})).status,409);assert.equal(sql.prepare('SELECT count(*) c FROM household_states WHERE user_id=?').get('member').c,0);
