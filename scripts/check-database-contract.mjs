#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
const file=path.join(process.cwd(),'supabase','contracts','database-contract.snapshot.json');
let s;
try{s=JSON.parse(await readFile(file,'utf8'));}
catch(e){if(e?.code==='ENOENT'){console.error('BLOCKED: database-contract.snapshot.json is not present.');process.exit(2);}
 console.error('Unable to parse contract snapshot: '+e.message);process.exit(1);}
const errors=[];
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const arr=(v,n)=>{if(!Array.isArray(v)){errors.push(n+' must be an array.');return false;}return true;};
const str=(v,n,empty=false)=>{if(typeof v!=='string'||(!empty&&!v.trim()))errors.push(n+' must be a '+(empty?'string':'non-empty string')+'.');};
const bool=(v,n)=>{if(typeof v!=='boolean')errors.push(n+' must be boolean.');};
const named=(v,n,ids,fields=[])=>{
 if(!arr(v,n))return;const seen=new Set();
 for(const [i,x] of v.entries()){if(!obj(x)){errors.push(n+'['+i+'] must be an object.');continue;}
  for(const id of ids)str(x[id],n+'['+i+'].'+id);
  const k=ids.map(id=>x[id]).join('|');if(ids.every(id=>typeof x[id]==='string'&&x[id].trim())){if(seen.has(k))errors.push('Duplicate '+n+' identity: '+k+'.');seen.add(k);}
  for(const [f,t] of fields){if(t==='string')str(x[f],n+'['+i+'].'+f,f==='searchPath');if(t==='boolean')bool(x[f],n+'['+i+'].'+f);}
 }
};
if(!obj(s)){console.error('Database contract snapshot INVALID: root must be a JSON object.');process.exit(1);}
if(s.schemaVersion!==2){console.error('BLOCKED: legacy or incomplete contract version; a fresh v2 catalog capture is required.');process.exit(2);}
if(s.projectRef==='UNVERIFIED_MANUAL_ENTRY_REQUIRED'){errors.push('projectRef must be filled from a verified project identity; current_database is not a project ref.');}
str(s.capturedAt,'capturedAt');if(typeof s.capturedAt==='string'&&Number.isNaN(Date.parse(s.capturedAt)))errors.push('capturedAt must be a valid timestamp.');
for(const f of ['source','projectRef','databaseName','postgresVersion','databaseRole'])str(s[f],f);
if(!['APPROVED','PENDING_HUMAN_REVIEW'].includes(s.reviewStatus))errors.push('reviewStatus must be APPROVED or PENDING_HUMAN_REVIEW.');
if(s.reviewStatus==='APPROVED'){
 if(!obj(s.review))errors.push('APPROVED snapshot requires review object.');
 else{str(s.review.reviewedBy,'review.reviewedBy');str(s.review.reviewedAt,'review.reviewedAt');
  if(typeof s.review.reviewedAt==='string'&&Number.isNaN(Date.parse(s.review.reviewedAt)))errors.push('review.reviewedAt must be valid.');
  str(s.review.reviewEvidence,'review.reviewEvidence');}
}
if(!obj(s.capture))errors.push('capture must be an object.');
else{
 arr(s.capture.scopeSchemas,'capture.scopeSchemas');arr(s.capture.metadataCategories,'capture.metadataCategories');
 for(const f of ['applicationRowsRead','functionBodiesRead','secretsRead','writeStatementsExecuted']){
  bool(s.capture[f],'capture.'+f);if(s.capture[f]===true)errors.push('capture.'+f+' must be false.');
 }
 const categories=['schemas','tables','columns','constraints','indexes','table_grants','column_grants','rls_policies','triggers','functions','extensions','custom_types','role_attributes','role_memberships'];
 if(Array.isArray(s.capture.metadataCategories))for(const x of categories)if(!s.capture.metadataCategories.includes(x))errors.push('capture.metadataCategories missing '+x+'.');
 if(Array.isArray(s.capture.scopeSchemas))for(const x of ['public','private'])if(!s.capture.scopeSchemas.includes(x))errors.push('capture.scopeSchemas missing '+x+'.');
}
named(s.schemas,'schemas',['name'],[['owner','string']]);
named(s.extensions,'extensions',['name'],[['schema','string'],['version','string']]);
named(s.types,'types',['schema_name','name'],[['kind','string'],['formatted_type','string'],['not_null','boolean']]);
named(s.roles,'roles',['name'],[['superuser','boolean'],['inherit','boolean'],['create_role','boolean'],['create_db','boolean'],['can_login','boolean'],['replication','boolean'],['bypass_rls','boolean']]);
if(arr(s.roleMemberships,'roleMemberships'))for(const [i,x] of s.roleMemberships.entries()){
 if(!obj(x)){errors.push('roleMemberships['+i+'] must be an object.');continue;}
 for(const f of ['member','role'])str(x[f],'roleMemberships['+i+'].'+f);
 for(const f of ['adminOption','inheritOption','setOption'])bool(x[f],'roleMemberships['+i+'].'+f);
}
if(arr(s.tables,'tables')){const tableIds=new Set();for(const [i,t] of s.tables.entries()){
 if(!obj(t)){errors.push('tables['+i+'] must be an object.');continue;}
 str(t.schema,'tables['+i+'].schema');str(t.name,'tables['+i+'].name');
 const k=String(t.schema)+'.'+String(t.name);if(tableIds.has(k))errors.push('Duplicate table entry: '+k+'.');tableIds.add(k);
 str(t.relationKind,k+'.relationKind');str(t.owner,k+'.owner');bool(t.rlsEnabled,k+'.rlsEnabled');bool(t.forceRls,k+'.forceRls');
 for(const f of ['columns','constraints','indexes','policies','grants','columnGrants','triggers']){
  if(!arr(t[f],k+'.'+f))continue;const seen=new Set();
  for(const [j,x] of t[f].entries()){if(!obj(x)){errors.push(k+'.'+f+'['+j+'] must be an object.');continue;}
   let id;
   if(f==='columns'){id=x.name;str(x.type,k+'.columns['+j+'].type');bool(x.notNull,k+'.columns['+j+'].notNull');
    if(!Number.isInteger(x.ordinal)||x.ordinal<1)errors.push(k+'.columns['+j+'].ordinal must be positive integer.');
    if(x.default!==null&&typeof x.default!=='string')errors.push(k+'.columns['+j+'].default must be string or null.');}
   else if(f==='grants')id=String(x.grantee)+'|'+String(x.privilege);
   else if(f==='columnGrants')id=String(x.column)+'|'+String(x.grantee)+'|'+String(x.privilege);
   else{id=x.name;str(x.name,k+'.'+f+'['+j+'].name');}
   if(['constraints','indexes','triggers'].includes(f))str(x.definition,k+'.'+f+'['+j+'].definition');
   if(f==='grants'||f==='columnGrants'){str(x.grantee,k+'.'+f+'['+j+'].grantee');str(x.privilege,k+'.'+f+'['+j+'].privilege');bool(x.grantable,k+'.'+f+'['+j+'].grantable');}
   if(f==='policies'){str(x.command,k+'.policies['+j+'].command');arr(x.roles,k+'.policies['+j+'].roles');}
   if(id!==undefined&&seen.has(id))errors.push(k+'.'+f+' duplicate identity '+id+'.');if(id!==undefined)seen.add(id);
  }
 }
}}
if(arr(s.functions,'functions')){const seen=new Set();for(const [i,f] of s.functions.entries()){
 if(!obj(f)){errors.push('functions['+i+'] must be an object.');continue;}
 for(const k of ['schema','name','owner','language','resultType','identityArguments','searchPath','volatility','parallelSafety','definitionMd5'])str(f[k],'functions['+i+'].'+k,k==='identityArguments'||k==='searchPath');
 for(const k of ['securityDefiner','strict','leakproof'])bool(f[k],'functions['+i+'].'+k);
 arr(f.executeRoles,'functions['+i+'].executeRoles');
 if(Array.isArray(f.executeRoles)&&f.executeRoles.some(x=>typeof x!=='string'||!x.trim()))errors.push('functions['+i+'].executeRoles contains invalid role.');
 const k=String(f.schema)+'.'+String(f.name)+'('+String(f.identityArguments)+')';if(seen.has(k))errors.push('Duplicate function overload: '+k+'.');seen.add(k);
 if(f.securityDefiner&&!f.searchPath)errors.push(k+': SECURITY DEFINER function has no fixed search_path; manual security review required.');
}}
if(errors.length){console.error('Database contract snapshot INVALID:');for(const e of errors)console.error('- '+e);process.exit(1);}
if(s.reviewStatus!=='APPROVED'){console.error('BLOCKED: complete database contract snapshot awaits explicit human approval.');process.exit(2);}
console.log('Database contract v2 structurally valid: '+s.schemas.length+' schemas, '+s.tables.length+' relations, '+s.functions.length+' function overloads, '+s.extensions.length+' extensions, '+s.roles.length+' roles.');
console.log('Structural validity is not schema parity; reconcile against migration replay and an independently reviewed capture.');
