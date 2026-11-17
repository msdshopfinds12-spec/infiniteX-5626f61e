import {describe,expect,it} from "vitest";
import {loadConfig} from "../src/config/env.js";
import {rateLimitKey} from "../src/middleware/rate-limit.js";

describe("environment safety",()=>{
 it("uses safe development defaults",()=>{const c=loadConfig({NODE_ENV:"test"});expect(c.PORT).toBe(3000);expect(c.AI_MAX_OUTPUT_TOKENS).toBe(1024);});
 it("rejects production without JWT verification configuration",()=>{expect(()=>loadConfig({NODE_ENV:"production"})).toThrow(/AUTH_ISSUER_URL/);});
 it("rejects an invalid port",()=>{expect(()=>loadConfig({NODE_ENV:"test",PORT:"70000"})).toThrow(/PORT/);});
});

describe("rate limit identity keys",()=>{
 it("isolates identical subjects from different issuers",()=>{
  expect(rateLimitKey("https://issuer-a.example","same-subject"))
   .not.toBe(rateLimitKey("https://issuer-b.example","same-subject"));
 });
 it("uses an unambiguous tuple encoding",()=>{
  expect(rateLimitKey("issuer:a","subject"))
   .not.toBe(rateLimitKey("issuer","a:subject"));
 });
});
