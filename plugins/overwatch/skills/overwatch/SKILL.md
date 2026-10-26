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

1. **Pre-Implementation Gate: `overwatch_plan_check`**
   - Call immediately after planning, before writing code.
2. **Milestone Steering & Recovery Gate: `overwatch_checkpoint`**
   - Call after every major milestone, and immediately after 2 consecutive errors.
3. **Debug Loop Breaker: `overwatch_quick_hint`**
   - Call when stuck on an error or stack trace.
4. **Code & Diff Audit: `overwatch_review`**
   - Call for full audit of real git diff.
5. **Completion Gate: `overwatch_verify`**
   - Call before declaring completion to the user.
