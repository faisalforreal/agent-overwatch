# Overwatch Prompt Patterns

How junior agents should execute the mentor's `coaching_prompt`:

## Pattern 1: Applying Direct Coaching Prompts
When `overwatch_checkpoint` or `overwatch_review` returns:
```json
"coaching_prompt": "Update src/auth.ts to add expiration check before decoding payload, then add test in tests/auth.test.ts"
```
The junior agent should treat this coaching prompt as its immediate internal priority:
1. Open `src/auth.ts` and apply the exact expiration check.
2. Open `tests/auth.test.ts` and add test coverage.
3. Run test command to confirm fix.

## Pattern 2: Socratic Steering
When the mentor flags an architectural anti-pattern in `avoid`:
```json
"avoid": ["Do NOT use global process.env inside library functions", "Do NOT query database inside render loops"]
```
The junior agent must inspect its code to ensure none of these anti-patterns exist before proceeding.
