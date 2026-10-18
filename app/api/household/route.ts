import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { householdStates } from '@/db/schema';
import {saveBackup} from '@/lib/backups';
import {wasApplied,recordApplied,receiptKey} from '@/lib/mutation-ledger';
import { emptyState } from '@/lib/domain';
import { resolveHousehold, householdMetadata } from '@/lib/household-access';
import type { HouseholdState } from '@/lib/domain';
import { actionSchema, applyAction, DomainError, publicState } from '@/lib/household';

const responseHeaders={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
function json(value:unknown,status=200){return Response.json(value,{status,headers:responseHeaders});}
function capabilities(state:HouseholdState,version:number){
  const result=publicState(state,version);
  const aiEnv=env as unknown as Record<string,unknown>;
  result.capabilities={...result.capabilities,photoRecognition:Boolean(aiEnv.AI_GATEWAY_API_KEY && aiEnv.AI_GATEWAY_MODEL)};
  return result;
}
async function read(userId:string){
  const db=getDb();
  const [row]=await db.select().from(householdStates).where(eq(householdStates.userId,userId)).limit(1);
  return {db,row,state:row?JSON.parse(row.data) as HouseholdState:emptyState()};
}
export async function GET(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Connexion ChatGPT requise.'},401);
  try {
    const access=await resolveHousehold(user.userId);
    const {row,state}=await read(access.scopeId);
    if(new URL(request.url).searchParams.get('export')==='1'){
      return new Response(JSON.stringify({formatVersion:1,exportedAt:new Date().toISOString(),...publicState(state,row?.version??0),consumption:state.consumption??[],importFingerprints:state.importFingerprints??[]},null,2),{
        headers:{...responseHeaders,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="courses-cuisine-export.json"'},
      });
    }
    return json({...capabilities(state,row?.version??0),household:householdMetadata(access)});
  }catch(error){console.error('Household read failed',error instanceof Error?error.name:'unknown');return json({error:'Stock temporairement indisponible. Réessayez.'},503);}
}
export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:'Connexion ChatGPT requise.'},401);
  const origin=request.headers.get('origin');
  if(!origin || origin!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine de requête refusée.'},403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'JSON requis.'},415);
  if(Number(request.headers.get('content-length')??0)>200000)return json({error:'Requête trop volumineuse.'},413);
  try {
    const body=await request.text();if(body.length>200000)return json({error:'Requête trop volumineuse.'},413);
    let payload:unknown;try{payload=JSON.parse(body);}catch{return json({error:'JSON invalide.'},400);}
    const parsed=actionSchema.safeParse(payload);
    if(!parsed.success)return json({error:'Données invalides.',issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))},400);
    const access=await resolveHousehold(user.userId);
    if(parsed.data.expectedScopeId && parsed.data.expectedScopeId!==access.scopeId)return json({error:'Votre foyer a changé. Rechargez vos réserves avant de modifier.'},409);
    if(parsed.data.action==='clear_data' && access.role!=='owner')return json({error:'Seul le propriétaire peut effacer les données du foyer.'},403);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(parsed.data)));
    const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    for(let attempt=0;attempt<5;attempt++){
      const latestAccess=await resolveHousehold(user.userId);
      if(latestAccess.scopeId!==access.scopeId||latestAccess.role!==access.role)return json({error:'Votre accès au foyer a changé. Actualisez la page.'},409);
      const {row,state}=await read(access.scopeId);
      if(await wasApplied(access.scopeId,user.userId,parsed.data.requestId,fingerprint))return json({...capabilities(state,row?.version??0),household:householdMetadata(access)});
      const next=applyAction(state,parsed.data,fingerprint);
      if(next===state){
        await recordApplied(access.scopeId,user.userId,parsed.data.requestId,fingerprint);
        return json({...capabilities(state,row?.version??0),household:householdMetadata(access)});
      }
      if(row)await saveBackup(access.scopeId,user.userId,state,parsed.data.action==='clear_data'?'before_clear':'automatic');
      const now=new Date().toISOString();
      const permission=`(EXISTS(SELECT 1 FROM household_members WHERE user_id=? AND household_id=?) OR (?=? AND NOT EXISTS(SELECT 1 FROM household_members WHERE user_id=?)))`;
      const guard=[user.userId,access.scopeId,user.userId,access.scopeId,user.userId];
      const key=receiptKey(access.scopeId,parsed.data.requestId);
      const noReceipt='NOT EXISTS(SELECT 1 FROM mutation_receipts WHERE key=?)';
      const write=row
        ?env.DB!.prepare(`UPDATE household_states SET data=?,version=version+1,updated_at=? WHERE user_id=? AND version=? AND ${permission} AND ${noReceipt} RETURNING version`).bind(JSON.stringify(next),now,access.scopeId,row.version,...guard,key)
        :env.DB!.prepare(`INSERT OR IGNORE INTO household_states(user_id,data,version,updated_at) SELECT ?,?,1,? WHERE ${permission} AND ${noReceipt} RETURNING version`).bind(access.scopeId,JSON.stringify(next),now,...guard,key);
      const receipt=env.DB!.prepare('INSERT INTO mutation_receipts(key,scope_id,request_id,actor_id,fingerprint,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(key,access.scopeId,parsed.data.requestId,user.userId,fingerprint,now);
      // D1 batch is transactional: the stock change and its permanent receipt commit together.
      const batch=await env.DB!.batch<{version:number}>([write,receipt]);
      const updated=batch[0].results?.[0];
      if(updated){
        if(parsed.data.expectedScopeId && parsed.data.expectedScopeId!==access.scopeId)return json({error:'Votre foyer a changé. Rechargez vos réserves avant de modifier.'},409);
    if(parsed.data.action==='clear_data')await env.DB!.prepare('DELETE FROM order_drafts WHERE user_id=? AND created_at<=?').bind(user.userId,Date.parse(now)).run();
        return json({...capabilities(next,updated.version),household:householdMetadata(access)});
      }
    }
    return json({error:'Modification simultanée. Réessayez avec le même identifiant de requête.'},409);
  }catch(error){
    if(error instanceof DomainError)return json({error:error.message},error.status);
    console.error('Household mutation failed',error instanceof Error?error.name:'unknown');
    return json({error:'Enregistrement indisponible. Votre action n’est pas confirmée ; réessayez.'},503);
  }
}
