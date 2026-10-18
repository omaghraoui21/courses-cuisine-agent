import { env } from 'cloudflare:workers';

export type HouseholdAccess = { scopeId:string; ownerId:string; role:'owner'|'member'; name:string };
export const SITE_SHARING_NOTICE = 'Cette invitation partage les données du foyer uniquement. Le propriétaire doit aussi donner accès à son conjoint depuis le menu Partager du Site. Aucun e-mail n’est envoyé.';
export function householdDb():D1Database { if(!env.DB)throw new Error('D1 unavailable'); return env.DB; }
export async function resolveHousehold(userId:string):Promise<HouseholdAccess>{
  const row=await householdDb().prepare(`SELECT h.id,h.owner_id,h.name,m.role FROM household_members m JOIN households h ON h.id=m.household_id WHERE m.user_id=?`).bind(userId).first<{id:string;owner_id:string;name:string;role:string}>();
  return row?{scopeId:row.id,ownerId:row.owner_id,name:row.name,role:row.role==='owner'?'owner':'member'}:{scopeId:userId,ownerId:userId,name:'Ma maison',role:'owner'};
}
export function householdMetadata(access:HouseholdAccess){return {id:access.scopeId,name:access.name,role:access.role,ownerId:access.ownerId};}
export async function hashInvite(token:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
