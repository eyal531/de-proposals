// Builds the "לכבוד" block and the personal salutation (spec 9.2).

export type AddressForm = "plural" | "male" | "female";

export interface Recipient {
  name: string;
  role?: string | null;
  email?: string | null;
}

export interface GreetingInput {
  recipients: Recipient[];
  companyName?: string | null;
  /** prefix used when only a company is known, e.g. "הנהלת" or "צוות" */
  companyOnlyPrefix?: string;
}

const clean = (s?: string | null) => (s ?? "").trim();

/** Hebrew list join: "א", "א ו-ב" style → "ישראל ישראלי ודנה כהן", "א, ב וג" */
export function joinHebrew(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  const last = names[names.length - 1];
  // ו before a non-Hebrew letter or digit needs a hyphen: "ו-Dana"
  const conj = /^[֐-׿]/.test(last) ? `ו${last}` : `ו-${last}`;
  return `${names.slice(0, -1).join(", ")} ${conj}`;
}

/** Returns the lines of the greeting block, or null when nothing was entered. */
export function buildGreeting(input: GreetingInput): string[] | null {
  const people = input.recipients.map((r) => ({ name: clean(r.name), role: clean(r.role) })).filter((r) => r.name).slice(0, 3);
  const company = clean(input.companyName);
  if (!people.length && !company) return null;

  const lines = ["לכבוד"];
  if (people.length === 1) {
    lines.push(people[0].role ? `${people[0].name}, ${people[0].role}` : people[0].name);
  } else if (people.length > 1) {
    lines.push(joinHebrew(people.map((p) => p.name)));
  }
  if (company) lines.push(people.length ? company : `${input.companyOnlyPrefix ?? "הנהלת"} ${company}`);
  return lines;
}

export function firstName(full: string): string {
  return clean(full).split(/\s+/)[0] ?? "";
}

/** "שלום ישראל," for one recipient, "שלום רב," otherwise. */
export function salutation(recipients: Recipient[]): string {
  const people = recipients.filter((r) => clean(r.name));
  if (people.length === 1) return `שלום ${firstName(people[0].name)},`;
  return "שלום רב,";
}

/** Gendered word helper: pick(form, {plural:"תוכלו", male:"תוכל", female:"תוכלי"}) */
export function pick(form: AddressForm, words: Record<AddressForm, string>): string {
  return words[form] ?? words.plural;
}

/** Proposal title, e.g. "הצעה לניהול שיווק דיגיטלי עבור אקמה" */
export function proposalTitle(base: string, companyName?: string | null, personName?: string | null): string {
  const who = clean(companyName) || clean(personName);
  return who ? `${base} עבור ${who}` : base;
}
