import sanitizeHtml from "sanitize-html";

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    "a", "b", "i", "u", "em", "strong", "p", "br", "div", "span", "ul", "ol", "li", "blockquote", "pre", "code",
    "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "img", "hr", "small",
    "sub", "sup", "font", "center", "dl", "dt", "dd",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "title"],
    td: ["colspan", "rowspan", "align", "valign", "width", "style"],
    th: ["colspan", "rowspan", "align", "valign", "width", "style"],
    table: ["width", "cellpadding", "cellspacing", "border", "align", "style"],
    font: ["color", "face", "size"],
    "*": ["style", "dir"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel", "cid", "data"],
  allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/, /^[a-z]+$/i],
      "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/, /^[a-z]+$/i],
      "font-size": [/^\d+(\.\d+)?(px|em|rem|pt|%)$/],
      "font-weight": [/^(bold|normal|[1-9]00)$/],
      "font-style": [/^(italic|normal)$/],
      "font-family": [/^[\w\s,"'-]+$/],
      "text-align": [/^(left|right|center|justify)$/],
      "text-decoration": [/^(underline|line-through|none)$/],
      margin: [/^[\d.\s]+(px|em|%)?([\d.\s]+(px|em|%)?)*$/],
      padding: [/^[\d.\s]+(px|em|%)?([\d.\s]+(px|em|%)?)*$/],
      "line-height": [/^[\d.]+(px|em|%)?$/],
      width: [/^\d+(\.\d+)?(px|%)$/],
      "max-width": [/^\d+(\.\d+)?(px|%)$/],
      "border-collapse": [/^(collapse|separate)$/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
    }),
  },
  nonTextTags: ["style", "script", "textarea", "option", "noscript", "head", "title"],
  parseStyleAttributes: true,
};

/** Cleans email HTML so it can be rendered inside the application safely. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, options);
}

/** Plain text with all tags stripped, for search and previews. */
export function stripHtml(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}
