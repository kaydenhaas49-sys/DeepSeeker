# DeepSeeker — Agent Instructions

## Project identity
- This repository is **Backrooms: Lost Signal**, a browser-based Three.js game.
- The active implementation is the web game rooted at `index.html` and `main.js`.
- Treat `README.md` and the active browser implementation as the source of truth.
- Do not rebuild the game in Godot or switch engines. Old prototype/reference-project files are not the active game.

## Autonomy level
Work independently on investigation, bug reproduction, implementation, and verification. Do not stop after writing a plan: after the initial audit, keep selecting the next well-scoped, high-value task and completing it. Ask the user only when a decision is genuinely ambiguous, requires an external account/secret, changes the intended game direction, or cannot be made safely from repository evidence.

## Git safety
- Work only on `codex/deepseeker-high-autonomy` or a task-specific branch created from it.
- Never commit directly to `main` or `BRANCH2`.
- Make small, focused commits. Prefer one independently verifiable fix per commit.
- Push changes and open/update a pull request targeting `BRANCH2` when a coherent batch is ready.
- Never merge a pull request, deploy, publish a release, delete branches, rewrite shared history, or force-push.
- Before editing, inspect `git status`, the current branch, and recent history. Preserve unrelated user changes.
- Never overwrite uncommitted work. If the working tree is dirty in ways you did not create, stop and report the conflict.

## Required loop
1. Inspect the relevant code and existing conventions before changing anything.
2. Reproduce the suspected issue or establish evidence that it exists.
3. Identify the smallest safe fix and the systems it may affect.
4. Implement the fix without unrelated refactoring.
5. Run relevant checks (syntax, tests, build, and/or browser checks that actually exist).
6. Review the diff for regressions, accidental scope expansion, debug leftovers, and broken imports/paths.
7. Commit only a coherent, verified batch. Record the commit, checks, and any limitations in `docs/AUTONOMOUS_DEVELOPMENT.md`.
8. Continue with the next highest-priority verified issue.

## Testing rules
- Discover the project's actual scripts, dependencies, and CI checks before choosing commands. Do not invent `npm test`, build scripts, or package-manager workflows.
- The project may be a static ES-module site; use a local HTTP server for browser testing rather than opening `index.html` as a file.
- Test both normal gameplay and relevant edge cases when possible.
- Check browser console/network errors, asset loading, input behavior, and multiplayer-related behavior when a change touches those systems.
- Distinguish automated checks from manual checks. Never claim a browser test was performed if it was not.
- If a check cannot run, explain why and provide the exact remaining verification.

## Product constraints to preserve
- Preserve the existing browser-based Three.js architecture and current campaign progression.
- Avoid removing or silently changing working systems such as player movement, flashlight, phone, multiplayer, enemy behavior, puzzles, menus, warnings, and the ending flow.
- Treat existing visual/UX decisions as intentional unless the code, issue history, or user says otherwise. In particular, do not reintroduce removed HUD/radar/distance UI or redesign screens as an unrelated cleanup.
- Keep optional decorative asset loading non-blocking; failures in optional props must not prevent boot or normal gameplay.
- Preserve third-party license files and attribution. Do not replace assets or add dependencies with unclear licensing.
- Do not add new paid services, API keys, secrets, analytics, or external dependencies without approval.
- Do not expose secrets or personal information in commits, logs, screenshots, or reports.

## Code quality
- Prefer small, understandable changes over clever abstractions.
- Match the existing JavaScript style and module structure.
- Avoid broad formatting churn and generated-file noise.
- Add or update tests where a meaningful test harness exists.
- Keep comments useful and current; remove temporary debugging output before committing.

## Communication
- Maintain a concise, factual progress log in `docs/AUTONOMOUS_DEVELOPMENT.md`.
- For each completed batch, report: issue, root cause, files changed, commit, checks run, results, and remaining risk.
- Separate confirmed bugs from hypotheses and visual opinions.
- Briefly explain important code decisions so the project owner can learn from the work.
- Do not claim the game is release-ready until the documented release checklist has been completed.
