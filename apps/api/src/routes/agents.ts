import {Hono} from "hono";
import {z} from "zod";
import type {AppBindings} from "../types.js";
import {requireAuth} from "../middleware/auth.js";
import {userRateLimit} from "../middleware/rate-limit.js";
import {config} from "../config/env.js";
import {createAgent,listAgents} from "../repositories/agent-repository.js";
const schema=z.object({name:z.string().trim().min(1).max(120),description:z.string().trim().max(1000).optional()}).strict();
export const agentRoutes=new Hono<AppBindings>().use("*",requireAuth,userRateLimit).get("/",async c=>{if(!config.DATABASE_URL)return c.json({error:{code:"DATABASE_NOT_CONFIGURED",message:"Agent persistence is not configured."}},503);const p=c.get("principal");try{return c.json({data:await listAgents(p.issuer,p.sub)});}catch{return c.json({error:{code:"TENANT_NOT_READY",message:"The account is not provisioned or storage is unavailable."}},503);}}).post("/",async c=>{if(!config.DATABASE_URL)return c.json({error:{code:"DATABASE_NOT_CONFIGURED",message:"Agent persistence is not configured."}},503);const parsed=schema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:{code:"INVALID_REQUEST",message:"Agent input is invalid."}},400);const p=c.get("principal");try{return c.json({data:await createAgent(p.issuer,p.sub,{name:parsed.data.name,description:parsed.data.description??""})},201);}catch{return c.json({error:{code:"AGENT_CREATE_FAILED",message:"Could not create the agent. Verify tenant provisioning and database availability."}},503);}});