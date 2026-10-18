import {householdDb} from './household-access';
import {actionSchema} from './household';
import {emptyState, type HouseholdState} from './domain';
export function tunisDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Tunis',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function backupState(state:HouseholdState){
 const copy=structuredClone(state);copy.importFingerprints??=[];copy.consumption??=[];copy.events=copy.events.map(event=>{const e={...event};delete e.before;return e;});
 return JSON.stringify({formatVersion:2,state:copy});
}
export function restoreState(serialized:string):HouseholdState{
 const parsed=JSON.parse(serialized);if(parsed.formatVersion!==2||!parsed.state||typeof parsed.state!=='object')throw new Error('Format de sauvegarde incompatible.');
 const s=parsed.state;const result=emptyState();
 if(!Array.isArray(s.items)||s.items.length>500||!Array.isArray(s.shopping)||s.shopping.length>300)throw new Error('Sauvegarde trop volumineuse.');
 const requestId=crypto.randomUUID();
 for(let offset=0;offset<s.items.length;offset+=200){const validated=actionSchema.parse({action:'import_items',requestId,mode:'inventory',items:s.items.slice(offset,offset+200).map((i:Record<string,unknown>)=>Object.fromEntries(Object.entries(i).filter(([k])=>['id','name','brand','quantity','unit','category','location','level','expiry','monthlyUsage'].includes(k))))});
 if(validated.action==='import_items')result.items.push(...validated.items.map((i)=>({...i,id:i.id||crypto.randomUUID(),brand:i.brand??'',unit:i.unit??'pièce',category:i.category??'food',location:i.location??'Placard',level:i.level??'sufficient',expiry:i.expiry??null,monthlyUsage:i.monthlyUsage??null,updatedAt:new Date().toISOString()})));}
 result.shopping=s.shopping.map((i:Record<string,unknown>)=>{const {id,...value}=i;const a=actionSchema.parse({action:'add_shopping',requestId,item:value});if(a.action!=='add_shopping')throw new Error('Article invalide.');return {...a.item,id:typeof id==='string'?id:crypto.randomUUID()};});
 const pref=actionSchema.parse({action:'save_preferences',requestId,preferences:s.preferences});if(pref.action==='save_preferences')result.preferences=pref.preferences;
 const hex=/^[a-f0-9]{64}$/;
 if(!Array.isArray(s.importFingerprints)||s.importFingerprints.length>2000||s.importFingerprints.some((v:unknown)=>typeof v!=='string'||!hex.test(v)))throw new Error('Empreintes invalides.');
 result.importFingerprints=s.importFingerprints;
 if(!Array.isArray(s.consumption)||s.consumption.length>1000||s.consumption.some((v:Record<string,unknown>)=>!v||typeof v.itemId!=='string'||typeof v.quantity!=='number'||!Number.isFinite(v.quantity)||v.quantity<=0||typeof v.at!=='string'||!Number.isFinite(Date.parse(v.at))))throw new Error('Historique de consommation invalide.');
 result.consumption=s.consumption;
 // Do not restore request receipts or undo snapshots: durable receipts remain authoritative.
 result.events=[{id:crypto.randomUUID(),action:'restore_backup',label:'Sauvegarde restaurée',createdAt:new Date().toISOString()}];
 return result;
}
export async function saveBackup(scopeId:string,actorId:string,state:HouseholdState,reason:'automatic'|'manual'|'before_clear'|'before_restore'='automatic'){
 const db=householdDb(),now=new Date().toISOString();const id=reason==='automatic'?JSON.stringify([scopeId,tunisDate()]):crypto.randomUUID();
 await db.prepare('INSERT OR IGNORE INTO household_backups(id,scope_id,created_by,created_at,data,reason) VALUES(?,?,?,?,?,?)').bind(id,scopeId,actorId,now,backupState(state),reason).run();
 await db.prepare('DELETE FROM household_backups WHERE scope_id=? AND id NOT IN (SELECT id FROM household_backups WHERE scope_id=? ORDER BY created_at DESC,rowid DESC LIMIT 10)').bind(scopeId,scopeId).run();
 return id;
}
