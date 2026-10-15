/*
 * Runs inside the real pages, in a real browser.
 *
 * tests/browser/run.js copies the project into a scratch directory, appends
 * one script tag pointing at this file, and loads the result in headless
 * Chrome. Results go into a <div id="test-results"> as JSON, which the runner
 * reads out of the dumped DOM.
 *
 * The div is attached to documentElement rather than to body, because the one
 * thing being tested on the yantra page is a code path that replaces the whole
 * of body.
 */

(function () {
  "use strict";

  var results = [];

  function check(name, fn) {
    try {
      var detail = fn();
      results.push({ name: name, ok: true, detail: detail === undefined ? null : detail });
    } catch (err) {
      results.push({ name: name, ok: false, error: String((err && err.stack) || err) });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
  }

  function equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        (message ? message + ": " : "") +
          "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual),
      );
    }
  }

  var scenario = document.documentElement.getAttribute("data-scenario");

  /* ---------------------------------------------------------------- *
   * index.html
   * ---------------------------------------------------------------- */

  function home() {
    check("the poem is on the page", function () {
      var quote = document.querySelector("q");
      assert(quote, "no <q> element");
      var text = quote.textContent.trim();
      assert(text.indexOf("In the dance of cosmos") === 0, "the poem does not start where it should");
      assert(text.indexOf("an existence in vain") > 0, "the poem does not end where it should");
      return text.length;
    });

    check("the three footer links are all absolute and open in a new tab", function () {
      var links = document.querySelectorAll("footer a");
      equal(links.length, 3, "footer link count");
      for (var i = 0; i < links.length; i++) {
        assert(/^https:\/\//.test(links[i].getAttribute("href")), links[i].textContent);
        equal(links[i].getAttribute("target"), "_blank", links[i].textContent);
      }
      return links.length;
    });

    /*
     * The bug this replaces: the target was built from window.location.origin
     * plus "/devi/". An origin has no path in it, so that is always the root
     * of the server -- right only while this page is the root as well, and
     * wrong for every other deployment. Opened from disk it is wrong outright:
     * Chrome gives "file://" for a file: URL's origin, so the heading led to
     * file:///devi/, and Firefox gives "null".
     *
     * The assertion is therefore against the devi/ directory *next to this
     * page*, not against any URL ending in /devi/ -- the weaker version of
     * this check passed against the original, which is how it was caught.
     */
    check("clicking the heading opens this site's devi/ page", function () {
      var asked = null;
      var realOpen = window.open;
      window.open = function (url, target) {
        asked = { url: url, target: target };
        return null;
      };
      try {
        document.querySelector("header").dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      } finally {
        window.open = realOpen;
      }
      assert(asked, "the heading did not try to open anything");
      equal(asked.target, "_blank");
      var resolved = new URL(asked.url, location.href).href;
      equal(resolved, new URL("devi/", location.href).href, "the heading leads to");
      return resolved;
    });

    check("the page raised no errors", function () {
      equal(JSON.stringify(window.__errors || []), "[]");
    });
  }

  /* ---------------------------------------------------------------- *
   * devi/index.html -- the 3D page, when it can run
   * ---------------------------------------------------------------- */

  function yantra() {
    check("three.js loaded", function () {
      assert(typeof THREE !== "undefined", "THREE is undefined");
      return THREE.REVISION;
    });

    check("the engine started and exposed its switch", function () {
      assert(window.__yantra, "window.__yantra is missing");
      equal(typeof window.__yantra.setAuto, "function");
      equal(window.__yantra.autoRotate, false, "it should start still");
    });

    check("the canvas was sized to the viewport", function () {
      var canvas = document.getElementById("three-canvas");
      assert(canvas, "no canvas");
      assert(canvas.width > 0 && canvas.height > 0, canvas.width + "x" + canvas.height);
      /* setPixelRatio caps at 2, so the buffer is at most twice the CSS box. */
      assert(canvas.width <= window.innerWidth * 2 + 2, "buffer is wider than 2x the viewport");
      return canvas.width + "x" + canvas.height;
    });

    check("scrolling is locked while the 3D page is up", function () {
      equal(document.documentElement.style.overflow, "hidden");
      equal(document.body.style.overflow, "hidden");
    });

    check("the 2D fallback was not shown", function () {
      assert(document.querySelector("noscript"), "the noscript block is gone");
      assert(document.getElementById("ui-shell"), "the 3D shell is gone");
      assert(!document.querySelector("details"), "the 2D accordion is on screen");
    });

    check("the button toggles auto-rotation and says which state it is in", function () {
      var button = document.getElementById("auto-btn");
      /* The label starts as markup, indented; syncBtn writes it back without
       * the indentation, so the comparison has to be on the words. */
      var before = button.textContent.trim();
      button.click();
      equal(window.__yantra.autoRotate, true, "after one click");
      assert(button.classList.contains("active"), "the button does not look active");
      assert(button.textContent.trim() !== before, "the label did not change");
      var rotating = button.textContent.trim();

      button.click();
      equal(window.__yantra.autoRotate, false, "after two clicks");
      assert(!button.classList.contains("active"), "the button still looks active");
      equal(button.textContent.trim(), before, "the label did not change back");
      return { still: before, rotating: rotating };
    });

    /*
     * Dragging turns auto-rotation off. The handler is on document and skips
     * events whose target is the button, so a drag has to start elsewhere.
     */
    check("dragging the yantra stops it auto-rotating", function () {
      var button = document.getElementById("auto-btn");
      button.click();
      equal(window.__yantra.autoRotate, true, "auto-rotation did not start");

      document.getElementById("three-canvas").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }),
      );
      equal(window.__yantra.autoRotate, false, "the drag did not stop it");
      assert(!button.classList.contains("active"), "the button still looks active");
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    check("pressing the button does not count as a drag", function () {
      var button = document.getElementById("auto-btn");
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1, clientY: 1 }));
      button.click();
      equal(window.__yantra.autoRotate, true, "the button stopped working");
      button.click();
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    check("the page raised no errors", function () {
      equal(JSON.stringify(window.__errors || []), "[]");
    });
  }

  /* ---------------------------------------------------------------- *
   * devi/index.html -- the 3D page, when it cannot run
   * ---------------------------------------------------------------- */

  function fallback() {
    check("the 2D page is showing", function () {
      var headings = document.querySelectorAll("h1");
      assert(headings.length >= 1, "no heading");
      equal(
        headings[0].textContent.trim(),
        "ॐ क्रीं कालिकायै नमः",
        "the mantra heading",
      );
      var accordion = document.querySelectorAll("details");
      assert(accordion.length >= 4, "only " + accordion.length + " accordion sections");
      return accordion.length;
    });

    check("the yantra photograph is in place of the model", function () {
      var image = document.querySelector("figure img");
      assert(image, "no image in the 2D page");
      assert(/yantra\.webp$/.test(image.getAttribute("src")), image.getAttribute("src"));
      assert(image.getAttribute("alt"), "the image has no alt text");
      return image.getAttribute("src");
    });

    check("the 3D shell is gone rather than sitting on top", function () {
      assert(!document.getElementById("ui-shell"), "the 3D shell is still there");
      assert(!document.getElementById("three-canvas"), "the canvas is still there");
      assert(!document.getElementById("auto-btn"), "the dead button is still there");
    });

    /*
     * The failure this suite exists for. The scroll lock ran unconditionally,
     * so a visitor who could not have the 3D page got a page they could not
     * scroll either -- and the content is four screens long.
     */
    check("the page can be scrolled", function () {
      equal(document.documentElement.style.overflow, "");
      equal(document.body.style.overflow, "");
      var style = getComputedStyle(document.documentElement).overflowY;
      assert(style !== "hidden", "computed overflow-y is " + style);
    });

    /*
     * Asserted on an element the 3D page does not have. The first version of
     * this read the colour off "h1", which the 3D header also has and in the
     * same red -- so it passed against the original, where no fallback had
     * been shown at all.
     */
    check("the 2D stylesheet came with the markup", function () {
      var section = document.querySelector("details");
      assert(section, "no accordion section to read a style off");
      var colour = getComputedStyle(section).backgroundColor;
      /* --surface is hsl(0, 0%, 6%), which is rgb(15, 15, 15). */
      equal(colour, "rgb(15, 15, 15)", "the injected <style> did not apply");
      return colour;
    });

    check("nothing escaped as an uncaught error", function () {
      equal(JSON.stringify(window.__errors || []), "[]");
    });
  }

  var scenarios = { home: home, yantra: yantra, "no-three": fallback, "no-webgl": fallback };

  function publish() {
    var target = scenarios[scenario];
    if (!target) {
      results.push({ name: "scenario", ok: false, error: "unknown scenario: " + scenario });
    } else {
      target();
    }
    var box = document.createElement("div");
    box.id = "test-results";
    box.textContent = JSON.stringify(results);
    document.documentElement.appendChild(box);
  }

  /* After load, so the engine and its first frames have been and gone. */
  if (document.readyState === "complete") setTimeout(publish, 0);
  else window.addEventListener("load", function () { setTimeout(publish, 0); });
})();
