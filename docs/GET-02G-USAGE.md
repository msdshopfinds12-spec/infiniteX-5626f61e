# GET-02G — Usage Examples

All exact numeric values should enter the engine as strings.

```ts
import {
  addDecimal,
  compareDecimal,
  divideDecimal,
  formatDecimal,
  multiplyDecimal,
  parseDecimal,
  parseIntegerLiteral,
  parseSafeInteger,
} from "@/engine/numeric";

const total = addDecimal(parseDecimal("0.1"), parseDecimal("0.2"));
formatDecimal(total); // "0.3"

const product = multiplyDecimal(parseDecimal("1.25"), parseDecimal("2"));
formatDecimal(product); // "2.5"

const quotient = divideDecimal(
  parseDecimal("1"),
  parseDecimal("8"),
  3,
  "half-even",
);
formatDecimal(quotient); // "0.125"

parseIntegerLiteral("9007199254740992"); // exact bigint
parseSafeInteger("9007199254740991"); // safe number
// parseSafeInteger("9007199254740992") throws UNSAFE_INTEGER

compareDecimal(parseDecimal("2.50"), parseDecimal("2.5")); // 0
```

## API boundary guidance

- Send exact integers/decimals as JSON strings, never JSON number literals when precision matters.
- Validate at the boundary, then parse into the domain-specific exact type.
- Convert to JavaScript `number` only for APIs that explicitly require it and only after a safe-range check.
- Choose division precision and rounding mode explicitly in financial or measurement workflows. The default is a general-purpose default, not a financial compliance guarantee.

## Example error handling

```ts
import { NumericEngineError, parseSafeInteger } from "@/engine/numeric";

try {
  const value = parseSafeInteger(userSuppliedString);
  // Use value only after the safe-integer conversion succeeds.
} catch (error) {
  if (error instanceof NumericEngineError) {
    // Map error.code to a safe, user-readable validation message.
  } else {
    throw error;
  }
}
```
