import {Pool} from "pg";
import {config} from "../config/env.js";
let pool:Pool|undefined;
export function getPool():Pool{if(!config.DATABASE_URL)throw new Error("DATABASE_URL is not configured.");pool??=new Pool({connectionString:config.DATABASE_URL,max:config.DATABASE_POOL_MAX,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,query_timeout:20000,...(config.NODE_ENV==="production"?{ssl:{rejectUnauthorized:true}}:{})});return pool;}
export async function closePool():Promise<void>{if(pool){const current=pool;pool=undefined;await current.end();}}
export async function databaseHealth():Promise<"not_configured"|"ok"|"error">{if(!config.DATABASE_URL)return "not_configured";try{await getPool().query("SELECT 1");return "ok";}catch{return "error";}}