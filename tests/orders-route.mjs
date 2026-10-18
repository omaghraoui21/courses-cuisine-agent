import ts from 'typescript';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const encode=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
globalThis.deliveryFixture={user:null,env:{GLOVO_BRIDGE_URL:'not-a-url',GLOVO_BRIDGE_TOKEN:'fake'},rows:[],calls:[],scopeId:'family'};
const db=`export function getDb(){const f=globalThis.deliveryFixture;return {select:()=>({from:()=>({where:()=>({orderBy:()=>({limit:async()=>f.rows}),then:(resolve,reject)=>Promise.resolve(f.rows).then(resolve,reject)})})}),insert:()=>({values:async value=>{f.rows.push(value)}}),update:()=>({set:value=>({where:()=>{const row=f.rows[0];Object.assign(row,value);return {returning:async()=>[{id:row.id}],then:(resolve,reject)=>Promise.resolve().then(resolve,reject)}}})})}}`;
const modules={
 'cloudflare:workers':encode('export const env=globalThis.deliveryFixture.env;'),
 'drizzle-orm':encode('export const eq=(...x)=>x;export const and=(...x)=>x;export const desc=x=>x;'),
 '@/app/chatgpt-auth':encode('export async function getChatGPTUser(){return globalThis.deliveryFixture.user}'),
 '@/db':encode(db),'@/db/schema':encode('export const orderDrafts={};'),
 '@/lib/order-policy':encode(compile('../lib/order-policy.ts')),
 '@/lib/delivery':encode(compile('../lib/delivery.ts')),
 '@/lib/household-access':encode('export async function resolveHousehold(){return {scopeId:globalThis.deliveryFixture.scopeId}}'),
};
let source=compile('../app/api/orders/route.ts');for(const [name,url]of Object.entries(modules))source=source.replaceAll(`'${name}'`,JSON.stringify(url));
const {GET,POST}=await import(encode(source));const f=globalThis.deliveryFixture;
const post=b=>new Request('https://nesma.example/api/orders',{method:'POST',headers:{origin:'https://nesma.example'},body:JSON.stringify(b)});
assert.equal((await GET()).status,401);f.user={userId:'omar'};
let response=await GET();assert.equal(response.status,200);assert.equal((await response.json()).providers.every(p=>!p.connected),true);
const basket={action:'prepare',items:[{name:'Riz',quantity:1,unit:'kg'}],budgetMillimes:10000,expectedScopeId:'family'};
assert.equal((await POST(post({...basket,provider:'unknown'}))).status,400);
assert.equal((await POST(post({...basket,expectedScopeId:'stale'}))).status,409);assert.equal(f.rows.length,0);
response=await POST(post({...basket,provider:'yassir'}));assert.equal(response.status,200);let draft=await response.json();assert.equal(draft.provider,'yassir');assert.equal(draft.verified,false);
assert.equal((await POST(post({action:'execute',id:draft.id}))).status,503);
assert.equal((await POST(post({action:'approve',id:draft.id,provider:'glovo'}))).status,409);
assert.equal((await POST(post({action:'approve',id:draft.id}))).status,409);
f.rows=[];response=await POST(post(basket));draft=await response.json();assert.equal(draft.provider,'glovo');
// Fixture bridge never performs a real payment. A response cannot redirect the saved provider.
f.rows=[];f.env.YASSIR_BRIDGE_URL='https://fixture.example';f.env.YASSIR_BRIDGE_TOKEN='fixture-only';
const now=Date.now();const quote={verified:true,provider:'glovo',id:'poison',status:'confirmed',userId:'outsider',createdAt:0,scopeId:'poison',quoteId:'q1',storeName:'Fixture',deliveryAddress:'Test address',summary:'Riz livré',items:[{productId:'rice',name:'Riz',quantity:1,unit:'kg',priceMillimes:2000}],subtotalMillimes:2000,deliveryMillimes:1000,serviceMillimes:0,otherFeesMillimes:0,discountMillimes:0,totalMillimes:3000,expiresAt:now+60000};
const originalFetch=globalThis.fetch;
try {
 globalThis.fetch=async(url,init)=>{f.calls.push({url,body:JSON.parse(init.body)});return Response.json(String(url).endsWith('/quote')?quote:{status:'confirmed',externalOrderId:'fixture-order',approvedQuoteId:'q1',totalMillimes:3000})};
 response=await POST(post({...basket,provider:'yassir'}));draft=await response.json();assert.equal(draft.provider,'yassir');assert.equal(draft.verified,true);assert.notEqual(draft.id,'poison');assert.equal(draft.status,'draft');assert.equal(draft.scopeId,'family');assert.equal(draft.userId,undefined);
 let listed=(await (await GET()).json()).orders[0];assert.equal(listed.id,draft.id);assert.equal(listed.status,'draft');assert.notEqual(listed.createdAt,0);assert.equal(listed.userId,undefined);
 assert.equal((await POST(post({action:'approve',id:draft.id,expectedScopeId:'stale'}))).status,409);
 f.scopeId='another-family';assert.equal((await POST(post({action:'approve',id:draft.id}))).status,409);f.scopeId='family';
 assert.equal((await POST(post({action:'approve',id:draft.id,provider:'glovo'}))).status,409);
 assert.equal((await POST(post({action:'approve',id:draft.id}))).status,200);
 assert.equal((await POST(post({action:'execute',id:draft.id,provider:'glovo'}))).status,409);
 assert.equal((await POST(post({action:'execute',id:draft.id}))).status,200);
 assert.equal(f.calls[1].url,'https://fixture.example/execute');assert.equal(f.calls[1].body.approvedSnapshot.provider,'yassir');
 assert.equal((await POST(post({action:'execute',id:draft.id}))).status,409);assert.equal(f.calls.length,2);
 // An empty external ID cannot be taken as payment confirmation.
 f.rows=[];f.calls=[];
 globalThis.fetch=async(url,init)=>{f.calls.push({url,body:JSON.parse(init.body)});return Response.json(String(url).endsWith('/quote')?quote:{status:'confirmed',externalOrderId:'   ',approvedQuoteId:'q1',totalMillimes:3000})};
 draft=await (await POST(post({...basket,provider:'yassir'}))).json();
 assert.equal((await POST(post({action:'approve',id:draft.id}))).status,200);
 let uncertain=await POST(post({action:'execute',id:draft.id}));assert.equal(uncertain.status,502);assert.equal((await uncertain.json()).status,'unknown');assert.equal(f.rows[0].status,'unknown');
} finally {globalThis.fetch=originalFetch}
console.log('Delivery route: malformed configuration, scope, persisted provider, approval and fixture execution passed.');

const legacy=f.rows[0];const legacyPayload=JSON.parse(legacy.payload);delete legacyPayload.scopeId;delete legacyPayload.provider;legacyPayload.id='poison';legacyPayload.status='wrong';legacyPayload.userId='outsider';legacyPayload.createdAt=0;legacy.payload=JSON.stringify(legacyPayload);let listing=(await (await GET()).json()).orders[0];assert.equal(listing.id,legacy.id);assert.equal(listing.status,legacy.status);assert.equal(listing.userId,undefined);assert.equal(listing.createdAt,legacy.createdAt);assert.equal((await POST(post({action:'approve',id:legacy.id}))).status,409);
