import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { db, ids, runAccount, createPositionAt, seedWorkspace, TEST_SYMBOL } from "./fixtures";

/**
 * #5 — Positions table parity with TradingView.
 *
 * Asserted in the running app rather than in types, because the two complaints
 * this work answers are both about pixels: a labelled red Close button wide
 * enough to sit under the floating assistant bubble, and a panel too crowded to
 * read. Neither shows up in a passing typecheck.
 */

/** A 5-decimal forex entry, so the fractional-pip superscript has something to render. */
const FX_ENTRY = 1.10557;

async function openBlotter(page: Page, accountId: string) {
  await seedWorkspace(page, accountId, TEST_SYMBOL);
  await page.goto("/trading");
  await page.waitForSelector("canvas", { timeout: 45_000 });
  // By test id, not by "the table that has the column picker in it". Radix
  // marks the rest of the page inert while a menu is open, so a structural
  // locator like that resolves to nothing mid-interaction — and an assertion
  // of the form `expect(...).toHaveCount(0)` then PASSES for the wrong reason.
  const table = page.getByTestId("positions-table");
  await expect(table, "the full positions blotter must be on screen").toBeVisible({ timeout: 30_000 });
  return table;
}

/** Close an open menu and wait until the page is interactive again. */
async function dismissMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
}

function headers(table: Locator) {
  return table.locator("thead th");
}

