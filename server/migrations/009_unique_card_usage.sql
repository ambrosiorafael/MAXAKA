CREATE TABLE IF NOT EXISTS match_used_cards (
  card_id VARCHAR(64) NOT NULL PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_match_used_cards_match (match_id),
  CONSTRAINT fk_match_used_cards_card FOREIGN KEY (card_id) REFERENCES cards(id)
);

INSERT IGNORE INTO match_used_cards (card_id, match_id, room_id, used_at)
SELECT card_id, match_id, room_id, MIN(used_at)
  FROM match_used_items
 GROUP BY card_id, match_id, room_id;

ALTER TABLE match_used_items
  DROP INDEX uq_match_used_content,
  ADD UNIQUE KEY uq_match_used_card_content (match_id, card_id, content_id);