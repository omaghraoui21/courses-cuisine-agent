import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { householdStates, orderDrafts } from '@/db/schema';
import { emptyState } from '@/lib/domain';
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
    const {row,state}=await read(user.userId);
    if(new URL(request.url).searchParams.get('export')==='1'){
      return new Response(JSON.stringify({formatVersion:1,exportedAt:new Date().toISOString(),...publicState(state,row?.version??0),consumption:state.consumption??[],importFingerprints:state.importFingerprints??[]},null,2),{
        headers:{...responseHeaders,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="courses-cuisine-export.json"'},
      });
    }
    return json(capabilities(state,row?.version??0));
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
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(parsed.data)));
    const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    for(let attempt=0;attempt<5;attempt++){
      const {db,row,state}=await read(user.userId);
      const next=applyAction(state,parsed.data,fingerprint);
      if(next===state){
        if(parsed.data.action==='clear_data')await db.delete(orderDrafts).where(eq(orderDrafts.userId,user.userId));
        return json(capabilities(state,row?.version??0));
      }
      const now=new Date().toISOString();
      const updated=row
        ?await db.update(householdStates).set({data:JSON.stringify(next),version:row.version+1,updatedAt:now}).where(and(eq(householdStates.userId,user.userId),eq(householdStates.version,row.version))).returning({version:householdStates.version})
        :await db.insert(householdStates).values({userId:user.userId,data:JSON.stringify(next),version:1,updatedAt:now}).onConflictDoNothing().returning({version:householdStates.version});
      if(updated.length){
        if(parsed.data.action==='clear_data')await db.delete(orderDrafts).where(eq(orderDrafts.userId,user.userId));
        return json(capabilities(next,updated[0].version));
      }
    }
    return json({error:'Modification simultanée. Réessayez avec le même identifiant de requête.'},409);
  }catch(error){
    if(error instanceof DomainError)return json({error:error.message},error.status);
    console.error('Household mutation failed',error instanceof Error?error.name:'unknown');
    return json({error:'Enregistrement indisponible. Votre action n’est pas confirmée ; réessayez.'},503);
  }
}
