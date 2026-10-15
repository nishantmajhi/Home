# Code Review — Home (manishmajhi.com.np)

First reviewed 2026-09-04. Remediated 2026-09-26 on branch `cleanup/2026-09-26`.
This file is now a record rather than a to-do list.

---

## Correction to the first review, read this before anything else

The first review's bug section said, of `js/age.js`:

> The page always displays years and months with an exclamation mark, and the
> days value the script goes to some trouble to compute … is never shown.

**The page displays nothing at all.** `js/age.js` is loaded by no page in this
project, and no page has an element with `id="age"` for it to write to — not
`index.html`, not `devi/index.html`, and not in the first commit either. Had it
been loaded, the first `getElementById("age")` would have returned `null` and
the first assignment in the chain would have thrown a `TypeError`, so nothing
would have been displayed then either.

The diagnosis underneath it was right — the last three lines do discard
everything the four-branch chain computes, and
`tests/original.test.js` proves it by running the first commit's file — but the
consequence was invented. Checking cost one `grep` for `age.js` across the
project.

This is the archive's standing rule for the third time, in a new place: the
first review read the file and did not read the page that was supposed to load
it. It is the same mistake as `Web/Django/MedicineRecognitionSystem - Old`'s,
one level smaller.

**Second correction, smaller.** The first review said of the day-borrow logic:
"the day-borrow logic is actually correct … Worth a comment saying so, because
this expression is easy to mistake for an off-by-one and someone will 'fix' it
eventually." The expression `new Date(current_year, current_month - 1, 0)` is
indeed the last day of the previous month, and that part is right. But the
borrow it feeds is wrong in a way the review recommended preserving: one borrow
is not always enough. From 31 January to 1 March the deficit is 30 days and
February has 28, so the days end up at **−2** and stay there. It cannot be
provoked through this file, whose date of birth is hardcoded to a 24th, and
that is presumably why it read as correct. It is still the wrong algorithm, and
it is the one someone would copy.

Had the review's advice been taken — comment it and leave it — the bug would
have been documented as a feature. Read a proposed remedy as sceptically as a
proposed diagnosis.

---

## What was fixed

### `js/age.js` — rewritten

**P1, as reviewed.** The unconditional final assignment is gone, so the branch
the date actually falls in is the one that shows.

**The borrow, which the review defended.** Months are now counted first and the
days measured from the resulting anniversary, with the anniversary's day
clamped to the length of the month it lands in — 31 January plus one month is
28 or 29 February, because there is no 31 February to land on. The days can
then never be negative, because the anniversary is never later than the date it
is measured to. Every day from 2000 to 2100 is checked against a
reconstruction, and thirty years of them against a slower reference that counts
the months one at a time.

**It no longer throws on a page that has no `#age` element**, which is every
page in this project. It writes nothing and returns `null`.

**It declines a clock set before the date of birth** rather than producing
"−1 years, 11 months and 20 days". A visitor with a misconfigured machine sees
nothing, which is the better of the two.

**`textContent` rather than `innerHTML`**, and the element is looked up once
rather than five times (P3, as reviewed).

**One global instead of six.** The file is an IIFE that exposes
`window.ageCounter`, which is what the tests drive. The original declared
`birth_year`, `birth_month`, `birth_date`, `today`, `current_year`,
`current_month`, `current_day`, `age_years`, `age_months` and `age_days` at
the top level, and offered no seam at all — which is why none of the arithmetic
had ever been tested.

### `devi/index.html` — the 2D page is now reachable when the 3D one fails

The page carries a complete 2D version of itself inside `<noscript>`, for a
visitor with JavaScript switched off. It did not cover the commoner failure:
JavaScript on and three.js or WebGL unavailable — a blocked or unreachable CDN,
an offline machine, WebGL disabled, a device whose driver will not hand out a
context. The engine threw on its first line, and because the scroll lock ran
unconditionally in a script of its own *before* it, what was left was a black
page that could not be scrolled, carrying a heading and a button that did
nothing.

Confirmed in headless Chrome, both ways: with the CDN pointed at a file that
does not exist, and with `getContext` refusing every WebGL context.

