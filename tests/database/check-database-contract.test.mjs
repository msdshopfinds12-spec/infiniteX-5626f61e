import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const validator=fileURLToPath(new URL('../../scripts/check-database-contract.mjs',import.meta.url));
async function run(t,value){const cwd=await mkdtemp(path.join(tmpdir(),'infinite-contract-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 if(value!==undefined){const dir=path.join(cwd,'supabase','contracts');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'database-contract.snapshot.json'),value,'utf8');}
 return spawnSync(process.execPath,[validator],{cwd,encoding:'utf8'});}
const valid={
 schemaVersion:2,capturedAt:'2026-11-20T00:00:00.000Z',source:'synthetic catalog',projectRef:'synthetic-project',
 databaseName:'postgres',postgresVersion:'17.1',databaseRole:'catalog_reader',reviewStatus:'APPROVED',
 review:{reviewedBy:'reviewer',reviewedAt:'2026-11-20T00:00:00.000Z',reviewEvidence:'synthetic evidence'},
 capture:{scopeSchemas:['public','private'],metadataCategories:['schemas','tables','columns','constraints','indexes','table_grants','column_grants','rls_policies','triggers','functions','extensions','custom_types','role_attributes','role_memberships'],applicationRowsRead:false,functionBodiesRead:false,secretsRead:false,writeStatementsExecuted:false},
 schemas:[{name:'public',owner:'postgres',grants:[]},{name:'private',owner:'postgres',grants:[]}],
 tables:[{schema:'public',name:'profiles',relationKind:'r',owner:'postgres',rlsEnabled:true,forceRls:false,
  columns:[{ordinal:1,name:'id',type:'uuid',default:null,notNull:true,identity:'',generated:'',collation:null}],
  constraints:[{name:'profiles_pkey',type:'p',definition:'PRIMARY KEY (id)',validated:true,deferrable:false,initiallyDeferred:false}],
  indexes:[{name:'profiles_pkey',definition:'CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)',unique:true,primary:true,valid:true,ready:true}],
  policies:[{name:'profiles_read',command:'SELECT',roles:['authenticated'],using:'true',check:null}],
  grants:[{grantor:'postgres',grantee:'postgres',privilege:'SELECT',grantable:true}],columnGrants:[],triggers:[]}],
 functions:[{schema:'public',name:'get_profile',owner:'postgres',language:'sql',resultType:'uuid',identityArguments:'user_id uuid',securityDefiner:false,searchPath:'',volatility:'STABLE',parallelSafety:'SAFE',strict:false,leakproof:false,executeRoles:['authenticated']}],
 extensions:[{name:'pgcrypto',schema:'extensions',version:'1.3'}],
 types:[{schema_name:'public',name:'profile_state',kind:'enum',formatted_type:'profile_state',enum_labels:['active'],base_type:null,not_null:false}],
 roles:[{name:'authenticated',superuser:false,inherit:true,create_role:false,create_db:false,can_login:false,replication:false,bypass_rls:false,connection_limit:-1}],
 roleMemberships:[{member:'authenticated',role:'anon',adminOption:false,inheritOption:true,setOption:true}]
};
test('missing snapshot blocks with exit 2',async t=>{const r=await run(t);assert.equal(r.status,2);assert.match(r.stderr,/not present/);});
test('pending approval blocks with exit 2',async t=>{const r=await run(t,JSON.stringify({...valid,reviewStatus:'PENDING_HUMAN_REVIEW'}));assert.equal(r.status,2);assert.match(r.stderr,/awaits explicit human approval/);});
test('complete approved v2 fixture passes',async t=>{const r=await run(t,JSON.stringify(valid));assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Database contract v2 structurally valid/);});
test('legacy v1 snapshot blocks pending fresh capture',async t=>{const r=await run(t,JSON.stringify({...valid,schemaVersion:1}));assert.equal(r.status,2);assert.match(r.stderr,/legacy or incomplete/);});
test('unverified project identity is rejected',async t=>{const r=await run(t,JSON.stringify({...valid,projectRef:'UNVERIFIED_MANUAL_ENTRY_REQUIRED'}));assert.equal(r.status,1);assert.match(r.stderr,/projectRef must be filled/);});
test('missing required metadata category is rejected',async t=>{const r=await run(t,JSON.stringify({...valid,capture:{...valid.capture,metadataCategories:['tables']}}));assert.equal(r.status,1);assert.match(r.stderr,/metadataCategories missing columns/);});
test('unsafe capture flag is rejected',async t=>{const r=await run(t,JSON.stringify({...valid,capture:{...valid.capture,applicationRowsRead:true}}));assert.equal(r.status,1);assert.match(r.stderr,/applicationRowsRead must be false/);});
test('duplicate relation identity is rejected',async t=>{const r=await run(t,JSON.stringify({...valid,tables:[...valid.tables,...valid.tables]}));assert.equal(r.status,1);assert.match(r.stderr,/Duplicate table entry/);});
test('missing nested table metadata is rejected',async t=>{const v=structuredClone(valid);delete v.tables[0].columnGrants;const r=await run(t,JSON.stringify(v));assert.equal(r.status,1);assert.match(r.stderr,/columnGrants must be an array/);});
test('duplicate function overload is rejected',async t=>{const r=await run(t,JSON.stringify({...valid,functions:[...valid.functions,...valid.functions]}));assert.equal(r.status,1);assert.match(r.stderr,/Duplicate function overload/);});
test('SECURITY DEFINER without fixed search_path is rejected',async t=>{const v=structuredClone(valid);v.functions[0].securityDefiner=true;const r=await run(t,JSON.stringify(v));assert.equal(r.status,1);assert.match(r.stderr,/no fixed search_path/);});
test('approved snapshot requires reviewer evidence',async t=>{const r=await run(t,JSON.stringify({...valid,review:{reviewedBy:'',reviewedAt:'',reviewEvidence:''}}));assert.equal(r.status,1);assert.match(r.stderr,/review.reviewedBy/);});
test('malformed JSON returns controlled error',async t=>{const r=await run(t,'{not-json');assert.equal(r.status,1);assert.match(r.stderr,/Unable to parse/);});
test('null root returns validation error not crash',async t=>{const r=await run(t,'null');assert.equal(r.status,1);assert.match(r.stderr,/root must be a JSON object/);});

test('different ACL grantors remain distinct identities',async t=>{
 const value=structuredClone(valid);
 value.tables[0].grants.push({grantor:'admin_role',grantee:'authenticated',privilege:'SELECT',grantable:false});
 const r=await run(t,JSON.stringify(value));
 assert.equal(r.status,0,r.stderr);
});
test('ACL grantor is required for relation grants',async t=>{
 const value=structuredClone(valid);delete value.tables[0].grants[0].grantor;
 const r=await run(t,JSON.stringify(value));
 assert.equal(r.status,1);assert.match(r.stderr,/grantor must be a non-empty string/);
});
