/*
 * What the original js/age.js did, run from the baseline commit rather than
 * described. Every test here is a bug: if one of them starts failing because
 * the original behaves better than it says, the claim in review.md is wrong
 * and should be corrected, not the test.
 *
 * The fixed file is asserted against the same cases in age.test.js, so the two
 * files read as a before and an after.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { load, baselineFile, baselineSha } = require("./harness.js");

const ORIGINAL = baselineFile("js/age.js");

test("the baseline commit is the one the corrections were written against", () => {
  assert.match(baselineSha(), /^[0-9a-f]{40}$/);
  assert.match(ORIGINAL, /const birth_year = 2000;/);
});

/*
 * The headline. The four-branch if/else chain computes four different
 * sentences and the last three lines of the file overwrite all of them, so the
 * days the script borrows from the previous month to work out are never seen.
 */
test("the final assignment discards every branch above it", () => {
  const onlyDays = load(ORIGINAL, { now: "2026-05-29T09:00:00" });
  assert.equal(onlyDays.error, null);
  assert.equal(onlyDays.shown, "26 years, 0 months!");

  const exactBirthday = load(ORIGINAL, { now: "2026-05-24T09:00:00" });
  assert.equal(exactBirthday.shown, "26 years, 0 months!");

  const full = load(ORIGINAL, { now: "2026-09-26T09:00:00" });
  assert.equal(full.shown, "26 years, 4 months!");
});

test("the days it computes are never shown, on any date of the year", () => {
  for (let month = 1; month <= 12; month++) {
    for (const day of [1, 15, 24, 28]) {
      const stamp = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:00:00`;
      const shown = load(ORIGINAL, { now: stamp }).shown;
      assert.match(shown, /^\d+ years, \d+ months!$/, stamp + " showed " + shown);
    }
  }
});

/*
 * The finding the first review did not have. Its bug section says "the page
 * always displays years and months with an exclamation mark" -- but no page in
 * this project has an element with id "age" and none loads this script, so the
 * first getElementById returns null and the assignment throws. Nothing is
 * displayed, ever. See the correction at the top of review.md.
 */
test("on a page with no #age element the original throws", () => {
  const result = load(ORIGINAL, { now: "2026-09-26T09:00:00", ids: [] });
  assert.ok(result.error, "expected a TypeError, got none");
  assert.match(String(result.error), /Cannot set propert(y|ies) .*innerHTML/);
});

test("the original writes through innerHTML, not textContent", () => {
  const result = load(ORIGINAL, { now: "2026-09-26T09:00:00" });
  assert.equal(result.element.textContent, "");
  assert.equal(result.element.innerHTML, "26 years, 4 months!");
});

test("the original exposes no seam to test its arithmetic through", () => {
  /*
   * Top-level `const`s are invisible to the sandbox object, so they cannot be
   * counted from out here; `let` and the rest are the same. What can be shown
   * is that the script exports nothing deliberate -- there is no seam to test
   * the arithmetic through, which is why the arithmetic was never tested.
   */
  const result = load(ORIGINAL, { now: "2026-09-26T09:00:00" });
  assert.equal(result.api, null);
  assert.match(ORIGINAL, /^const birth_year/m);
  assert.doesNotMatch(ORIGINAL, /function /);
});

/*
 * The borrow. The original subtracts the day numbers and, if that is negative,
 * adds the length of the month before today's. That is one borrow, and one is
 * not always enough: a deficit can exceed the month it borrows from, and then
 * the days stay negative and the page says so.
 *
 * It cannot be provoked through the file itself, because the date of birth is
 * a hardcoded 24th and no month is shorter than 25 days. So the algorithm is
 * transcribed here, exactly as the original writes it, and driven with the
 * birth dates the original cannot have. The fixed file's ageBetween is run
 * over the same cases in age.test.js.
 */
function originalAlgorithm(birth, today) {
  let age_years = today.year - birth.year;
  let age_months = today.month - birth.month;
  let age_days = today.date - birth.date;

  if (age_days < 0) {
    const previous_month = new Date(today.year, today.month - 1, 0);
    age_days += previous_month.getDate();
    age_months--;
  }
  if (age_months < 0) {
    age_months += 12;
    age_years--;
  }
  return { years: age_years, months: age_months, days: age_days };
}

test("one borrow is not enough: the original's arithmetic can go negative", () => {
  const negatives = [];
  for (const birthDay of [29, 30, 31]) {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 2, 3]) {
        const birth = { year: 2000, month: 1, date: birthDay };
        const today = { year: 2026, month, date: day };
        const age = originalAlgorithm(birth, today);
        if (age.days < 0) negatives.push({ birthDay, today, age });
      }
    }
  }
  assert.ok(negatives.length > 0, "expected the single borrow to underflow");

  /* 31 January to 1 March: a 30-day deficit borrowing February's 28. */
  assert.deepEqual(
    originalAlgorithm({ year: 2000, month: 1, date: 31 }, { year: 2026, month: 3, date: 1 }),
    { years: 26, months: 1, days: -2 },
  );
});

test("the original's own suite did not exist", () => {
  const { execFileSync } = require("node:child_process");
  const { baselineSha: sha } = require("./harness.js");
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", sha()], {
    cwd: require("node:path").join(__dirname, ".."),
    encoding: "utf8",
  }).trim().split("\n");
  assert.equal(files.filter((f) => /test/i.test(f)).length, 0);
  assert.equal(files.filter((f) => /README/i.test(f)).length, 0);
});
