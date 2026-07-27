import type { MistakeCategory, MistakeKind } from "./types";

export interface RuleMeta {
  kind: MistakeKind;
  category: MistakeCategory;
  title: string;
  short: string;
  description: string;
  fix: string; // one-line recommendation
}

export const RULES: Record<MistakeKind, RuleMeta> = {
  // ---------- Risk ----------
  risk_above_limit: {
    kind: "risk_above_limit",
    category: "risk",
    title: "Risk above your limit",
    short: "Position risk exceeded your configured max risk %.",
    description:
      "Trades where the planned risk % on the entry breached your personal risk-per-trade limit.",
    fix: "Cap position size using the Risk % calculator before every order.",
  },
  inconsistent_size: {
    kind: "inconsistent_size",
    category: "risk",
    title: "Inconsistent position sizing",
    short: "Your lot sizes vary widely across similar setups.",
    description:
      "The coefficient of variation of your lot sizes is high, meaning your bet size is not systematic.",
    fix: "Standardise sizing using a fixed % risk model per setup.",
  },
  consecutive_oversized_losses: {
    kind: "consecutive_oversized_losses",
    category: "risk",
    title: "Consecutive oversized losses",
    short: "You took multiple back-to-back losses larger than 1R.",
    description:
      "Two or more consecutive losing trades where realised loss was greater than 1R.",
    fix: "Stop trading after 2 red trades of >1R and review the setup.",
  },
  daily_loss_limit_breach: {
    kind: "daily_loss_limit_breach",
    category: "risk",
    title: "Daily loss limit breached",
    short: "You kept trading after your daily loss limit was hit.",
    description:
      "On these days, cumulative R crossed your daily loss limit and additional trades were opened.",
    fix: "Enforce a hard stop for the day when your R limit is reached.",
  },
  // ---------- Execution ----------
  entered_before_confirmation: {
    kind: "entered_before_confirmation",
    category: "execution",
    title: "Entered before confirmation",
    short: "Entry taken without the setup being fully confirmed.",
    description:
      "The trader tagged an early entry, or the pre-trade checklist wasn't cleared before execution.",
    fix: "Wait for the confirmation candle or run the playbook checklist first.",
  },
  chased_price: {
    kind: "chased_price",
    category: "execution",
    title: "Chased price",
    short: "Entry taken far from the planned level with weak RR.",
    description:
      "Entries where planned RR was < 1 or stop distance was compressed, signalling chasing after a move.",
    fix: "If you missed the level, skip the trade. Never widen risk to catch a runner.",
  },
  poor_stop_placement: {
    kind: "poor_stop_placement",
    category: "execution",
    title: "Poor stop placement",
    short: "Stops were too tight or too wide for the setup.",
    description:
      "Stop distance was < 5% or > 50% of intended profit target, indicating illogical placement.",
    fix: "Anchor stops to structure (swing / liquidity), not to a fixed pip count.",
  },
  poor_rr: {
    kind: "poor_rr",
    category: "execution",
    title: "Poor risk-reward",
    short: "Planned or realised RR fell below 1:1.",
    description: "Trades entered with a reward-to-risk ratio below 1 are statistically hard to sustain.",
    fix: "Require a minimum 1.5R target before any trade goes live.",
  },
  early_exit_winner: {
    kind: "early_exit_winner",
    category: "execution",
    title: "Closed winners too early",
    short: "Profitable trades closed well before your take-profit.",
    description:
      "Winners closed at less than 50% of the planned reward distance, capturing only a fraction of the move.",
    fix: "Move stop to break-even at 1R and let the runner reach target.",
  },
  let_loser_run: {
    kind: "let_loser_run",
    category: "execution",
    title: "Let losers run too long",
    short: "Losing trades were held far beyond the original stop.",
    description:
      "Realised loss exceeded 1.5× the planned risk — the stop was moved or ignored.",
    fix: "Never move your stop against you. Accept the loss at the planned level.",
  },
  // ---------- Psychology ----------
  revenge_trade: {
    kind: "revenge_trade",
    category: "psychology",
    title: "Revenge trading",
    short: "Trades opened within minutes of a loss.",
    description:
      "A new trade was opened less than 5 minutes after a losing trade closed — a classic revenge pattern.",
    fix: "Enforce a 15-minute cooldown after any red trade.",
  },
  overtrading: {
    kind: "overtrading",
    category: "psychology",
    title: "Overtrading",
    short: "Trade count spikes well above your daily average.",
    description:
      "Days where you opened > 2× your average number of trades — typically a sign of forcing setups.",
    fix: "Cap daily trades at your average + 1 and stop for the day.",
  },
  fomo_entry: {
    kind: "fomo_entry",
    category: "psychology",
    title: "FOMO entries",
    short: "Trades tagged with FOMO or greed emotions.",
    description:
      "Trades where you flagged fear-of-missing-out or greed as the driving emotion.",
    fix: "If you feel FOMO, sit out the current bar and reassess the setup.",
  },
  fear_exit: {
    kind: "fear_exit",
    category: "psychology",
    title: "Fear exits",
    short: "Green trades closed early due to fear.",
    description:
      "Winning trades closed early with fear/anxiety tagged as the exit emotion.",
    fix: "Automate exits with a partial + trailing stop so emotion can't intervene.",
  },
  traded_after_max_loss: {
    kind: "traded_after_max_loss",
    category: "psychology",
    title: "Traded after max loss reached",
    short: "Continued trading after hitting your daily loss cap.",
    description: "Trades executed on days your daily loss limit had already been reached.",
    fix: "Set a hard shutdown rule when the loss cap is hit.",
  },
  // ---------- Discipline ----------
  did_not_follow_playbook: {
    kind: "did_not_follow_playbook",
    category: "discipline",
    title: "Didn't follow playbook",
    short: "Trade taken without any playbook attached.",
    description:
      "Closed trades that were not linked to a playbook / strategy in your library.",
    fix: "Attach a playbook to every trade before execution.",
  },
  journal_incomplete: {
    kind: "journal_incomplete",
    category: "discipline",
    title: "Journal incomplete",
    short: "Key journal fields were left blank.",
    description:
      "Trade journals missing setup, session, direction, or entry reason.",
    fix: "Enable the journal completeness check and fill required fields.",
  },
  missing_screenshots: {
    kind: "missing_screenshots",
    category: "discipline",
    title: "Missing screenshots",
    short: "Trades logged without a chart snapshot.",
    description:
      "You cannot review a setup you didn't capture. These trades have no attached image.",
    fix: "Attach at least one screenshot before marking a trade closed.",
  },
  missing_notes: {
    kind: "missing_notes",
    category: "discipline",
    title: "Missing notes",
    short: "Trades logged without any written notes.",
    description: "No entry-reason or post-trade note recorded for these trades.",
    fix: "Write one sentence about the setup and one about the outcome.",
  },
  ignored_checklist: {
    kind: "ignored_checklist",
    category: "discipline",
    title: "Ignored checklist",
    short: "Playbook checklist wasn't run before entry.",
    description:
      "The pre-trade checklist was not executed even though a playbook was attached.",
    fix: "Run the checklist via the Playbook button in the order panel.",
  },
  // ---------- Consistency ----------
  random_lot_sizes: {
    kind: "random_lot_sizes",
    category: "consistency",
    title: "Random lot sizes",
    short: "Lot sizes on the same symbol vary wildly.",
    description:
      "Within a single symbol, lot sizes differ by more than 3× between the smallest and largest.",
    fix: "Fix sizing per symbol using a per-instrument risk template.",
  },
  random_holding_time: {
    kind: "random_holding_time",
    category: "consistency",
    title: "Random holding time",
    short: "Trade duration is inconsistent for the same setup.",
    description:
      "Standard deviation of hold time exceeds the mean — no repeatable exit process.",
    fix: "Define an exit trigger per setup (time-based or structure-based).",
  },
  random_sessions: {
    kind: "random_sessions",
    category: "consistency",
    title: "Random session selection",
    short: "You trade all sessions equally without focus.",
    description:
      "Trade counts across London / New York / Asia are near-uniform, suggesting no session specialisation.",
    fix: "Pick your best session by P&L and trade only during that window for 2 weeks.",
  },
  strategy_hopping: {
    kind: "strategy_hopping",
    category: "consistency",
    title: "Strategy hopping",
    short: "Too many strategies used without enough trades each.",
    description:
      "More than 4 different playbooks used with fewer than 5 trades each — no strategy gets a fair sample.",
    fix: "Commit to your top 2 playbooks for the next 20 trades.",
  },
};
