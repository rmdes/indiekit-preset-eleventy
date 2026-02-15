import camelcaseKeys from "camelcase-keys";
import YAML from "yaml";

/**
 * Get content
 * @access private
 * @param {object} properties - JF2 properties
 * @returns {string} Content
 */
const getContent = (properties) => {
  if (properties.content) {
    const content =
      properties.content.text || properties.content.html || properties.content;
    return `\n${content}\n`;
  } else {
    return "";
  }
};

/**
 * Get front matter
 * @access private
 * @param {object} properties - JF2 properties
 * @returns {string} Front matter in chosen format
 */
const getFrontMatter = (properties) => {
  /**
   * Eleventy uses camelCase for YAML property keys, i.e. `fileSlug`
   * @see {@link https://www.11ty.dev/docs/data-eleventy-supplied/}
   */
  properties = camelcaseKeys(properties, { deep: true });

  /**
   * Replace Microformat properties with Eleventy equivalents
   * @see {@link https://www.11ty.dev/docs/data-frontmatter/}
   * @see {@link https://www.11ty.dev/docs/dates/}
   */
  properties = {
    date: properties.published,
    ...(properties.name && { title: properties.name }),
    ...properties,
  };

  /**
   * Draft posts
   * @see {@link https://www.11ty.dev/docs/quicktips/draft-posts/}
   */
  if (properties.postStatus === "draft") {
    properties.draft = true;
  }

  delete properties.content; // Shown below front matter
  delete properties.name; // Use `title`
  delete properties.postStatus; // Use `draft`
  delete properties.published; // Use `date`
  delete properties.slug; // use `page.fileSlug`
  delete properties.type; // Not required

  // Store the Micropub URL for frontend edit links before deleting it
  if (properties.url) {
    properties.mpUrl = properties.url;
  }

  // For pages (root-level slash pages like /about, /videos), convert URL to
  // Eleventy permalink so they generate at /{slug}/ instead of /content/pages/{slug}/.
  // For all other post types, delete URL and let Eleventy use file paths
  // (nginx rewrites handle the Indiekit URL format → Eleventy path mapping).
  if (properties.url) {
    let url = properties.url;
    // Extract pathname from full URL
    if (url.startsWith("http://") || url.startsWith("https://")) {
      try {
        url = new URL(url).pathname;
      } catch {
        // If URL parsing fails, use as-is
      }
    }
    // Single-segment paths are pages (e.g. /videos, /about)
    // Multi-segment paths are regular posts (e.g. /articles/2026/02/13/slug)
    const segments = url.split("/").filter(Boolean);
    if (segments.length === 1) {
      properties.permalink = url.endsWith("/") ? url : `${url}/`;
    }
  }
  delete properties.url;

  const frontMatter = YAML.stringify(properties, { lineWidth: 0 });
  return `---\n${frontMatter}---\n`;
};

/**
 * Get post template
 * @param {object} properties - JF2 properties
 * @returns {string} Rendered template
 */
export const getPostTemplate = (properties) => {
  const content = getContent(properties);
  const frontMatter = getFrontMatter(properties);

  return frontMatter + content;
};
