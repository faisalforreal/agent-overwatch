# Agent-Overwatch Checkpoint Rules (Opt-In)

When explicitly activated by the user (via prompt request or `/agent-overwatch`), the AI Agent observes the following checkpoint gates:

1. **Pre-Implementation Gate (`agent-overwatch_plan_check`)**:
   - Call `agent-overwatch_plan_check` immediately after drafting an approach, BEFORE creating or modifying code.
   - Do NOT proceed to implementation if the verdict is `CRITICAL_REVISION` or `NEEDS_REFINEMENT`.

2. **Steering Gate (`agent-overwatch_checkpoint`)**:
   - Call `agent-overwatch_checkpoint` after every major milestone or completed component.
   - Call `agent-overwatch_checkpoint` immediately after 2 consecutive errors or test failures.
   - Adhere strictly to the returned `next_steps` and `avoid` instructions.

3. **Completion Gate (`agent-overwatch_verify`)**:
   - Call `agent-overwatch_verify` with your test results before declaring the task complete.
   - Do NOT inform the user work is finished without an `APPROVED` verdict from agent-overwatch.

4. **Project Memory (`.agent-overwatch/NOTES.md`)**:
   - Read `.agent-overwatch/NOTES.md` at the start of every iteration to respect established architectural constraints.
