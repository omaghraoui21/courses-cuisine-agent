import {getChatGPTUser} from '@/app/chatgpt-auth';
import {householdDb,resolveHousehold} from '@/lib/household-access';
import {saveBackup,restoreState} from '@/lib/backups';
import {emptyState,type HouseholdState} from '@/lib/domain';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
export async function GET(){
 const user=await getChatGPTUser();if(!user)return json({error:'Connexion requise.'},401);
 try{const access=await resolveHousehold(user.userId);if(access.role!=='owner')return json({error:'Réservé au propriétaire du foyer.'},403);
 const rows=await householdDb().prepare('SELECT id,created_at AS createdAt,reason FROM household_backups WHERE scope_id=? ORDER BY created_at DESC,rowid DESC LIMIT 10').bind(access.scopeId).all();return json({backups:rows.results});
 }catch{return json({error:'Sauvegardes indisponibles.'},503);}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Connexion requise.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine refusée.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON requis.'},415);
 try{
 const raw=await request.text();if(raw.length>4096)return json({error:'Requête trop volumineuse.'},413);
 const body=JSON.parse(raw);const access=await resolveHousehold(user.userId);if(access.role!=='owner')return json({error:'Seul le propriétaire peut sauvegarder ou restaurer.'},403);
 const db=householdDb();const current=await db.prepare('SELECT data,version FROM household_states WHERE user_id=?').bind(access.scopeId).first<{data:string;version:number}>();
 const state=current?JSON.parse(current.data) as HouseholdState:emptyState();
 if(body.action==='create'){const id=await saveBackup(access.scopeId,user.userId,state,'manual');return json({id,message:'Sauvegarde créée.'});}
 if(body.action!=='restore'||body.confirmation!=='RESTAURER'||typeof body.id!=='string')return json({error:'Confirmation RESTAURER et sauvegarde requises.'},400);
 const row=await db.prepare('SELECT data FROM household_backups WHERE id=? AND scope_id=?').bind(body.id,access.scopeId).first<{data:string}>();if(!row)return json({error:'Sauvegarde introuvable.'},404);
 const restored=restoreState(row.data);await saveBackup(access.scopeId,user.userId,state,'before_restore');
 const again=await resolveHousehold(user.userId);if(again.role!=='owner'||again.scopeId!==access.scopeId)return json({error:'Votre accès au foyer a changé.'},409);
 const now=new Date().toISOString();
 const permission="(EXISTS(SELECT 1 FROM household_members WHERE user_id=? AND household_id=? AND role='owner') OR (?=? AND NOT EXISTS(SELECT 1 FROM household_members WHERE user_id=?)))";
 const guard=[user.userId,access.scopeId,user.userId,access.scopeId,user.userId];
 const result=current?await db.prepare(`UPDATE household_states SET data=?,version=version+1,updated_at=? WHERE user_id=? AND version=? AND ${permission}`).bind(JSON.stringify(restored),now,access.scopeId,current.version,...guard).run():await db.prepare(`INSERT OR IGNORE INTO household_states(user_id,data,version,updated_at) SELECT ?,?,1,? WHERE ${permission}`).bind(access.scopeId,JSON.stringify(restored),now,...guard).run();
 if(!result.meta.changes)return json({error:'Les réserves ont changé pendant la restauration. Vérifiez puis réessayez.'},409);
 return json({message:'Sauvegarde restaurée. La version précédente reste disponible.'});
 }catch{return json({error:'Sauvegarde ou restauration impossible. Aucune réussite confirmée.'},400);}
}
