# Contributing to Agent-Overwatch

Thank you for contributing to Agent-Overwatch! This project helps developers maximize the effectiveness of dual-model agent setups by steering junior models with senior mentor models.

---

## Updating `models.json`

`models.json` maintains the classification rules mapping model names to capability tiers:
- **`frontier`**: Flagship reasoning and architectural models (e.g., Claude Opus 5.5, Fable 5.1, Gemini 4-Argon, Gemini Astra, OpenAI o3, o1).
- **`strong`**: High-capability frontier code generation models (e.g., Claude 3.7 Sonnet, DeepSeek R1, GPT-4o, Gemini 3.5 Pro).
- **`medium`**: High-speed, cost-effective execution worker models (e.g., Gemini 3.8 Flash, Claude 3.5 Haiku, GPT-4o-mini).
- **`small`**: Edge and lightweight models (e.g., Gemini Flash 8B, GPT-3.5-Turbo, Qwen-2.5-Coder-7B).

### How to add a new model via Pull Request:
1. Open `models.json`.
2. Add an entry to the `models` array with regex `pattern`, `tier`, `reasoning` (boolean), and a brief `description`:
   ```json
   {
     "pattern": "^(provider/)?model-name.*",
     "tier": "frontier",
     "reasoning": true,
     "description": "Next-gen flagship model"
   }
   ```
3. Run the tier test suite:
   ```bash
   npm test
   ```
4. Submit your pull request with links to official provider model release documentation.

---

## Local Development Workflow

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/faisalforreal/agent-overwatch.git
   cd agent-overwatch
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run build
   ```

3. Run the test suite:
   ```bash
   npm test
   ```

4. Run the CLI doctor to verify local health:
   ```bash
   node bin/overwatch.js doctor
   ```
