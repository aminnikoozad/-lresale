import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePublicProject,LEGACY_PRODUCTION_URL} from '../lib/supabase/project-config.ts';
const base={preview:true,fallbackPublishableKey:'synthetic-test-key'};
test('an unconfigured preview or a production-targeting preview fails before connecting',()=>{
 assert.throws(()=>resolvePublicProject(base),/separate Supabase test project/);
 assert.throws(()=>resolvePublicProject({...base,url:LEGACY_PRODUCTION_URL,publishableKey:'test-key'}),/separate Supabase test project/);
 assert.throws(()=>resolvePublicProject({...base,url:LEGACY_PRODUCTION_URL+'/',publishableKey:'test-key'}),/separate Supabase test project/);
 assert.throws(()=>resolvePublicProject({...base,url:'https://staging.example.invalid'}),/both public/);
});
test('explicit staging configuration works while the existing production default remains unchanged',()=>{
 assert.deepEqual(resolvePublicProject({...base,url:'https://staging.example.invalid/',publishableKey:'test-key'}),{url:'https://staging.example.invalid',publishableKey:'test-key'});
 assert.deepEqual(resolvePublicProject({...base,preview:false}),{url:LEGACY_PRODUCTION_URL,publishableKey:base.fallbackPublishableKey});
 assert.throws(()=>resolvePublicProject({...base,url:'http://staging.example.invalid',publishableKey:'test-key'}),/HTTPS/);
});
