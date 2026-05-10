# Agent Handover Template

If you want another AI agent to use this library in a different project, copy and paste the following prompt to that
agent.

---

## Copy-Paste Prompt for the Other Agent

"I want you to implement a feature using the `ts-game-toolbox` library.

### 1. Library Documentation

You can find the full AI-optimized documentation for this library here:
`[PATH_TO_THIS_PROJECT]/docs/ai.md`
Please read this file to understand the available modules (Assets, Geometries, UI, etc.) and their APIs.

### 2. Integration

The library is located at: `[PATH_TO_THIS_PROJECT]`
To use it in this project, you should:

1. Ensure the library is linked (I have already run `npm link` in the library folder).
2. Run `npm link ts-game-toolbox` in this project.
3. Import what you need from `'ts-game-toolbox'`.

### 3. Your Task

[DESCRIBE_THE_TASK_HERE (e.g., Create a main menu with three buttons using the UI system)]"

---

## Best Practices for Handover

1. **Point to `docs/ai.md`**: This is the most important step. It's a single file designed for LLMs to ingest quickly.
2. **Mention `llms.txt`**: If the agent has a "crawler" or "search" capability, telling it about `[PATH]/llms.txt` will
   help it find all relevant documentation automatically.
3. **Use `npm link`**: For local development across folders, `npm link` is the cleanest way to share the library without
   publishing it to a registry.
    - In this library folder: `npm install && npm run build && npm link`
    - In the other project folder: `npm link ts-game-toolbox`
