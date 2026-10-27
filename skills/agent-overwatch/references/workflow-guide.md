# Overwatch Workflow Guide

This document describes how junior models interact with the senior mentor during a task.

## Phase 1: Planning & Pre-Flight
1. Read the user's objective carefully.
2. Read `.overwatch/NOTES.md` if it exists to understand established constraints.
3. Formulate your proposed plan.
4. Call `overwatch_plan_check`.
5. Incorporate mentor critiques into your final plan.

## Phase 2: Implementation & Checkpointing
1. Implement the first milestone.
2. If tests pass, call `overwatch_checkpoint` with `state: { done: [...], about_to_do: '...' }`.
3. If an error occurs twice in a row, immediately call `overwatch_checkpoint` with the `error_log` and `state: { failing: '...' }` to get unstuck.
4. Review the returned `coaching_prompt`. Execute the directions.

## Phase 3: Final Verification
1. Run local test suites and capture the output.
2. Call `overwatch_verify`.
3. Only report completion to the user after receiving an `APPROVED` verdict.
