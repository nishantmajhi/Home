/*
 * The two pages, checked as documents rather than as code.
 *
 * A static site has no runtime to fail in, so the things that go wrong in one
 * go wrong silently: a stylesheet whose filename differs from its link only in
 * case (which Windows forgives and a CDN does not), a script that queries an
 * id no longer in the markup, structured data that says this page is that
 * page. None of those show up in a browser on the author's machine, which is
 * exactly why they survive.
 *
 * Everything here reads the real files. There is no HTML parser in the
 * standard library and adding one to a project with no dependencies would cost
 * more than it is worth, so the extraction below is deliberately narrow: it
 * knows about the attributes these two files actually use.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PAGES = ["index.html", "devi/index.html"];

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

/* Attribute values that name another file: href= and src=, double-quoted. */
function references(html) {
  const found = [];
  for (const match of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) found.push(match[1]);
  return found;
}

function metaContent(html, key) {
  const pattern = new RegExp(
    '<meta\\s+(?:name|property)="' + key + '"\\s+content="([^"]*)"',
    "i",
  );
  const spread = new RegExp(
    '<meta\\s*\\n?\\s*(?:name|property)="' + key + '"\\s*\\n?\\s*content="([^"]*)"',
    "i",
  );
  const match = html.match(pattern) || html.match(spread);
  return match ? match[1] : null;
}

function canonical(html) {
  const match = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i);
  return match ? match[1] : null;
}

function jsonLd(html) {
  const blocks = [...html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )];
  return blocks.map((block) => JSON.parse(block[1]));
}

/*
 * Case-exact existence. fs.existsSync answers "yes" on Windows for a name
 * whose case is wrong, and Netlify's CDN answers 404 for the same name -- the
 * shape of bug that took the Hugo blog's header image off the live site. The
 * directory listing is the only authority that agrees with the server.
 */
function existsExactly(target) {
  const directory = path.dirname(target);
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return false;
  }
  return entries.includes(path.basename(target));
}

test("every local href and src resolves, with the case it is written in", () => {
  const missing = [];
  for (const page of PAGES) {
    const base = path.dirname(path.join(ROOT, page));
    for (const reference of references(read(page))) {
      if (/^(https?:|data:|mailto:|#|\/\/)/i.test(reference)) continue;
      const target = path.resolve(base, reference.split(/[?#]/)[0]);
      if (!existsExactly(target)) missing.push(page + " -> " + reference);
    }
  }
  assert.deepEqual(missing, []);
});

/*
 * The other direction: a file that ships and is never asked for. devi/ had a
 * css/devi.css, the standalone 2D page's stylesheet from before that page was
 * folded into the <noscript> block as an inline <style>. Nothing had linked it
 * for some time and it went out with every deploy.
 */
test("no stylesheet, script or image in the tree is unreferenced", () => {
  const html = PAGES.map(read).join("\n");
  /*
   * js/age.js is unreferenced too, and that is the other known finding rather
   * than a second orphan -- it is named here so this test keeps catching new
   * ones, and covered on its own terms by the test below.
   */
  const known = ["js/age.js"];
  const orphans = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (![".git", "tests"].includes(entry.name)) walk(relative);
        continue;
      }
      if (!/\.(css|js|webp|png|jpe?g|svg|ico)$/i.test(entry.name)) continue;
      if (html.includes(entry.name) || known.includes(relative.replace("./", ""))) continue;
      orphans.push(relative);
    }
  };
  walk(".");
  assert.deepEqual(orphans, []);
});

test("every id an inline script looks up is in the markup it ships with", () => {
  const unresolved = [];
  for (const page of PAGES) {
    const html = read(page);
    for (const match of html.matchAll(/getElementById\(\s*"([^"]+)"\s*\)/g)) {
      const id = match[1];
      if (!new RegExp('\\sid="' + id + '"').test(html)) unresolved.push(page + " -> #" + id);
    }
    for (const match of html.matchAll(/querySelector\(\s*"([a-z][a-z0-9]*)"\s*\)/gi)) {
      const tag = match[1];
      if (!new RegExp("<" + tag + "[\\s>]", "i").test(html)) unresolved.push(page + " -> <" + tag + ">");
    }
  }
  assert.deepEqual(unresolved, []);
});

/*
 * js/age.js and the element it writes to are either both present or both
 * absent. They are currently both absent -- no page loads the script and no
 * page has an #age element, which is the correction at the top of review.md.
 * Wiring one up without the other is the failure this guards against, in
 * whichever direction it happens.
 */
test("the age counter is either wired up at both ends or at neither", () => {
  for (const page of PAGES) {
    const html = read(page);
    const loadsScript = /src="[^"]*js\/age\.js"/.test(html);
    const hasElement = /\sid="age"/.test(html);
    assert.equal(
      loadsScript,
      hasElement,
      page + (loadsScript
        ? " loads js/age.js but has no element with id age"
        : ' has an element with id "age" but never loads js/age.js'),
    );
  }
});

test("both pages declare a language, a charset and a title", () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /<html lang="[a-z]{2}(-[A-Za-z]+)?">/, page);
    assert.match(html, /<meta charset="UTF-8"\s*\/>/i, page);
    assert.match(html, /<title>[^<]+<\/title>/, page);
  }
});

