---
name: agent-overwatch-reverse
description: >-
  Bottom-Up External API Steering mode: Fast junior worker in chat (Gemini Flash, Haiku, GPT-4o-mini)
  submits checkpoints and diffs to external frontier mentor models (Bedrock Claude Opus 5.5, OpenAI o3,
  Gemini API, OpenRouter, Custom endpoints) via 1-shot HTTP MCP gates. Use when the user requests reverse
  overwatch, external API mentor review, or uses the /agent-overwatch-reverse slash command.
---

# Agent-Overwatch Reverse: Classic External API Mentor Steering

Connects a junior coding agent in the IDE to an external senior mentor model (Bedrock Claude Opus 5.5, OpenAI o3, Gemini API, Anthropic API, OpenRouter, or Custom Base URL) via direct 1-shot HTTP MCP gates.

---

## ⚡ Activation Policy (Opt-In Only)

> [!IMPORTANT]
> **DO NOT trigger or call `agent-overwatch` tools unprompted.**
> This skill is strictly **OPT-IN**. Only activate and follow this protocol when:
> 1. The user explicitly requests external mentor review or reverse overwatch (e.g., "use agent-overwatch-reverse", "check with bedrock mentor", "@agent-overwatch-reverse").
> 2. The user invokes the `/agent-overwatch-reverse` command.
>
> During normal coding requests where the user has not asked for overwatch, work independently and do not invoke these tools.

### 🔄 Mid-Session Catch-Up (When Activated Mid-Project)
If the user invokes Agent-Overwatch Reverse mid-project (after conversation turns where Overwatch was not called):
- Pass `session_context: ["Summary of decision 1", "Summary of decision 2"]` on your first tool call.
- Pass `relevant_files: ["path/to/file1.ts", ...]` listing key existing or modified files you have touched or plan to touch.
- The Overwatch server automatically computes the git commit delta, scans untracked files, and backfills `.agent-overwatch/NOTES.md` so the external senior mentor immediately understands the entire project history.

---

## 🛑 The Checkpoint Protocol (When Activated)

When the user activates Agent-Overwatch Reverse, follow these gates:

```text
[Junior Coder in Chat]
       │
       ▼
1. Plan Solution ──────► [Pre-Implementation Gate: agent-overwatch_plan_check]
                                     │ (1-Shot HTTP to External Mentor)
                                     ▼
2. Implementation Loop ─► [Milestone Gate: agent-overwatch_checkpoint]
                                     │ (Every major milestone & after 2 failures)
                                     ▼
3. Final Diff & Tests ──► [Completion Gate: agent-overwatch_verify]
                                     │ (Must receive APPROVED from Mentor)
                                     ▼
[Deliver to User]
```

### 1. Pre-Implementation Gate: `agent-overwatch_plan_check`
- **When:** Immediately after drafting your initial approach or implementation plan, BEFORE modifying or creating any code files.
- **Action:** Call `agent-overwatch_plan_check` with `user_goal`, `proposed_plan`, `repo_path`, and optional `relevant_files` / `session_context`.
- **Handling Result:**
  - If verdict is `NEEDS_REFINEMENT` or `CRITICAL_REVISION`, adjust your plan based on `next_steps` and `avoid` lists.
  - Do NOT write code until the mentor approves your plan architecture.

### 2. Milestone Steering & Recovery Gate: `agent-overwatch_checkpoint`
- **When:**
  1. After completing each major milestone or file group.
  2. **Immediately after 2 consecutive failures** (test failure, build error, runtime crash).
- **Action:** Call `agent-overwatch_checkpoint` with `user_goal`, `state` (`done`, `about_to_do`, `failing`), `error_log`, and optional `relevant_files`.
- **Handling Result:**
  - Strictly follow the returned `next_steps` (the next 3-5 concrete actions).
  - Obey the `avoid` list to prevent anti-patterns.
  - If provided, use `coaching_prompt` as your internal directive for the next turn.

### 3. Debug Loop Breaker: `agent-overwatch_quick_hint`
- **When:** You are stuck on a specific error message or stack trace.
- **Action:** Call `agent-overwatch_quick_hint` with `problem_description`, `error_or_log`, and optional `relevant_files`.
- **Handling Result:** Use the root-cause diagnosis to apply the fix directly instead of thrashing.

### 4. Code & Diff Audit: `agent-overwatch_review`
- **When:** You have completed a substantial batch of edits and want a deep security, bug, and edge-case review.
- **Action:** Call `agent-overwatch_review` with `user_goal`, `repo_path`, and optional `relevant_files`.

### 5. Completion Gate: `agent-overwatch_verify`
- **When:** All changes are made and local tests have passed, BEFORE telling the user the task is complete.
- **Action:** Call `agent-overwatch_verify` with `user_goal`, `repo_path`, `test_results`, and optional `relevant_files`.
- **Handling Result:**
  - If verdict is `APPROVED`: Present the solution to the user.
  - If verdict is `NEEDS_REFINEMENT`: Fix the remaining defects flagged by the mentor.

---

## 🧠 Shared Memory (`.agent-overwatch/NOTES.md`)

- At the start of every step, check `.agent-overwatch/NOTES.md` in the repository root.
- This file records architectural decisions, rejected alternatives, and project constraints established by the senior mentor.
- Never violate decisions recorded in `NOTES.md`.

---

## 💰 Budget Exhaustion Protocol

- If any tool returns: `Session call cap reached. The junior agent must now proceed independently...`:
  - Do not panic or fail.
  - Proceed independently using the advice and `NOTES.md` recorded so far.
  - Rely on running tests locally to verify correctness before concluding.
