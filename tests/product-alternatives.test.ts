import test from 'node:test';import assert from 'node:assert/strict';
import {productAlternatives} from '../lib/product-alternatives.ts';
test('available catalog alternatives prioritize size, type, then price without guessing or changing the cart',()=>{
 const current={id:'old',category:'women',size:'M',subcategory:'Tops',priceCents:2400};
 const available=[{...current,id:'same-size-type-near',priceCents:2300},{...current,id:'same-size-type-far',priceCents:4500},{...current,id:'other-size',size:'S'},{...current,id:'same-size-other-type',subcategory:'Pants'},{...current,id:'wrong-category',category:'men'},current];
 assert.deepEqual(productAlternatives(current,available).map(p=>p.id),['same-size-type-near','same-size-type-far','same-size-other-type','other-size']);
 assert.deepEqual(productAlternatives(current,[]),[]);assert.equal(available.length,6);
});
