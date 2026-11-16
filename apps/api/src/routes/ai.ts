import {Hono} from "hono";
import {z} from "zod";
import type {AppBindings} from "../types.js";
import {requireAuth} from "../middleware/auth.js";
import {userRateLimit} from "../middleware/rate-limit.js";
import {config} from "../config/env.js";
import {generateWithConfiguredProvider} from "../services/ai-provider.js";
const bodySchema=z.object({prompt:z.string().trim().min(1).max(20000),maxOutputTokens:z.number().int().min(1).max(4096).default(512)}).strict();
export const aiRoutes=new Hono<AppBindings>().post("/generate",requireAuth,userRateLimit,async c=>{const body=bodySchema.safeParse(await c.req.json().catch(()=>null));if(!body.success)return c.json({error:{code:"INVALID_REQUEST",message:"Request body is invalid."}},400);if(!config.AI_BASE_URL||!config.AI_API_KEY||!config.AI_MODEL)return c.json({error:{code:"AI_NOT_CONFIGURED",message:"AI provider is not configured."}},503);try{const data=await generateWithConfiguredProvider(body.data);return c.json({data,meta:{billingStatus:"provider_usage_returned_not_persisted"}});}catch(error){const message=error instanceof Error?error.message:"AI provider request failed.";const status=message==="AI provider is not configured."?503:502;return c.json({error:{code:"AI_PROVIDER_ERROR",message:status===503?message:"AI provider request failed."}},status);}});