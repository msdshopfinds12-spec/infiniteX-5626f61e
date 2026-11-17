import { NumericEngineError } from "./errors.ts";

export type RoundingMode = "half-even" | "half-up" | "down" | "floor" | "ceil";

export interface DecimalValue {
  readonly coefficient: bigint;
  readonly scale: number;
}

const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const MAX_LITERAL_CHARS = 10_000;
const MAX_SCALE = 1_000;
const MAX_INTERMEDIATE_POWER = 2_000;

function pow10(power: number): bigint {
  if (!Number.isInteger(power) || power < 0 || power > MAX_INTERMEDIATE_POWER) {
    throw new NumericEngineError("PRECISION_OUT_OF_RANGE", "Decimal scale exceeds the configured limit.");
  }
  return 10n ** BigInt(power);
}

function normalize(coefficient: bigint, scale: number): DecimalValue {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
    throw new NumericEngineError("PRECISION_OUT_OF_RANGE", "Decimal scale is outside the supported range.");
  }
  if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
  let nextCoefficient = coefficient;
  let nextScale = scale;
  while (nextScale > 0 && nextCoefficient % 10n === 0n) {
    nextCoefficient /= 10n;
    nextScale -= 1;
  }
  return { coefficient: nextCoefficient, scale: nextScale };
}

export function parseDecimal(input: string): DecimalValue {
  if (typeof input !== "string") {
    throw new NumericEngineError("INVALID_DECIMAL", "Decimal literal must be supplied as a string.");
  }
  if (input.length === 0 || input.length > MAX_LITERAL_CHARS) {
    throw new NumericEngineError("INPUT_TOO_LONG", "Decimal literal is empty or exceeds the configured length limit.");
  }
  if (!DECIMAL_PATTERN.test(input)) {
    throw new NumericEngineError("INVALID_DECIMAL", "Expected a plain base-10 decimal literal; exponent notation and separators are not accepted.");
  }
  const negative = input.startsWith("-");
  const unsigned = negative ? input.slice(1) : input;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > MAX_SCALE) {
    throw new NumericEngineError("PRECISION_OUT_OF_RANGE", "Decimal literal has too many fractional digits.");
  }
  const digits = whole + fraction;
  const coefficient = BigInt(digits) * (negative ? -1n : 1n);
  return normalize(coefficient, fraction.length);
}

export function formatDecimal(value: DecimalValue): string {
  const normalized = normalize(value.coefficient, value.scale);
  const negative = normalized.coefficient < 0n;
  const digits = (negative ? -normalized.coefficient : normalized.coefficient).toString();
  if (normalized.scale === 0) return (negative ? "-" : "") + digits;
  const padded = digits.padStart(normalized.scale + 1, "0");
  const split = padded.length - normalized.scale;
  return (negative ? "-" : "") + padded.slice(0, split) + "." + padded.slice(split);
}

function align(a: DecimalValue, b: DecimalValue): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.coefficient * pow10(scale - a.scale), b.coefficient * pow10(scale - b.scale), scale];
}

export function addDecimal(a: DecimalValue, b: DecimalValue): DecimalValue {
  const [left, right, scale] = align(a, b);
  return normalize(left + right, scale);
}

export function subtractDecimal(a: DecimalValue, b: DecimalValue): DecimalValue {
  const [left, right, scale] = align(a, b);
  return normalize(left - right, scale);
}

export function multiplyDecimal(a: DecimalValue, b: DecimalValue): DecimalValue {
  return normalize(a.coefficient * b.coefficient, a.scale + b.scale);
}

function roundedQuotient(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) throw new NumericEngineError("DIVISION_BY_ZERO", "Cannot divide by zero.");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || mode === "down") return quotient;

  const sameSign = (numerator < 0n) === (denominator < 0n);
  const direction = sameSign ? 1n : -1n;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  if (mode === "floor") return sameSign ? quotient : quotient - 1n;
  if (mode === "ceil") return sameSign ? quotient + 1n : quotient;
  const doubled = absRemainder * 2n;
  if (doubled > absDenominator) return quotient + direction;
  if (doubled < absDenominator) return quotient;
  if (mode === "half-up") return quotient + direction;
  if (mode === "half-even") return quotient % 2n === 0n ? quotient : quotient + direction;
  throw new NumericEngineError("INVALID_ROUNDING_MODE", "Unsupported rounding mode.");
}

export function divideDecimal(
  a: DecimalValue,
  b: DecimalValue,
  precision = 18,
  rounding: RoundingMode = "half-even",
): DecimalValue {
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_SCALE) {
    throw new NumericEngineError("PRECISION_OUT_OF_RANGE", "Division precision must be an integer from 0 to 1000.");
  }
  if (!(["half-even", "half-up", "down", "floor", "ceil"] as const).includes(rounding)) {
    throw new NumericEngineError("INVALID_ROUNDING_MODE", "Unsupported rounding mode.");
  }
  if (b.coefficient === 0n) throw new NumericEngineError("DIVISION_BY_ZERO", "Cannot divide by zero.");
  const numerator = a.coefficient * pow10(b.scale + precision);
  const denominator = b.coefficient * pow10(a.scale);
  return normalize(roundedQuotient(numerator, denominator, rounding), precision);
}

export function compareDecimal(a: DecimalValue, b: DecimalValue): -1 | 0 | 1 {
  const [left, right] = align(a, b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function decimalToJSON(value: DecimalValue): string {
  return formatDecimal(value);
}
