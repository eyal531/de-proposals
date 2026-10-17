import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emailHtml, parseFrom } from "./email";

describe("parseFrom", () => {
  it("name and address", () => expect(parseFrom("דיגיטל אפקטיב <a@b.co.il>")).toEqual({ name: "דיגיטל אפקטיב", email: "a@b.co.il" }));
  it("quoted name", () => expect(parseFrom('"Digital Effective" <a@b.com>')).toEqual({ name: "Digital Effective", email: "a@b.com" }));
  it("address only", () => expect(parseFrom("a@b.com")).toEqual({ email: "a@b.com" }));
  it("invalid", () => expect(parseFrom("nope")).toBeNull());
});

describe("emailHtml", () => {
  it("escapes content and is RTL", () => {
    const html = emailHtml({ title: "<b>x</b>", lines: ["a & b"], buttonText: "go", buttonUrl: "https://x.co/?a=1&b=2" });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).not.toContain("<b>x</b>");
  });
});
