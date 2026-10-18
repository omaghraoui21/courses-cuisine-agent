import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { orderDrafts } from '@/db/schema';
import { canApprove, validateLines, validateQuote } from '@/lib/order-policy';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'private, no-store'}});
function bridgeConfig() {
 const e = env as unknown as Record<string,string|undefined>;
 if (!e.GLOVO_BRIDGE_URL || !e.GLOVO_BRIDGE_TOKEN) return null;
 const u = new URL(e.GLOVO_BRIDGE_URL);
 if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
 return {url:u.href.replace(/\/$/,''),token:e.GLOVO_BRIDGE_TOKEN};
}
async function bridge(path: string, body: unknown) {
 const c = bridgeConfig(); if(!c) throw new Error('Glovo non connecté.');
 const r = await fetch(c.url+path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.token},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok) throw new Error('Le service de commande ne répond pas.');
 return await r.json() as Record<string,unknown>;
}
export async function GET() {
 const user = await getChatGPTUser(); if(!user) return json({error:'Connexion requise.'},401);
 const rows = await getDb().select().from(orderDrafts).where(eq(orderDrafts.userId,user.userId)).limit(30);
 return json({connected:!!bridgeConfig(),orders:rows.map(r=>({...r,...JSON.parse(r.payload),payload:undefined,userId:undefined})).sort((a,b)=>b.createdAt-a.createdAt)});
}
export async function POST(request:Request) {
 const user = await getChatGPTUser(); if(!user) return json({error:'Connexion requise.'},401);
 if(request.headers.get('origin') !== new URL(request.url).origin) return json({error:'Origine refusée.'},403);
 try {
  if(Number(request.headers.get('content-length')||0)>50000) return json({error:'Panier trop volumineux.'},413);
  const b=await request.json() as Record<string,unknown>; const db=getDb();
  if(b.action==='prepare') {
   const lines=validateLines(b.items);
   const budget=Number(b.budgetMillimes); if(!Number.isSafeInteger(budget)||budget<0||budget>100000000) return json({error:'Budget invalide.'},400);
   const id=crypto.randomUUID(); const now=Date.now();
   let payload: {items:unknown;verified:boolean;totalMillimes:number|null;budgetMillimes:number;quoteId?:string;summary?:string;externalOrderId?:string;[key:string]:unknown}={items:lines,verified:false,totalMillimes:null,budgetMillimes:budget};
   if(bridgeConfig()) {
    const quote=await bridge('/quote',{id,items:lines,budgetMillimes:budget});
    const verified=validateQuote(quote,now);
    payload={...payload,...verified,budgetMillimes:budget};
   }
   await db.insert(orderDrafts).values({id,userId:user.userId,payload:JSON.stringify(payload),status:'draft',expiresAt:typeof payload.expiresAt==='number'?payload.expiresAt:now+10*60*1000,createdAt:now});
   return json({id,status:'draft',...payload,connected:!!bridgeConfig(),message:payload.verified?'Panier vérifié, à approuver.':'Liste enregistrée. Glovo non connecté : aucun prix livré ni achat confirmé.'});
  }
  if(typeof b.id!=='string') return json({error:'Commande invalide.'},400);
  const where=and(eq(orderDrafts.id,b.id),eq(orderDrafts.userId,user.userId));
  const [row]=await db.select().from(orderDrafts).where(where); if(!row) return json({error:'Commande introuvable.'},404);
  const payload=JSON.parse(row.payload);
  if(b.action==='approve') {
   if(row.status!=='draft'||!payload.quoteId||!canApprove(payload,row.expiresAt)) return json({error:'Un devis livré complet, récent et dans le budget est nécessaire.'},409);
   await db.update(orderDrafts).set({status:'approved'}).where(and(where,eq(orderDrafts.status,'draft')));
   return json({id:row.id,status:'approved'});
  }
  if(b.action==='execute') {
   if(!bridgeConfig()) return json({error:'Glovo non connecté. Aucune commande passée.'},503);
   if(row.status!=='approved'||!payload.quoteId||!canApprove(payload,row.expiresAt)) return json({error:'Approbation valide requise.'},409);
   // The bridge must revalidate quote identity before any payment. CAS prevents duplicate submissions.
   const result=await db.update(orderDrafts).set({status:'submitting'}).where(and(where,eq(orderDrafts.status,'approved'))).returning({id:orderDrafts.id});
   if(!result.length) return json({error:'Commande déjà en cours.'},409);
   try {
    const receipt=await bridge('/execute',{idempotencyKey:row.id,quoteId:payload.quoteId,approvedSnapshot:payload,expiresAt:row.expiresAt});
    if(receipt.status!=='confirmed'||typeof receipt.externalOrderId!=='string'||receipt.approvedQuoteId!==payload.quoteId||receipt.totalMillimes!==payload.totalMillimes) throw new Error('Statut externe incertain.');
    await db.update(orderDrafts).set({status:'confirmed',payload:JSON.stringify({...payload,externalOrderId:receipt.externalOrderId})}).where(where);
    return json({id:row.id,status:'confirmed',externalOrderId:receipt.externalOrderId});
   }catch{
    await db.update(orderDrafts).set({status:'unknown'}).where(where);
    return json({error:'Statut de commande inconnu. Vérifiez Glovo avant toute nouvelle tentative.',status:'unknown'},502);
   }
  }
  return json({error:'Action inconnue.'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Erreur de commande.'},400);}
}
