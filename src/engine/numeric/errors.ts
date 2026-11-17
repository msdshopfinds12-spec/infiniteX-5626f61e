export type NumericErrorCode =
  | "INVALID_DECIMAL"
  | "INVALID_INTEGER"
  | "UNSAFE_INTEGER"
  | "DIVISION_BY_ZERO"
  | "PRECISION_OUT_OF_RANGE"
  | "INPUT_TOO_LONG"
  | "INVALID_ROUNDING_MODE";

export class NumericEngineError extends Error {
  readonly code: NumericErrorCode;

  constructor(code: NumericErrorCode, message: string) {
    super(message);
    this.name = "NumericEngineError";
    this.code = code;
  }
}
