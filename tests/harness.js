/*
 * Loads js/age.js -- the real file, not a transcription of it -- into a
 * node:vm context that has just enough of a browser in it: a document whose
 * getElementById knows about a fixed set of ids, and a Date pinned to a chosen
 * instant so that "how old is he today" has an answer a test can assert on.
 *
 * The script under test is a classic <script>, not a module, so require() is
 * not an option and neither is importing it. vm.runInContext is, and it has
 * one trap worth knowing: top-level `const`s go into the context's global
 * lexical scope and never appear as properties of the sandbox object. That is
 * why age.js hangs its functions off `window` rather than declaring them and
 * hoping -- and why the original, which declares nothing but consts, can only
 * be observed through what it writes to the document.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

/*
 * The commit the project was in when this pass started. Tests that claim "the
 * original did X" read X's source from here rather than from a copy that could
 * drift, and assert the subject line so that a rebased or amended history
 * fails loudly instead of quietly testing the wrong bytes.
 */
const BASELINE_SUBJECT = "first commit";

function baselineSha() {
  const out = execFileSync(
    "git",
    ["log", "--all", "--format=%H", "--grep=^" + BASELINE_SUBJECT + "$", "--max-count=1"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  if (!out) throw new Error('no commit with subject "' + BASELINE_SUBJECT + '"');
  return out.split("\n")[0];
}

function baselineFile(relative) {
  return execFileSync("git", ["show", baselineSha() + ":" + relative], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function currentFile(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

/*
 * A Date that answers `new Date()` with a chosen instant and behaves normally
 * for everything else -- age.js calls `new Date(year, month, 0)` to measure a
 * month, and that has to keep working.
 */
function clockAt(iso) {
  const fixed = new Date(iso).getTime();
  if (Number.isNaN(fixed)) throw new Error("unparseable instant: " + iso);
  return class PinnedDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  };
}

function fakeDocument(ids) {
  const elements = new Map();
  for (const id of ids) {
    elements.set(id, { id, textContent: "", innerHTML: "", tagName: "SPAN" });
  }
  return {
    getElementById(id) {
      return elements.has(id) ? elements.get(id) : null;
    },
    _elements: elements,
  };
}

/*
 * Runs `source` in a fresh context. `now` is a local-time instant with no zone
 * suffix, because the script works in local calendar terms and a "Z" here
 * would silently shift the day for anyone running the suite outside UTC.
 *
 * Returns what happened rather than throwing, so that "the original throws on
 * a page with no #age element" is an assertion rather than a crashed run.
 */
function load(source, options) {
  const settings = options || {};
  const ids = settings.ids === undefined ? ["age"] : settings.ids;
  const document = fakeDocument(ids);
  const sandbox = { document, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.Date = clockAt(settings.now || "2026-09-26T12:00:00");
  vm.createContext(sandbox);

  let error = null;
  try {
    vm.runInContext(source, sandbox, { filename: settings.filename || "age.js" });
  } catch (err) {
    error = err;
  }

  const element = document.getElementById("age");
  return {
    sandbox,
    document,
    error,
    element,
    /* What the page would actually show, whichever property was written to. */
    shown: element ? element.textContent || element.innerHTML || "" : null,
    api: sandbox.ageCounter || null,
  };
}

module.exports = { ROOT, BASELINE_SUBJECT, baselineSha, baselineFile, currentFile, clockAt, load };
