export type OrderLine = { name: string; quantity: number; unit: string; priceMillimes: number | null };
export function validateLines(input: unknown): OrderLine[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new Error('Ajoutez entre 1 et 100 articles.');
  return input.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Article invalide.');
    const x = raw as Record<string, unknown>;
    if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > 150 || typeof x.quantity !== 'number' || !Number.isFinite(x.quantity) || x.quantity <= 0 || x.quantity > 1000) throw new Error('Article invalide.');
    const price = x.priceMillimes;
    if (price !== null && price !== undefined && (!Number.isSafeInteger(price) || Number(price) < 0 || Number(price) > 100000000)) throw new Error('Prix invalide.');
    return { name: x.name.trim(), quantity: x.quantity, unit: typeof x.unit === 'string' ? x.unit.slice(0, 30) : 'pièce', priceMillimes: price == null ? null : Number(price) };
  });
}
export function canApprove(payload: { verified: boolean; totalMillimes: number | null; budgetMillimes: number }, expiresAt: number, now = Date.now()) {
  return payload.verified && payload.totalMillimes !== null && Number.isSafeInteger(payload.totalMillimes) && payload.totalMillimes >= 0 && payload.totalMillimes <= payload.budgetMillimes && expiresAt > now;
}
export function validateQuote(raw: Record<string,unknown>, now=Date.now()) {
 const text=(v:unknown)=> typeof v==='string' && v.trim().length>0 && v.length<=500;
 const money=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=100000000;
 const rawItems=raw.items;
 if(raw.verified!==true||!text(raw.quoteId)||!text(raw.storeName)||!text(raw.deliveryAddress)||!text(raw.summary)||!Array.isArray(rawItems)||rawItems.some(x=>!x||!text(x.productId)))throw new Error('Devis incomplet : références, magasin et adresse nécessaires.');
 const lines=validateLines(rawItems);
 if(lines.some(x=>x.priceMillimes===null))throw new Error('Tous les prix doivent être vérifiés.');
 const amounts=['subtotalMillimes','deliveryMillimes','serviceMillimes','otherFeesMillimes','discountMillimes','totalMillimes'] as const;
 if(amounts.some(k=>!money(raw[k])))throw new Error('Frais de devis incomplets.');
 const subtotal=lines.reduce((sum,x)=>sum+Math.round(x.quantity*x.priceMillimes!),0);
 if(subtotal!==raw.subtotalMillimes||subtotal+Number(raw.deliveryMillimes)+Number(raw.serviceMillimes)+Number(raw.otherFeesMillimes)-Number(raw.discountMillimes)!==raw.totalMillimes)throw new Error('Le total du devis est incohérent.');
 if(!Number.isSafeInteger(raw.expiresAt)||Number(raw.expiresAt)<=now||Number(raw.expiresAt)>now+600000)throw new Error('Devis expiré ou validité incorrecte.');
 return {...raw,items:lines.map((x,i)=>({...x,productId:rawItems[i].productId})),verified:true,totalMillimes:Number(raw.totalMillimes),quoteId:String(raw.quoteId),summary:String(raw.summary),expiresAt:Number(raw.expiresAt)};
}
