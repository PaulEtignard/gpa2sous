import type { Encoding } from "./types";

/**
 * Detect text encoding. We support UTF-8 and Windows-1252 (a superset of
 * ISO-8859-1 — the most common legacy encoding from French banks).
 *
 * Strategy:
 *   1. Check for UTF-8/UTF-16 BOM.
 *   2. Try decoding as strict UTF-8. If invalid bytes, fall back to 1252.
 *   3. Count replacement characters (U+FFFD) — too many means we guessed wrong.
 */
export function detectEncoding(buffer: ArrayBuffer): Encoding {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }

  try {
    const strict = new TextDecoder("utf-8", { fatal: true });
    strict.decode(buffer);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

export function decodeBuffer(buffer: ArrayBuffer, encoding: Encoding): string {
  const decoder = new TextDecoder(encoding);
  let text = decoder.decode(buffer);

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text;
}
