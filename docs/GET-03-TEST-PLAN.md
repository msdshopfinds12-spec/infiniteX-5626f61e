# GET-03 — Compiler Core Test Plan

## Acceptance criteria

1. Lexer emits stable token kinds and exact source offsets.
2. Invalid characters and malformed decimal literals fail with typed diagnostics.
3. Parser enforces precedence and left associativity.
4. Parentheses and unary operators behave deterministically.
5. Evaluator delegates arithmetic to GET-02G exact decimal functions.
6. Division precision is bounded and configurable.
7. Source length, token count, and parser depth are bounded.
8. No dynamic code execution or side effects exist in the compiler module.
9. Existing numeric test suite remains green.

## Test matrix

| Area | Cases |
|---|---|
| Lexer | integers, decimals, operators, parentheses, whitespace, EOF |
| Lexer errors | unknown character, malformed decimal, oversized source |
| Parser | precedence, associativity, nested groups, unary signs |
| Parser errors | missing operand, missing close paren, trailing token, excess depth |
| Evaluator | exact addition, subtraction, multiplication, division, negative values |
| Evaluator errors | divide by zero, precision out of range |
| Regression | all GET-02G numeric tests |
