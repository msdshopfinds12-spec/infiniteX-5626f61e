import {createRemoteJWKSet,jwtVerify} from "jose";
import {createMiddleware} from "hono/factory";
import type {AppBindings} from "../types.js";
import {config} from "../config/env.js";
let jwks:ReturnType<typeof createRemoteJWKSet>|undefined;
export const requireAuth=createMiddleware<AppBindings>(async(c,next)=>{
 const issuer=config.AUTH_ISSUER_URL,audience=config.AUTH_AUDIENCE,jwksUrl=config.AUTH_JWKS_URL;
 if(!issuer||!audience||!jwksUrl)return c.json({error:{code:"AUTH_NOT_CONFIGURED",message:"Authentication is not configured."}},503);
 const header=c.req.header("authorization");
 if(!header?.startsWith("Bearer "))return c.json({error:{code:"UNAUTHORIZED",message:"Bearer token required."}},401);
 let subject:string;
 try{jwks??=createRemoteJWKSet(new URL(jwksUrl));const verified=await jwtVerify(header.slice(7),jwks,{issuer,audience});if(typeof verified.payload.sub!=="string"||!verified.payload.sub)return c.json({error:{code:"UNAUTHORIZED",message:"Token subject is missing."}},401);subject=verified.payload.sub;}
 catch{return c.json({error:{code:"UNAUTHORIZED",message:"Token is invalid or expired."}},401);}
 c.set("principal",{sub:subject,issuer});
 await next();
});