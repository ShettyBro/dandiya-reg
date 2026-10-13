const BLOCK_TAGS_TO_NEWLINE = /<\/(p|div|tr|li|h[1-6]|table)>/gi;
const BR_TO_NEWLINE = /<br\s*\/?>/gi;
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&middot;": "·",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#8377;": "₹"
};

// A plain-text alternative part is expected by virtually every spam filter -- an HTML-only
// transactional email (no multipart/alternative, no text/plain) is a well-known deliverability
// red flag, especially from a newer sending domain. This is a best-effort rendering (strip tags,
// turn block boundaries into line breaks, decode the handful of entities the templates actually
// use) -- it only needs to be readable as a fallback, not a pixel-perfect rendition of the HTML.
export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(BR_TO_NEWLINE, "\n")
    .replace(BLOCK_TAGS_TO_NEWLINE, "\n")
    .replace(/<[^>]+>/g, "");

  text = text.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  for (const [entity, replacement] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(replacement);
  }

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && (lines[index - 1]?.length ?? 0) > 0))
    .join("\n")
    .trim();
}
