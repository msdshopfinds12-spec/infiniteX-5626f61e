import {createMiddleware} from "hono/factory";
import type {AppBindings} from "../types.js";
import {config} from "../config/env.js";

type Bucket={count:number;resetAt:number};
const buckets=new Map<string,Bucket>();
const MAX_BUCKETS=10_000;

/**
 * A JSON tuple avoids collisions between issuers/subjects that contain delimiters.
 * This limiter remains process-local; use a shared atomic store before multi-instance production.
 */
export function rateLimitKey(issuer:string,subject:string):string {
 return JSON.stringify([issuer,subject]);
}

function removeExpiredBuckets(now:number):void {
 for(const [key,bucket] of buckets) {
  if(bucket.resetAt<=now)buckets.delete(key);
 }
}

export const userRateLimit=createMiddleware<AppBindings>(async(c,next)=>{
 const now=Date.now();
 const principal=c.get("principal");
 const key=rateLimitKey(principal.issuer,principal.sub);
 let bucket=buckets.get(key);

 if(!bucket) {
  if(buckets.size>=MAX_BUCKETS)removeExpiredBuckets(now);
  if(buckets.size>=MAX_BUCKETS) {
   return c.json({error:{code:"RATE_LIMIT_CAPACITY",message:"Rate limiter capacity is temporarily exhausted. Retry later."}},503);
  }
  bucket={count:0,resetAt:now+config.RATE_LIMIT_WINDOW_MS};
  buckets.set(key,bucket);
 }

 if(bucket.resetAt<=now) {
  bucket={count:0,resetAt:now+config.RATE_LIMIT_WINDOW_MS};
  buckets.set(key,bucket);
 }

 bucket.count++;
 c.header("X-RateLimit-Limit",String(config.RATE_LIMIT_MAX_REQUESTS));
 c.header("X-RateLimit-Remaining",String(Math.max(0,config.RATE_LIMIT_MAX_REQUESTS-bucket.count)));

 if(bucket.count>config.RATE_LIMIT_MAX_REQUESTS) {
  c.header("Retry-After",String(Math.max(1,Math.ceil((bucket.resetAt-now)/1000))));
  return c.json({error:{code:"RATE_LIMITED",message:"Request limit exceeded."}},429);
 }

 await next();
});
