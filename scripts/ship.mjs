/**
 * Ship the current branch to production.
 *
 *   npm run ship
 *
 * One command, but not a blind one. It refuses more often than it runs, on purpose: everything it
 * checks is something that has already gone wrong on this project once.
 *
 *   - Uncommitted work      → you would ship a different tree than you tested.
 *   - Shipping from main    → main is production. Work on a branch, so there is always a preview
 *                             and always something to revert to.
 *   - Behind origin/main    → merging stale work silently reverts someone else's change.
 *   - lint/typecheck/test   → cheap to run here, expensive to discover in a salon at 7pm.
 *   - build                 → the only check that catches a client/server bundle mistake, which is
 *                             invisible to typecheck.
 *
 * The build step also runs `prisma migrate deploy` against your LOCAL database - never production.
 * Production migrations run on Vercel, during its own build. See docs/ENVIRONMENTS.md.
 */
import { execSync, spawnSync } from "node:child_process";

const run = (command) => execSync(command, { encoding: "utf8" }).trim();

function step(label, command) {
  process.stdout.write(`\n▸ ${label}\n`);
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  if (result.status !== 0) fail(`${label} failed. Nothing was shipped.`);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// --- Guards -------------------------------------------------------------------------------------

const branch = run("git rev-parse --abbrev-ref HEAD");

if (branch === "main") {
  fail(
    "You are on main, which is production.\n" +
    "  Work on a branch instead:  git checkout -b my-change\n" +
    "  Then `npm run ship` merges it here for you.",
  );
}

if (run("git status --porcelain")) {
  fail(
    "You have uncommitted changes.\n" +
    "  Commit them first - otherwise you would ship a different tree than the one you just tested.\n" +
    "  git add -A && git commit -m \"...\"",
  );
}

// --- Verify -------------------------------------------------------------------------------------

step("Fetching origin", "git fetch origin main");

const behind = run("git rev-list --count HEAD..origin/main");
if (behind !== "0") {
  fail(
    `Your branch is ${behind} commit(s) behind origin/main.\n` +
    "  Merging now could revert someone else's work.\n" +
    "  git merge origin/main    (then fix any conflicts and try again)",
  );
}

step("Linting", "npm run lint");
step("Typechecking", "npm run typecheck");
step("Testing", "npm test");
step("Building (migrations run against your LOCAL database only)", "npm run build");

// --- Ship ---------------------------------------------------------------------------------------

step("Merging into main", `git checkout main && git merge --no-ff ${branch} -m "Merge ${branch}"`);
step("Pushing to production", "git push origin main");
step(`Returning to ${branch}`, `git checkout ${branch}`);

console.log(`
✔ Shipped ${branch} to production.

  Vercel is building now. It will run prisma migrate deploy against the live database,
  then deploy. Watch: https://vercel.com  →  your project  →  Deployments

  The live site changes in a minute or two. If the build fails, the previous deploy
  keeps serving - customers see nothing.
`);
