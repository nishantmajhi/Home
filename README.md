# Home

The personal site at <https://manishmajhi.com.np>. Two pages, no build step, no
dependencies, no framework: HTML, CSS, and a little JavaScript, served as files.

| | |
| --- | --- |
| `index.html` | A poem on non-duality. Clicking the heading opens the second page. |
| `devi/index.html` | The Kalika Yantra, drawn in 3D with three.js, with a 2D version of the same page underneath it. |

## Running it

Open `index.html` in a browser. Everything resolves relatively, so the file
works from disk as well as from a server. If you would rather serve it:

```
python -m http.server 8000     # or any other static server
```

Both pages load one typeface, Newsreader, from Google Fonts, and fall back to
Georgia or the system serif without it. `devi/index.html` also loads three.js
from cdnjs. Both have fallbacks — see below — so the site works offline, just
not in 3D and not in Newsreader.

## The two pages

### `index.html`

The poem, three links in the footer, and one piece of behaviour: clicking the
heading opens `devi/` in a new tab. The target is a relative URL, deliberately.
An earlier version built it from `window.location.origin`, which is a scheme
and a host with no path in it, so the link always pointed at the root of the
server — right only for as long as this page was the root as well. Opened from
disk it was wrong outright, because a `file:` URL's origin is `"file://"` in
Chrome and `"null"` in Firefox.

### `devi/index.html`

One page in three states.

**3D.** A canvas, a `<h1>` with the mantra, and a button that toggles
auto-rotation. The yantra is built out of `THREE.Line` primitives — a bindu, five
nested downward triangles, four circles, an eight-petal lotus, two outer
circles, a square, four gates and a double outer square, each at its own depth
so that tilting the model separates them. Drag to rotate, wheel to zoom,
double-click to reset. three.js r128 comes from cdnjs.

**2D.** The whole of the page again, written out inside a `<noscript>` block:
the mantra, a photograph of the yantra, and an accordion of questions and
answers. A browser with JavaScript switched off renders it and ignores the rest.

**2D, reached from the 3D page.** JavaScript being switched off is not the only
way the 3D page can fail to work, and it is the least likely one. Either the
CDN does not answer, or the machine is offline, or WebGL is switched off, or
there is no context to be had — and the engine used to throw on its first line
and leave a black page, with the scroll locked, showing a heading and a button
that did nothing. The bootstrap at the bottom of the page now checks that
`THREE` arrived, runs the engine inside a `try`, and on either failure calls
`showFallback()`, which unlocks the scroll and re-parses the `<noscript>` block
into the body. The visitor gets the 2D page instead of a black rectangle.

`tests/browser/run.js` exercises all three states in a real browser, with the
CDN broken and with WebGL refused.

## `js/age.js`

**No page in this project loads it, and there is no element with `id="age"` for
it to write to.** It is a live age counter, it works, and it is wired to
nothing.

It is kept because the intent is clear and the arithmetic is worth keeping: it
gives whole years, months and days between the author's date of birth and
today, counting months first and then measuring the days from the resulting
anniversary. That ordering matters — subtracting day numbers and borrowing the
length of the previous month, which is the obvious way and the way this file
used to do it, gives a *negative* number of days whenever the deficit is larger
than the month it borrows from. From 31 January to 1 March it borrows
February's 28 against a shortfall of 30.

To put it on a page, add an element with `id="age"` and a
`<script src="js/age.js"></script>` tag. `tests/markup.test.js` will tell you
if you add one without the other.

Note before you do: the file contains a full date of birth in plaintext, and it
is served from the author's own domain under the author's own name whether or
not a page loads it. That is a decision rather than an oversight — see
`review.md`.

## Tests

```
node tests/run.js                        # everything
node --test "tests/*.test.js"            # the half that needs no browser
node tests/browser/run.js                # the half that does
node tests/browser/run.js --original     # the same, against the first commit
```

No npm, no `package.json`, no dependencies. Node 22 or later, because the test
runner is given a glob rather than a directory — Node 26 resolves a bare
directory argument as a module specifier and dies before running anything. Run
here against Node 26.4. The browser half finds Chrome or Edge itself and skips
cleanly if there is none.

| | |
| --- | --- |
| `tests/harness.js` | Loads `js/age.js` into a `node:vm` context with a fake document and a clock pinned to a chosen day. |
| `tests/age.test.js` | The age arithmetic, including every day between 2000 and 2100 checked against a reconstruction and against a slower reference. |
| `tests/original.test.js` | What the first commit's `age.js` did, run rather than described. Every test in it is a bug. |
| `tests/markup.test.js` | The two pages as documents: link targets that exist with the case they are written in, ids the scripts look up, JSON-LD identity, Open Graph agreeing with the canonical URL, declared image dimensions matching the file's own bytes. |
| `tests/browser/` | The real pages in headless Chrome, in all three of the states above. |

`--original` is the useful one. It stages the first commit's HTML instead of
the working tree's and asserts that exactly the expected checks fail — so if a
fix here ever turns out to have been fixing nothing, that run says so.

## What is not here

- **No deployment configuration.** Nothing in here records how the site reaches
  `manishmajhi.com.np`.
- **No self-hosted fonts.** Both pages load Newsreader from Google Fonts, so
  every visitor's IP address reaches Google. Self-hosting them would
  stop that and would probably load faster.

## Layout

```
index.html            the poem
css/theme.css         shared: colours, type, spacing
css/index.css         the poem page only
js/age.js             the age counter, loaded by nothing
favicon.ico
devi/index.html       the yantra, 3D and 2D, styles inline
devi/img/yantra.webp  3604x3604, used by the 2D page and as the social card
devi/favicon.ico
tests/                see above
review.md             what was wrong, what was fixed, what was left
```

## Licence

Free for personal, non-commercial use. You may use, study and modify this
software for yourself, but you may not use it commercially, and you may not
share or publish it, in its original form or modified. See [LICENSE](LICENSE)
for the full terms.

That covers the poem and the yantra page, which are the author's own writing.
