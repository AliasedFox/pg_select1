---
name: create-pr
description: Open a GitHub pull request for select1, after formatting the code, fixing lint and running the typecheck, linter, format check and tests, and, only when the user asks for a review too ("create a PR and review"), having the code-reviewer agent review it. Use whenever the user asks to open, create or make a PR.
---

# Create a pull request

1. If you're on `main`, branch first (`feat/...`, `fix/...`, `chore/...`).
2. From the repo root, run `bun run format` and `bun run lint:fix`, and commit what they change.
3. Run `bun run lint`. Fix what it still reports in the code, or, where the code is right and the rule isn't, suppress it on that line with a reason (`// oxlint-disable-next-line <rule> -- <why>`). Tell the user what you changed.
4. After the last code change, run `bun run check`: the typecheck, linter, format check and tests at once, in one command. Each check's lines are prefixed with its name; it goes on when one fails, and fails if any did.
5. If any fails or can't run, stop and tell the user. Don't open the PR unless they say to.
6. Commit, push, and open the PR with `gh pr create`, with its title and description (see below). In its Testing section, list what actually ran and the results.
7. Stop here, with the PR's URL, unless the user asked for a review too (e.g. "create a PR and review"); then go on.
8. Once it's up, start the `code-reviewer` agent with the Agent tool (`subagent_type: "code-reviewer"`). Give it only the PR's number and URL, none of this session: it reads the title, description and diff itself, and posts its review on the PR.
9. When the review comes back, show its findings here as they are, numbered, and say they're posted on the PR. Don't act on any of them: the user reads them and says which to implement.

## Title and description

Write them for a person skimming the PR list, in plain words.

- Title: what changes, in about 8 words or fewer, e.g. "Show a table's indexes in the explorer".
- Summary: 2 to 5 short bullets on what changed and why, from the user's side first. Leave out what the diff already shows: function names, file paths, every edge case.
- Add a short note only for what a reviewer must know: a migration, a behaviour change, a known gap.
- Testing: one line per check with its result, e.g. "`bun run test`: 120 + 85 pass".
