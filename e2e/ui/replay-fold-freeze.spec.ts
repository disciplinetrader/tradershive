import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * The 2H fold freeze — reproducing the PAUSED case that strands the viewport.
 *
 * Two mechanisms were confirmed live, and this spec exists to separate them:
 *
 *  (a) The restore branch in `setCandles` recomputes the visible range from
 *      the viewport as it was at the instant of the fold. Switched from the
 *      right edge, the newest bar stays in range. Switched from the middle, it
 *      does not — `lastBarVisible: false`.
 *  (b) Recovery is `fitContent()`, and it is gated on `fittedRef`, which is
 *      cleared by an effect declared AFTER the one that calls `setCandles`.
 *      So the refit never runs on the fold itself; it runs on the NEXT change
 *      to `candles`. While playing that is the following tick, which is why
 *      (a) self-corrected in the live run and looked survivable.
 *
 * BOTH ARE FIXED, and this file is the regression coverage:
 *
 *  · `setCandles` now TRANSLATES the restored window forward when it would
 *    otherwise stop short of the newest bar, so the head is always inside the
 *    range and the renderer keeps following appends. Span is preserved, so the
 *    trader's zoom survives the fold.
 *  · `StudioChart` no longer refits on a fold. The restore owns cross-fold
 *    viewport continuity; the refit was a second opinion that overrode it one
 *    tick late — the measured 2-3 bar stutter — and never ran at all when the
 *    session was paused.
 *
 * The paused case is the sharp one: with no emits there is no second chance,
 * so the restore has to be right the first time. That is what this asserts.
 *
 * ── One caveat this spec has to respect ────────────────────────────────────
 *
 * `AutosaveEngine.runFlush` emits TWICE around an `await` on the network
 * write. Every emit invalidates the controller snapshot, and `visibleCandles()`
 * returns a fresh slice, so a late autosave emit lands as a new `candles`
 * identity — which re-runs the effect and fires the now-armed refit. Pausing
 * and folding immediately would therefore be rescued by the trailing flush and
 * the freeze would not reproduce. The settle wait below is load-bearing, not
 * padding.
 *
 * BTC/USDT 5m on 2026-07-05 — the symbol these specs have stored candles for.
 * The base is 5m rather than the 1H of the original report; what matters is
 * that `barStep` changes across the fold, which is what selects the branch.
 */

const TITLE = "E2E FOLD FREEZE RUN";

type FoldLog = { tag: string; data: Record<string, number | string | boolean | null | object> };

/** "[fold] TICK {json}" -> { tag, data }. The log is one flat string now. */
function parseFold(line: string): FoldLog {
  const brace = line.indexOf("{");
  if (brace < 0) return { tag: line.trim(), data: {} };
  try {
    return { tag: line.slice(0, brace).trim(), data: JSON.parse(line.slice(brace)) };
  } catch {
    return { tag: line.slice(0, brace).trim(), data: {} };
  }
}

async function seed(sb: SupabaseClient, userId: string, tag: string) {
  const { data, error } = await sb.from("replay_sessions").insert({
    user_id: userId,
    title: `${TITLE} ${tag}`,
    mode: "day",
    market: "crypto",
    symbol: "BTC/USDT",
    timeframe: "5m",
    replay_date: "2026-07-05",
    status: "active",
    initial_balance: 10_000,
    provider: "historical",
  }).select("id").single();
  if (error) throw new Error(`could not seed session: ${error.message}`);
  return String((data as { id: string }).id);
}

async function openStudio(page: Page, sessionId: string) {
  // Capture into a page global rather than through Playwright's console event:
  // the instrumentation logs an OBJECT, and resolving those args is async and
  // races the end of the test. This is synchronous and readable on demand.
  await page.addInitScript(() => {
    localStorage.setItem("thv:tour:completed:v1", "1");
    localStorage.setItem("chartFoldDebug", "1");
    (window as unknown as { __foldLogs: string[] }).__foldLogs = [];
    const original = console.log.bind(console);
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("[fold]")) {
        (window as unknown as { __foldLogs: string[] }).__foldLogs.push(args[0] as string);
      }
      original(...args);
    };
  });
  await page.goto(`/replay/studio?id=${sessionId}`);
  await page.getByTestId("pane-layout-bar").waitFor({ state: "visible", timeout: 120_000 });
  await expect(page.getByTestId("studio-chart").first()).toBeVisible({ timeout: 60_000 });
}

