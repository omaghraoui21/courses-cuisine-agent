import ts from 'typescript';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const code=ts.transpileModule(readFileSync(new URL('../lib/shopping-advisor.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parsePackSize,buildShoppingNeeds,matchingOffers,shoppingNeedLine}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const now=new Date('2026-10-18T23:30:00Z');
const stock=(name,extra={})=>({id:name,name,brand:'',quantity:1,unit:'pièce',category:'food',location:'Cuisine',level:'sufficient',expiry:null,monthlyUsage:null,updatedAt:now.toISOString(),...extra});
const offer=(name,extra={})=>({name,priceMillimes:6000,url:'https://mg.tn/lait',...extra});
const retailer=(offers,extra={})=>({id:'mg',name:'MG',url:'https://mg.tn/',status:'ok',lastChecked:'2026-10-18T23:00:00Z',message:'',catalogs:[],offers,...extra});
test('pack size accepts explicit units and common multipacks, rejects ambiguity',()=>{
 assert.deepEqual(parsePackSize('Lait 6 x 1 L'),{quantity:6,unit:'L'});
 assert.deepEqual(parsePackSize('Shampoing 250 ml'),{quantity:.25,unit:'L'});
 assert.deepEqual(parsePackSize('Farine 2×500g'),{quantity:1,unit:'kg'});
 assert.deepEqual(parsePackSize('Huile 0,75 litre'),{quantity:.75,unit:'L'});
 for(const label of ['Papier 6 rouleaux','Lait lot de 6 1L','Lait 1L x6','Lait 2x6x1L','Farine 500g + 100g','Huile 1L / 2L','Shampoing 250ml +20%','Farine 0g'])assert.equal(parsePackSize(label),null,label);
});
test('needs deduplicate max quantity, retain explicit list, and never invent consumption',()=>{
 const items=[stock('Lait',{unit:'L',quantity:1,monthlyUsage:9}),stock('Shampoing',{level:'low'}),stock('Café',{level:'low'}),stock('Café',{id:'reserve',level:'sufficient',quantity:3})];
 const list=[{id:'a',name:'Lait',quantity:4,unit:'L',checked:false,priceMillimes:null},{id:'b',name:'lait',quantity:2,unit:'litre',checked:false,priceMillimes:null},{id:'c',name:'Pain',quantity:1,unit:'pièce',checked:true,priceMillimes:null}];
 const needs=buildShoppingNeeds(items,list,30,now);
 assert.equal(needs.find(x=>x.name==='Lait').quantity,8);
 assert.equal(needs.find(x=>x.name==='Lait').listed,true);
 assert.equal(needs.find(x=>x.name==='Lait').listedQuantity,4);assert.equal(needs.find(x=>x.name==='Lait').needsIncrease,true);
 assert.equal(needs.filter(x=>x.name.toLowerCase()==='lait').length,1);
 assert.equal(needs.find(x=>x.name==='Shampoing').quantity,1);
 assert.ok(!needs.some(x=>x.name==='Café'||x.name==='Pain'));
 assert.equal(buildShoppingNeeds([stock('Lait',{unit:'L',quantity:1,monthlyUsage:9})],[],7,now)[0].quantity,1.1);
});
test('offer evidence requires exact labels, freshness, valid date and numeric price',()=>{
 const rows=[retailer([offer('Lait 6x1L'),offer('Lait chocolat 1L'),offer('Lait 1L',{url:'https://mg.tn/expired',validUntil:'2026-10-18'}),offer('Lait 1L',{url:'https://mg.tn/badprice',priceMillimes:NaN}),offer('Lait 1L',{url:'javascript:alert(1)'}),offer('Lait 1L',{url:'https://mg.tn/invaliddate',validUntil:'2026-99-99'})]),retailer([offer('Lait 1L')],{lastChecked:'2026-10-17T20:00:00Z'}),retailer([offer('Lait 1L')],{lastChecked:'2026-10-19T00:00:00Z'}),retailer([offer('Lait 1L')],{status:'blocked'})];
 const result=matchingOffers({name:'Lait'},rows,now);
 assert.equal(result.length,1);assert.equal(result[0].unitPriceMillimes,1000);assert.equal(result[0].pack.quantity,6);
 assert.equal(matchingOffers({name:'lait demi écrémé'},rows,now).length,0);
});
test('expiry is interpreted in Tunis and expired stock does not cover needs',()=>{
 const needs=buildShoppingNeeds([stock('Lait',{expiry:'2026-10-18',quantity:10,unit:'L',monthlyUsage:3})],[],7,now);
 assert.equal(needs.length,1);assert.equal(needs[0].priority,0);assert.equal(needs[0].quantity,.7);
});

test('conflicting machine and display pack sizes never yield a unit price',()=>{const result=matchingOffers({name:'Lait'},[retailer([offer('Lait 6x1L',{unit:'1 L'})])],now);assert.equal(result.length,1);assert.equal(result[0].pack,null);assert.equal(result[0].unitPriceMillimes,null);});

test('Arabic labels retain distinct identities; empty normalized names never match',()=>{
 const needs=buildShoppingNeeds([stock('حليب',{level:'empty'}),stock('سكر',{level:'empty'}),stock('!!!',{level:'empty'})],[],7,now);
 assert.equal(needs.length,2);assert.notEqual(needs[0].key,needs[1].key);
 const rows=[retailer([offer('حليب 1 L'),offer('سكر 1 kg'),offer('!!!')])];
 assert.equal(matchingOffers({name:'حليب'},rows,now).length,1);
 assert.equal(matchingOffers({name:'حليب'},rows,now)[0].offer.name,'حليب 1 L');
 assert.equal(matchingOffers({name:'!!!'},rows,now).length,0);
 assert.equal(buildShoppingNeeds([],[{id:'a',name:'!!!',quantity:1,unit:'pièce',checked:false}],7,now).length,0);
});
test('discrete products round up, continuous units retain fractional forecast and sufficient listed quantity stays unchanged',()=>{
 const needs=buildShoppingNeeds([stock('Œuf',{quantity:0,level:'empty',monthlyUsage:1})],[],7,now);
 assert.equal(needs[0].quantity,1);
 const listed=buildShoppingNeeds([stock('Œuf',{quantity:0,level:'empty',monthlyUsage:1})],[{id:'a',name:'Œuf',quantity:2,unit:'pièce',checked:false}],7,now)[0];
 assert.equal(listed.quantity,2);assert.equal(listed.listedQuantity,2);assert.equal(listed.needsIncrease,false);
});

test('adviser mutation payload satisfies the actual strict shopping API schema',async()=>{
 const encode=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
 const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {createRequire}=await import('node:module');const {pathToFileURL}=await import('node:url');const require=createRequire(import.meta.url);
 const reducer=compile('../lib/household.ts').replace("'./domain'",JSON.stringify(encode(compile('../lib/domain.ts')))).replace("'zod'",JSON.stringify(pathToFileURL(require.resolve('zod')).href));
 const {actionSchema}=await import(encode(reducer));
 const need=buildShoppingNeeds([stock('Shampoing',{level:'low'})],[],7,now)[0];
 assert.equal(actionSchema.safeParse({action:'add_shopping',requestId:crypto.randomUUID(),item:need}).success,false);
 assert.equal(actionSchema.safeParse({action:'add_shopping',requestId:crypto.randomUUID(),item:shoppingNeedLine(need)}).success,true);
});