/* ------------------------------------------------------------------ *
 * Structured data and social metadata
 * ------------------------------------------------------------------ */

test("the JSON-LD in both pages parses", () => {
  for (const page of PAGES) {
    assert.equal(jsonLd(read(page)).length, 1, page);
  }
});

/*
 * A crawler that follows og:url indexes the page it names, not the page that
 * carries the tag. devi/index.html named the site root, so the yantra page's
 * card resolved to the poem.
 */
test("og:url names the page it is on", () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.equal(metaContent(html, "og:url"), canonical(html), page);
  }
});

test("twitter:url, where present, names the page it is on", () => {
  for (const page of PAGES) {
    const html = read(page);
    const declared = metaContent(html, "twitter:url");
    if (declared === null) continue;
    assert.equal(declared, canonical(html), page);
  }
});

/*
 * @id is an identity, not a label. Three nodes sharing one @id assert that
 * they are one node, so a consumer merges a WebSite, a WebApplication and a
 * CreativeWork into a single thing with three competing names.
 */
test("no two JSON-LD nodes claim the same @id", () => {
  for (const page of PAGES) {
    for (const block of jsonLd(read(page))) {
      const nodes = block["@graph"] || [block];
      const ids = nodes.map((node) => node["@id"]).filter(Boolean);
      assert.deepEqual([...new Set(ids)], ids, page + ": " + JSON.stringify(ids));
    }
  }
});