const readLogs = async (page: Page): Promise<FoldLog[]> => {
  const raw = await page.evaluate(
    () => (window as unknown as { __foldLogs: string[] }).__foldLogs ?? [],
  );
  return raw.map(parseFold);
};

const clearLogs = (page: Page) =>
  page.evaluate(() => { (window as unknown as { __foldLogs: string[] }).__foldLogs = []; });

/** Drag the canvas right — pans BACK in time, off the right edge. */
async function panToCentre(page: Page) {
  const box = await page.locator('[data-testid="studio-chart"] canvas').first().boundingBox();
  if (!box) throw new Error("no chart canvas to pan");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.65, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, y, { steps: 25 });
  await page.mouse.up();
}

test.describe("timeframe fold — viewport survival", () => {
  let sb: SupabaseClient;
  let sessionId: string;
  const tag = `ff${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    sb = db();
    sessionId = await seed(sb, ids().userId, tag);
  });

  test.afterAll(async () => {
    if (sessionId) {
      await sb.from("chart_closed_trades").delete().eq("replay_session_id", sessionId);
      await sb.from("replay_sessions").delete().eq("id", sessionId);
    }
  });

  test("a fold taken while PAUSED from the centre keeps the newest bar in range", async ({ page }) => {
    await openStudio(page, sessionId);

    // Consume some bars so there is a tape to be scrolled away from.
    await page.keyboard.press(" ");
    await page.waitForTimeout(6000);
    await page.keyboard.press(" ");

    // Let the pause's autosave flush resolve — see the header. Without this the
    // trailing emit rescues the fold and the freeze does not reproduce.
    await page.waitForTimeout(5000);

    await panToCentre(page);
    await page.waitForTimeout(1500);
    await clearLogs(page);

    // The fold itself.
    await page.getByRole("button", { name: "2H", exact: true }).first().click();
    await expect(page.getByTestId("studio-chart").first()).toHaveAttribute("data-timeframe", "2H");

    // Give any recovery every chance to fire before concluding there is none.
    await page.waitForTimeout(8000);

    const logs = await readLogs(page);
    console.log("FOLD LOGS:\n" + JSON.stringify(logs, null, 2));

    const switches = logs.filter((l) => l.tag.includes("SWITCH"));
    const ticks = logs.filter((l) => l.tag.includes("TICK"));

    expect(switches.length, "the fold should log exactly one SWITCH").toBe(1);

    // `appliedRange` is read immediately after `setVisibleLogicalRange` and the
    // renderer has not necessarily committed by then — it was measured stale
    // once. `requestedTo` is what the restore actually asked for, so assert on
    // that; it is the value the clamp controls.
    const d = switches[0].data as { requestedTo: number | null; lastBarIndex: number };

    console.log("requestedTo:", d.requestedTo, "lastBarIndex:", d.lastBarIndex);
    console.log("ticks while paused after SWITCH:", ticks.length);

    expect(d.requestedTo, "the fold should compute a right edge at all").not.toBeNull();
    // THE REGRESSION THIS FILE EXISTS FOR. Before the clamp this was 23.35
    // against a newest bar at 25 — 1.65 bars short — and the chart froze:
    // the renderer stops following appends once the head is outside the range.
    expect(
      Number(d.requestedTo),
      "restored range must contain the newest bar, or the renderer stops following new bars",
    ).toBeGreaterThanOrEqual(d.lastBarIndex);

    // And it must hold WITHOUT relying on a later tick to correct it: a paused
    // session produces no emits, so there is no second chance.
    expect(ticks.length, "a paused session produces no further tick to recover on").toBe(0);
  });

  /**
   * CAPTURE RUN — the full paused-fold timeline, through the press of play.
   *
   * Answers two open questions with data rather than reading:
   *
   * Q1 · why do TICKs fire while the UI shows PAUSED? `setCandles` only runs
   *      when the `candles` memo recomputes, which needs `view.candles` to
   *      change identity, which needs an engine emit. Two possibilities, and
   *      `candlesLength` separates them cleanly:
   *        · CONSTANT across the paused window -> identity churn. Something is
   *          invalidating the controller snapshot without the clock moving;
   *          `visibleCandles()` re-slices, so a fresh array with identical
   *          content re-fires the effect. Wasteful, not a correctness bug.
   *        · CLIMBING -> the clock is genuinely advancing while the UI claims
   *          to be paused, which is a far more serious bug than the freeze.
   *
   * Q2 · is the visible stutter on play a separate bug? Prediction: it is NOT.
   *      It is hypothesis (b)'s deferred recovery becoming visible. While
   *      paused `fittedRef` is false (cleared by the displayTf effect), so the
   *      FIRST `candles` change after play runs `a.fitContent()`, snapping the
   *      viewport from wherever the fold left it to fit-all. That is a jump,
   *      and it lands on the first post-play tick. Note the ordering: the TICK
   *      is logged INSIDE `setCandles`, i.e. BEFORE `fitContent()` runs in the
   *      same effect — so the snap is not visible in the tick that causes it,
   *      which is exactly why the live capture showed lastBarVisible: true
   *      throughout and the stutter looked unexplained.
   */
  test("CAPTURE: paused fold, held, then played", async ({ page }) => {
    await openStudio(page, sessionId);

    await page.keyboard.press(" ");
    await page.waitForTimeout(6000);
    await page.keyboard.press(" ");
    await page.waitForTimeout(5000);

    await panToCentre(page);
    await page.waitForTimeout(1500);
    await clearLogs(page);

    await page.getByRole("button", { name: "2H", exact: true }).first().click();
    await expect(page.getByTestId("studio-chart").first()).toHaveAttribute("data-timeframe", "2H");

    // ---- the paused window -------------------------------------------------
    await page.waitForTimeout(8000);
    const paused = await readLogs(page);

    // ---- press play --------------------------------------------------------
    await page.keyboard.press(" ");
    await page.waitForTimeout(5000);
    const everything = await readLogs(page);
    const afterPlay = everything.slice(paused.length);

    const lens = (rows: FoldLog[]) => rows.map((r) => Number(r.data.candlesLength));
    const pausedTicks = paused.filter((r) => r.tag.includes("TICK"));
    const pausedLens = lens(pausedTicks);
    const distinct = [...new Set(pausedLens)];

    console.log("================ FOLD CAPTURE ================");
    console.log("-- paused window --");
    for (const r of paused) console.log(r.tag, JSON.stringify(r.data));
    console.log(`paused TICK count: ${pausedTicks.length}`);
    console.log(`paused candlesLength values (distinct): ${JSON.stringify(distinct)}`);
    console.log(
      pausedTicks.length === 0
        ? "Q1 VERDICT: NO ticks at all while paused -> the engine emits nothing; nothing recovers the fold"
        : distinct.length <= 1
          ? "Q1 VERDICT: candlesLength CONSTANT -> snapshot identity churn, clock is NOT advancing"
          : "Q1 VERDICT: candlesLength CLIMBING -> the clock IS advancing while the UI shows paused",
    );

    console.log("-- first 12 ticks after play --");
    for (const r of afterPlay.slice(0, 12)) console.log(r.tag, JSON.stringify(r.data));
    const falseAfterPlay = afterPlay.filter((r) => r.data.lastBarVisible === false).length;
    console.log(`after-play TICK count: ${afterPlay.length}, lastBarVisible:false among them: ${falseAfterPlay}`);
    console.log("==============================================");

    // Recorded, not asserted: this test exists to produce numbers. The only
    // thing worth failing on is capturing nothing at all.
    expect(paused.length + afterPlay.length).toBeGreaterThan(0);
  });
});
