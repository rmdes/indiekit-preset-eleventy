# CLAUDE.md - indiekit-preset-eleventy

Fork of `@indiekit/preset-eleventy` with custom modifications for the `@rmdes/*` Indiekit ecosystem.

## Package Overview

**Package:** `@rmdes/indiekit-preset-eleventy`
**Type:** Indiekit publication preset plugin
**Upstream:** Fork of `@indiekit/preset-eleventy` (Paul Robert Lloyd)
**Purpose:** Configures Indiekit to generate Eleventy-compatible Markdown files with YAML frontmatter

**Version:** 1.0.0-beta.38

## What This Fork Changes from Upstream

### 1. Post Template URL Handling (CRITICAL)

**File:** `lib/post-template.js`, lines 59-76

**Upstream behavior:**
```javascript
delete properties.url;  // Remove URL, let Eleventy generate from file path
```

**Fork behavior (beta.38):**
```javascript
// Store the Micropub URL for frontend edit links before deleting it
if (properties.url) {
  properties.mpUrl = properties.url;
}

// Convert Indiekit URL to Eleventy permalink so pages generate
// at the canonical URL (e.g., /notes/2026/02/22/slug/) instead of
// the file-path-based URL (e.g., /content/notes/2026-02-22-slug/).
if (properties.url) {
  let url = properties.url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      url = new URL(url).pathname;
    } catch {
      // If URL parsing fails, use as-is
    }
  }
  properties.permalink = url.endsWith("/") ? url : `${url}/`;
}
delete properties.url;
```

**History:**
- **Beta.34:** Fork added `permalink` for ALL post types → conflicted with nginx rewrites → 404s.
- **Beta.35:** Removed ALL permalink logic → broke pages (generated at `/content/pages/slug/` instead of `/slug/`).
- **Beta.36:** Added `permalink` ONLY for pages (single-segment URLs). Regular posts used file paths + nginx rewrites.
- **Beta.37 (current):** Adds `permalink` for ALL post types. nginx reverses: `/content/` URLs redirect (301) to clean URLs. The Eleventy data cascade (`_data/eleventyComputed.js`) also computes `permalink` for existing posts that lack frontmatter permalink.

**Why ALL post types now use permalink:**
- **Eliminates URL dualism** — No more mismatch between Indiekit URLs and browser URLs
- **No nginx rewrite dependency** — Eleventy generates pages at the canonical Indiekit URLs directly
- **Simpler architecture** — One URL format everywhere: Indiekit stores it, Eleventy renders it, nginx serves it
- **Legacy `/content/` URLs** — Old bookmarks get 301 redirects to clean URLs for backward compatibility

**The workflow for ALL post types:**
1. Indiekit creates post at `content/articles/2026-02-13-slug.md`
2. Indiekit URL is `/articles/2026/02/13/slug` (stored in `properties.url`)
3. `post-template.js` converts `url` to `permalink: /articles/2026/02/13/slug/` in frontmatter
4. Eleventy builds HTML at `/articles/2026/02/13/slug/index.html` (from permalink)
5. nginx serves the file directly at the canonical URL
6. Old `/content/articles/2026-02-13-slug/` URLs redirect (301) to `/articles/2026/02/13/slug/`

**For existing posts without frontmatter permalink:**
- The Eleventy data cascade (`_data/eleventyComputed.js`) computes `permalink` from the file path pattern `content/{type}/{yyyy}-{MM}-{dd}-{slug}.md` → `/{type}/{yyyy}/{MM}/{dd}/{slug}/`

**Do NOT:**
- Remove `permalink` for ANY post type (breaks canonical URL generation)
- Remove the data cascade file (breaks existing posts without frontmatter permalink)

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

**Redirects legacy /content/ URLs to canonical URLs:**
```nginx
# Legacy /content/ URLs redirect to clean Indiekit URLs (reversed Feb 2026)
rewrite "^/content/articles/(\d{4})-(\d{2})-(\d{2})-(.+?)/?$" "/articles/$1/$2/$3/$4/" permanent;
rewrite "^/content/notes/(\d{4})-(\d{2})-(\d{2})-(.+?)/?$" "/notes/$1/$2/$3/$4/" permanent;
# ... (12 post types)
```

**CRITICAL:** nginx no longer rewrites Indiekit URLs to `/content/` paths. The preset sets `permalink` in frontmatter, so Eleventy generates pages at the canonical URLs directly.

### Eleventy

**Consumes preset's output:**
- Reads Markdown files from `content/{type}/{yyyy}-{MM}-{dd}-{slug}.md`
- Parses YAML frontmatter (requires `date`, `title`, **`permalink`**, etc.)
- Generates HTML at `/{type}/{yyyy}/{MM}/{dd}/{slug}/index.html` (from `permalink`)
- For existing posts without frontmatter `permalink`, the data cascade file (`_data/eleventyComputed.js`) computes it from the file path

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

**Cause:** Missing `permalink` in frontmatter or incorrect Eleventy output path.

**Diagnosis:**
1. Check post file exists: `content/articles/2026-02-13-slug.md`
2. Check frontmatter has `permalink: /articles/2026/02/13/slug/`
3. Check Eleventy output: `_site/articles/2026/02/13/slug/index.html` should exist (NOT under `/content/`)
4. Check Indiekit URL: `/articles/2026/02/13/slug/` (from Micropub Location header)
5. For old `/content/` URLs: nginx should redirect (301) to the clean URL

**Fix:** Ensure `post-template.js` adds `permalink` for ALL post types (beta.38+). The data cascade file (`_data/eleventyComputed.js`) also computes permalink for existing posts without frontmatter permalink.

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

**Cause:** Missing `permalink` in frontmatter.

**Fix:** Ensure `post-template.js` adds `permalink` for ALL post types (beta.38+). This applies to pages AND regular posts. All posts should have `permalink` set to the Indiekit URL.

### Posts generate under /content/ prefix

**Cause:** Old file-path-based generation (beta.35-36 behavior). The `permalink` is missing from frontmatter.

**Fix:** Ensure `post-template.js` adds `permalink` for ALL post types (beta.38+). For existing posts created before beta.38, the data cascade file (`_data/eleventyComputed.js`) computes `permalink` from the file path. If posts still generate under `/content/`, verify the data cascade file exists and has the `permalink` computed property.

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
- Check frontmatter: has `permalink: /{type}/{yyyy}/{MM}/{dd}/{slug}/`, `date` is ISO string, `title` is set
- Check Eleventy output: `_site/{type}/{yyyy}/{MM}/{dd}/{slug}/index.html` exists (NOT under `/content/`)
- Check URL: Indiekit URL serves directly (no redirect needed)

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
