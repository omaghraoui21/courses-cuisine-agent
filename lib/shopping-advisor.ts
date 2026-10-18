import type { HouseholdItem, ShoppingItem } from './domain';
import type { Offer, RetailerResult } from './retailers';

export type ShoppingNeed = { key:string; name:string; quantity:number; unit:string; reason:string; priority:number; listed:boolean; listedQuantity:number; needsIncrease:boolean };
export type PackSize = { quantity:number; unit:'kg'|'L' };
export type OfferEvidence = { offer:Offer; retailer:string; checkedAt:string; pack:PackSize|null; unitPriceMillimes:number|null };
export const MAX_OFFER_AGE_MS = 24 * 60 * 60 * 1000;
export function normalizeLabel(value:string):string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/œ/g,'oe').replace(/[^\p{L}\p{N}]+/gu,' ').trim(); }
function normalizeUnit(value:string):string { const s=normalizeLabel(value); return ({litre:'L',litres:'L',l:'L',kg:'kg',g:'g',ml:'ml',cl:'cl',piece:'pièce',pieces:'pièce',unite:'pièce',unites:'pièce'} as Record<string,string>)[s]||s; }
function tunisDate(now:Date):string { return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Tunis',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
/** Only one explicit weight/volume expression is accepted. Counts without a size are unknown. */
export function parsePackSize(label:string):PackSize|null {
 const text=label.toLowerCase().replace(/,/g,'.');
 const expressions=[...text.matchAll(/(?:(\d+)\s*[x×*]\s*)?(\d+(?:\.\d+)?)\s*(kg|ml|cl|litres?|l|g)\b/g)];
 if(expressions.length!==1)return null;
 const m=expressions[0];
 // Reject reverse/multi-stage multipacks and bonus/alternative sizes instead of guessing.
 const rest=text.slice(0,m.index)+text.slice((m.index||0)+m[0].length);
 if(/[x×*+]\s*\d|\d\s*[x×*+]|\b(?:lot|pack)\s*(?:de\s*)?\d|\d\s*%|\//i.test(rest))return null;
 const count=Number(m[1]||1),amount=Number(m[2]);
 if(!Number.isSafeInteger(count)||count<1||count>1000||!Number.isFinite(amount)||amount<=0)return null;
 const volume=/^(?:ml|cl|litre|litres|l)$/.test(m[3]);
 const factor=({g:0.001,kg:1,ml:0.001,cl:0.01,l:1,litre:1,litres:1} as Record<string,number>)[m[3]];
 return {quantity:count*amount*factor,unit:volume?'L':'kg'};
}
function productLabel(offer:Offer):string {
 // Only remove a pack expression after it was unambiguously parsed; brands/variants remain.
 if(!parsePackSize(offer.name))return normalizeLabel(offer.name);
 return normalizeLabel(offer.name.replace(/(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|ml|cl|litres?|l|g)\b/i,''));
}
export function buildShoppingNeeds(items:HouseholdItem[],shopping:ShoppingItem[],days:7|30,now=new Date()):ShoppingNeed[] {
 const needs=new Map<string,ShoppingNeed>(),today=tunisDate(now);
 const keyOf=(name:string,unit:string)=>normalizeLabel(name)+'|'+normalizeUnit(unit);
 const merge=(next:ShoppingNeed)=>{const old=needs.get(next.key);if(old){old.quantity=Math.max(old.quantity,next.quantity);old.priority=Math.min(old.priority,next.priority);old.listed||=next.listed;old.listedQuantity=Math.max(old.listedQuantity,next.listedQuantity);old.needsIncrease=old.listed&&old.quantity>old.listedQuantity;if(!old.reason.includes(next.reason))old.reason+=' · '+next.reason;}else needs.set(next.key,next);};
 for(const line of shopping){if(line.checked||!normalizeLabel(line.name)||!Number.isFinite(line.quantity)||line.quantity<=0)continue;const key=keyOf(line.name,line.unit);merge({key,name:line.name,unit:line.unit,quantity:line.quantity,reason:'Déjà prévu dans votre liste',priority:1,listed:true,listedQuantity:line.quantity,needsIncrease:false});}
 const groups=new Map<string,HouseholdItem[]>();
 for(const item of items){if(!normalizeLabel(item.name))continue;const key=keyOf(item.name,item.unit);groups.set(key,[...(groups.get(key)||[]),item]);}
 for(const [key,group] of groups){
  const first=group[0],valid=group.filter(x=>!x.expiry||x.expiry>=today);
  const stock=valid.reduce((total,x)=>total+(x.level==='empty'?0:Math.max(0,x.quantity)),0);
  // A low signal in one container does not require purchase while another is sufficient.
  const urgent=valid.every(x=>x.level==='empty')||!valid.length;
  const low=!valid.some(x=>x.level==='sufficient'&&x.quantity>0)&&valid.some(x=>x.level==='low');
  // Monthly usage is a product-level declaration; repeated containers are not summed.
  const declarations=group.map(x=>x.monthlyUsage).filter((x):x is number=>x!==null&&Number.isFinite(x)&&x>0);
  const monthly=declarations.length?Math.max(...declarations):0;
  const deficit=monthly?Math.max(0,monthly*days/30-stock):0;
  if(urgent||low||deficit>0){const required=deficit>0?deficit:1;const continuous=['kg','g','L','ml','cl'].includes(normalizeUnit(first.unit));const quantity=continuous?Math.ceil(required*1000)/1000:Math.ceil(required);merge({key,name:first.name,unit:first.unit,quantity,reason:urgent?'Terminé ou date dépassée : vérifier avant achat':low?'Bientôt fini : quantité à confirmer':`Besoin estimé sur ${days} jours selon votre consommation déclarée`,priority:urgent?0:low?1:2,listed:false,listedQuantity:0,needsIncrease:false});}
 }
 return [...needs.values()].sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name,'fr'));
}
export function matchingOffers(need:Pick<ShoppingNeed,'name'>,retailers:RetailerResult[],now=new Date()):OfferEvidence[] {
 const wanted=normalizeLabel(need.name);if(!wanted)return [];
 const today=tunisDate(now),result:OfferEvidence[]=[];
 for(const retailer of retailers){
  const checked=Date.parse(retailer.lastChecked),age=now.getTime()-checked;
  if(retailer.status!=='ok'||!Number.isFinite(checked)||age<0||age>MAX_OFFER_AGE_MS)continue;
  for(const offer of retailer.offers){
   if(offer.validUntil){const parsed=Date.parse(offer.validUntil+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(offer.validUntil)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==offer.validUntil||offer.validUntil<today)continue;}
   if(!Number.isSafeInteger(offer.priceMillimes)||offer.priceMillimes<=0||productLabel(offer)!==wanted)continue;
   try {const url=new URL(offer.url);if(url.protocol!=='https:'||url.username||url.password)continue;}catch{continue;}
   const namedPack=parsePackSize(offer.name),declaredPack=parsePackSize(offer.unit||'');
   const hasSize=/\d\s*(?:kg|ml|cl|litres?|l|g)\b/i.test(offer.name);
   const conflict=namedPack&&declaredPack&&(namedPack.unit!==declaredPack.unit||Math.abs(namedPack.quantity-declaredPack.quantity)>0.000001);
   const pack=conflict?null:namedPack||(!hasSize?declaredPack:null);
   result.push({offer,retailer:retailer.name,checkedAt:retailer.lastChecked,pack,unitPriceMillimes:pack?Math.round(offer.priceMillimes/pack.quantity):null});
  }
 }
 return [...new Map(result.map(x=>[x.retailer+'|'+x.offer.url,x])).values()];
}

/** Project display-only reasoning out of the strict mutation contract. */
export function shoppingNeedLine(need:Pick<ShoppingNeed,"name"|"quantity"|"unit">){return {name:need.name,quantity:need.quantity,unit:need.unit};}
