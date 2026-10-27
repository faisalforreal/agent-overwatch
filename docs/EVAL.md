# Agent-Overwatch Evaluation Protocol (`docs/EVAL.md`)

This document outlines the rigorous benchmarking methodology for evaluating coding agent performance: **Junior Model Alone** vs. **Junior Model + Agent-Overwatch Mentor Steering**.

> [!IMPORTANT]
> Do NOT claim performance or accuracy improvements in project documentation without conducting and publishing empirical benchmark results using this protocol.

---

## 1. Evaluation Methodology

### Test Matrix
- **Junior Model**: Gemini 3.8 Flash / Claude 3.5 Haiku / GPT-4o-mini
- **Mentor Model**: Claude Opus 5.5 / Fable 5.1 / Gemini 4-Argon / OpenAI o3
- **Task Suite**: 8 realistic software engineering tasks across different languages and failure modes:
  1. `T1-Concurrency`: Fix a race condition in a multi-threaded bounded queue (Go).
  2. `T2-SQL-Security`: Refactor a database query layer to eliminate subtle SQL injection and N+1 query patterns (TypeScript).
  3. `T3-Algorithm`: Implement an LRU cache with $O(1)$ operations and thread-safe eviction (Python).
  4. `T4-Architecture`: Design and scaffold a clean hexagonal architecture domain model for an order processing service (TypeScript).
  5. `T5-EdgeCase`: Parse and normalize complex RFC-compliant email and URL formats with edge-case test suites (Rust).
  6. `T6-Refactor`: Migrate legacy callback-based async code to modern async/await with robust error recovery (JavaScript).
  7. `T7-Bugfix`: Resolve a floating-point off-by-one boundary defect in an automated billing calculation (Python).
  8. `T8-Integration`: Implement a retryable HTTP client with exponential backoff and jitter (Go).

---

## 2. Metrics Collected

For each run across both conditions:
1. **Task Success Rate (%):** Did the final code pass 100% of the hidden verification tests?
2. **First-Pass Pass Rate (%):** Did the solution pass tests without human or agent rework?
3. **Number of Turns / Thrashing:** Total iterations taken by the agent to reach completion.
4. **Defect Count in Initial Draft:** Number of architectural or logic flaws caught before code execution.
5. **Total Cost (USD):** Total token cost (Junior token spend + Mentor steering spend).

---

## 3. Evaluation Runner Script Template (`scripts/eval-runner.mjs`)

```javascript
/**
 * Sample Evaluation Harness
 * Compares Junior-alone vs Junior+Overwatch on a test repo.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';

const TASKS = ['T1-Concurrency', 'T2-SQL-Security', 'T3-Algorithm', 'T4-Architecture'];

async function runEvaluation() {
  console.log('Starting Overwatch Evaluation Suite...\n');

  const results = [];

  for (const task of TASKS) {
    console.log(`Evaluating task: ${task}`);

    // Condition A: Junior Alone
    const startA = Date.now();
    // Simulate or invoke junior agent alone
    const resultA = {
      task,
      condition: 'junior-alone',
      passed: false, // Update with test runner
      turns: 7,
      costUsd: 0.012,
    };

    // Condition B: Junior + Overwatch
    const startB = Date.now();
    // Simulate or invoke junior agent with Overwatch MCP active
    const resultB = {
      task,
      condition: 'junior-with-overwatch',
      passed: true, // Update with test runner
      turns: 3,
      costUsd: 0.045,
    };

    results.push(resultA, resultB);
  }

  console.table(results);
}

runEvaluation();
```
