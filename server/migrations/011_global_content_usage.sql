CREATE TABLE IF NOT EXISTS global_content_usage (
  content_id VARCHAR(191) NOT NULL PRIMARY KEY,
  card_id VARCHAR(64) NOT NULL,
  match_id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_global_content_usage_match (match_id),
  CONSTRAINT fk_global_content_usage_content FOREIGN KEY (content_id) REFERENCES content_catalog(id),
  CONSTRAINT fk_global_content_usage_card FOREIGN KEY (card_id) REFERENCES cards(id)
);

INSERT IGNORE INTO global_content_usage (content_id, card_id, match_id, room_id, used_at)
SELECT content_id,
       MIN(card_id),
       MIN(match_id),
       MIN(room_id),
       MIN(used_at)
  FROM match_used_items
 GROUP BY content_id;