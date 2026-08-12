-- Run AFTER j3-statement.sql. Two queries — run them one at a time.

-- 1. Expect both columns true.
--    carries_cursor false  -> the paste truncated before observation_cursor
--    drains_tag_ids false  -> the paste truncated before the tag block, which
--                             silently disables open-time tagging
select prosrc like '%observation_cursor%' as carries_cursor,
       prosrc like '%journal_entry_tags%' as drains_tag_ids
  from pg_proc
 where proname = 'create_journal_draft_from_trade';

-- 2. Expect 2 rows: the insert and update triggers, still attached.
select tgname from pg_trigger
 where tgname like 'trg_paper_trades_auto_journal%';
