/*
 * The fixed js/age.js, loaded as the browser would load it.
 *
 * The cases in original.test.js are re-run here so the two files read as a
 * before and an after; the rest is the arithmetic, which the original had no
 * seam to test through and which is the only logic in this project.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { load, currentFile } = require("./harness.js");

const SOURCE = currentFile("js/age.js");
const api = () => load(SOURCE, { now: "2026-09-26T09:00:00" }).api;

function parts(year, month, date) {
  return { year, month, date };
}

/* ------------------------------------------------------------------ *
 * What the original got wrong
 * ------------------------------------------------------------------ */

test("the branch the date falls in is the one that is shown", () => {
  const cases = [
    ["2026-05-24T09:00:00", "26 years"],
    ["2026-05-29T09:00:00", "26 years and 5 days"],
    ["2026-07-24T09:00:00", "26 years and 2 months"],
    ["2026-09-26T09:00:00", "26 years, 4 months and 2 days"],
  ];
  for (const [now, expected] of cases) {
    assert.equal(load(SOURCE, { now }).shown, expected, now);
  }
});

test("no date of the year produces the stray exclamation mark", () => {
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= 28; day++) {
      const stamp = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T09:00:00`;
      assert.doesNotMatch(load(SOURCE, { now: stamp }).shown, /!/, stamp);
    }
  }
});

test("a page with no #age element is left alone instead of throwing", () => {
  const result = load(SOURCE, { now: "2026-09-26T09:00:00", ids: [] });
  assert.equal(result.error, null);
  assert.equal(result.shown, null);
});

test("it writes textContent and leaves innerHTML untouched", () => {
  const result = load(SOURCE, { now: "2026-09-26T09:00:00" });
  assert.equal(result.element.textContent, "26 years, 4 months and 2 days");
  assert.equal(result.element.innerHTML, "");
});

test("it exports exactly one global", () => {
  const result = load(SOURCE, { now: "2026-09-26T09:00:00" });
  assert.ok(result.api, "window.ageCounter is missing");
  const expected = ["document", "console", "window", "globalThis", "Date", "ageCounter"];
  const leaked = Object.keys(result.sandbox).filter((key) => !expected.includes(key));
  assert.deepEqual(leaked, []);
});

/* ------------------------------------------------------------------ *
 * daysInMonth
 * ------------------------------------------------------------------ */

test("daysInMonth knows the months and the leap rule", () => {
  const { daysInMonth } = api();
  const ordinary = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let month = 1; month <= 12; month++) {
    assert.equal(daysInMonth(2026, month), ordinary[month - 1], "2026-" + month);
  }
  assert.equal(daysInMonth(2024, 2), 29, "2024 divisible by 4");
  assert.equal(daysInMonth(1900, 2), 28, "1900 divisible by 100 but not 400");
  assert.equal(daysInMonth(2000, 2), 29, "2000 divisible by 400");
  assert.equal(daysInMonth(2100, 2), 28, "2100 divisible by 100 but not 400");
});

/* ------------------------------------------------------------------ *
 * addMonths -- the clamping the borrow approach got wrong
 * ------------------------------------------------------------------ */

test("addMonths clamps onto months that are too short", () => {
  const { addMonths } = api();
  assert.deepEqual(addMonths(parts(2026, 1, 31), 1), parts(2026, 2, 28));
  assert.deepEqual(addMonths(parts(2024, 1, 31), 1), parts(2024, 2, 29));
  assert.deepEqual(addMonths(parts(2026, 1, 31), 2), parts(2026, 3, 31));
  assert.deepEqual(addMonths(parts(2026, 3, 31), 1), parts(2026, 4, 30));
});

test("addMonths crosses years in both directions", () => {
  const { addMonths } = api();
  assert.deepEqual(addMonths(parts(2026, 12, 15), 1), parts(2027, 1, 15));
  assert.deepEqual(addMonths(parts(2026, 1, 15), -1), parts(2025, 12, 15));
  assert.deepEqual(addMonths(parts(2026, 6, 15), 0), parts(2026, 6, 15));
  assert.deepEqual(addMonths(parts(2000, 5, 24), 316), parts(2026, 9, 24));
});

test("addMonths never lands on a date that does not exist", () => {
  const { addMonths, daysInMonth } = api();
  for (let month = 1; month <= 12; month++) {
    for (const day of [28, 29, 30, 31]) {
      if (day > daysInMonth(2024, month)) continue;
      for (let step = -30; step <= 30; step++) {
        const moved = addMonths(parts(2024, month, day), step);
        assert.ok(moved.month >= 1 && moved.month <= 12, JSON.stringify(moved));
        assert.ok(
          moved.date >= 1 && moved.date <= daysInMonth(moved.year, moved.month),
          JSON.stringify(moved),
        );
      }
    }
  }
});

/* ------------------------------------------------------------------ *
 * ageBetween
 * ------------------------------------------------------------------ */

test("ageBetween on the cases the single borrow got wrong", () => {
  const { ageBetween } = api();
  /* The original's transcription answers the first of these with -2 days. */
  assert.deepEqual(ageBetween(parts(2000, 1, 31), parts(2026, 3, 1)), {
    years: 26,
    months: 1,
    days: 1,
  });
  /* 31 January plus one month is 28 February, so that day is a whole month
   * exactly -- not 28 days short of one. */
  assert.deepEqual(ageBetween(parts(2000, 1, 31), parts(2026, 2, 28)), {
    years: 26,
    months: 1,
    days: 0,
  });
  assert.deepEqual(ageBetween(parts(2000, 8, 31), parts(2026, 10, 1)), {
    years: 26,
    months: 1,
    days: 1,
  });
});

test("ageBetween is zero on the day and on every birthday", () => {
  const { ageBetween } = api();
  assert.deepEqual(ageBetween(parts(2000, 5, 24), parts(2000, 5, 24)), {
    years: 0,
    months: 0,
    days: 0,
  });
  assert.deepEqual(ageBetween(parts(2000, 5, 24), parts(2026, 5, 24)), {
    years: 26,
    months: 0,
    days: 0,
  });
  assert.deepEqual(ageBetween(parts(2000, 5, 24), parts(2000, 5, 25)), {
    years: 0,
    months: 0,
    days: 1,
  });
});

test("a 29 February birthday has an anniversary in every year", () => {
  const { ageBetween } = api();
  /* Clamped to the 28th in a common year, so the 1st of March is one day
   * later rather than the anniversary itself. */
  assert.deepEqual(ageBetween(parts(2000, 2, 29), parts(2025, 2, 28)), {
    years: 25,
    months: 0,
    days: 0,
  });
  assert.deepEqual(ageBetween(parts(2000, 2, 29), parts(2025, 3, 1)), {
    years: 25,
    months: 0,
    days: 1,
  });
  assert.deepEqual(ageBetween(parts(2000, 2, 29), parts(2024, 2, 29)), {
    years: 24,
    months: 0,
    days: 0,
  });
  /* The day before that anniversary counts from 29 January, a 31-day month,
   * so the remainder is 29 days rather than 27 or 28. */
  assert.deepEqual(ageBetween(parts(2000, 2, 29), parts(2025, 2, 27)), {
    years: 24,
    months: 11,
    days: 29,
  });
});

test("ageBetween refuses a date before the date of birth", () => {
  const { ageBetween } = api();
  /* The error is thrown inside the vm context and so is that realm's
   * RangeError, not this one's -- instanceof would be false. The name is the
   * part that carries the meaning. */
  const rangeError = (err) => err.name === "RangeError";
  assert.throws(() => ageBetween(parts(2000, 5, 24), parts(2000, 5, 23)), rangeError);
  assert.throws(() => ageBetween(parts(2000, 5, 24), parts(1999, 12, 31)), rangeError);
});

/*
 * The property that matters, checked exhaustively rather than sampled: for
 * every day from the date of birth to the end of the century the answer must
 * be reconstructible -- the birth date advanced by that many whole months and
 * then that many days must land exactly on the day asked about -- and the days
 * must never be negative, which is what the original could not guarantee.
 */
test("every day from 2000 to 2100 reconstructs to itself", () => {
  const { ageBetween, addMonths, daysInMonth } = api();
  const birth = parts(2000, 5, 24);
  let checked = 0;

  const cursor = new Date(Date.UTC(2000, 4, 24));
  const end = Date.UTC(2100, 11, 31);
  while (cursor.getTime() <= end) {
    const today = parts(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
    const age = ageBetween(birth, today);
    const where = JSON.stringify({ today, age });

    assert.ok(age.days >= 0, where);
    assert.ok(age.months >= 0 && age.months <= 11, where);

    const anniversary = addMonths(birth, age.years * 12 + age.months);
    const landed = new Date(
      Date.UTC(anniversary.year, anniversary.month - 1, anniversary.date),
    );
    landed.setUTCDate(landed.getUTCDate() + age.days);
    assert.equal(landed.getTime(), cursor.getTime(), where);

    /* The days must be a remainder, not a whole month in disguise. */
    assert.ok(age.days < daysInMonth(anniversary.year, anniversary.month), where);

    checked++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  assert.ok(checked > 36000, "expected a century of days, got " + checked);
});

/*
 * The same span again, against a definition rather than an implementation: the
 * age in months is the largest number of whole months that still lands on or
 * before today. Slow and obviously right, which is what a reference is for.
 */
test("it agrees with a count-them-one-at-a-time reference", () => {
  const { ageBetween, addMonths, compare } = api();
  const birth = parts(2000, 5, 24);

  const cursor = new Date(Date.UTC(2000, 4, 24));
  const end = Date.UTC(2030, 11, 31);
  let months = 0;
  while (cursor.getTime() <= end) {
    const today = parts(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
    while (compare(addMonths(birth, months + 1), today) <= 0) months++;

    const anniversary = addMonths(birth, months);
    const expected = {
      years: Math.floor(months / 12),
      months: months % 12,
      days: Math.round(
        (Date.UTC(today.year, today.month - 1, today.date) -
          Date.UTC(anniversary.year, anniversary.month - 1, anniversary.date)) /
          86400000,
      ),
    };
    assert.deepEqual(ageBetween(birth, today), expected, JSON.stringify(today));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
});

test("compare orders calendar dates and ignores the time of day", () => {
  const { compare } = api();
  assert.equal(compare(parts(2026, 1, 1), parts(2026, 1, 2)), -1);
  assert.equal(compare(parts(2026, 1, 2), parts(2026, 1, 1)), 1);
  assert.equal(compare(parts(2026, 1, 1), parts(2026, 1, 1)), 0);
  assert.equal(compare(parts(2025, 12, 31), parts(2026, 1, 1)), -1);
});

/* ------------------------------------------------------------------ *
 * formatAge -- the author's four sentences, unchanged
 * ------------------------------------------------------------------ */

test("formatAge picks the shortest true sentence", () => {
  const { formatAge } = api();
  assert.equal(formatAge({ years: 26, months: 0, days: 0 }), "26 years");
  assert.equal(formatAge({ years: 26, months: 0, days: 5 }), "26 years and 5 days");
  assert.equal(formatAge({ years: 26, months: 2, days: 0 }), "26 years and 2 months");
  assert.equal(formatAge({ years: 26, months: 2, days: 5 }), "26 years, 2 months and 5 days");
  assert.equal(formatAge({ years: 0, months: 0, days: 0 }), "0 years");
});

/*
 * Left as the author wrote it. "1 years" and "1 months" are both wrong English
 * and both appear -- the months one for a month of every year. Changing them
 * changes the words on the page, which is the author's call and not this
 * pass's; review.md records the offer. This pins the wording so that whoever
 * changes it changes it deliberately.
 */
test("singular values are still pluralised, deliberately not fixed here", () => {
  const { formatAge } = api();
  assert.equal(formatAge({ years: 1, months: 1, days: 1 }), "1 years, 1 months and 1 days");
});

/* ------------------------------------------------------------------ *
 * render
 * ------------------------------------------------------------------ */

test("render declines a clock set before the date of birth", () => {
  const result = load(SOURCE, { now: "1998-01-01T09:00:00" });
  assert.equal(result.error, null);
  assert.equal(result.element.textContent, "");
});

test("render returns the text it wrote", () => {
  const { render } = api();
  const element = { textContent: "" };
  const document = { getElementById: (id) => (id === "age" ? element : null) };
  assert.equal(render(document, new Date(2026, 8, 26)), "26 years, 4 months and 2 days");
  assert.equal(element.textContent, "26 years, 4 months and 2 days");
  assert.equal(render({ getElementById: () => null }, new Date(2026, 8, 26)), null);
});

test("render reads the local calendar day, not a UTC one", () => {
  const { render } = api();
  const element = { textContent: "" };
  const document = { getElementById: () => element };
  /* Half past eleven at night on the 23rd of May, local time. */
  render(document, new Date(2026, 4, 23, 23, 30));
  assert.equal(element.textContent, "25 years, 11 months and 29 days");
});
