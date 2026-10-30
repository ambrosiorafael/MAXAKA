ALTER TABLE match_used_cards
  ADD COLUMN combination_key CHAR(64) NULL AFTER card_id;

UPDATE match_used_cards used
JOIN (
  SELECT card_id,
         LOWER(SHA2(GROUP_CONCAT(DISTINCT content_id ORDER BY BINARY content_id SEPARATOR '|'), 256)) AS combination_key
    FROM match_used_items
   GROUP BY card_id
) combinations ON combinations.card_id = used.card_id
SET used.combination_key = combinations.combination_key;

DELETE duplicate_entry
  FROM match_used_cards duplicate_entry
  JOIN match_used_cards retained_entry
    ON retained_entry.combination_key = duplicate_entry.combination_key
   AND retained_entry.card_id < duplicate_entry.card_id;

ALTER TABLE match_used_cards
  DROP PRIMARY KEY,
  MODIFY combination_key CHAR(64) NOT NULL,
  ADD PRIMARY KEY (combination_key),
  ADD KEY idx_match_used_cards_card (card_id);