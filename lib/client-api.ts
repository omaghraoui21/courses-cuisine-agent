export class ApiError extends Error {status:number;constructor(message:string,status=0){super(message);this.status=status;}}
export async function requestJson<T>(path:string,body?:unknown,fetcher:typeof fetch=fetch):Promise<T>{
 if(body&&typeof navigator!=='undefined'&&navigator.onLine===false)throw new ApiError('Vous êtes hors ligne. Votre saisie reste affichée ; reconnectez-vous pour enregistrer.');
 const serial=body?JSON.stringify(body):undefined;
 const safeRetry=!body||(path==='/api/household'&&typeof (body as Record<string,unknown>).requestId==='string');
 for(let attempt=0;attempt<(safeRetry?2:1);attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const res=await fetcher(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:serial,signal:controller.signal,cache:'no-store'});
   let data:Record<string,unknown>;try{data=await res.json() as Record<string,unknown>;}catch{throw new ApiError('Réponse illisible. Votre action n’est pas encore confirmée ; réessayez.',502);}
   if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError('Réponse inattendue du serveur.',502);
   if(!res.ok){if(safeRetry&&attempt===0&&[502,503,504].includes(res.status))continue;throw new ApiError(typeof data.error==='string'?data.error:'Enregistrement non confirmé. Réessayez.',res.status);}
   return data as T;
  }catch(e){if(e instanceof ApiError)throw e;if(!safeRetry||attempt>0)throw new ApiError('Connexion interrompue. Réessayez : nous vérifierons cette même action pour éviter un doublon.');}
  finally{clearTimeout(timer);}
 }
 throw new ApiError('Service momentanément indisponible.');
}

export function validateHousehold<T>(data:T):T {
 const s=data as Record<string,unknown>;
 if(!s||!Number.isSafeInteger(s.version)||!Array.isArray(s.items)||!Array.isArray(s.shopping)||!Array.isArray(s.events)||!s.preferences||typeof s.preferences!=='object')throw new ApiError('Réserves reçues illisibles. Rechargez la page.',502);
 if(s.items.some((x)=>!x||typeof x.id!=='string'||typeof x.name!=='string'||typeof x.quantity!=='number'||!Number.isFinite(x.quantity)||typeof x.unit!=='string'||typeof x.category!=='string'||typeof x.level!=='string')||s.shopping.some((x)=>!x||typeof x.id!=='string'||typeof x.name!=='string'||typeof x.quantity!=='number')||s.events.some((x)=>!x||typeof x.id!=='string'))throw new ApiError('Données de réserves invalides. Rechargez la page.',502);
 return data;
}
