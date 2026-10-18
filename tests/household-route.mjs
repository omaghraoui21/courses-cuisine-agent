// Run: node tests/household-route.mjs. Exercise auth/CSRF/validation before D1.
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const encode=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const domain=encode(compile('../lib/domain.ts'));
const reducer=encode(compile('../lib/household.ts').replace("'./domain'",JSON.stringify(domain)).replace("'zod'",JSON.stringify(pathToFileURL(require.resolve('zod')).href)));
globalThis.routeTestUser=null;globalThis.routeTestDbCalls=0;
const modules={
  'drizzle-orm':pathToFileURL(require.resolve('drizzle-orm')).href,
  'cloudflare:workers':encode('export const env={};'),
  '@/app/chatgpt-auth':encode('export async function getChatGPTUser(){return globalThis.routeTestUser;}'),
  '@/db':encode('export function getDb(){globalThis.routeTestDbCalls++;throw new Error("D1 should not be reached")}'),
  '@/db/schema':encode('export const householdStates={},orderDrafts={};'),
  '@/lib/domain':domain,'@/lib/household':reducer,
  '@/lib/household-access':encode('export async function resolveHousehold(){throw new Error("Access must not be reached")} export function householdMetadata(x){return x}'),
  '@/lib/backups':encode('export async function saveBackup(){throw new Error("Backup must not be reached")}'),
  '@/lib/mutation-ledger':encode('export async function wasApplied(){throw new Error("Ledger must not be reached")} export async function recordApplied(){} export const receiptKey=(a,b)=>JSON.stringify([a,b]);'),
};
let source=compile('../app/api/household/route.ts');
for(const [name,url] of Object.entries(modules))source=source.replaceAll(`'${name}'`,JSON.stringify(url));
const {GET,POST}=await import(encode(source));
const endpoint='https://courses.example/api/household';
const post=(body,extra={})=>new Request(endpoint,{method:'POST',headers:{origin:'https://courses.example','content-type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
assert.equal((await GET(new Request(endpoint))).status,401);
assert.equal((await POST(post({}))).status,401);
globalThis.routeTestUser={userId:'u1',email:'u1@example.test'};
assert.equal((await POST(post({},{origin:'https://attacker.example'}))).status,403);
assert.equal((await POST(post({},{'sec-fetch-site':'cross-site'}))).status,403);
const missingOrigin=post({});missingOrigin.headers.delete('origin');assert.equal((await POST(missingOrigin)).status,403);
assert.equal((await POST(post({},{'content-type':'text/plain'}))).status,415);
assert.equal((await POST(post('invalid-json'))).status,400);
assert.equal((await POST(post({action:'import_items',requestId:crypto.randomUUID(),items:[{name:'Shampooing'}]}))).status,400);
assert.equal((await POST(post({action:'add_item',requestId:crypto.randomUUID(),item:{name:'x',quantity:-1}}))).status,400);
assert.equal((await POST(post({action:'unrecognized',requestId:crypto.randomUUID()}))).status,400);
assert.equal(globalThis.routeTestDbCalls,0);
console.log('Household route auth/CSRF/validation: 11 assertions passed.');
