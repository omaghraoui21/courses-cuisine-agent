import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  if(!env.DB)throw new Error('Storage unavailable');
  const row=await env.DB.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('household_states','order_drafts','vision_usage','households','household_members','household_invites','household_backups','mutation_receipts')").first<{count:number}>();
  const ready=row?.count===8;
  return Response.json({status:ready?'ok':'unavailable',storage:ready?'ready':'schema_pending'},{status:ready?200:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
