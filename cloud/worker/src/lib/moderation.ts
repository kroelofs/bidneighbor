/**
 * Fast, synchronous keyword gate for user-submitted listings. This is a coarse first
 * line — it blocks the obvious junk (slurs, sexual solicitation, blatant spam) on submit
 * with zero network cost. The AI pass (`ai.ts`) and user reports catch everything subtler.
 *
 * Kept deliberately small and word-boundary-matched to avoid false positives on innocent
 * substrings (e.g. "grass", "assist", "scunthorpe"). Extend the lists as real abuse shows up.
 */

// Sexual-explicit / hate terms. Word-boundary matched; case- and simple-leet-folded.
const BLOCK_TERMS = [
  "cunt", "faggot", "nigger", "kike", "spic", "chink", "retard",
  "porn", "pornography", "creampie", "blowjob", "handjob", "cumshot",
  "escort service", "sexual favors", "sex work", "onlyfans",
];

// Spam signatures — off-platform payment / contact-harvesting solicitation.
const SPAM_PATTERNS: RegExp[] = [
  /\b(?:wire|western\s*union|money\s*gram|zelle|cash\s*app|venmo)\b.*\b(?:only|upfront|deposit)\b/i,
  /\bgift\s*cards?\b.*\b(?:payment|only)\b/i,
  /\b(?:free\s+money|make\s+\$?\d+\s*(?:\/|per)\s*(?:day|hour|week))\b/i,
  /\bclick\s+here\b.*\bhttps?:\/\//i,
];

/** Fold common leetspeak so "n1gger" / "p0rn" don't slip past the word list. */
function fold(input: string): string {
  return input
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[7]/g, "t");
}

export interface ScreenResult {
  blocked: boolean;
  reason?: string;
}

/** Synchronous denylist check over the listing's free text. No network, no allocation churn. */
export function screenText(text: string): ScreenResult {
  const folded = fold(text);
  for (const term of BLOCK_TERMS) {
    // Word-boundary match on the folded term so substrings don't false-trigger.
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(folded)) return { blocked: true, reason: "prohibited language" };
  }
  for (const re of SPAM_PATTERNS) {
    if (re.test(text)) return { blocked: true, reason: "looks like spam or an off-platform payment solicitation" };
  }
  return { blocked: false };
}
