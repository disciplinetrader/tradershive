/**
 * "Did this trade follow the plan?" — one definition, derived, not stored.
 *
 * There is no `journal_entries.followed_plan` column and this deliberately does
 * not add one. The answer is already implied by data the trader enters: the
 * per-rule checklist, plus any verdict they corrected by hand in the playbook
 * review. This lifts the expression that `editor/sections/playbook.tsx` was
 * already computing and displaying, so every consumer agrees by construction
 * rather than by convention.
 *
 * Two readers previously disagreed about where this lived — `social.functions`
 * selected a column that does not exist (taking `grade` and the whole rollup
 * down with it, since PostgREST rejects the entire select), while
 * `analytics/normalize.ts` read a `playbook_review.followed_plan` key that
 * nothing ever writes. Both now call this.
 *
 * **The bar is 100%.** "Followed the plan" means every rule was followed.
 * A lower threshold would quietly redefine the metric as mostly-followed while
 * the leaderboard label still claims otherwise — semantic drift, not a tuning
 * choice.
 *
 * **Rules come from the entry's own checklist, never from a default set.**
 * `create_journal_draft_from_trade()` leaves `checklist` empty, so an
 * auto-created draft has no rules and is correctly *unmeasurable*. Falling back
 * to a default rule list — which the editor does, legitimately, to offer the
 * trader something to fill in — would score every untouched draft as 0%
 * adherence and report a review that never happened as a failed one.
 */

export type RuleVerdict = "followed" | "missed" | "broken";

export type PlanAdherence =
  | { measurable: false; reason: "no_rules" }
  | {
      measurable: true;
      /** How many rules the entry defines. */
      rules: number;
      /** How many carry a "followed" verdict. */
      followed: number;
      /** followed / rules, 0…1. */
      ratio: number;
      /** The 100% threshold — every rule followed. */
      followedPlan: boolean;
    };

type ChecklistRule = { id: string; checked: boolean };

/** Read `journal_entries.checklist` (jsonb) into rules, tolerating junk. */
function readRules(checklist: unknown): ChecklistRule[] {
  if (!Array.isArray(checklist)) return [];
  const out: ChecklistRule[] = [];
  for (const raw of checklist) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = r.id ?? r.label;
    if (id == null || String(id) === "") continue;
    out.push({ id: String(id), checked: r.checked === true });
  }
  return out;
}

/** Read the trader's manual verdict overrides out of `playbook_review`. */
function readOverrides(playbookReview: unknown): Record<string, RuleVerdict> {
  if (!playbookReview || typeof playbookReview !== "object") return {};
  const ov = (playbookReview as Record<string, unknown>).overrides;
  if (!ov || typeof ov !== "object") return {};
  const out: Record<string, RuleVerdict> = {};
  for (const [k, v] of Object.entries(ov as Record<string, unknown>)) {
    if (v === "followed" || v === "missed" || v === "broken") out[k] = v;
  }
  return out;
}

/**
 * The verdict for one rule: the trader's correction if they made one,
 * otherwise the system's reading of the checkbox. Same precedence the playbook
 * editor uses — an override is the trader disagreeing with the system, and the
 * trader wins.
 */
export function verdictForRule(
  rule: ChecklistRule, overrides: Record<string, RuleVerdict>,
): RuleVerdict {
  return overrides[rule.id] ?? (rule.checked ? "followed" : "missed");
}

export function planAdherence(input: {
  checklist: unknown;
  playbookReview: unknown;
}): PlanAdherence {
  const rules = readRules(input.checklist);
  if (rules.length === 0) return { measurable: false, reason: "no_rules" };

  const overrides = readOverrides(input.playbookReview);
  const followed = rules.filter((r) => verdictForRule(r, overrides) === "followed").length;

  return {
    measurable: true,
    rules: rules.length,
    followed,
    ratio: followed / rules.length,
    followedPlan: followed === rules.length,
  };
}

/**
 * The boolean the old `followed_plan` column was supposed to hold.
 *
 * `null` means "not answerable", which is not the same as `false` and must not
 * be collapsed into it: the discipline metric divides by the count of entries
 * that *have* an answer, so scoring unreviewed drafts as `false` would drag
 * every trader's discipline toward zero for trades they never reviewed.
 */
export function followedPlanOf(entry: {
  checklist?: unknown;
  playbook_review?: unknown;
}): boolean | null {
  const a = planAdherence({
    checklist: entry.checklist,
    playbookReview: entry.playbook_review,
  });
  return a.measurable ? a.followedPlan : null;
}
