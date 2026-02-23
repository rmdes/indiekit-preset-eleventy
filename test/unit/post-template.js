import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// NOTE: @indiekit-test/fixtures not available in standalone fork
// import { getFixture } from "@indiekit-test/fixtures";

import { getPostTemplate } from "../../lib/post-template.js";

describe("preset-eleventy/lib/post-template", async () => {
  // const properties = JSON.parse(getFixture("jf2/post-template-properties.jf2"));

  it("Renders post template without content", () => {
    const result = getPostTemplate({
      published: "2020-02-02",
      updated: "2022-12-11",
      deleted: "2022-12-12",
      name: "Lunchtime",
    });

    assert.equal(
      result,
      `---
date: 2020-02-02
title: Lunchtime
updated: 2022-12-11
deleted: 2022-12-12
---
`,
    );
  });

  it("Renders post template with basic draft content", () => {
    const result = getPostTemplate({
      published: "2020-02-02",
      name: "Lunchtime",
      content:
        "I ate a [cheese](https://en.wikipedia.org/wiki/Cheese) sandwich, which was nice.",
      "post-status": "draft",
    });

    assert.equal(
      result,
      `---
date: 2020-02-02
title: Lunchtime
draft: true
---

I ate a [cheese](https://en.wikipedia.org/wiki/Cheese) sandwich, which was nice.
`,
    );
  });

  it("Renders post template with HTML content", () => {
    const result = getPostTemplate({
      published: "2020-02-02",
      name: "Lunchtime",
      content: {
        html: '<p>I ate a <a href="https://en.wikipedia.org/wiki/Cheese">cheese</a> sandwich, which was nice.</p>',
      },
    });

    assert.equal(
      result,
      `---
date: 2020-02-02
title: Lunchtime
---

<p>I ate a <a href="https://en.wikipedia.org/wiki/Cheese">cheese</a> sandwich, which was nice.</p>
`,
    );
  });

  // SKIPPED: Old test uses @indiekit-test/fixtures (not available in fork)
  // it("Renders post template", () => {
  //   const result = getPostTemplate(properties);
  //   ...
  // });

  // NEW TESTS for permalink logic (all post types, not just pages)

  it("Adds permalink for multi-segment URL (regular post)", () => {
    const result = getPostTemplate({
      published: "2026-02-22",
      name: "Test Article",
      content: "Test content",
      url: "https://example.com/notes/2026/02/22/abc123",
    });

    assert.match(result, /permalink: \/notes\/2026\/02\/22\/abc123\//);
    assert.doesNotMatch(result, /\nurl:/); // url should be deleted
  });

  it("Adds permalink for single-segment URL (page)", () => {
    const result = getPostTemplate({
      published: "2026-02-22",
      name: "About Page",
      content: "About content",
      url: "https://example.com/about",
    });

    assert.match(result, /permalink: \/about\//);
    assert.doesNotMatch(result, /\nurl:/);
  });

  it("Adds permalink for path-only URL (no domain)", () => {
    const result = getPostTemplate({
      published: "2026-02-22",
      content: "Test",
      url: "/articles/2026/02/22/slug",
    });

    assert.match(result, /permalink: \/articles\/2026\/02\/22\/slug\//);
  });

  it("Does not add permalink when URL is missing", () => {
    const result = getPostTemplate({
      published: "2026-02-22",
      name: "No URL",
      content: "Test",
    });

    assert.doesNotMatch(result, /permalink:/);
    assert.doesNotMatch(result, /mpUrl:/);
  });

  it("Preserves mpUrl for edit links", () => {
    const result = getPostTemplate({
      published: "2026-02-22",
      content: "Test",
      url: "https://example.com/notes/2026/02/22/abc123",
    });

    assert.match(result, /mpUrl: https:\/\/example\.com\/notes\/2026\/02\/22\/abc123/);
  });

  it("Ensures trailing slash on permalink", () => {
    const result = getPostTemplate({
      published: "2026-02-22",
      content: "Test",
      url: "/notes/2026/02/22/no-trailing-slash",
    });

    assert.match(result, /permalink: \/notes\/2026\/02\/22\/no-trailing-slash\//);
  });
});
