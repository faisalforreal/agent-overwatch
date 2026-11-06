---
name: agent-overwatch
description: >-
  Top-Down Architect Delegation mode: Senior Architect in chat (Gemini 4 Argon) formulates plans,
  locks constraints into .agent-overwatch/NOTES.md, delegates code implementation to fast junior worker
  subagents (invoke_subagent Model="flash"), and audits changes with deep git diff reviews. Use ONLY
  when the user explicitly requests overwatch, senior mentor oversight, or uses the /agent-overwatch slash command.
---

# Agent-Overwatch: Top-Down Architect Delegation Skill

Enables a frontier reasoning model in the IDE chat (such as Gemini 4 Argon) to act as the **Senior Staff Architect**, formulating system architecture and delegating mechanical coding to fast junior worker subagents (`Model="flash"`) while maintaining strict quality gates and isolating git diffs from dirty directory noise.

---

## ⚡ Activation Policy (Opt-In Only)

> [!IMPORTANT]
> **DO NOT trigger or call `agent-overwatch` tools unprompted.**
> This skill is strictly **OPT-IN**. Only activate and follow this protocol when:
> 1. The user explicitly requests senior oversight, architect delegation, or overwatch in their prompt (e.g., "use agent-overwatch", "architect this with overwatch", "@agent-overwatch").
> 2. The user invokes the `/agent-overwatch` command.
>
> During normal coding requests where the user has not asked for overwatch, work independently and do not invoke these tools.

---

## 🛑 The Architect Delegation Protocol (When Activated)

In this mode, **you (the chat model) are already the Senior Architect**. You do NOT need self-verification gates (`plan_check` or `verify` on your own thoughts). Instead, you direct the junior worker subagent (`Model="flash"`), receive its touched files and micro-commit, audit the scoped diff, and steer it to completion.

```text
[User Request with /agent-overwatch]
       │
       ▼
1. Senior Architect Formulates Architecture in Chat (Gemini 4 Argon)
   └── Lock hard constraints into .agent-overwatch/NOTES.md
       │
       ▼
2. Baseline Snapshot
   └── Call agent-overwatch_diff_audit(mode="snapshot") to record HEAD commit and dirty files
       │
       ▼
3. Dispatch Junior Worker Subagent
   └── invoke_subagent(TypeName="self", Model="flash", Role="Overwatch Junior Implementer")
       │ Subagent writes files, runs local test suite,
       │ stages ONLY touched files, commits: overwatch(flash): <summary>,
       │ and returns ```overwatch-receipt manifest with touched_files & commit.
       │ Subagent NEVER calls overwatch tools.
       ▼
4. Scoped Diff & Receipt Audit (Zero Noise)
   └── Call agent-overwatch_diff_audit(files=receipt.touched_files, base_commit=baseline.headCommit)
       │ Isolates subagent changes from any unrelated dirty uncommitted files
       ▼
5. In-Chat Senior Architect Review
   ├── Review scoped diff directly against .agent-overwatch/NOTES.md
   ├── If defects found: send_message to subagent with corrective guidance
   └── If clean & verified: Deliver completed solution to user
```

---

### Step 1: Architectural Strategy & Shared Memory
- Formulate the architecture, component boundaries, test requirements, and security criteria directly in chat.
- Maintain `.agent-overwatch/NOTES.md` at the repository root as the single source of truth for design decisions and constraints:
  ```markdown
  # Architectural Notes
  - Decision: Use streaming response parser for low latency
  - Constraint: No external network calls in data processing pipeline
  - Testing: Unit test coverage required for all edge cases
  ```

---

### Step 2: Capture Baseline Snapshot (`agent-overwatch_diff_audit`)
- Before delegating, capture the baseline commit and existing dirty files to prevent developer work-in-progress from contaminating the subagent review:
  ```typescript
  agent-overwatch_diff_audit({
    mode: "snapshot",
    repo_path: "<workspace_root>"
  });
  ```
- Keep note of the returned `headCommit`.

---

### Step 3: Junior Worker Subagent Delegation (`invoke_subagent`)
- Dispatch the implementation task to a fast junior worker subagent locked to `Model="flash"`:
  ```typescript
  invoke_subagent({
    TypeName: "self",
    Model: "flash",
    Role: "Overwatch Junior Implementer",
    Prompt: `Implement the following feature per our architectural plan:
<Detailed Task Description>

Constraints:
1. Adhere strictly to .agent-overwatch/NOTES.md.
2. Run tests to verify your implementation.
3. Once working, stage ONLY the files you modified (git add <file1> <file2>).
4. Commit your changes with prefix: "overwatch(flash): <brief summary>".
5. Return an overwatch-receipt code block in your response:
\`\`\`overwatch-receipt
commit: "<git commit hash>"
touched_files:
  - "path/to/modified_or_created_file1.ts"
  - "path/to/modified_or_created_file2.ts"
test_status: "PASSED (all tests pass)"
summary: "Brief explanation of changes"
\`\`\`
6. Do NOT invoke any agent-overwatch_* tools. Hand over directly when complete.`
  });
  ```

---

### Step 4: Scoped Diff Audit (`agent-overwatch_diff_audit`)
- When the subagent completes and sends its message with the `overwatch-receipt`, call `agent-overwatch_diff_audit`:
  ```typescript
  agent-overwatch_diff_audit({
    repo_path: "<workspace_root>",
    files: ["path/to/file1.ts", "path/to/file2.ts"], // From subagent's receipt
    base_commit: "<baseline_head_commit>",
    target_commit: "<subagent_commit_hash>",
    mode: "audit"
  });
  ```
- **Why Scoped Diff?** If the repository has uncommitted, dirty WIP files from the developer or other tasks, a regular `git diff` produces noise and confusion. Scoping to `files` extracts *exclusively* the changes made by the Flash subagent.

---

### Step 5: Senior Architect In-Chat Audit & Steering
- As the Senior Architect, inspect the clean, scoped diff directly in chat:
  - **Logic & Edge Cases:** Check for off-by-one errors, null checks, edge cases, and API misuses.
  - **Constraint Verification:** Check whether the implementation complied with `.agent-overwatch/NOTES.md`.
  - **Security & Redaction:** Ensure no credentials or unwanted logs were introduced.
- **If corrections are required:**
  - Send targeted, actionable feedback directly to the subagent using `send_message`:
    ```typescript
    send_message({
      Recipient: "<subagent_conversation_id>",
      Message: "In path/to/file1.ts line 42, handle the undefined case when payload is empty. Re-run tests, amend commit, and update receipt."
    });
    ```
- **If approved & verified:**
  - Complete the task and present the clean, working solution to the user.
