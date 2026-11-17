import { createAiGatewayHandler } from "../server/ai-gateway/handler";

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

// Fail closed: only an explicit mock setting enables this endpoint.
const mode = process.env.INFINITEX_AI_MODE === "mock" ? "mock" : "disabled";
export default createAiGatewayHandler({ mode });
