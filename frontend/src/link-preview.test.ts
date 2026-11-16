import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import ogImage from "../public/og-image.png?inline";

// The link preview shown when the live URL is pasted on LinkedIn, WhatsApp, Slack or X.
const SITE = "https://guest-inbox-assistant.vercel.app";

// Every <meta ...> tag in index.html (tags may span several lines).
const TAGS = [...html.matchAll(/<meta\b([^>]*)>/g)].map((m) => {
  const attrs: Record<string, string> = {};
  for (const a of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
  return attrs;
});

function meta(attr: "property" | "name", key: string): string | undefined {
  return TAGS.find((t) => t[attr] === key)?.content;
}

function pngSize(dataUrl: string): { width: number; height: number; bytes: number } {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const u32 = (at: number) =>
    ((bin.charCodeAt(at) << 24) |
      (bin.charCodeAt(at + 1) << 16) |
      (bin.charCodeAt(at + 2) << 8) |
      bin.charCodeAt(at + 3)) >>>
    0;
  // PNG header: 8-byte signature, then the IHDR chunk holds width and height.
  expect(bin.slice(1, 4)).toBe("PNG");
  return { width: u32(16), height: u32(20), bytes: bin.length };
}

describe("link preview tags", () => {
  it("has the Open Graph title, description, url and type", () => {
    expect(meta("property", "og:title")).toBe("Guest Inbox Assistant");
    expect(meta("property", "og:description")).toBe(meta("name", "description"));
    expect(meta("property", "og:url")).toBe(`${SITE}/`);
    expect(meta("property", "og:type")).toBe("website");
  });

  it("points og:image and twitter:image at the full live URL of the image", () => {
    expect(meta("property", "og:image")).toBe(`${SITE}/og-image.png`);
    expect(meta("name", "twitter:image")).toBe(`${SITE}/og-image.png`);
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("property", "og:image:alt")).toBeTruthy();
  });

  it("ships a 1200x630 PNG under 1 MB that matches the declared size", () => {
    const { width, height, bytes } = pngSize(ogImage);
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
    expect(meta("property", "og:image:width")).toBe(String(width));
    expect(meta("property", "og:image:height")).toBe(String(height));
    expect(bytes).toBeLessThan(1024 * 1024);
  });
});
