/**
 * Escape/strip PostgREST special characters from user-supplied search strings
 * before interpolating them into supabase-js `.or()` / `.ilike()` filter values.
 *
 * PostgREST parses `,`, `(`, `)`, `.`, `:`, `*` as syntax inside filter values,
 * so raw user input can alter the intended query logic. We strip them and cap
 * length to defuse filter-logic injection.
 */
export function escapeSearch(input: string, maxLength = 80): string {
  return (input ?? "")
    .toString()
    .slice(0, maxLength)
    .replace(/[,()*:.\\%]/g, " ")
    .trim();
}
