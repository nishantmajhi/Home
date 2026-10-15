/*
 * Live age counter.
 *
 * Nothing in this project loads this file. There is no element with id "age"
 * in index.html or in devi/index.html, and no <script src="js/age.js"> tag in
 * either -- see README.md. It is kept, fixed and tested because the author
 * evidently wants the counter somewhere; adding it to a page is a design
 * decision, not a bug fix.
 *
 * The date of birth below is a full DOB in plaintext on a public domain under
 * the author's own name. It is served whether or not a page loads this file.
 * That is a deliberate decision left to the author -- review.md, P2.
 */

(function () {
  "use strict";

  const BIRTH = { year: 2000, month: 5, date: 24 }; // month is 1-12, not 0-11

  /*
   * new Date(y, m, 0) is the last day of the *previous* month, because day 0
   * of month m is the day before its first. With `month` 1-12 that makes
   * new Date(year, month, 0) the last day of `month` itself. Easy to misread
   * as an off-by-one; it is not one.
   */
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function toParts(date) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1, // getMonth() is 0-11
      date: date.getDate(),
    };
  }

  function epochDay(parts) {
    return Date.UTC(parts.year, parts.month - 1, parts.date) / 86400000;
  }

  /* Calendar order, not duration: -1, 0 or 1. */
  function compare(a, b) {
    const left = epochDay(a);
    const right = epochDay(b);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  /*
   * `from` advanced by `count` whole months, with the day clamped to the
   * length of the month it lands in -- 31 January plus one month is 28 or 29
   * February, because there is no 31 February to land on.
   */
  function addMonths(from, count) {
    const total = (from.year * 12 + (from.month - 1)) + count;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    return { year, month, date: Math.min(from.date, daysInMonth(year, month)) };
  }

  /*
   * Whole years, whole months and whole days between two calendar dates.
   *
   * The months are counted first and the days are then measured from the
   * resulting anniversary, rather than subtracting the day numbers and
   * borrowing from the previous month. Borrowing looks simpler and is wrong
   * whenever the birth day does not exist in the month it borrows from: from
   * 31 January to 1 March it borrows February's 28 from a deficit of 30 and
   * leaves the days *negative*. Measuring from the anniversary cannot, because
   * the anniversary is never later than the date it is measured to.
   *
   * Throws if `today` is before `birth`; a duration backwards is not an age,
   * and the caller decides what to show instead.
   */
  function ageBetween(birth, today) {
    if (compare(today, birth) < 0) {
      throw new RangeError("today is before the date of birth");
    }
    let months = (today.year - birth.year) * 12 + (today.month - birth.month);
    if (compare(addMonths(birth, months), today) > 0) months -= 1;
    return {
      years: Math.floor(months / 12),
      months: months % 12,
      days: epochDay(today) - epochDay(addMonths(birth, months)),
    };
  }

  function formatAge(age) {
    if (!age.months && !age.days) {
      return `${age.years} years`;
    } else if (!age.months) {
      return `${age.years} years and ${age.days} days`;
    } else if (!age.days) {
      return `${age.years} years and ${age.months} months`;
    }
    return `${age.years} years, ${age.months} months and ${age.days} days`;
  }

  /*
   * Returns the text it wrote, or null if it wrote nothing -- no #age element
   * on the page, or a clock set before the date of birth, which is a visitor's
   * misconfigured machine rather than anything this page can fix. Showing
   * "-1 years, 11 months and 20 days" would be worse than showing nothing.
   */
  function render(doc, now) {
    const element = doc.getElementById("age");
    if (!element) return null;
    const today = toParts(now);
    if (compare(today, BIRTH) < 0) return null;
    const text = formatAge(ageBetween(BIRTH, today));
    element.textContent = text; // textContent, not innerHTML: this is text
    return text;
  }

  /* One global, so the tests can reach the arithmetic without a browser. */
  window.ageCounter = { BIRTH, daysInMonth, toParts, compare, addMonths, ageBetween, formatAge, render };

  render(document, new Date());
})();
