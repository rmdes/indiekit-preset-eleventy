# CLAUDE.md - indiekit-preset-eleventy

Fork of `@indiekit/preset-eleventy` with custom modifications for the `@rmdes/*` Indiekit ecosystem.

## Package Overview

**Package:** `@rmdes/indiekit-preset-eleventy`
**Type:** Indiekit publication preset plugin
**Upstream:** Fork of `@indiekit/preset-eleventy` (Paul Robert Lloyd)
**Purpose:** Configures Indiekit to generate Eleventy-compatible Markdown files with YAML frontmatter

**Version:** 1.0.0-beta.36

## What This Fork Changes from Upstream

### 1. Post Template URL Handling (CRITICAL)

**File:** `lib/post-template.js`, line 59

**Upstream behavior:**
```javascript
delete properties.url;  // Remove URL, let Eleventy generate from file path
```

**Fork behavior (beta.36):**
```javascript
// For pages (single-segment URLs like /about, /videos):
//   Convert URL to permalink so Eleventy generates at /{slug}/
// For regular posts (multi-segment URLs like /articles/2026/02/13/slug):
//   Delete URL, let Eleventy use file paths (nginx rewrites handle mapping)
if (properties.url) {
  const segments = url.split("/").filter(Boolean);
  if (segments.length === 1) {
    properties.permalink = `/${slug}/`;
  }
}
delete properties.url;
```

**History:**
- **Beta.34:** Fork added `permalink` for ALL post types → conflicted with nginx rewrites → 404s.
- **Beta.35:** Removed ALL permalink logic → broke pages (generated at `/content/pages/slug/` instead of `/slug/`).
- **Beta.36 (current):** Adds `permalink` ONLY for pages (single-segment URLs). Regular posts still use file paths.

**Why pages need permalink but regular posts don't:**
- **Pages** are stored at `content/pages/slug.md`. Without permalink, Eleventy generates at `/content/pages/slug/`. Pages need `permalink: /slug/` to generate at root level.
- **Regular posts** are stored at `content/articles/2026-02-13-slug.md`. Eleventy generates at `/content/articles/2026-02-13-slug/`. nginx rewrites map Indiekit URLs to this path. No permalink needed.

**The correct workflow for pages:**
1. Indiekit creates page at `content/pages/videos.md`
2. Indiekit URL is `/videos` (from post type config: `url: "{slug}"`)
3. `post-template.js` detects single-segment URL → sets `permalink: /videos/`
4. Eleventy builds HTML at `/videos/index.html` (from permalink)

**The correct workflow for regular posts:**
1. Indiekit creates post at `content/articles/2026-02-13-slug.md`
2. Indiekit URL is `/articles/2026/02/13/slug/` (from post type config)
3. `post-template.js` detects multi-segment URL → does NOT add permalink
4. Eleventy builds HTML at `/content/articles/2026-02-13-slug/index.html` (from file path)
5. nginx/Caddy rewrites `/articles/2026/02/13/slug/` → `/content/articles/2026-02-13-slug/`

**Do NOT:**
- Add `permalink` for ALL post types (breaks nginx rewrites for regular posts)
- Remove permalink for pages (breaks root-level URL generation)

### 2. Post Type Path Overrides

**File:** `lib/post-types.js`

**Special handling for "page" post type:**
```javascript
if (type === "page") {
  postTypes.set(type, {
    ...postTypes.get(type),
    post: {
      path: `pages/{slug}.md`,     // Stored in pages/ directory
      url: `{slug}`,               // Root-level URL: /about, /now
    },
    media: {
      path: `media/pages/{filename}`,
    },
  });
}
```

This overrides `@rmdes/indiekit-post-type-page`'s default paths (`{slug}.md` → `pages/{slug}.md`).

**Standard post types:**
```javascript
// For type "article":
post: {
  path: `articles/{yyyy}-{MM}-{dd}-{slug}.md`,
  url: `articles/{yyyy}/{MM}/{dd}/{slug}`,
}
```

**Pattern:**
- Path: `{plural}/{yyyy}-{MM}-{dd}-{slug}.md` (flat directory, date prefix in filename)
- URL: `{plural}/{yyyy}/{MM}/{dd}/{slug}` (date-based hierarchy)

**Why this matters:**
- The path determines where Eleventy looks for content files
- The URL is stored in `properties.url` (then deleted from frontmatter)
- Indiekit uses the URL for Micropub Location headers and syndication

## Architecture

### Plugin Structure

```
index.js                    # Main plugin class
lib/
  post-template.js          # Converts JF2 to YAML frontmatter + Markdown
  post-types.js             # Configures paths/URLs for each post type
```

### Plugin API

