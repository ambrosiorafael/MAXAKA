ALTER TABLE card_items
  ADD COLUMN category VARCHAR(80) NOT NULL DEFAULT 'Conhecimentos gerais' AFTER item_order;

ALTER TABLE match_turns
  MODIFY COLUMN started_at TIMESTAMP NULL DEFAULT NULL;
