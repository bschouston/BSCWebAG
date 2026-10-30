const HTML_TAG =
  /<\/?(p|br|strong|b|em|i|u|s|strike|del|ul|ol|li|a|h1|h2|h3|blockquote|span|mark|sub|sup|hr|code)\b/i;
const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "span",
  "mark",
  "sub",
  "sup",
  "hr",
  "code",
]);
const ALIGN_TAGS = new Set(["p", "h1", "h2", "h3", "li", "blockquote"]);

export function sectionBodyIsHtml(body: string): boolean {
  return HTML_TAG.test(body);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain section text becomes paragraphs so the editor can format it. Colon labels start out bold. */
export function sectionBodyToEditorHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (sectionBodyIsHtml(trimmed)) return trimmed;
  return trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon > 0) {
        const label = escapeHtml(line.slice(0, colon + 1));
        const rest = escapeHtml(line.slice(colon + 1).trim());
        return `<p><strong>${label}</strong>${rest ? ` ${rest}` : ""}</p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("");
}

export function sectionHtmlForSave(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text ? html : "";
}

function isSafeColor(value: string): boolean {
  return (
    /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
    /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(value) ||
    /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/i.test(value)
  );
}

function keptStyle(attrs: string, props: Array<"color" | "background-color" | "text-align">): string {
  const styleMatch = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  const raw = styleMatch?.[2] || styleMatch?.[3] || "";
  if (!raw) return "";
  const kept: string[] = [];
  for (const part of raw.split(";")) {
    const splitAt = part.indexOf(":");
    if (splitAt < 0) continue;
    const prop = part.slice(0, splitAt).trim().toLowerCase();
    const val = part.slice(splitAt + 1).trim();
    if (!props.includes(prop as (typeof props)[number])) continue;
    if (prop === "text-align" && /^(left|center|right|justify)$/i.test(val)) {
      kept.push(`text-align: ${val.toLowerCase()}`);
    } else if ((prop === "color" || prop === "background-color") && isSafeColor(val)) {
      kept.push(`${prop}: ${val}`);
    }
  }
  return kept.length ? ` style="${kept.join("; ")}"` : "";
}

/** Keep admin-authored section HTML to formatting, color, and alignment. */
export function sanitizeSectionHtml(html: string): string {
  let source = html.replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, "");
  source = source.replace(/<(script|style|iframe|object|embed|svg|math)[^>]*\/?>/gi, "");
  source = source.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  source = source.replace(/javascript\s*:/gi, "");
  return source.replace(/<\/?([a-z0-9:-]+)(\s[^>]*)?>/gi, (match, tag: string, attrs: string = "") => {
    const name = tag.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    if (name === "br") return "<br>";
    if (name === "hr") return "<hr>";
    if (match.startsWith("</")) return `</${name}>`;
    if (name === "a") {
      const hrefMatch = /\shref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = (hrefMatch?.[2] || hrefMatch?.[3] || "").trim();
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return "<a>";
      return `<a href="${url.replace(/"/g, "%22")}" rel="noopener noreferrer" target="_blank">`;
    }
    if (name === "span") return `<span${keptStyle(attrs, ["color", "background-color"])}>`;
    if (name === "mark") return `<mark${keptStyle(attrs, ["background-color", "color"])}>`;
    if (ALIGN_TAGS.has(name)) return `<${name}${keptStyle(attrs, ["text-align"])}>`;
    return `<${name}>`;
  });
}
