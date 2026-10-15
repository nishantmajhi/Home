/*
 * The whole suite, in one command:
 *
 *   node tests/run.js
 *
 * Two halves. The node half reads js/age.js and the two HTML files and checks
 * them without a browser; the browser half loads the real pages in headless
 * Chrome, and skips cleanly if there is no Chrome to find.
 *
 * Both halves can also be run on their own -- the command below and
 * `node tests/browser/run.js` -- and the browser half takes `--original` to
 * run the same checks against the baseline commit. Nothing here needs npm,
 * because nothing here has a dependency.
 */

"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

/*
 * A glob, not the directory. Node 26 resolves a bare directory argument as a
 * module specifier and dies with MODULE_NOT_FOUND before it runs anything.
 */
const NODE_TESTS = "tests/*.test.js";

function step(label, args) {
  console.log("\n=== " + label + " " + "=".repeat(Math.max(0, 60 - label.length)) + "\n");
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status === 0;
}

const passed = [
  step("node suite", ["--test", NODE_TESTS]),
  step("browser suite", ["tests/browser/run.js"]),
];

console.log("");
process.exitCode = passed.every(Boolean) ? 0 : 1;
console.log(passed.every(Boolean) ? "All green." : "Something failed; see above.");
