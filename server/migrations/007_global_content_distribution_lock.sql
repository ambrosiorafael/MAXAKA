CREATE TABLE IF NOT EXISTS content_distribution_lock (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY
);

INSERT IGNORE INTO content_distribution_lock (id) VALUES (1);

ALTER TABLE match_used_items
  ADD KEY idx_match_used_content_id (content_id);
