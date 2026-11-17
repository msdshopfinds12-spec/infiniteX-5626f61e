import { NumericEngineError } from "./errors.ts";

const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;
const MAX_INTEGER_CHARS = 10_000;

export function parseIntegerLiteral(input: string): bigint {
  if (input.length === 0 || input.length > MAX_INTEGER_CHARS) {
    throw new NumericEngineError("INPUT_TOO_LONG", "Integer literal is empty or exceeds the configured length limit.");
  }
  if (!INTEGER_PATTERN.test(input)) {
    throw new NumericEngineError("INVALID_INTEGER", "Expected a base-10 integer without separators or exponent notation.");
  }
  return BigInt(input);
}

export function parseSafeInteger(input: string): number {
  const value = parseIntegerLiteral(input);
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new NumericEngineError("UNSAFE_INTEGER", "Integer cannot be represented exactly as a JavaScript number.");
  }
  return Number(value);
}

export function isSafeIntegerLiteral(input: string): boolean {
  try {
    parseSafeInteger(input);
    return true;
  } catch {
    return false;
  }
}

export function serializeBigInt(value: bigint): string {
  return value.toString(10);
}
