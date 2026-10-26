---
name: overwatch
description: >-
  Connect junior AI coding agents (Gemini Flash, Haiku, GPT-4o-mini) to senior mentor models
  (Claude Opus, Fable, Gemini Argon, o3) via mandatory checkpoints, automated context gathering,
  architectural steering, and release verification.
---

# Overwatch: Senior Architect & Mentor Steering Skill

This skill enforces a **Mentor-in-the-Loop** steering protocol for junior coding models.
Junior models are fast and cost-effective, but can miss edge cases, introduce subtle bugs, or drift into dead ends. 
**Overwatch** connects you directly to a senior staff engineer model at mandatory checkpoints.

---

## 🛑 The Non-Negotiable Checkpoint Protocol

You MUST follow these gates. "Consulting when unsure" is NOT permitted—always trigger these tools:

```text
[User Prompt]
      │
      ▼
1. Plan Solution ──────► [MANDATORY GATE: overwatch_plan_check]
                                   │ (Approved or Refined)
                                   ▼
2. Implementation Loop ─► [MANDATORY GATE: overwatch_checkpoint]
                                   │ (Every milestone & after 2 failures)
                                   ▼
3. Final Diff & Tests ──► [MANDATORY GATE: overwatch_verify]
                                   │ (Must receive APPROVED)
                                   ▼
[Deliver to User]
```

### 1. Pre-Implementation Gate: `overwatch_plan_check`
- **When:** Immediately after drafting your initial approach or implementation plan, BEFORE modifying or creating any code files.
- **Action:** Call `overwatch_plan_check` with `user_goal`, `proposed_plan`, and `repo_path`.
- **Handling Result:**
  - If verdict is `NEEDS_REFINEMENT` or `CRITICAL_REVISION`, adjust your plan based on `next_steps` and `avoid` lists.
  - Do NOT write code until the mentor approves your plan architecture.

### 2. Milestone Steering & Recovery Gate: `overwatch_checkpoint`
- **When:**
  1. After completing each major milestone or file group.
  2. **Immediately after 2 consecutive failures** (test failure, build error, runtime crash).
- **Action:** Call `overwatch_checkpoint` with `user_goal`, `state` (`done`, `about_to_do`, `failing`), and `error_log`.
- **Handling Result:**
  - Strictly follow the returned `next_steps` (the next 3-5 concrete actions).
  - Obey the `avoid` list to prevent anti-patterns.
  - If provided, use `coaching_prompt` as your internal directive for the next turn.

### 3. Debug Loop Breaker: `overwatch_quick_hint`
- **When:** You are stuck on a specific error message or stack trace.
- **Action:** Call `overwatch_quick_hint` with `problem_description` and `error_or_log`.
- **Handling Result:** Use the root-cause diagnosis to apply the fix directly instead of thrashing.

### 4. Code & Diff Audit: `overwatch_review`
- **When:** You have completed a substantial batch of edits and want a deep security, bug, and edge-case review.
- **Action:** Call `overwatch_review` with `user_goal` and `repo_path`.

### 5. Completion Gate: `overwatch_verify`
- **When:** All changes are made and local tests have passed, BEFORE telling the user the task is complete.
- **Action:** Call `overwatch_verify` with `user_goal`, `repo_path`, and `test_results`.
- **Handling Result:**
  - If verdict is `APPROVED`: Present the solution to the user.
  - If verdict is `NEEDS_REFINEMENT`: Fix the remaining defects flagged by the mentor.

---

## 🧠 Shared Memory (`.overwatch/NOTES.md`)

- At the start of every step, check `.overwatch/NOTES.md` in the repository root.
- This file records architectural decisions, rejected alternatives, and project constraints established by the senior mentor.
- Never violate decisions recorded in `NOTES.md`.

---

## 💰 Budget Exhaustion Protocol

- If any tool returns: `Session call cap reached. The junior agent must now proceed independently...`:
  - Do not panic or fail.
  - Proceed independently using the advice and `NOTES.md` recorded so far.
  - Rely on running tests locally to verify correctness before concluding.
