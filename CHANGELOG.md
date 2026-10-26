# Changelog

All notable changes to `overwatch` are documented in this file.

## [1.0.0] - 2026-10-26

### Initial Release
- **MCP Server**: Stdio MCP server exposing `overwatch_plan_check`, `overwatch_checkpoint`, `overwatch_review`, `overwatch_quick_hint`, `overwatch_verify`, and `overwatch_status`.
- **Mandatory Checkpoint Protocol**: Enforces senior steering before implementation, after milestones, after consecutive failures, and before final completion.
- **Server Context Engine**: Reads git diff, status, and capped files directly with path-traversal guards and automatic secret redaction.
- **Persistent Notes Memory**: Appends architectural decisions and constraints to `.overwatch/NOTES.md` with auto-compaction.
- **Multi-Provider Support**: OpenRouter, Anthropic (with prompt caching and extended thinking), Google Gemini, OpenAI, and custom OpenAI-compatible endpoints (Ollama/vLLM).
- **Tier Validation Engine**: Enforces mentor superiority over junior models using regex patterns in `models.json`.
- **CLI Suite**: `serve`, `configure`, `doctor`, `setup` (Antigravity, Claude Code, Cursor, Windsurf, VS Code), and `stats`.
- **Packaging**: Antigravity plugin bundle (`plugins/overwatch`), agent skill (`skills/overwatch/SKILL.md`), and rules (`rules/AGENTS.md`).
