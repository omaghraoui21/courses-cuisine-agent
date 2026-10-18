// Actual backup endpoint and helpers, executed against SQLite (no source replacements).
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE households(id TEXT PRIMARY KEY,owner_id TEXT,name TEXT,created_at TEXT);
CREATE TABLE household_members(user_id TEXT PRIMARY KEY,household_id TEXT,role TEXT);
CREATE TABLE household_states(user_id TEXT PRIMARY KEY,data TEXT,version INTEGER,updated_at TEXT);
CREATE TABLE household_backups(id TEXT PRIMARY KEY,scope_id TEXT,created_by TEXT,created_at TEXT,data TEXT,reason TEXT);`);
class Statement{
 constructor(query,args=[]){this.query=query;this.args=args;}
 bind(...args){return new Statement(this.query,args);}
 async first(){return sql.prepare(this.query).get(...this.args)??null;}
 async all(){return {results:sql.prepare(this.query).all(...this.args)};}
 async run(){if(/^(UPDATE|INSERT OR IGNORE INTO) household_states/.test(this.query)&&globalThis.beforeBackupWrite){const callback=globalThis.beforeBackupWrite;globalThis.beforeBackupWrite=null;callback();}return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
}
globalThis.backupD1={prepare:q=>new Statement(q)};
const encode=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const domain=encode(compile('../lib/domain.ts'));
const reducer=encode(compile('../lib/household.ts').replace("'./domain'",JSON.stringify(domain)).replace("'zod'",JSON.stringify(pathToFileURL(require.resolve('zod')).href)));
const access=encode(compile('../lib/household-access.ts').replace("'cloudflare:workers'",JSON.stringify(encode('export const env={DB:globalThis.backupD1}'))));
const backups=encode(compile('../lib/backups.ts').replace("'./household-access'",JSON.stringify(access)).replace("'./household'",JSON.stringify(reducer)).replace("'./domain'",JSON.stringify(domain)));
const modules={'@/app/chatgpt-auth':encode('export async function getChatGPTUser(){return globalThis.backupActor?{userId:globalThis.backupActor}:null}'),'@/lib/household-access':access,'@/lib/backups':backups,'@/lib/domain':domain};
let source=compile('../app/api/backups/route.ts');for(const [name,url] of Object.entries(modules))source=source.replaceAll(`'${name}'`,JSON.stringify(url));
const {GET,POST}=await import(encode(source)),{emptyState}=await import(domain),{saveBackup,backupState,restoreState}=await import(backups);
const post=(body,headers={})=>POST(new Request('https://test.example/api/backups',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json',...headers},body:JSON.stringify(body)}));
const state=emptyState();state.items=[{id:'rice',name:'Riz',brand:'',quantity:3,unit:'kg',category:'food',location:'Placard',level:'sufficient',expiry:null,monthlyUsage:null,updatedAt:'2026-10-18T10:00:00.000Z'}];state.importFingerprints=['a'.repeat(64)];
sql.prepare('INSERT INTO household_states VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,'now');
sql.prepare('INSERT INTO households VALUES(?,?,?,?)').run('owner','owner','Notre maison','now');
for(const [u,role] of [['owner','owner'],['member','member']])sql.prepare('INSERT INTO household_members VALUES(?,?,?)').run(u,'owner',role);
assert.equal((await GET()).status,401);assert.equal((await post({action:'create'})).status,401);
globalThis.backupActor='member';assert.equal((await GET()).status,403);assert.equal((await post({action:'create'})).status,403);assert.equal((await post({action:'restore',confirmation:'RESTAURER',id:'x'})).status,403);
globalThis.backupActor='owner';assert.equal((await post({action:'create'},{origin:'https://evil.example'})).status,403);
const created=await post({action:'create'});assert.equal(created.status,200);const {id}=await created.json();assert.ok(id);
const listing=await (await GET()).json();assert.equal(listing.backups.length,1);assert.equal(listing.backups[0].id,id);
const read=()=>JSON.parse(sql.prepare('SELECT data FROM household_states WHERE user_id=?').get('owner').data);
sql.prepare('UPDATE household_states SET data=?,version=2 WHERE user_id=?').run(JSON.stringify({...state,items:[]}),'owner');
assert.equal((await post({action:'restore',id,confirmation:'RESTAURER'})).status,200);assert.equal(read().items[0].quantity,3);assert.equal(sql.prepare('SELECT version FROM household_states WHERE user_id=?').get('owner').version,3);
const previous=sql.prepare("SELECT data FROM household_backups WHERE scope_id=? AND reason='before_restore'").get('owner');assert.deepEqual(JSON.parse(previous.data).state.items,[],'pre-restore state is recoverable');
assert.deepEqual(read().importFingerprints,['a'.repeat(64)]);assert.equal(read().requests.length,0,'old undo/request snapshots never revive');
globalThis.backupActor='other';assert.equal((await post({action:'restore',id,confirmation:'RESTAURER'})).status,404,'backup ids do not bypass household isolation');
globalThis.backupActor='owner';const versionBefore=sql.prepare('SELECT version FROM household_states WHERE user_id=?').get('owner').version;
globalThis.beforeBackupWrite=()=>sql.prepare('UPDATE household_states SET version=version+1 WHERE user_id=?').run('owner');
assert.equal((await post({action:'restore',id,confirmation:'RESTAURER'})).status,409);assert.equal(sql.prepare('SELECT version FROM household_states WHERE user_id=?').get('owner').version,versionBefore+1,'CAS preserves simultaneous write');
// Revoke/transition owner after both JS access resolutions but before SQL write.
globalThis.beforeBackupWrite=()=>sql.prepare("UPDATE household_members SET household_id='other',role='member' WHERE user_id='owner'").run();
assert.equal((await post({action:'restore',id,confirmation:'RESTAURER'})).status,409);assert.equal(sql.prepare('SELECT version FROM household_states WHERE user_id=?').get('owner').version,versionBefore+1);
sql.prepare("UPDATE household_members SET household_id='owner',role='owner' WHERE user_id='owner'").run();
// Retention is per scope and bounded to ten, retaining snapshots before destructive work.
for(let i=0;i<15;i++)await saveBackup('retention','owner',state,'manual');
assert.equal(sql.prepare("SELECT count(*) c FROM household_backups WHERE scope_id='retention'").get().c,10);assert.ok(sql.prepare("SELECT count(*) c FROM household_backups WHERE scope_id='owner'").get().c>0);
await saveBackup('owner','owner',state,'before_clear');const clearBackup=sql.prepare("SELECT data FROM household_backups WHERE scope_id='owner' AND reason='before_clear'").get();assert.equal(restoreState(clearBackup.data).items[0].name,'Riz');
const legacy={...state};delete legacy.consumption;delete legacy.importFingerprints;assert.deepEqual(restoreState(backupState(legacy)).consumption,[]);
const large={...state,items:Array.from({length:500},(_,i)=>({...state.items[0],id:'p'+i}))};assert.equal(restoreState(backupState(large)).items.length,500);
console.log('Backup API on SQLite: owner-only create/list/restore, legacy roundtrip, 500 items, scope isolation, CAS, atomic owner revocation, pre-clear/pre-restore recovery and retention ten passed.');
