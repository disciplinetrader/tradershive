/**
 * moomoo → our vocabulary: country names and indicator titles.
 *
 * The moomoo calendar is served in Chinese with no locale control. Measured
 * 2026-08-24: `lang=en`, `locale=en-US`, `language=en`, `market=US&lang=en_US`
 * and `Accept-Language: en-US | en | zh-CN` all return byte-identical Chinese,
 * and `currency` is null on every record (the `country` field carries a
 * Chinese country NAME, not an ISO code). So both mappings have to live here.
 *
 * ── Why a table rather than the one case we need ───────────────────────────
 *
 * The 22-day probe measured 100% 美国 (US) coverage, so `美国 → USD` is the
 * only mapping the ingest actually exercises today. It is a table anyway
 * because the failure mode of the alternative is silent: a hardcoded US branch
 * meets its first non-US event by mis-tagging it as USD, and a EUR release
 * filed under USD is worse than no release at all — it lands on the wrong
 * chart, in the wrong replay session, looking legitimate.
 *
 * Unknown strings are therefore never guessed. `lookupCurrency` returns null
 * and the caller warns and skips the row, so a new country surfaces in the
 * sync log as a named string ready to paste in here.
 *
 * Titles are the opposite trade-off and are handled the opposite way — see
 * `lookupTitle`.
 */

/**
 * Chinese country name → ISO currency.
 *
 * Seeded from the names actually observed in the 2026-08-24 probes (美国 from
 * `hot`; 新西兰, 巴西, 澳大利亚, 法国, 瑞士 from `/search`) plus the majors
 * `currenciesForSymbol` can pair against. Extend by pasting the string a
 * warning names — do not translate by inference.
 */
export const COUNTRY_TO_CURRENCY: Readonly<Record<string, string>> = {
  美国: "USD",
  欧元区: "EUR",
  德国: "EUR",
  法国: "EUR",
  意大利: "EUR",
  西班牙: "EUR",
  英国: "GBP",
  日本: "JPY",
  澳大利亚: "AUD",
  新西兰: "NZD",
  加拿大: "CAD",
  瑞士: "CHF",
  中国: "CNY",
  巴西: "BRL",
};

/**
 * Chinese indicator title → English.
 *
 * Seeded with every indicator the 22-day `hot` probe returned — non-farm
 * payrolls, the unemployment rate, CPI YoY (NSA) and the Fed rate decision —
 * plus the near-term additions that `hot` is most likely to surface next.
 *
 * Matching is exact on the full string. Substring matching was considered and
 * rejected: 美国失业率 (unemployment rate) is a substring relationship away
 * from several other labour releases, and a loose match here renames one
 * indicator to another silently, which is the same class of error as
 * mis-mapping a currency.
 */
export const TITLE_ZH_TO_EN: Readonly<Record<string, string>> = {
  // Measured in the 2026-08-24 hot probe.
  美国季调后非农就业人口变动: "US Non-Farm Payrolls (seasonally adjusted)",
  美国私营企业非农就业人数变动: "US Private Non-Farm Payrolls",
  美国失业率: "US Unemployment Rate",
  美国未季调CPI年率: "US CPI YoY (not seasonally adjusted)",
  美联储利率决议: "Fed Interest Rate Decision",
  // Obvious near-term additions for the same US high-signal set.
  美国季调后CPI月率: "US CPI MoM (seasonally adjusted)",
  美国核心CPI年率: "US Core CPI YoY",
  美国核心CPI月率: "US Core CPI MoM",
  美国PPI年率: "US PPI YoY",
  美国PPI月率: "US PPI MoM",
  美国核心PCE物价指数年率: "US Core PCE Price Index YoY",
  美国核心PCE物价指数月率: "US Core PCE Price Index MoM",
  美国零售销售月率: "US Retail Sales MoM",
  美国核心零售销售月率: "US Core Retail Sales MoM",
  美国GDP年化季率初值: "US GDP Annualised QoQ (advance)",
  美国GDP年化季率修正值: "US GDP Annualised QoQ (second estimate)",
  美国GDP年化季率终值: "US GDP Annualised QoQ (final)",
  美联储经济预测: "Fed Economic Projections",
  美联储FOMC经济预测: "FOMC Economic Projections",
};

/**
 * ISO currency for a moomoo country string, or null when unmapped.
 *
 * Null is a deliberate refusal rather than a default. See the header: a guess
 * files a foreign release under the wrong currency.
 */
export function lookupCurrency(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_TO_CURRENCY[country.trim()] ?? null;
}

/**
 * English title for a moomoo indicator string.
 *
 * Unlike currency, an unmapped title is passed THROUGH rather than refused —
 * the caller keeps the row and warns. An untranslated Chinese label in the
 * overlay is cosmetic; dropping the release loses its `actual`, which is the
 * only thing this provider exists to supply. `matched` lets the caller tell
 * the two apart without re-checking the table.
 */
export function lookupTitle(zh: string): { title: string; matched: boolean } {
  const key = zh.trim();
  const hit = TITLE_ZH_TO_EN[key];
  return hit ? { title: hit, matched: true } : { title: key, matched: false };
}
