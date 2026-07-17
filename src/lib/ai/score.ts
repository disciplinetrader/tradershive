/**
 * AI Score — computed from actual platform data.
 * Pure calculation module (no DB access here — caller passes rows).
 */
export interface ScoreInputs {
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  totalRisk: number;
  averageRR: number;
  maxDrawdown: number;
  journaledTrades: number;
  totalJournalWords: number;
  tradesWithStops: number;
  tradesRespectingRisk: number;
  activeChallenges: number;
  completedChallenges: number;
  tradingDays: number;
  journalingDays: number;
  loginDays: number;
  windowDays: number;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export function computeAiScore(i: ScoreInputs) {
  const winRate = i.totalTrades ? i.wins / i.totalTrades : 0;
  const journalCoverage = i.totalTrades ? i.journaledTrades / i.totalTrades : 0;
  const stopCoverage = i.totalTrades ? i.tradesWithStops / i.totalTrades : 0;
  const riskCoverage = i.totalTrades ? i.tradesRespectingRisk / i.totalTrades : 0;
  const tradingCadence = i.windowDays ? i.tradingDays / i.windowDays : 0;
  const journalCadence = i.windowDays ? i.journalingDays / i.windowDays : 0;
  const loginCadence = i.windowDays ? i.loginDays / i.windowDays : 0;

  const discipline = clamp(
    stopCoverage * 40 + riskCoverage * 40 + journalCoverage * 20,
  );
  const risk_management = clamp(
    stopCoverage * 50 + riskCoverage * 40 + (i.maxDrawdown < 10 ? 10 : Math.max(0, 10 - i.maxDrawdown / 2)),
  );
  const consistency = clamp(
    tradingCadence * 40 + journalCadence * 30 + loginCadence * 30,
  );
  const execution = clamp(
    winRate * 60 + Math.min(i.averageRR, 3) * 13.33,
  );
  const journal_quality = clamp(
    journalCoverage * 60 + Math.min(i.totalJournalWords / Math.max(i.journaledTrades, 1) / 100, 1) * 40,
  );
  const challenge_completion = clamp(
    (i.completedChallenges * 20) + (i.activeChallenges > 0 ? 20 : 0),
  );
  const performance = clamp(
    50 + (i.totalPnl > 0 ? Math.min(50, (i.totalPnl / Math.max(i.totalRisk, 1)) * 10) : Math.max(-50, (i.totalPnl / Math.max(i.totalRisk, 1)) * 10)),
  );
  const psychology = clamp(
    discipline * 0.4 + risk_management * 0.3 + consistency * 0.3,
  );

  const overall = clamp(
    discipline * 0.15 +
      risk_management * 0.2 +
      consistency * 0.1 +
      execution * 0.15 +
      psychology * 0.1 +
      journal_quality * 0.1 +
      challenge_completion * 0.05 +
      performance * 0.15,
  );

  return {
    overall: Math.round(overall * 100) / 100,
    discipline: Math.round(discipline * 100) / 100,
    risk_management: Math.round(risk_management * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    execution: Math.round(execution * 100) / 100,
    psychology: Math.round(psychology * 100) / 100,
    journal_quality: Math.round(journal_quality * 100) / 100,
    challenge_completion: Math.round(challenge_completion * 100) / 100,
    performance: Math.round(performance * 100) / 100,
    breakdown: { winRate, journalCoverage, stopCoverage, riskCoverage, tradingCadence },
  };
}
