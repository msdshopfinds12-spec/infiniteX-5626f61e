import { NumericEngineError } from "./errors.ts";

export interface NumericInputPolicy {
  readonly maxLength?: number;
  readonly allowNegative?: boolean;
  readonly allowDecimal?: boolean;
}

export function validateNumericInput(input: unknown, policy: NumericInputPolicy = {}): string {
  if (typeof input !== "string") {
    throw new NumericEngineError("INVALID_DECIMAL", "Numeric input must be supplied as a string to preserve precision.");
  }
  const maxLength = policy.maxLength ?? 10_000;
  if (input.length === 0 || input.length > maxLength) {
    throw new NumericEngineError("INPUT_TOO_LONG", "Numeric input is empty or exceeds the configured length limit.");
  }
  if (input.trim() !== input) {
    throw new NumericEngineError("INVALID_DECIMAL", "Whitespace is not permitted in strict numeric input.");
  }
  if (policy.allowNegative === false && input.startsWith("-")) {
    throw new NumericEngineError("INVALID_DECIMAL", "Negative values are not permitted by this input policy.");
  }
  if (policy.allowDecimal === false && input.includes(".")) {
    throw new NumericEngineError("INVALID_DECIMAL", "Decimal values are not permitted by this input policy.");
  }
  return input;
}
