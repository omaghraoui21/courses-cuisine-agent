import {householdDb} from './household-access';
import {DomainError} from './household';
export const receiptKey=(scopeId:string,requestId:string)=>JSON.stringify([scopeId,requestId]);
export async function wasApplied(scopeId:string,actorId:string,requestId:string,fingerprint:string){
 const row=await householdDb().prepare('SELECT actor_id,fingerprint FROM mutation_receipts WHERE key=?').bind(receiptKey(scopeId,requestId)).first<{actor_id:string;fingerprint:string}>();
 if(!row)return false;
 if(row.actor_id!==actorId||row.fingerprint!==fingerprint)throw new DomainError('Identifiant déjà utilisé pour une autre action.',409);
 return true;
}
export async function recordApplied(scopeId:string,actorId:string,requestId:string,fingerprint:string){
 await householdDb().prepare('INSERT OR IGNORE INTO mutation_receipts(key,scope_id,request_id,actor_id,fingerprint,created_at) VALUES(?,?,?,?,?,?)').bind(receiptKey(scopeId,requestId),scopeId,requestId,actorId,fingerprint,new Date().toISOString()).run();
 await wasApplied(scopeId,actorId,requestId,fingerprint);
}
