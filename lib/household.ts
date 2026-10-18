import { z } from 'zod';
import { CAPABILITIES, emptyState } from './domain';
import type { HouseholdItem, HouseholdResponse, HouseholdState, ConsumptionForecast, ShoppingItem } from './domain';
const short = z.string().trim().min(1).max(160);
const qty = z.number().finite().min(0).max(100000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'Date invalide').nullable();
const fields = {
  name: short, brand: z.string().trim().max(120).default(''), quantity: qty.default(1),
  unit: short.default('pièce'), category: z.enum(['food','hygiene','cleaning','drinks']).default('food'),
  location: short.default('Placard'), level: z.enum(['sufficient','low','empty']).default('sufficient'),
  expiry: date.default(null), monthlyUsage: z.number().finite().positive().max(100000).nullable().default(null),
};
const item = z.object(fields).strict();
// OCR may omit or return null metadata. Neither erases previously confirmed values.
// Quantity must always be explicitly confirmed before importing an observation.
const importItem = z.object({
  id: short.optional(), name: short, quantity: qty,
  brand: z.string().trim().max(120).nullable().optional(),
  unit: short.nullable().optional(), category: z.enum(['food','hygiene','cleaning','drinks']).nullable().optional(),
  location: short.nullable().optional(), level: z.enum(['sufficient','low','empty']).nullable().optional(),
  expiry: date.optional(), monthlyUsage: z.number().finite().positive().max(100000).nullable().optional(),
}).strict();
const shoppingFields = {name: short, quantity: z.number().finite().positive().max(100000).default(1), unit: short.default('pièce'), checked: z.boolean().default(false), priceMillimes: z.number().int().min(0).max(100000000).nullable().default(null), retailer: z.string().trim().max(120).optional()};
const shopping = z.object(shoppingFields).strict();
const preferences = z.object({people: z.number().int().min(1).max(30), budgetMillimes: z.number().int().min(0).max(100000000), diet: z.array(short).max(20), maxStores: z.number().int().min(1).max(5)}).strict();
const base = {requestId: z.string().uuid(),expectedScopeId:z.string().min(1).max(160).optional()};
export const actionSchema = z.discriminatedUnion('action', [
  z.object({...base,action:z.literal('add_item'),item}).strict(),
  z.object({...base,action:z.literal('update_item'),id:short,patch:item.partial()}).strict(),
  z.object({...base,action:z.literal('delete_item'),id:short}).strict(),
  z.object({...base,action:z.literal('mark_level'),id:short,level:z.enum(['sufficient','low','empty'])}).strict(),
  z.object({...base,action:z.literal('suggest_shopping'),days:z.union([z.literal(7),z.literal(30)]).default(7)}).strict(),
  z.object({...base,action:z.literal('consume_item'),id:short,quantity:z.number().finite().positive().max(100000).default(1)}).strict(),
  z.object({...base,action:z.literal('undo_event'),id:short}).strict(),
  z.object({...base,action:z.literal('add_shopping'),item:shopping}).strict(),
  z.object({...base,action:z.literal('update_shopping'),id:short,patch:shopping.partial()}).strict(),
  z.object({...base,action:z.literal('delete_shopping'),id:short}).strict(),
  z.object({...base,action:z.literal('save_preferences'),preferences}).strict(),
  z.object({...base,action:z.literal('import_items'),items:z.array(importItem).min(1).max(200),mode:z.enum(['inventory','purchase']).default('inventory'),fingerprints:z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(4).optional()}).strict(),
  z.object({...base,action:z.literal('clear_data'),confirmation:z.literal('SUPPRIMER')}).strict(),
]);
export type HouseholdAction = z.infer<typeof actionSchema>;
export class DomainError extends Error { constructor(message:string, public status=400){super(message);} }
export function publicState(state:HouseholdState,version:number):HouseholdResponse {
  return {items:state.items,shopping:state.shopping,preferences:state.preferences,events:state.events.map(event => {const copy={...event};delete copy.before;return copy;}),forecasts:calculateForecasts(state),capabilities:CAPABILITIES,version};
}
export function applyAction(state:HouseholdState,action:HouseholdAction,fingerprint:string,now=new Date().toISOString()):HouseholdState {
  const existing=state.requests.find(r=>r.id===action.requestId);
  if(existing){if(existing.fingerprint!==fingerprint)throw new DomainError('Identifiant de requête déjà utilisé pour une autre action.',409);return state;}
  const next=structuredClone(state);
  const before={items:structuredClone(next.items),shopping:structuredClone(next.shopping),preferences:structuredClone(next.preferences),importFingerprints:[...(next.importFingerprints??[])],consumption:structuredClone(next.consumption??[])};
  let label:string=action.action;
  const findItem=(id:string)=>{const found=next.items.find(i=>i.id===id);if(!found)throw new DomainError('Produit introuvable.',404);return found;};
  switch(action.action){
    case 'add_item': next.items.push({...action.item,id:crypto.randomUUID(),updatedAt:now});label=`Ajout : ${action.item.name}`;break;
    case 'import_items': {
      const hashes=[...new Set(action.fingerprints??[])];
      const confirmed=next.importFingerprints??[];
      if(hashes.some(hash=>confirmed.includes(hash)))throw new DomainError('Cette photo a déjà été confirmée. Utilisez une nouvelle photo ou annulez le dernier import.',409);
      // Persist without eviction: duplicate protection survives request history rotation.
      if(confirmed.length+hashes.length>2000)throw new DomainError('Limite de 2 000 empreintes photo atteinte. Exportez puis réinitialisez les données pour continuer.',409);
      const normalize=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
      for(const incoming of action.items){
        const candidates=incoming.id
          ?next.items.filter(i=>i.id===incoming.id)
          :next.items.filter(i=>normalize(i.name)===normalize(incoming.name)
            && (incoming.brand==null || normalize(i.brand)===normalize(incoming.brand))
            && (incoming.unit==null || normalize(i.unit)===normalize(incoming.unit)));
        if(incoming.id && candidates.length===0)throw new DomainError('Produit à rapprocher introuvable.',404);
        if(candidates.length>1)throw new DomainError('Plusieurs produits correspondent. Confirmez la marque et le format ou choisissez un produit.',409);
        const found=candidates[0];
        const metadata=Object.fromEntries(Object.entries(incoming).filter(([key,value])=>key!=='id' && value!=null));
        if(found){
          const quantity=action.mode==='purchase'?found.quantity+incoming.quantity:incoming.quantity;
          if(quantity>100000)throw new DomainError('Quantité cumulée trop élevée.');
          if(incoming.unit!=null && incoming.unit!==found.unit)next.consumption=(next.consumption??[]).filter(o=>o.itemId!==found.id);
          Object.assign(found,metadata,{id:found.id,quantity,updatedAt:now});
          if(incoming.level==null && incoming.quantity>0 && (action.mode==='purchase' || found.level==='empty'))found.level='sufficient';
        }else{next.items.push({...item.parse(metadata),id:crypto.randomUUID(),updatedAt:now});}
      }
      next.importFingerprints=[...confirmed,...hashes];
      label=`${action.mode==='purchase'?'Achats':'Inventaire'} : ${action.items.length} produits confirmés`;break;
    }
    case 'update_item': {const found=findItem(action.id);if(action.patch.unit!==undefined && action.patch.unit!==found.unit)next.consumption=(next.consumption??[]).filter(o=>o.itemId!==found.id);Object.assign(found,action.patch,{updatedAt:now});label=`Mise à jour : ${found.name}`;break;}
    case 'delete_item': {const index=next.items.findIndex(i=>i.id===action.id);if(index<0)throw new DomainError('Produit introuvable.',404);label=`Suppression : ${next.items[index].name}`;next.items.splice(index,1);break;}
    case 'mark_level': {
      const found=findItem(action.id);found.level=action.level;found.updatedAt=now;
      if(action.level==='empty')found.quantity=0;
      if(action.level!=='sufficient')mergeShopping(next.shopping,{name:found.name,quantity:1,unit:found.unit,checked:false,priceMillimes:null});
      label=`${action.level==='empty'?'Terminé':action.level==='low'?'Bientôt fini':'Suffisant'} : ${found.name}`;break;
    }
    case 'suggest_shopping': {
      const forecasts=calculateForecasts(next,now);
      for(const stock of next.items){
        const forecast=forecasts.find(f=>f.itemId===stock.id);
        const deficit=forecast?Math.max(0,forecast.monthly*action.days/30.4375-stock.quantity):0;
        const quantity=Math.max(stock.level==='low'||stock.level==='empty'?1:0,Math.ceil(deficit));
        if(quantity>0)mergeShopping(next.shopping,{name:stock.name,quantity,unit:stock.unit,checked:false,priceMillimes:null});
      }
      label=`Courses proposées pour ${action.days} jours`;break;
    }
    case 'consume_item': {const found=findItem(action.id);if(action.quantity>found.quantity)throw new DomainError('Quantité supérieure au stock confirmé.');found.quantity-=action.quantity;if(found.quantity===0)found.level='empty';found.updatedAt=now;next.consumption=[...(next.consumption??[]),{itemId:found.id,quantity:action.quantity,at:now}].slice(-1000);label=`Consommation : ${found.name}`;break;}
    case 'add_shopping':mergeShopping(next.shopping,action.item);label=`Liste : ${action.item.name}`;break;
    case 'update_shopping': {const found=next.shopping.find(i=>i.id===action.id);if(!found)throw new DomainError('Article introuvable.',404);Object.assign(found,action.patch);label=`Liste modifiée : ${found.name}`;break;}
    case 'delete_shopping': {const index=next.shopping.findIndex(i=>i.id===action.id);if(index<0)throw new DomainError('Article introuvable.',404);next.shopping.splice(index,1);label='Article retiré de la liste';break;}
    case 'save_preferences':next.preferences=action.preferences;label='Préférences enregistrées';break;
    case 'undo_event': {const latest=next.events.at(-1);if(!latest||latest.id!==action.id||latest.undone||!latest.before)throw new DomainError('Seule la dernière action peut être annulée.',409);next.items=latest.before.items;next.shopping=latest.before.shopping;next.preferences=latest.before.preferences;next.importFingerprints=latest.before.importFingerprints??[];next.consumption=latest.before.consumption??[];latest.undone=true;delete latest.before;break;}
    case 'clear_data': {const cleared=emptyState();cleared.requests=next.requests;Object.assign(next,cleared);label='Données effacées';break;}
  }
  if(next.items.length>500||next.shopping.length>300)throw new DomainError('Limite atteinte : 500 produits et 300 articles de courses.');
  if(action.action!=='undo_event'){
    // Only the latest mutation can be undone, preventing restoration over later edits.
    next.events=next.events.map(event=>{const copy={...event};delete copy.before;return copy;});
    next.events.push({id:crypto.randomUUID(),action:action.action,label,createdAt:now,...(action.action==='clear_data'?{}:{before})});
    next.events=next.events.slice(-50);
  }
  // Compatibility cache only: the route's durable D1 mutation ledger protects
  // requests beyond this window, including old purchase retries.
  next.requests.push({id:action.requestId,fingerprint});next.requests=next.requests.slice(-100);
  return next;
}
const normalizeShopping=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('fr').replace(/\s+/g,' ');
/** Repeated needs are merged by maximum quantity; only confirmed purchases add stock. */
function mergeShopping(list:ShoppingItem[],incoming:Omit<ShoppingItem,'id'>):void {
  const name=normalizeShopping(incoming.name),unit=normalizeShopping(incoming.unit);
  const matches=list.filter(entry=>normalizeShopping(entry.name)===name && normalizeShopping(entry.unit)===unit);
  const retailer=normalizeShopping(incoming.retailer??'');
  // A generic need also matches an existing store assignment. Never overwrite it.
  const found=matches.find(entry=>!retailer || normalizeShopping(entry.retailer??'')===retailer)
    ??matches.find(entry=>!entry.retailer);
  if(found){
    const quantity=Math.max(found.quantity,incoming.quantity);
    // A checked article becomes outstanding again only when explicitly re-added.
    if(found.checked){found.checked=false;found.priceMillimes=quantity===incoming.quantity?incoming.priceMillimes:null;}
    else if(quantity!==found.quantity)found.priceMillimes=null;
    found.quantity=quantity;
    if(!found.retailer && incoming.retailer)found.retailer=incoming.retailer;
  }else list.push({...incoming,id:crypto.randomUUID()});
}
export function monthlyForecast(item:HouseholdItem):{monthly:number;annual:number;toBuy:number}|null {
  if(item.monthlyUsage===null)return null;
  return {monthly:item.monthlyUsage,annual:item.monthlyUsage*12,toBuy:Math.max(0,item.monthlyUsage-item.quantity)};
}

/** Learn only from explicit consumption, never from purchases or photo differences. */
export function calculateForecasts(state:HouseholdState,now=new Date().toISOString()):ConsumptionForecast[] {
  const end=Date.parse(now);
  return state.items.flatMap<ConsumptionForecast>(item=>{
    if(item.monthlyUsage!==null)return [{itemId:item.id,basis:'declared' as const,monthly:item.monthlyUsage,annual:item.monthlyUsage*12,confidence:'provisional' as const,samples:0,spanDays:0}];
    const observations=(state.consumption??[]).filter(o=>o.itemId===item.id && Number.isFinite(o.quantity) && o.quantity>0 && Number.isFinite(Date.parse(o.at)) && Date.parse(o.at)<=end).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    if(observations.length<3)return [];
    const spanDays=(Date.parse(observations.at(-1)!.at)-Date.parse(observations[0].at))/86400000;
    if(spanDays<14)return [];
    // The first event establishes the start; only subsequent use belongs to that interval.
    const monthly=observations.slice(1).reduce((sum,o)=>sum+o.quantity,0)/spanDays*30.4375;
    return [{itemId:item.id,basis:'observed' as const,monthly,annual:monthly*12,confidence:'provisional' as const,samples:observations.length,spanDays}];
  });
}
