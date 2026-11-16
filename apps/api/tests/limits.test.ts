import {describe,expect,it} from "vitest";
import {loadConfig} from "../src/config/env.js";
describe("environment safety",()=>{
 it("uses safe development defaults",()=>{const c=loadConfig({NODE_ENV:"test"});expect(c.PORT).toBe(3000);expect(c.AI_MAX_OUTPUT_TOKENS).toBe(1024);});
 it("rejects production without JWT verification configuration",()=>{expect(()=>loadConfig({NODE_ENV:"production"})).toThrow(/AUTH_ISSUER_URL/);});
 it("rejects an invalid port",()=>{expect(()=>loadConfig({NODE_ENV:"test",PORT:"70000"})).toThrow(/PORT/);});
});