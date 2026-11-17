import type { DecimalValue } from "./decimal.ts";
import { formatDecimal } from "./decimal.ts";

export type ExactNumericJSON = string;

export function serializeExactInteger(value: bigint): ExactNumericJSON {
  return value.toString(10);
}

export function serializeExactDecimal(value: DecimalValue): ExactNumericJSON {
  return formatDecimal(value);
}

/**
 * JSON.stringify cannot serialize bigint. Keep exact numeric values as strings
 * in JSON contracts and revive them explicitly at the trusted boundary.
 */
export function parseExactIntegerJSON(value: unknown): bigint {
  if (typeof value !== "string") throw new TypeError("Exact integer JSON values must be strings.");
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(value)) throw new TypeError("Invalid exact integer JSON value.");
  return BigInt(value);
}