test.describe("positions table", () => {
  let sb: ReturnType<typeof db>;
  let account: any;
  const disposers: (() => Promise<void>)[] = [];
  let fxTrade: any;

  test.beforeAll(async () => {
    sb = db();
    account = await runAccount(sb);
    const userId = ids().userId;

    const fx = await createPositionAt(sb, account.id, userId, {
      symbol: "EUR/USD", market: "forex", price: FX_ENTRY, lot: 0.01,
    });
    fxTrade = fx.trade;
    disposers.push(fx.dispose);
  });

  test.afterAll(async () => {
    for (const d of disposers) await d();
  });

  test("the actions column is two unlabelled icons, not a red button", async ({ page }) => {
    const table = await openBlotter(page, account.id);
    const row = table.locator("tbody tr").first();
    await expect(row).toBeVisible();

    const close = row.getByRole("button", { name: "Close at market" });
    const edit = row.getByRole("button", { name: "Modify SL/TP" });

    // --- ASSERTION 1: both controls exist --------------------------------
    await expect(edit, "the edit (pencil) control must be present").toBeVisible();
    await expect(close, "the close control must be present").toBeVisible();

    // --- ASSERTION 2: the close control carries no text label ------------
    // "Close" as a word is what made the button wide. The icon and the
    // accessible name carry the meaning instead.
    expect(
      (await close.innerText()).trim(),
      "the close control must be an icon only — no text label",
    ).toBe("");

    // --- ASSERTION 3: it is icon-sized, not button-sized -----------------
    const closeBox = await close.boundingBox();
    expect(closeBox, "close control must have a box").not.toBeNull();
    expect(
      closeBox!.width,
      `close control is ${closeBox!.width}px wide; the labelled version was ~68px`,
    ).toBeLessThanOrEqual(32);

    // --- ASSERTION 4: the whole actions cell got narrower -----------------
    // This is what stops the floating assistant bubble covering the control:
    // the column was 136px, and the bubble overlapped its right end.
    const cell = row.locator("td").last();
    const cellBox = await cell.boundingBox();
    expect(cellBox, "actions cell must have a box").not.toBeNull();
    expect(
      cellBox!.width,
      `actions column is ${cellBox!.width}px; it was 136px when the button was labelled`,
    ).toBeLessThanOrEqual(112);

    // --- ASSERTION 5: it is still the control that closes -----------------
    // Enabled and clickable, i.e. nothing is painted on top of it. Checked
    // rather than clicked: this spec must not close the position.
    await expect(close).toBeEnabled();
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x as number, y as number);
      const btn = el?.closest("button");
      return {
        label: btn?.getAttribute("aria-label") ?? null,
        // Enough to name the culprit when it is not our button. "Something is
        // on top of it" is only actionable if the report says what.
        describe: btn
          ? `button[aria-label=${btn.getAttribute("aria-label")}] .${btn.className.slice(0, 60)}`
          : `${el?.tagName} .${(el as HTMLElement | null)?.className?.toString().slice(0, 60)}`,
      };
    }, [closeBox!.x + closeBox!.width / 2, closeBox!.y + closeBox!.height / 2]);
    expect(
      hit.label,
      `the centre of the close control belongs to: ${hit.describe} — something is painted over it`,
    ).toBe("Close at market");
  });

  test("the new risk columns are present and the picker hides them", async ({ page }) => {
    const table = await openBlotter(page, account.id);

    // --- ASSERTION 6: the TradingView columns exist ----------------------
    for (const label of ["P/L %", "Trade value", "Market value", "Leverage", "Margin"]) {
      await expect(
        headers(table).filter({ hasText: label }).first(),
        `the "${label}" column must be in the table`,
      ).toBeVisible();
    }

    // --- ASSERTION 7: ours are kept ---------------------------------------
    for (const label of ["Session", "Duration"]) {
      await expect(
        headers(table).filter({ hasText: label }).first(),
        `our "${label}" column must survive the parity pass`,
      ).toBeVisible();
    }

    const before = await headers(table).count();
    expect(before, "the table should have every column to start with").toBeGreaterThan(10);

    // --- ASSERTION 8: unchecking a column removes it ----------------------
    await page.getByRole("button", { name: "Choose columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Margin" }).click();
    await dismissMenu(page);

    await expect(
      headers(table).filter({ hasText: "Margin" }),
      "unchecking Margin must remove the column",
    ).toHaveCount(0);
    // Exactly one column left, not the whole table gone.
    expect(await headers(table).count()).toBe(before - 1);

    // --- ASSERTION 9: the choice survives a reload ------------------------
    // A picker that forgets is a picker the user has to re-set every session,
    // which is no better than us choosing for them.
    await page.reload();
    const after = page.getByTestId("positions-table");
    await expect(after).toBeVisible({ timeout: 30_000 });
    await expect(
      headers(after).filter({ hasText: "Margin" }),
      "the hidden column must stay hidden across a reload",
    ).toHaveCount(0);
    expect(await headers(after).count()).toBe(before - 1);

    // --- ASSERTION 10: required columns cannot be removed ------------------
    await page.getByRole("button", { name: "Choose columns" }).click();
    const pair = page.getByRole("menuitemcheckbox", { name: "Pair" });
    await expect(pair, "Pair must be listed so the menu accounts for every column").toBeVisible();
    await expect(pair, "Pair must not be removable — a row without it is unreadable").toBeDisabled();
    await dismissMenu(page);

    // Put it back, so this spec leaves no preference behind for the next one.
    await page.getByRole("button", { name: "Choose columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Margin" }).click();
    await dismissMenu(page);
    await expect(headers(after).filter({ hasText: "Margin" })).toHaveCount(1);
  });

  test("forex prices render the fractional pip as a superscript", async ({ page }) => {
    const table = await openBlotter(page, account.id);
    const row = table.locator(`tbody tr`).filter({ hasText: "EUR/USD" }).first();
    await expect(row, "the EUR/USD position must be on the table").toBeVisible();

    // The Entry cell, found by its value rather than by column index so the
    // assertion survives the user hiding a column to its left.
    const sup = row.locator("sup").first();

    // --- ASSERTION 11: the fifth decimal is raised ------------------------
    await expect(sup, "a 5-decimal forex price must raise its last digit").toBeVisible();
    expect(await sup.innerText()).toBe(String(FX_ENTRY).slice(-1));

    // --- ASSERTION 12: no precision was dropped to do it ------------------
    // The digits must still read as the full price when the superscript is
    // concatenated back — a superscript that replaces a digit is a rounding
    // bug wearing a typographic hat.
    const cellText = (await row.locator("td").filter({ hasText: /1\.105/ }).first().innerText())
      .replace(/\s+/g, "");
    expect(cellText, `entry cell should read ${FX_ENTRY}`).toContain(String(FX_ENTRY));
    // The rendered price must be the persisted one, not a rounded echo of it.
    expect(Number(fxTrade.entry_price)).toBe(FX_ENTRY);
  });
});
