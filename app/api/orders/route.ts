import { env } from 'cloudflare:workers';
import { and, eq, desc } from 'drizzle-orm';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { orderDrafts } from '@/db/schema';
import { canApprove, validateLines, validateQuote } from '@/lib/order-policy';
import { boundedJson, callDeliveryBridge, deliveryConfig, deliveryLabel, deliveryProvider, deliveryStatuses } from '@/lib/delivery';
import { resolveHousehold } from '@/lib/household-access';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'private, no-store'}});
const settings = () => env as unknown as Record<string,string|undefined>;
export async function GET() {
 const user = await getChatGPTUser(); if(!user) return json({error:'Connexion requise.'},401);
 const rows = await getDb().select().from(orderDrafts).where(eq(orderDrafts.userId,user.userId)).orderBy(desc(orderDrafts.createdAt)).limit(30);
 return json({connected:!!deliveryConfig('glovo',settings()),providers:deliveryStatuses(settings()),orders:rows.map(r=>{const payload=JSON.parse(r.payload);return {...payload,id:r.id,status:r.status,expiresAt:r.expiresAt,createdAt:r.createdAt,provider:deliveryProvider(payload.provider),payload:undefined,userId:undefined};}).sort((a,b)=>b.createdAt-a.createdAt)});
}
export async function POST(request:Request) {
 const user = await getChatGPTUser(); if(!user) return json({error:'Connexion requise.'},401);
 if(request.headers.get('origin') !== new URL(request.url).origin) return json({error:'Origine refusée.'},403);
 try {
  if(Number(request.headers.get('content-length')||0)>50000) return json({error:'Panier trop volumineux.'},413);
  const b=await boundedJson(request); const db=getDb();
  const access=await resolveHousehold(user.userId);
  if(b.expectedScopeId!==undefined && b.expectedScopeId!==access.scopeId) return json({error:'Le foyer a changé. Rechargez les réserves avant de préparer le panier.'},409);
  if(b.action==='prepare') {
   const provider=deliveryProvider(b.provider);
   const lines=validateLines(b.items);
   const budget=Number(b.budgetMillimes); if(!Number.isSafeInteger(budget)||budget<0||budget>100000000) return json({error:'Budget invalide.'},400);
   const id=crypto.randomUUID(); const now=Date.now();
   let payload: {items:unknown;verified:boolean;totalMillimes:number|null;budgetMillimes:number;quoteId?:string;summary?:string;externalOrderId?:string;[key:string]:unknown}={provider,scopeId:access.scopeId,items:lines,verified:false,totalMillimes:null,budgetMillimes:budget};
   if(deliveryConfig(provider,settings())) {
    const quote=await callDeliveryBridge(provider,settings(),'/quote',{id,items:lines,budgetMillimes:budget});
    const verified=validateQuote(quote,now);
    payload={...payload,...verified,provider,scopeId:access.scopeId,budgetMillimes:budget};
   }
   await db.insert(orderDrafts).values({id,userId:user.userId,payload:JSON.stringify(payload),status:'draft',expiresAt:typeof payload.expiresAt==='number'?payload.expiresAt:now+10*60*1000,createdAt:now});
   return json({...payload,id,status:'draft',connected:!!deliveryConfig(provider,settings()),message:payload.verified?'Panier vérifié, à approuver.':'Liste enregistrée. '+deliveryLabel(provider)+' non connecté : aucun prix livré ni achat confirmé.'});
  }
  if(typeof b.id!=='string') return json({error:'Commande invalide.'},400);
  const where=and(eq(orderDrafts.id,b.id),eq(orderDrafts.userId,user.userId));
  const [row]=await db.select().from(orderDrafts).where(where); if(!row) return json({error:'Commande introuvable.'},404);
  const payload=JSON.parse(row.payload);
  if((payload.scopeId ?? user.userId)!==access.scopeId) return json({error:'Ce panier appartient à un autre foyer. Préparez un nouveau panier dans le foyer actuel.'},409);
  const provider=deliveryProvider(payload.provider);
  if(b.provider!==undefined && deliveryProvider(b.provider)!==provider) return json({error:'Le service de livraison du panier ne peut pas être modifié.'},409);
  if(b.action==='approve') {
   if(row.status!=='draft'||!payload.quoteId||!canApprove(payload,row.expiresAt)) return json({error:'Un devis livré complet, récent et dans le budget est nécessaire.'},409);
   await db.update(orderDrafts).set({status:'approved'}).where(and(where,eq(orderDrafts.status,'draft')));
   return json({id:row.id,status:'approved'});
  }
  if(b.action==='execute') {
   if(!deliveryConfig(provider,settings())) return json({error:deliveryLabel(provider)+' non connecté. Aucune commande passée.'},503);
   if(row.status!=='approved'||!payload.quoteId||!canApprove(payload,row.expiresAt)) return json({error:'Approbation valide requise.'},409);
   // The bridge must revalidate quote identity before any payment. CAS prevents duplicate submissions.
   const result=await db.update(orderDrafts).set({status:'submitting'}).where(and(where,eq(orderDrafts.status,'approved'))).returning({id:orderDrafts.id});
   if(!result.length) return json({error:'Commande déjà en cours.'},409);
   try {
    const receipt=await callDeliveryBridge(provider,settings(),'/execute',{idempotencyKey:row.id,quoteId:payload.quoteId,approvedSnapshot:payload,expiresAt:row.expiresAt});
    if(receipt.status!=='confirmed'||typeof receipt.externalOrderId!=='string'||!receipt.externalOrderId.trim()||receipt.externalOrderId.length>500||receipt.approvedQuoteId!==payload.quoteId||receipt.totalMillimes!==payload.totalMillimes) throw new Error('Statut externe incertain.');
    await db.update(orderDrafts).set({status:'confirmed',payload:JSON.stringify({...payload,externalOrderId:receipt.externalOrderId})}).where(where);
    return json({id:row.id,status:'confirmed',externalOrderId:receipt.externalOrderId});
   }catch{
    await db.update(orderDrafts).set({status:'unknown'}).where(where);
    return json({error:'Statut de commande inconnu. Vérifiez '+deliveryLabel(provider)+' avant toute nouvelle tentative.',status:'unknown'},502);
   }
  }
  return json({error:'Action inconnue.'},400);
 }catch(e){return json({error:e instanceof Error?e.message:'Erreur de commande.'},e instanceof Error && e.message==='Panier trop volumineux.'?413:400);}
}
