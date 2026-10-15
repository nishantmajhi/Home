/*
 * Runs the real pages in a real browser.
 *
 * The node suite in tests/ reads the two HTML files as documents and js/age.js
 * as arithmetic. Neither of those can answer the question this project's worst
 * bug turns on -- what a visitor sees when three.js or WebGL is not available
 * -- because answering it needs a browser that can actually fail to give a
 * page a WebGL context.
 *
 * Chrome is driven with --headless=new --dump-dom, which needs no driver, no
 * protocol client and no dependency. The project is copied into a scratch
 * directory, the page under test is given one extra script tag and (for the
 * two failure scenarios) one deliberate injury, and the copy is checked
 * against the real file so that a page which drifted from the one under test
 * fails loudly instead of quietly passing.
 *
 *   node tests/browser/run.js              all four scenarios
 *   node tests/browser/run.js --original   the same, against the baseline
 *
 * With no browser installed it exits 0 and says SKIP.
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const BASELINE_SUBJECT = "first commit";

const CANDIDATES = [
  process.env.HOME_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findBrowser() {
  for (const candidate of CANDIDATES) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* not there */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Staging
 * ------------------------------------------------------------------ */

const COPY = ["index.html", "favicon.ico", "css", "js", "devi"];

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

/*
 * Collects what the page throws. Chrome reports an uncaught exception on
 * stderr and nowhere the dumped DOM can see, so without this a page that
 * half-loaded would look like a page that loaded.
 */
const ERROR_HOOK =
  "<script>window.__errors=[];" +
  "window.addEventListener('error',function(e){window.__errors.push(String(e.message))});" +
  "</script>";

/*
 * Chrome will hand out a software WebGL context even with --disable-gpu, so a
 * machine with no GPU has to be simulated. Refusing every webgl context is
 * what such a machine looks like from inside the page.
 */
const NO_WEBGL =
  "<script>(function(){var real=HTMLCanvasElement.prototype.getContext;" +
  "HTMLCanvasElement.prototype.getContext=function(kind){" +
  "return /webgl/i.test(kind)?null:real.apply(this,arguments)};})();</script>";

function insertions(scenario) {
  const list = [{ after: "<head>", text: "\n" + ERROR_HOOK }];
  if (scenario === "no-webgl") {
    list.push({ before: "<!-- THREE.JS ENGINE -->", text: NO_WEBGL + "\n    " });
  }
  list.push({
    before: "</body>",
    text: '<script src="driver.js"></script>\n  ',
  });
  return list;
}

function stageFile(html, scenario) {
  let staged = html.replace(
    /<html lang="en">/,
    '<html lang="en" data-scenario="' + scenario + '">',
  );
  if (staged === html) throw new Error("the page has no <html lang=\"en\"> to mark");

  for (const insertion of insertions(scenario)) {
    const anchor = insertion.after || insertion.before;
    if (staged.split(anchor).length - 1 !== 1) {
      throw new Error("expected exactly one " + anchor + " in the page");
    }
    staged = insertion.after
      ? staged.replace(anchor, anchor + insertion.text)
      : staged.replace(anchor, insertion.text + anchor);
  }
  if (scenario === "no-three") {
    const cdn = /src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/[^"]*"/;
    if (!cdn.test(staged)) throw new Error("the three.js script tag has moved");
    staged = staged.replace(cdn, 'src="three-is-not-here.js"');
  }
  return staged;
}

/*
 * Undoing every insertion must give the original back. That is the check that
 * the page in the scratch directory is the page in the repository and not
 * something this file invented.
 */
function verifyStaged(staged, original, scenario) {
  let undone = staged;
  for (const insertion of insertions(scenario)) {
    undone = undone.replace(insertion.text, "");
  }
  undone = undone.replace(' data-scenario="' + scenario + '"', "");
  if (scenario === "no-three") {
    undone = undone.replace(
      'src="three-is-not-here.js"',
      'src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"',
    );
  }
  if (undone !== original) {
    throw new Error("the staged " + scenario + " page is not the real page with known edits");
  }
}

function copyInto(destination, useBaseline) {
  fs.mkdirSync(destination, { recursive: true });
  const walk = (relative) => {
    const source = path.join(ROOT, relative);
    if (fs.statSync(source).isDirectory()) {
      fs.mkdirSync(path.join(destination, relative), { recursive: true });
      for (const entry of fs.readdirSync(source)) walk(path.join(relative, entry));
      return;
    }
    if (useBaseline && /\.html$/.test(relative)) {
      fs.writeFileSync(path.join(destination, relative), baselineFile(relative.replace(/\\/g, "/")));
      return;
    }
    fs.copyFileSync(source, path.join(destination, relative));
  };
  for (const entry of COPY) walk(entry);
}

const SCENARIOS = [
  { name: "home", page: "index.html" },
  { name: "yantra", page: "devi/index.html" },
  { name: "no-three", page: "devi/index.html" },
  { name: "no-webgl", page: "devi/index.html" },
];

function stage(scenario, useBaseline) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "home-browser-"));
  copyInto(dir, useBaseline);
  fs.copyFileSync(path.join(__dirname, "driver.js"), path.join(dir, "driver.js"));
  if (path.dirname(scenario.page) !== ".") {
    fs.copyFileSync(
      path.join(__dirname, "driver.js"),
      path.join(dir, path.dirname(scenario.page), "driver.js"),
    );
  }

  const target = path.join(dir, scenario.page);
  const original = fs.readFileSync(target, "utf8");
  const staged = stageFile(original, scenario.name);
  verifyStaged(staged, original, scenario.name);
  fs.writeFileSync(target, staged);
  return dir;
}