```javascript
export default class EleventyPreset {
  name = "Eleventy preset";

  get info() {
    return { name: "Eleventy" };
  }

  postTemplate(properties) {
    return getPostTemplate(properties);  // JF2 → YAML frontmatter + content
  }

  init(Indiekit) {
    this.postTypes = getPostTypes(Indiekit.postTypes);  // Configure post type paths
    Indiekit.addPreset(this);
  }
}
```

### Post Template Generation

**Input:** JF2 properties (JavaScript object)
```javascript
{
  type: "entry",
  published: "2026-02-13T14:30:00.000Z",
  name: "My Article",
  content: { text: "Article content here..." },
  category: ["indieweb", "micropub"],
  url: "https://example.com/articles/2026/02/13/my-article",
  slug: "my-article",
}
```

**Output:** YAML frontmatter + Markdown content
```yaml
---
date: 2026-02-13T14:30:00.000Z
title: My Article
category:
  - indieweb
  - micropub
---

Article content here...
```

**Transformations:**
1. **camelCase conversion:** `published-at` → `publishedAt` (Eleventy convention)
2. **Property renames:**
   - `published` → `date` (Eleventy's date field)
   - `name` → `title` (Eleventy's title field)
   - `post-status: draft` → `draft: true` (Eleventy's draft mechanism)
3. **Deletions:**
   - `content` (shown below frontmatter)
   - `name` (use `title`)
   - `postStatus` (use `draft`)
   - `published` (use `date`)
   - `slug` (use `page.fileSlug`)
   - `type` (not required)
   - `url` (Eleventy uses file path for URL generation)

### Post Type Configuration

**Flow:**
1. Indiekit loads post type plugins (`@indiekit/post-type-article`, `@rmdes/indiekit-post-type-page`, etc.)
2. Indiekit calls `EleventyPreset.init(Indiekit)`
3. Preset calls `getPostTypes(Indiekit.postTypes)` to override paths/URLs
4. Preset registers itself via `Indiekit.addPreset(this)`

**Result:** All post types have Eleventy-compatible paths.

## Inter-Plugin Relationships

### @rmdes/indiekit-post-type-page

**The preset overrides the page post type's paths:**
- Page default: `post.path = "{slug}.md"` (root-level files)
- Preset override: `post.path = "pages/{slug}.md"` (pages/ directory)

**Why:** Keeps pages separate from posts. Eleventy directory data files can set default layout for all pages.

### @rmdes/indiekit-endpoint-micropub

**Relies on post type URL configuration:**
- Micropub returns `Location: https://example.com/articles/2026/02/13/my-article` header
- This URL comes from `postType.config.post.url` (configured by preset)

### nginx (Cloudron deployment)

**Expects preset's URL format:**
```nginx
# Legacy URL rewrites (Indiekit URL format → Eleventy file path format)
rewrite ^/(articles|notes|photos)/(\d{4})/(\d{2})/(\d{2})/(.+)$ /content/$1/$2-$3-$4-$5/ last;
```

**CRITICAL:** If preset changes URL format, nginx rewrites break.

### Eleventy

**Consumes preset's output:**
- Reads Markdown files from `content/{type}/{yyyy}-{MM}-{dd}-{slug}.md`
- Parses YAML frontmatter (requires `date`, `title`, etc.)
- Generates HTML at `/content/{type}/{yyyy}-{MM}-{dd}-{slug}/index.html` (from file path)

**Directory data files:**
```json
// content/content.json
{
  "layout": "layouts/post.njk"
}
```

Sets default layout for all posts. Created by `docker/eleventy/entrypoint.sh` or `start.sh`.

## Configuration

### Default (no customization)

Just load the preset:

```javascript
export default {
  plugins: [
    // Post types FIRST
    "@indiekit/post-type-article",
    "@indiekit/post-type-note",
    "@rmdes/indiekit-post-type-page",

    // Preset AFTER
    "@rmdes/indiekit-preset-eleventy",
  ],
};
```

### Custom Post Type Paths

Override paths for specific post types:

```javascript
"@rmdes/indiekit-preset-eleventy": {
  postTypes: [
    {
      type: "note",
      post: {
        path: "notes/{yyyy}/{MM}/{slug}.md",   // Monthly directories
        url: "notes/{yyyy}/{MM}/{slug}",
      },
    },
  ],
},
```

**WARNING:** Customizing paths may conflict with preset's overrides. The preset's `getPostTypes()` runs AFTER user config is loaded.

## Common Gotchas

### Posts return 404 after creation

**Cause:** URL mismatch between Indiekit URL, Eleventy output path, and nginx rewrites.

**Diagnosis:**
1. Check post file exists: `content/articles/2026-02-13-slug.md`
2. Check Eleventy output: `_site/content/articles/2026-02-13-slug/index.html` should exist
3. Check Indiekit URL: `/articles/2026/02/13/slug/` (from Micropub Location header)
4. Check nginx rewrites: `/articles/2026/02/13/slug/` should rewrite to `/content/articles/2026-02-13-slug/`

**Fix:** Ensure `post-template.js` does NOT add `permalink` to frontmatter. If present, remove it and rebuild preset.

### Frontmatter dates cause "Invalid Date"

**Cause:** Date is stored as JavaScript `Date` object instead of ISO string.

**Rule:** All dates MUST be ISO 8601 strings (`new Date().toISOString()`), NEVER `Date` objects.

**Why:** Nunjucks `| date` filter calls `date-fns parseISO(string)`, which only accepts strings. `Date` objects crash with `dateString.split is not a function`.

**Fix:** In any code that generates JF2 properties, use:
```javascript
published: new Date().toISOString(),  // CORRECT
// NOT:
published: new Date(),  // WRONG — crashes | date filter
```

### Page post type ignored

**Cause:** Post types loaded AFTER preset.

**Rule:** Post types MUST be loaded BEFORE the preset in `plugins` array.

**Fix:** Reorder plugins:
```javascript
plugins: [
  "@rmdes/indiekit-post-type-page",  // Post types FIRST
  "@rmdes/indiekit-preset-eleventy", // Preset AFTER
],
```

### Eleventy doesn't rebuild after post creation

**Cause:** Eleventy watcher may need a moment to detect file changes.

**Debug:** Check `docker compose logs eleventy` or Cloudron logs for rebuild activity.

**Note:** Watcher auto-restarts with exponential backoff on crashes (Docker Compose deployment).

### Pages generate at /content/pages/slug/ instead of /slug/

**Cause:** The preset's `post-template.js` is not adding `permalink` for pages.

**Fix:** Ensure `post-template.js` has the conditional permalink logic (beta.36+):
- Single-segment URLs (pages) → add `permalink: /slug/`
- Multi-segment URLs (regular posts) → no permalink, let file paths handle it

### Regular posts return 404 after adding permalink

**Cause:** Someone added `permalink` for ALL post types (beta.34 regression).

**Fix:** Ensure `post-template.js` only adds `permalink` for single-segment URLs (pages). Multi-segment URLs (regular posts) must NOT get a permalink — nginx/Caddy rewrites handle the mapping.

## Deployment Workflow

### Publishing Updates

1. **Edit the preset** in this repo
2. **Bump version** in `package.json` (npm rejects publishing same version twice)
3. **Commit and push**
4. **STOP — tell user to `npm publish`** (requires OTP, Claude cannot do this)
5. **Wait** for user confirmation
6. **Update deployment:**
   - Cloudron: Update `Dockerfile` npm install line, rebuild, update
   - Docker Compose: Update `docker/indiekit/package.core.json`, rebuild, restart

### Testing Changes

**Local testing:**
```bash
cd /home/rick/code/indiekit-dev/indiekit-preset-eleventy
npm link

cd /home/rick/code/indiekit-dev/indiekit-cloudron  # or indiekit-deploy
npm link @rmdes/indiekit-preset-eleventy
# Test, then unlink when done
```

**Production testing:**
- Create a test Micropub post
- Check file path: `content/{type}/{yyyy}-{MM}-{dd}-{slug}.md`
- Check frontmatter: no `permalink`, `date` is ISO string, `title` is set
- Check Eleventy output: `_site/content/{type}/{yyyy}-{MM}-{dd}-{slug}/index.html` exists
- Check URL: Indiekit URL redirects to Eleventy output path

## History & Rationale

### Why Fork from Upstream?

1. **Custom post type handling:** Special paths for `@rmdes/indiekit-post-type-page`
2. **Deployment-specific URL handling:** nginx rewrite compatibility
3. **Bug fixes:** Permalink issues discovered during production use

### Why NOT Merge Upstream Changes?

- Upstream may change URL handling in ways that break nginx rewrites
- Upstream doesn't have special handling for page post type
- Fork allows faster iteration for `@rmdes/*` ecosystem

### When to Merge Upstream Changes?

Check upstream occasionally for:
- Security fixes
- Bug fixes in frontmatter generation
- New Eleventy features (e.g., new frontmatter fields)

**Process:**
1. Check upstream commits: `git log upstream/main`
2. Cherry-pick relevant commits: `git cherry-pick <commit>`
3. Test thoroughly (especially URL generation)
4. Bump version, publish, deploy

## Compatibility

**Node.js:** >=20
**Indiekit:** >=1.0.0
**Eleventy:** >=2.0.0

**Works with:**
- `@rmdes/indiekit-post-type-page`
- All `@indiekit/post-type-*` plugins
- `@indiekit/store-file-system`
- `@rmdes/indiekit-endpoint-micropub`

**Tested with:**
- Cloudron deployment (nginx, single container)
- Docker Compose deployment (Caddy, multi-container)
