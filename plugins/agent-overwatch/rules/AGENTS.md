# Overwatch Mandatory Checkpoint Rules

The AI Agent MUST observe the following mandatory gates when working in this repository:

1. **Pre-Implementation Gate (`overwatch_plan_check`)**:
   - You MUST call `overwatch_plan_check` immediately after drafting an approach, BEFORE creating or modifying code.
   - Do NOT proceed to implementation if the verdict is `CRITICAL_REVISION` or `NEEDS_REFINEMENT`.

2. **Steering Gate (`overwatch_checkpoint`)**:
   - You MUST call `overwatch_checkpoint` after every major milestone or completed component.
   - You MUST call `overwatch_checkpoint` immediately after 2 consecutive errors or test failures.
   - You MUST adhere strictly to the returned `next_steps` and `avoid` instructions.

3. **Completion Gate (`overwatch_verify`)**:
   - You MUST call `overwatch_verify` with your test results before declaring the task complete.
   - Do NOT inform the user work is finished without an `APPROVED` verdict from overwatch.

4. **Project Memory (`.overwatch/NOTES.md`)**:
   - Read `.overwatch/NOTES.md` at the start of every iteration to respect established architectural constraints.