/* ------------------------------------------------------------------ *
 * Running
 * ------------------------------------------------------------------ */

function run(browser, dir, page) {
  const profile = path.join(dir, "profile");
  const result = spawnSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-extensions",
      "--user-data-dir=" + profile,
      "--virtual-time-budget=12000",
      "--dump-dom",
      "file:///" + path.join(dir, page).replace(/\\/g, "/"),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 },
  );

  if (result.error) throw result.error;
  const dom = result.stdout || "";
  const match = dom.match(/<div id="test-results">([\s\S]*?)<\/div>/);
  if (!match) {
    throw new Error(
      "the page produced no results. Last of the dumped DOM:\n" +
        dom.slice(-1200) + "\n--- stderr ---\n" + (result.stderr || "").slice(-1200),
    );
  }
  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return JSON.parse(decoded);
}

/*
 * What the baseline is expected to fail, named rather than counted, so that a
 * run against the original which starts passing something -- or fails for a
 * new reason -- is visible instead of absorbed into a total.
 */
const EXPECTED_BASELINE_FAILURES = {
  home: ["clicking the heading opens this site's devi/ page"],
  yantra: [],
  "no-three": [
    "the 2D page is showing",
    "the yantra photograph is in place of the model",
    "the 3D shell is gone rather than sitting on top",
    "the page can be scrolled",
    "the 2D stylesheet came with the markup",
    "nothing escaped as an uncaught error",
  ],
  "no-webgl": [
    "the 2D page is showing",
    "the yantra photograph is in place of the model",
    "the 3D shell is gone rather than sitting on top",
    "the page can be scrolled",
    "the 2D stylesheet came with the markup",
    "nothing escaped as an uncaught error",
  ],
};

function main() {
  const useBaseline = process.argv.includes("--original");
  const browser = findBrowser();
  if (!browser) {
    console.log("SKIP: no Chrome or Edge found. Set HOME_BROWSER to one.");
    console.log("      Everything here that can be checked without a browser is");
    console.log("      checked by the node suite; what a skip loses is what a");
    console.log("      visitor sees when three.js or WebGL is missing.");
    return 0;
  }
  console.log("browser: " + browser);
  console.log("page:    " + (useBaseline ? "the baseline commit" : "the working tree"));
  console.log("");

  let surprises = 0;
  let total = 0;

  for (const scenario of SCENARIOS) {
    const dir = stage(scenario, useBaseline);
    let results;
    try {
      results = run(browser, dir, scenario.page);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    }

    console.log(scenario.name + "  (" + scenario.page + ")");
    const shouldFail = useBaseline ? EXPECTED_BASELINE_FAILURES[scenario.name] : [];
    for (const result of results) {
      total++;
      const expectedToFail = shouldFail.indexOf(result.name) !== -1;
      const surprising = result.ok === expectedToFail;
      if (surprising) surprises++;
      const mark = result.ok ? "  ok  " : "  FAIL";
      const tag = expectedToFail ? (result.ok ? "  <-- expected this to fail" : " (expected)") : "";
      console.log(mark + "  " + result.name + tag);
      if (!result.ok && !expectedToFail) console.log("        " + result.error.split("\n")[0]);
    }
    console.log("");
  }

  if (useBaseline) {
    console.log(
      surprises === 0
        ? "The baseline failed exactly what it was expected to fail, and nothing else."
        : surprises + " result(s) the baseline was not expected to give.",
    );
  } else {
    console.log(surprises === 0 ? total + " checks, all passing." : surprises + " failing.");
  }
  return surprises === 0 ? 0 : 1;
}

process.exitCode = main();