The engine is now a named function; a bootstrap below it checks that `THREE`
arrived, locks the scroll only then, calls the engine inside a `try`, and on
either failure calls `showFallback()` — which clears the inline scroll lock and
re-parses the `<noscript>` block into the body. `tests/browser/run.js` covers
all three states, and `--original` confirms all six fallback checks fail
against the first commit.

**This is a visible change, in a failure state only.** Per the archive's
standing constraint it is flagged rather than assumed: the markup shown is the
author's own, written for exactly this purpose, and nothing about the page in
its working state is different. Nothing new was designed.

### `devi/index.html` — structured data and social metadata

None of this is visible on the page; all of it is what other machines read.

- **`og:url` named the site root**, not this page. Sharing the yantra page
  anywhere that follows Open Graph resolved to the poem. Now `/devi/`.
- **`og:image:width` and `og:image:height` said 1200×630. The file is
  3604×3604** — square, not 1.91:1. A crawler lays the card out from the
  declared numbers before the image arrives. `tests/markup.test.js` now reads
  the dimensions out of the WebP container itself, so the two cannot drift
  again.
- **All three JSON-LD nodes shared one `@id`.** In JSON-LD an `@id` is an
  identity, so a `WebSite`, a `WebApplication` and a `CreativeWork` all
  identified as `https://manishmajhi.com.np/devi/` are asserted to be one node
  with three competing names and descriptions. They now have distinct
  identifiers: `…/#website`, `…/devi/`, `…/devi/#yantra`.
- **The `WebApplication`'s and `WebSite`'s `url` pointed at the site root**
  while their `@id` pointed here.
- **The author was two people.** `index.html` identified the `Person` as
  `https://manishmajhi.com.np` and `devi/index.html` as
  `https://manishmajhi.com.np/`, and a trailing slash is a different IRI.

### `index.html` — the link to `devi/`

`window.open(window.location.origin + "/devi/", "_blank")` built a URL from an
origin, which is a scheme and a host with no path. That is always the root of
the server — correct only while this page is the root as well, and wrong for
any other deployment. Opened from disk it was wrong outright: Chrome's origin
for a `file:` URL is `"file://"`, so the heading led to `file:///devi/`;
Firefox's is `"null"`.

Now `window.open("devi/", "_blank")`.

Worth recording how this was caught, because the first version of the test
passed against the original code: it asserted that the resolved URL *ended in*
`/devi/`, and `file:///devi/` does. The check that finds it compares against
`new URL("devi/", location.href).href` — the `devi/` directory beside this
page, not any URL that looks like one. A test that passes against the unfixed
code is testing nothing, and it is not always obvious which one that is.

No `noopener` was added. `devi/` is the same origin and the same author, so
there is nothing for an opener reference to reach, and a non-empty window
features string turns the new tab into a new window in some browsers — which
would be a change to how the site behaves.

### Tidy-up

`devi/css/devi.css` was deleted. It is the standalone 2D page's stylesheet from
before that page was folded into the `<noscript>` block as an inline `<style>`;
nothing had linked it for some time and it shipped with every deploy. It is in
the history if it is wanted. `tests/markup.test.js` now fails on any
stylesheet, script or image in the tree that no page references.

---

## Tests

45 node checks and 25 browser checks; `node tests/run.js` runs both. See the
README for what each file covers.

The two that earn their place:

**`tests/original.test.js`** runs the first commit's `js/age.js` — fetched with
`git show`, not copied, and the commit is looked up by subject line so a
rewritten history fails loudly. Every test in it asserts a bug.

**`node tests/browser/run.js --original`** stages the first commit's HTML in
place of the working tree's and asserts that exactly thirteen named checks fail
and nothing else does. Naming them rather than counting them means a run
against the original that starts *passing* one is visible — which is how the
weak `/devi/` assertion above was caught.

---

## Left alone, deliberately

