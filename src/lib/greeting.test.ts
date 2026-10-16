import { describe, expect, it } from "vitest";
import { buildGreeting, joinHebrew, proposalTitle, salutation } from "./greeting";
import { classifyEmail, normalizeWebsite } from "./email-domain";

describe("בלוק לכבוד (אפיון 9.2)", () => {
  it("שם בלבד", () => expect(buildGreeting({ recipients: [{ name: "ישראל ישראלי" }] })).toEqual(["לכבוד", "ישראל ישראלי"]));
  it("שם + חברה", () =>
    expect(buildGreeting({ recipients: [{ name: "ישראל ישראלי" }], companyName: 'אקמה בע"מ' })).toEqual([
      "לכבוד",
      "ישראל ישראלי",
      'אקמה בע"מ',
    ]));
  it("שם + תפקיד + חברה", () =>
    expect(buildGreeting({ recipients: [{ name: "ישראל ישראלי", role: 'מנכ"ל' }], companyName: "אקמה" })).toEqual([
      "לכבוד",
      'ישראל ישראלי, מנכ"ל',
      "אקמה",
    ]));
  it("חברה בלבד", () => expect(buildGreeting({ recipients: [], companyName: "אקמה" })).toEqual(["לכבוד", "הנהלת אקמה"]));
  it("שני נמענים", () =>
    expect(buildGreeting({ recipients: [{ name: "ישראל ישראלי" }, { name: "דנה כהן" }], companyName: "אקמה" })).toEqual([
      "לכבוד",
      "ישראל ישראלי ודנה כהן",
      "אקמה",
    ]));
  it("לא הוזן דבר", () => expect(buildGreeting({ recipients: [{ name: "  " }], companyName: "" })).toBeNull());
  it("שלושה שמות ושם לועזי", () => expect(joinHebrew(["א", "ב", "Dana"])).toBe("א, ב ו-Dana"));
  it("פתיח", () => {
    expect(salutation([{ name: "ישראל ישראלי" }])).toBe("שלום ישראל,");
    expect(salutation([{ name: "א" }, { name: "ב" }])).toBe("שלום רב,");
  });
  it("כותרת", () => expect(proposalTitle("הצעה לניהול שיווק דיגיטלי", "אקמה")).toBe("הצעה לניהול שיווק דיגיטלי עבור אקמה"));
});

describe("זיהוי אימייל (אפיון 9.3)", () => {
  it("עסקי", () => expect(classifyEmail("Israel@Acme.co.il")).toEqual({ kind: "business", domain: "acme.co.il", websiteGuess: "https://acme.co.il" }));
  it("פרטי", () => expect(classifyEmail("someone@gmail.com").kind).toBe("personal"));
  it("וואלה", () => expect(classifyEmail("a@walla.co.il").kind).toBe("personal"));
  it("תת-דומיין דואר", () => expect(classifyEmail("a@mail.acme.com").domain).toBe("acme.com"));
  it("לא תקין", () => expect(classifyEmail("not-an-email").kind).toBe("invalid"));
  it("נרמול כתובת אתר", () => {
    expect(normalizeWebsite("www.acme.co.il/about")).toBe("https://www.acme.co.il");
    expect(normalizeWebsite("acme")).toBeNull();
  });
});
