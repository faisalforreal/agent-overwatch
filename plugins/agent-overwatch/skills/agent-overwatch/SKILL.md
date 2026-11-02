---
name: agent-overwatch
description: >-
  Connect junior AI coding agents (Gemini Flash, Haiku, GPT-4o-mini) to senior mentor models
  (Claude Opus, Fable, Gemini Argon, o3) via architectural plan evaluation, milestone checkpoints,
  code review, and verification. Use ONLY when the user explicitly requests overwatch, senior mentor review,
  or uses the /agent-overwatch slash command.
---

# Agent-Overwatch: Senior Architect & Mentor Steering Skill

Connects junior coding agents to senior staff engineer models (Gemini 4 Argon, Claude Opus 5.5, Fable 5.1, OpenAI o3) for architectural plan evaluation, milestone checkpointing, targeted debugging, and release verification.

---

## ⚡ Activation Policy (Opt-In Only)

> [!IMPORTANT]
> **DO NOT trigger or call `agent-overwatch` tools unprompted.**
> This skill is strictly **OPT-IN**. Only activate and follow this protocol when:
> 1. The user explicitly requests senior oversight, mentor review, or architectural validation in their prompt (e.g., "use agent-overwatch", "have the mentor check this", "@agent-overwatch").
> 2. The user invokes the `/agent-overwatch` command or specifies overwatch mode.
>
> During normal coding requests where the user has not asked for overwatch, work independently and do not invoke these tools.

---

## 🛑 The Checkpoint Protocol (When Activated)

When the user activates Agent-Overwatch, follow these gates:

```text
[User Prompt with Overwatch Request]
       │
       ▼
1. Plan Solution ──────► [Pre-Implementation Gate: agent-overwatch_plan_check]
                                    │ (Approved or Refined)
                                    ▼
2. Implementation Loop ─► [Milestone Gate: agent-overwatch_checkpoint]
                                    │ (Every major milestone & after 2 failures)
                                    ▼
3. Final Diff & Tests ──► [Completion Gate: agent-overwatch_verify]
                                    │ (Must receive APPROVED)
                                    ▼
[Deliver to User]
```

### 1. Pre-Implementation Gate: `agent-overwatch_plan_check`
- **When:** Immediately after drafting your initial approach or implementation plan, BEFORE modifying or creating any code files.
- **Action:** Call `agent-overwatch_plan_check` with `user_goal`, `proposed_plan`, and `repo_path`.
- **Handling Result:**
  - If verdict is `NEEDS_REFINEMENT` or `CRITICAL_REVISION`, adjust your plan based on `next_steps` and `avoid` lists.
  - Do NOT write code until the mentor approves your plan architecture.

### 2. Milestone Steering & Recovery Gate: `agent-overwatch_checkpoint`
- **When:**
  1. After completing each major milestone or file group.
  2. **Immediately after 2 consecutive failures** (test failure, build error, runtime crash).
- **Action:** Call `agent-overwatch_checkpoint` with `user_goal`, `state` (`done`, `about_to_do`, `failing`), and `error_log`.
- **Handling Result:**
  - Strictly follow the returned `next_steps` (the next 3-5 concrete actions).
  - Obey the `avoid` list to prevent anti-patterns.
  - If provided, use `coaching_prompt` as your internal directive for the next turn.

### 3. Debug Loop Breaker: `agent-overwatch_quick_hint`
- **When:** You are stuck on a specific error message or stack trace.
- **Action:** Call `agent-overwatch_quick_hint` with `problem_description` and `error_or_log`.
- **Handling Result:** Use the root-cause diagnosis to apply the fix directly instead of thrashing.

### 4. Code & Diff Audit: `agent-overwatch_review`
- **When:** You have completed a substantial batch of edits and want a deep security, bug, and edge-case review.
- **Action:** Call `agent-overwatch_review` with `user_goal` and `repo_path`.

### 5. Completion Gate: `agent-overwatch_verify`
- **When:** All changes are made and local tests have passed, BEFORE telling the user the task is complete.
- **Action:** Call `agent-overwatch_verify` with `user_goal`, `repo_path`, and `test_results`.
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
