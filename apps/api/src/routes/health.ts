import {Hono} from "hono";
import {config} from "../config/env.js";
import {databaseHealth} from "../db/pool.js";
export const healthRoutes=new Hono().get("/health",c=>c.json({status:"ok",service:config.APP_NAME,timestamp:new Date().toISOString()})).get("/ready",async c=>{const database=await databaseHealth();const ready=database!=="error";return c.json({status:ready?"ready":"not_ready",dependencies:{database,authentication:config.AUTH_ISSUER_URL?"configured":"not_configured",aiProvider:config.AI_BASE_URL&&config.AI_API_KEY&&config.AI_MODEL?"configured":"not_configured"}},ready?200:503);});