test("every JSON-LD url on this site points at a page that exists here", () => {
  const site = "https://manishmajhi.com.np/";
  const wrong = [];
  for (const page of PAGES) {
    const expected = canonical(read(page));
    for (const block of jsonLd(read(page))) {
      const nodes = block["@graph"] || [block];
      for (const node of nodes) {
        /* A node identified as this page must describe this page. */
        if (node["@id"] === expected && node.url && node.url !== expected) {
          wrong.push(page + ": " + node["@type"] + " @id " + node["@id"] + " url " + node.url);
        }
        for (const url of [node.url, node["@id"]]) {
          if (typeof url !== "string" || !url.startsWith(site)) continue;
          /* A fragment names something on a page, not a page. */
          const relative = url.slice(site.length).split("#")[0].replace(/\/$/, "");
          const target = relative === "" ? "index.html" : path.join(relative, "index.html");
          if (!existsExactly(path.join(ROOT, target))) wrong.push(page + ": " + url);
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
});

/*
 * Facebook, LinkedIn and X lay a card out from the declared dimensions before
 * the image arrives. Declaring 1200x630 for a square file is not a hint that
 * gets corrected -- it is the aspect ratio the card is built at.
 */
test("declared og:image dimensions match the file on disk", () => {
  for (const page of PAGES) {
    const html = read(page);
    const source = metaContent(html, "og:image");
    const width = metaContent(html, "og:image:width");
    const height = metaContent(html, "og:image:height");
    if (!source) {
      assert.equal(width, null, page + " declares an image size with no image");
      continue;
    }
    if (width === null && height === null) continue;

    const site = "https://manishmajhi.com.np/";
    assert.ok(source.startsWith(site), page + ": " + source);
    const file = path.join(ROOT, source.slice(site.length));
    assert.ok(existsExactly(file), page + ": " + source + " is not in this repository");

    const actual = webpSize(fs.readFileSync(file));
    assert.equal(Number(width), actual.width, page + " og:image:width");
    assert.equal(Number(height), actual.height, page + " og:image:height");
  }
});

/*
 * Enough of the WebP container to read a size out of the three bitstream
 * flavours: lossy (VP8), lossless (VP8L) and extended (VP8X). Thirty lines
 * against a dependency, for a fact that is otherwise taken on trust.
 */
function webpSize(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", "not a RIFF container");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", "not a WebP file");
  const chunk = buffer.toString("ascii", 12, 16);

  if (chunk === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") {
    const start = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    assert.ok(start > 0, "no VP8 keyframe marker");
    return {
      width: buffer.readUInt16LE(start + 3) & 0x3fff,
      height: buffer.readUInt16LE(start + 5) & 0x3fff,
    };
  }
  throw new Error("unknown WebP chunk: " + chunk);
}

test("the WebP reader agrees with the file it is pointed at", () => {
  const image = fs.readFileSync(path.join(ROOT, "devi/img/yantra.webp"));
  assert.deepEqual(webpSize(image), { width: 3604, height: 3604 });
});

/* ------------------------------------------------------------------ *
 * The link from the poem to the yantra
 * ------------------------------------------------------------------ */

/*
 * window.location.origin is "null" on a file:// URL and drops any directory
 * the site is served under, so a link built from it works in exactly one
 * deployment and nowhere else. A relative target works in all of them.
 */
test("the header link is built relatively, not from window.location.origin", () => {
  const html = read("index.html");
  assert.ok(/window\.open\("devi\/", "_blank"\)/.test(html), "the link to devi/ is gone");
  assert.ok(!/window\.location\.origin/.test(html), "still built from location.origin");
});

/*
 * No noopener here, deliberately. devi/ is the same origin and the same
 * author, so there is nothing for an opener reference to reach, and a
 * non-empty window features string turns the new tab into a new window in
 * some browsers -- which would be a change to how the site behaves rather
 * than to whether it is correct.
 */

/* ------------------------------------------------------------------ *
 * The 3D page's fallback
 * ------------------------------------------------------------------ */

/*
 * devi/index.html carries a complete 2D version of itself inside <noscript>,
 * for a visitor with JavaScript switched off. The case it did not cover is the
 * commoner one: JavaScript is on, and three.js or WebGL is not available. The
 * engine then threw on its first line and left a locked black page with a
 * heading and a dead button on it. See tests/browser for the proof in a real
 * browser; these two are the static half.
 */
test("the 3D page can reach its own 2D fallback", () => {
  const html = read("devi/index.html");
  assert.ok(/<noscript>/.test(html), "the 2D fallback markup is gone");
  assert.ok(/function showFallback\(\)/.test(html), "nothing can show the fallback");
  assert.ok(/\bshowFallback\(\);/.test(html), "showFallback is defined and never called");
  assert.ok(/} catch \(error\) {/.test(html), "starting the engine is not guarded");
});

test("the scroll lock is only applied once the engine has started", () => {
  const html = read("devi/index.html");
  const lock = html.indexOf('documentElement.style.overflow = "hidden"');
  const guard = html.indexOf("typeof THREE");
  assert.ok(guard > -1, "nothing checks whether three.js arrived");
  assert.ok(lock > -1, "the scroll lock is gone");
  assert.ok(lock > guard, "the page locks scrolling before it knows it can render");
});

/*
 * A Person identified as "https://manishmajhi.com.np" on one page and
 * "https://manishmajhi.com.np/" on another is two people as far as anything
 * consuming the graph is concerned.
 */
test("the author is identified by the same IRI on every page", () => {
  const seen = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node["@type"] === "Person" && node.url) seen.add(node.url);
    Object.values(node).forEach(walk);
  };
  for (const page of PAGES) jsonLd(read(page)).forEach(walk);
  assert.deepEqual([...seen], ["https://manishmajhi.com.np/"]);
});
