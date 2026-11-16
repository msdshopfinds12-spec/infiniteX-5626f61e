import {serve} from "@hono/node-server";
import app from "./app.js";
import {config} from "./config/env.js";
serve({fetch:app.fetch,port:config.PORT,hostname:"0.0.0.0"});
console.info(JSON.stringify({level:"info",event:"server_started",service:config.APP_NAME,port:config.PORT,environment:config.NODE_ENV}));