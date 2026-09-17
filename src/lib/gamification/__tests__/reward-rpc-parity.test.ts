import { describe, it, expect } from "vitest";
import { applyXp, leagueForLevel } from "@/lib/gamification/constants";
import { xpForLevel } from "@/lib/constants";

/**
 * Parity guard for the `award_xp_coins` SECURITY DEFINER RPC
 * (docs/migrations/remediation/phase2/I1_profile_integrity_rewards.sql).
 *
 * The RPC reimplements the app's leveling in plpgsql because reward payout is
 * now server-authoritative. If the TS formula changes, the SQL must change too.
 * These tests fail if they drift, which is the signal to update the migration.
 *
 * `rpcLevelling` mirrors the SQL exactly:
 *   v_xp := xp + max(delta,0)
 *   loop: cost := round(100 * 1.15^(level-1)); exit when v_xp < cost;
 *         v_xp -= cost; level += 1
 * and the league CASE uses thresholds 5/15/30/50/75 (bronze..master).
 */
function rpcLevelling(curLevel: number, curXp: number, delta: number) {
  let level = Math.max(1, curLevel);
  let xp = Math.max(0, curXp) + Math.max(0, delta);
  if (delta > 0) {
    for (;;) {
      const cost = Math.round(100 * Math.pow(1.15, Math.max(0, level - 1)));
      if (xp < cost) break;
      xp -= cost;
      level += 1;
    }
  }
  return { level, xp };
}

function rpcLeague(level: number): string {
  if (level >= 75) return "master";
  if (level >= 50) return "diamond";
  if (level >= 30) return "platinum";
  if (level >= 15) return "gold";
  if (level >= 5) return "silver";
  return "bronze";
}

describe("award_xp_coins RPC leveling parity with applyXp", () => {
  const cases: Array<[number, number, number]> = [
    [1, 0, 0], [1, 0, 50], [1, 0, 100], [1, 0, 250], [1, 0, 1000],
    [3, 35, 200], [5, 10, 0], [10, 90, 5000], [14, 0, 130], [1, 0, 100000],
  ];

  it("xpForLevel matches the SQL cost formula round(100 * 1.15^(level-1))", () => {
    for (let level = 1; level <= 120; level++) {
      expect(xpForLevel(level)).toBe(Math.round(100 * Math.pow(1.15, level - 1)));
    }
  });

  it("level+xp from applyXp equals the RPC leveling loop", () => {
    for (const [lvl, xp, delta] of cases) {
      const app = applyXp(lvl, xp, delta);
      const rpc = rpcLevelling(lvl, xp, delta);
      expect({ level: app.level, xp: app.xp }).toEqual(rpc);
    }
  });

  it("league thresholds match for the enum-valid range (bronze..master)", () => {
    for (let level = 1; level <= 99; level++) {
      const appLeague = leagueForLevel(level);
      // The DB `league` enum has no 'legend' member; the app only reaches
      // 'legend' at level>=100, which is out of the enum-valid range asserted
      // here and recorded as a separate finding.
      expect(rpcLeague(level)).toBe(appLeague);
    }
  });
});
