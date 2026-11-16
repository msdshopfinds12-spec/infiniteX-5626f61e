import type {ErrorHandler} from "hono";
import type {AppBindings} from "../types.js";
export const onError:ErrorHandler<AppBindings>=(error,c)=>{console.error(JSON.stringify({level:"error",event:"unhandled_error",errorName:error.name}));return c.json({error:{code:"INTERNAL_ERROR",message:"An unexpected error occurred."}},500);};