**The date of birth is still in `js/age.js` in plaintext** — P2 in the first
review, and it is the author's decision, not this pass's. One thing the first
review did not say, which changes the shape of it slightly: the file is loaded
by no page, so the date of birth is published without anything on the site
using it. It is still fetchable at `/js/age.js` by anyone who looks, because a
static host serves the directory. If the counter is never going to be on a
page, deleting the file removes the exposure at no cost. If it is, the number
can be computed at build time and the date left out of what ships.

**"1 years", "1 months" and "1 days".** All four sentences pluralise
unconditionally. `1 months` appears for a month of every year and `1 days` for
a day of every month, so this is not hypothetical. It was not changed because
it is the words on the page, and the archive's constraint on this project is
business logic only. `tests/age.test.js` pins the current wording so that
whoever changes it does so deliberately. It is a one-line change if you want
it.

**The comment `//because stupid getMonth() starts from 0`** is still there, on
a public site under the author's own name, as the first review noted. Kept
because it is true and it is the author's voice.

**The Google Fonts stylesheet** still comes from Google, so every visitor's IP
reaches them. Since 2026-10-07 both pages use one family, Newsreader, at the
author's request — replacing Cinzel and Cormorant Garamond on `devi/`, and
Arial and Times New Roman on the home page, which until then had made no
network request for fonts at all. Self-hosting Newsreader is the fix
and it is straightforward, but it means adding font binaries and their licence
to the repository, which is a decision about what the project contains.

**No `LICENSE` and no copyright line.** For a page whose content is a poem the
author wrote, this matters more than a code licence would. It is a legal
statement, so it is the author's to make; the README says it is missing.

**`<header>` on `index.html` is clickable but is not a link.** It has a
`cursor: pointer` and a click handler, so it cannot be reached by keyboard and
a screen reader does not announce it as anything. Making it an `<a>` is the
right fix and is a change to the markup and therefore to the UI, so it is left
here as a note.

**`devi/index.html` loads three.js from cdnjs with no `integrity` attribute.**
The page executes whatever cdnjs returns. Subresource integrity would pin it,
and with the fallback now in place a hash mismatch degrades to the 2D page
rather than to a black screen — so the risk of adding it is much lower than it
was this morning. Not done because it changes a network dependency's failure
mode and the hash has to be taken from what the CDN actually serves.

**`--font-ui: sans-serif, system-ui`** in `devi/index.html` and
`font-family: Arial, Helvetica, sans-serif, system` in `css/theme.css` both put
a generic family before a more specific one, so the last name in each list can
never be used. Moot since 2026-10-07: both stacks are now
`"Newsreader", Georgia, serif`.

---

## Notes for whoever is next

Nothing here is blocked and nothing is half-done.

The one thing a person could still do that no test can: open
`devi/index.html` in a real browser on a machine with a GPU and drag the
yantra around. Headless Chrome renders it through SwiftShader and the suite
confirms the canvas is sized, the engine started, the button toggles and
dragging stops the rotation — but nobody has looked at it since the engine was
wrapped in a function, and "it draws the right picture" is not something
`--dump-dom` can answer. Five minutes.

If you wire the age counter up, `tests/markup.test.js` has a check that the
script tag and the `#age` element arrive together, in whichever order you add
them.

## Licence, 2026-10-02

The author chose one licence for all of their projects: free for personal,
non-commercial use, modifiable for the user's own use, and not to be
distributed, original or modified. No standard licence says that, so `LICENSE`
is a short custom text, the same in every project apart from the year and what
it excludes. The README's licence section says the same. Anything above that
calls the licence an open question, or calls the project MIT, is superseded.

## CI, 2026-10-02

`.github/workflows/ci.yml` runs the node checks and the browser suite as two
jobs on `ubuntu-latest`. `tests/run.js` runs both halves in one; the workflow
splits them so a failure says which half broke. Nothing has been pushed, so it
has not run on GitHub yet. Every job was run before committing, from a fresh
clone of this branch, the way a runner would run it: Linux jobs in a throwaway
Ubuntu 24.04 (the image `ubuntu-latest` uses) with the same tool versions. 45
and 25.

The node job fetches full history, which the regression tests read; without it
one fails (checked). The browser job fails if the runner prints `SKIP`, which
it does when it finds no Chrome; otherwise a missing browser would read as a
pass.
