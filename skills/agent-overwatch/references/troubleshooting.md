# Overwatch Troubleshooting & Recovery

## Common Issues & Resolutions

### 1. "Session call cap reached"
- **Cause:** You have invoked overwatch tools 15 times in the current session.
- **Remedy:** This is normal cost protection. Continue your work independently using the instructions already provided in earlier turns and in `.overwatch/NOTES.md`.

### 2. "Tool Execution Error: All mentor provider attempts failed"
- **Cause:** Network connectivity failure, expired API key, or provider outage.
- **Remedy:** Check your internet connection or check `overwatch doctor` in the terminal to inspect API keys.

### 3. Mentor model warning: "Mentor model is NOT strictly stronger than junior model"
- **Cause:** The mentor model configured in `~/.overwatch/config.json` has a tier less than or equal to the junior model (e.g., both are medium).
- **Remedy:** Update your mentor model configuration to a frontier model (Claude Opus, Fable, Gemini Argon, o3) via `overwatch configure`.
