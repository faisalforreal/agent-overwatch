# Agent-Overwatch Rules (Opt-In)

When activated by the user, observe the guidelines corresponding to the selected mode:

---

## Mode A: Top-Down Architect Mode (`/agent-overwatch`)
In this mode, the chat assistant is the **Senior Architect** (Gemini 4 Argon / frontier model), delegating implementation to junior worker subagents (`Model="flash"`).

1. **No Self-Verification**: The Senior Architect does not call verification gates on itself. It formulates architecture and constraints directly in chat and `.agent-overwatch/NOTES.md`.
2. **Subagents NEVER Call Overwatch Tools**: Junior worker subagents dispatched via `invoke_subagent` must NEVER call `agent-overwatch_*` tools.
3. **Subagent Scoped Micro-Commits & Handover**:
   - The subagent must run tests and stage ONLY the files it modified (`git add <files>`).
   - The subagent commits using prefix: `overwatch(flash): <brief summary>`.
   - The subagent returns an `overwatch-receipt` manifest listing `commit`, `touched_files`, `test_status`, and hands over immediately to parent.
4. **Scoped Diff Inspection**:
   - The Senior Architect inspects the subagent's changes using `agent-overwatch_diff_audit` passing `files` from the receipt and baseline commit. This prevents uncommitted dirty directory bleed.
   - The Senior Architect audits the scoped diff against `.agent-overwatch/NOTES.md` and provides feedback via `send_message`.

---

## Mode B: Bottom-Up External Mentor Mode (`/agent-overwatch-reverse`)
In this mode, the chat assistant is a junior model consulting an external frontier mentor (Bedrock Claude Opus 5.5, OpenAI o3, Gemini API, custom endpoint) via MCP tools:

1. **Pre-Implementation Gate (`agent-overwatch_plan_check`)**:
   - Call `agent-overwatch_plan_check` before modifying code.
   - Respect verdict and lock constraints into `.agent-overwatch/NOTES.md`.
2. **Steering Gate (`agent-overwatch_checkpoint`)**:
   - Call after every major milestone or after 2 consecutive errors/failures.
3. **Completion Gate (`agent-overwatch_verify`)**:
   - Call before declaring completion to ensure full quality sign-off.
