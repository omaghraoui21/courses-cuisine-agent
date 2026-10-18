import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedJson, callDeliveryBridge, deliveryConfig, deliveryProvider, deliveryStatuses} from '../lib/delivery.ts';
test('provider config fails closed and legacy drafts select Glovo',()=>{
 assert.equal(deliveryProvider(undefined),'glovo'); assert.equal(deliveryProvider('yassir'),'yassir');
 for(const value of ['uber','',null,{}]) assert.throws(()=>deliveryProvider(value));
 for(const url of ['malformed','http://example.test','https://u:p@example.test','https://example.test?key=x','https://example.test/#x']) assert.equal(deliveryConfig('glovo',{GLOVO_BRIDGE_URL:url,GLOVO_BRIDGE_TOKEN:'secret'}),null);
 const states=deliveryStatuses({YASSIR_BRIDGE_URL:'https://bridge.example/api/',YASSIR_BRIDGE_TOKEN:'test'});
 assert.equal(states[0].connected,false);assert.equal(states[1].connected,true);
 assert.equal(JSON.stringify(states).includes('test'),false);
});
test('actual streamed JSON size is bounded without Content-Length',async()=>{
 await assert.rejects(()=>boundedJson(new Response(JSON.stringify({x:'é'.repeat(30000)}))),/volumineux/);
 await assert.rejects(()=>boundedJson(new Response('[]')),/Objet JSON/);
 assert.deepEqual(await boundedJson(new Response('{"ok":true}')),{ok:true});
});
test('provider-specific fixture bridge uses exact host and does not retry',async()=>{
 let calls=0;
 const settings={YASSIR_BRIDGE_URL:'https://yassir-bridge.example/api',YASSIR_BRIDGE_TOKEN:'test-only',GLOVO_BRIDGE_URL:'https://glovo-bridge.example',GLOVO_BRIDGE_TOKEN:'other'};
 const fake=(async(url:unknown,init:RequestInit)=>{calls++;assert.equal(url,'https://yassir-bridge.example/api/quote');assert.equal((init.headers as Record<string,string>).Authorization,'Bearer test-only');assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(String(init.body)),{items:['Riz']});return Response.json({quoteId:'fixture'});}) as typeof fetch;
 assert.deepEqual(await callDeliveryBridge('yassir',settings,'/quote',{items:['Riz']},fake),{quoteId:'fixture'}); assert.equal(calls,1);
 const failure=(async()=>{calls++;throw new Error('network');}) as typeof fetch;
 await assert.rejects(()=>callDeliveryBridge('glovo',settings,'/execute',{},failure));assert.equal(calls,2);
});
