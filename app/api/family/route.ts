import { getChatGPTUser } from '@/app/chatgpt-auth';
import { householdDb, resolveHousehold, householdMetadata, hashInvite, SITE_SHARING_NOTICE } from '@/lib/household-access';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
function json(value:unknown,status=200){return Response.json(value,{status,headers});}
export async function GET(){
 const user=await getChatGPTUser();if(!user)return json({error:'Connexion requise.'},401);
 try{const access=await resolveHousehold(user.userId);const rows=await householdDb().prepare('SELECT user_id AS userId,role FROM household_members WHERE household_id=?').bind(access.scopeId).all();
 return json({household:householdMetadata(access),members:rows.results.length?rows.results:[{userId:user.userId,role:'owner'}],siteSharingNotice:SITE_SHARING_NOTICE});
 }catch{return json({error:'Foyer temporairement indisponible.'},503);}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Connexion requise.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origine refusée.'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'JSON requis.'},415);
 try{
 const raw=await request.text();if(raw.length>4096)return json({error:'Requête trop volumineuse.'},413);
 let body;try{body=JSON.parse(raw);}catch{return json({error:'JSON invalide.'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Données invalides.'},400);
 const access=await resolveHousehold(user.userId),db=householdDb(),now=Date.now();
 if(body.action==='create_invite'){
  if(access.role!=='owner')return json({error:'Seul le propriétaire peut inviter.'},403);
  const token=crypto.randomUUID()+crypto.randomUUID(),hash=await hashInvite(token),expiresAt=now+48*3600*1000;
  const result=await db.batch([
   db.prepare('INSERT OR IGNORE INTO households(id,owner_id,name,created_at) VALUES(?,?,?,?)').bind(access.scopeId,user.userId,access.name,new Date(now).toISOString()),
   db.prepare("INSERT OR IGNORE INTO household_members(user_id,household_id,role) VALUES(?,?,'owner')").bind(user.userId,access.scopeId),
   db.prepare(`INSERT INTO household_invites(hash,household_id,created_by,expires_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM household_members WHERE user_id=? AND household_id=? AND role='owner') AND (SELECT count(*) FROM household_members WHERE household_id=?)<6`).bind(hash,access.scopeId,user.userId,expiresAt,user.userId,access.scopeId,access.scopeId),
  ]);
  if(!result[2].meta.changes)return json({error:'Foyer complet ou accès modifié.'},409);
  return json({token,expiresAt,siteSharingNotice:SITE_SHARING_NOTICE});
 }
 if(body.action==='accept_invite'){
  if(body.confirm!==true)return json({error:'Confirmez que vous rejoignez ce foyer : vos anciennes réserves seront conservées séparément, sans fusion.'},400);
  if(typeof body.token!=='string'||body.token.length<32||body.token.length>200)return json({error:'Invitation invalide.'},400);
  const hash=await hashInvite(body.token);
  // Both statements execute in one D1 transaction. The first checks all conditions,
  // the second consumes the token only if the membership has been attached.
  const result=await db.batch([
   db.prepare(`INSERT INTO household_members(user_id,household_id,role)
    SELECT ?,i.household_id,'member' FROM household_invites i JOIN households h ON h.id=i.household_id
    WHERE i.hash=? AND i.used_at IS NULL AND i.expires_at>? AND h.owner_id<>?
    AND EXISTS(SELECT 1 FROM household_members o WHERE o.user_id=i.created_by AND o.household_id=i.household_id AND o.role='owner')
    AND (SELECT count(*) FROM household_members WHERE household_id=i.household_id)<6
    AND NOT EXISTS(SELECT 1 FROM household_members me WHERE me.user_id=? AND (me.role='member' OR me.household_id=i.household_id))
    AND NOT EXISTS(SELECT 1 FROM household_members dependents WHERE dependents.household_id=? AND dependents.user_id<>?)
    ON CONFLICT(user_id) DO UPDATE SET household_id=excluded.household_id,role='member'`).bind(user.userId,hash,now,user.userId,user.userId,user.userId,user.userId),
   db.prepare(`UPDATE household_invites SET used_by=?,used_at=? WHERE hash=? AND changes()=1 AND used_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM household_members WHERE user_id=? AND household_id=household_invites.household_id AND role='member')`).bind(user.userId,now,hash,now,user.userId),
  ]);
  if(!result[0].meta.changes||!result[1].meta.changes)return json({error:'Invitation expirée, déjà utilisée, foyer complet ou appartenance incompatible. Quittez d’abord votre foyer actuel ; un propriétaire doit retirer ses membres avant de rejoindre un autre foyer.'},409);
  return json({household:householdMetadata(await resolveHousehold(user.userId)),message:'Foyer rejoint. Vos anciennes données restent conservées séparément.'});
 }
 if(body.action==='rename'){
  if(access.role!=='owner')return json({error:'Seul le propriétaire peut renommer.'},403);
  if(typeof body.name!=='string'||body.name.trim().length<1||body.name.trim().length>60)return json({error:'Nom requis (60 caractères maximum).'},400);
  // Rename can create the owner row while retaining the legacy state scope.
  await db.batch([db.prepare('INSERT OR IGNORE INTO households(id,owner_id,name,created_at) VALUES(?,?,?,?)').bind(access.scopeId,user.userId,access.name,new Date(now).toISOString()),db.prepare("INSERT OR IGNORE INTO household_members(user_id,household_id,role) VALUES(?,?,'owner')").bind(user.userId,access.scopeId),db.prepare('UPDATE households SET name=? WHERE id=? AND owner_id=?').bind(body.name.trim(),access.scopeId,user.userId)]);
  return json({household:householdMetadata(await resolveHousehold(user.userId))});
 }
 if(body.action==='leave'){
  if(access.role!=='member')return json({error:'Le propriétaire ne peut pas quitter son foyer.'},403);
  await db.prepare("DELETE FROM household_members WHERE user_id=? AND household_id=? AND role='member'").bind(user.userId,access.scopeId).run();return json({household:householdMetadata(await resolveHousehold(user.userId))});
 }
 if(body.action==='remove_member'){
  if(access.role!=='owner')return json({error:'Seul le propriétaire peut retirer un membre.'},403);
  if(typeof body.userId!=='string'||body.userId===user.userId)return json({error:'Membre invalide.'},400);
  await db.prepare("DELETE FROM household_members WHERE user_id=? AND household_id=? AND role='member'").bind(body.userId,access.scopeId).run();return json({ok:true});
 }
 return json({error:'Action inconnue.'},400);
 }catch(error){console.error('Family mutation failed',error instanceof Error?error.name:'unknown');return json({error:'Modification du foyer indisponible. Réessayez.'},503);}
}
