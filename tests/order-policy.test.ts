import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canApprove,validateLines,validateQuote} from '../lib/order-policy.ts';
test('unknown or overbudget total cannot authorize an order',()=>{
 assert.equal(canApprove({verified:false,totalMillimes:null,budgetMillimes:100},200,100),false);
 assert.equal(canApprove({verified:true,totalMillimes:101,budgetMillimes:100},200,100),false);
 assert.equal(canApprove({verified:true,totalMillimes:100,budgetMillimes:100},200,100),true);
 assert.equal(canApprove({verified:true,totalMillimes:100,budgetMillimes:100},100,100),false);
});
test('invalid quantities and prices are rejected',()=>{
 assert.throws(()=>validateLines([{name:'Lait',quantity:NaN}]));
 assert.throws(()=>validateLines([{name:'Lait',quantity:1,priceMillimes:-1}]));
 assert.equal(validateLines([{name:'Lait',quantity:1}])[0].priceMillimes,null);
});

test('a paid quote requires coherent fees, product IDs, address and expiry',()=>{
 const quote={verified:true,quoteId:'q1',storeName:'Magasin test',deliveryAddress:'Adresse privée test',summary:'Devis test',items:[{productId:'p1',name:'Lait',quantity:2,unit:'L',priceMillimes:1500}],subtotalMillimes:3000,deliveryMillimes:1000,serviceMillimes:200,otherFeesMillimes:0,discountMillimes:0,totalMillimes:4200,expiresAt:2000};
 assert.equal(validateQuote(quote,1000).totalMillimes,4200);
 assert.throws(()=>validateQuote({...quote,totalMillimes:3000},1000));
 assert.throws(()=>validateQuote({...quote,deliveryAddress:''},1000));
 assert.throws(()=>validateQuote({...quote,items:[{name:'Lait',quantity:1,priceMillimes:null}]},1000));
});
