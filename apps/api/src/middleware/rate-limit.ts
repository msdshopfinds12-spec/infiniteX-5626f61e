import {createMiddleware} from "hono/factory";
import type {AppBindings} from "../types.js";
import {config} from "../config/env.js";
type Bucket={count:number;resetAt:number};
const buckets=new Map<string,Bucket>();
const MAX_BUCKETS=10_000;
function removeExpiredBuckets(now:number):void{
 for(const[key,bucket]of buckets){
  if(bucket.resetAt<=now)buckets.delete(key);
 }
}
export const userRateLimit=createMiddleware<AppBindings>(async(c,next)=>{
 const now=Date.now(),sub=c.get("principal").sub;
 let bucket=buckets.get(sub);
 if(!bucket){
  // Keep process memory bounded when many distinct authenticated subjects arrive.
  if(buckets.size>=MAX_BUCKETS)removeExpiredBuckets(now);
  if(buckets.size>=MAX_BUCKETS){
   return c.json({error:{code:"RATE_LIMIT_CAPACITY",message:"Rate limiter capacity is temporarily exhausted. Retry later."}},503);
  }
  bucket={count:0,resetAt:now+config.RATE_LIMIT_WINDOW_MS};
  buckets.set(sub,bucket);
 }
 if(bucket.resetAt<=now){
  bucket={count:0,resetAt:now+config.RATE_LIMIT_WINDOW_MS};
  buckets.set(sub,bucket);
 }
 bucket.count++;
 c.header("X-RateLimit-Limit",String(config.RATE_LIMIT_MAX_REQUESTS));
 c.header("X-RateLimit-Remaining",String(Math.max(0,config.RATE_LIMIT_MAX_REQUESTS-bucket.count)));
 if(bucket.count>config.RATE_LIMIT_MAX_REQUESTS){
  c.header("Retry-After",String(Math.max(1,Math.ceil((bucket.resetAt-now)/1000))));
  return c.json({error:{code:"RATE_LIMITED",message:"Request limit exceeded."}},429);
 }
 await next();
});
