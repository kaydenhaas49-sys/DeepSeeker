# DeepSeeker Autonomous Development Plan

## Mission
Stabilize and finish **Backrooms: Lost Signal**, the existing browser-based Three.js game, without replacing its architecture or breaking working gameplay. Work in small, testable batches and keep the project owner in control of merging into `BRANCH2` and deployment.

## Branch and release boundaries
- Starting point: `BRANCH2`
- Agent branch: `codex/deepseeker-high-autonomy`
- Pull-request target: `BRANCH2`
- `main` and the live hosted game are out of scope.
- The agent may investigate, edit, test, commit, push its own branch, and prepare pull requests.
- The agent must not merge, deploy, publish, or force-push.

## Phase 0 — Baseline audit (do this first)
- [ ] Confirm branch, clean working tree, and starting commit.
- [ ] Read the README, CI workflows, entry point, module imports, and asset-loading paths.
- [ ] Identify actual test/build/lint commands; do not assume a package manager exists.
- [ ] Run existing automated checks and record baseline failures separately from regressions.
- [ ] Start the game locally over HTTP and inspect browser console/network errors if browser tooling is available.
- [ ] Trace the main play loop: boot/menu, movement, flashlight/phone, objectives/puzzles, enemies, multiplayer, ending.
- [ ] Produce a prioritized bug list with reproduction evidence, severity, affected files, and proposed validation.
- [ ] Do not make broad code changes during the audit.

## Phase 1 — Critical stability
Prioritize verified problems that prevent boot, break core controls, block progression, corrupt state, or cause repeatable crashes.
- [ ] Fix broken imports, runtime exceptions, and critical asset-loading failures.
- [ ] Fix progression blockers and objective/puzzle state inconsistencies.
- [ ] Fix input/focus issues that prevent normal play.
- [ ] Verify that optional decorative assets cannot block boot or gameplay.

## Phase 2 — Gameplay systems
Audit and repair only issues confirmed in the current code/build:
- [ ] Player movement, collision, crouch/sprint/jump, and camera behavior.
- [ ] Flashlight and phone interactions.
- [ ] Enemy state machines, navigation, attack/chase transitions, and recovery.
- [ ] Spider wall/ceiling traversal and encounter/QTE behavior, if still part of the active build.
- [ ] Signal relays, breaker puzzle, gate progression, and ending transition.
- [ ] Multiplayer connection, synchronization, reconnect/error handling, and UI.
- [ ] Audio lifecycle, loading, and cleanup.

## Phase 3 — Presentation and usability
- [ ] Check menu/loading flow, warnings, HUD, signage, and end screen against current intended design.
- [ ] Fix visual defects that are reproducible and materially affect play.
- [ ] Improve performance only after profiling identifies a real bottleneck.
- [ ] Avoid unrelated redesigns, placeholder-looking additions, and unnecessary visual effects.

## Phase 4 — Release-readiness verification
- [ ] Clean boot from a fresh browser session.
- [ ] Complete a full campaign/playtest path from menu to ending.
- [ ] Verify all core controls and interactions.
- [ ] Verify enemy encounters and recovery/death/restart paths where applicable.
- [ ] Verify multiplayer with at least two clients if the backend and test environment are available.
- [ ] Check browser console and network requests for uncaught errors and missing required assets.
- [ ] Check common desktop viewport sizes and a smaller viewport if supported.
- [ ] Confirm license/attribution files remain intact.
- [ ] Summarize known limitations and evidence; do not label untested systems as passed.

## Prioritization
For each issue, score:
1. Severity: crash/progression blocker > core gameplay > multiplayer > presentation > polish.
2. Reproducibility: repeatable and evidenced > intermittent > speculative.
3. Scope: smallest safe fix first.
4. Regression risk: prefer changes with clear tests and limited blast radius.

## Work log

### Initial setup
- Repository: `kaydenhaas49-sys/DeepSeeker`
- Starting branch: `BRANCH2`
- Agent branch: `codex/deepseeker-high-autonomy`
- Baseline commit: `c330e1121b65dd6b5b72a2fae0657020120cbf90`
- Setup status: agent instructions and this plan are being added; no gameplay code has been changed.
