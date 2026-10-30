CREATE TABLE IF NOT EXISTS content_catalog (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  normalized_text VARCHAR(191) NOT NULL,
  canonical_text VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_content_normalized_text (normalized_text)
);

CREATE TABLE IF NOT EXISTS content_aliases (
  normalized_alias VARCHAR(191) NOT NULL PRIMARY KEY,
  content_id VARCHAR(191) NOT NULL,
  CONSTRAINT fk_content_aliases_content FOREIGN KEY (content_id) REFERENCES content_catalog(id)
);

ALTER TABLE card_items
  ADD COLUMN content_id VARCHAR(191) NULL AFTER item_order,
  ADD KEY idx_card_items_content (content_id),
  ADD CONSTRAINT fk_card_items_content FOREIGN KEY (content_id) REFERENCES content_catalog(id);

CREATE TABLE IF NOT EXISTS match_used_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  turn_id CHAR(36) NOT NULL,
  card_id VARCHAR(64) NOT NULL,
  card_item_id BIGINT UNSIGNED NOT NULL,
  content_id VARCHAR(191) NOT NULL,
  player_id CHAR(36) NULL,
  team_id CHAR(36) NOT NULL,
  usage_status ENUM('reserved', 'used') NOT NULL DEFAULT 'reserved',
  used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_match_used_content (match_id, content_id),
  UNIQUE KEY uq_match_used_card (match_id, card_id),
  CONSTRAINT fk_match_used_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_used_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_used_turn FOREIGN KEY (turn_id) REFERENCES match_turns(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_used_card FOREIGN KEY (card_id) REFERENCES cards(id),
  CONSTRAINT fk_match_used_card_item FOREIGN KEY (card_item_id) REFERENCES card_items(id),
  CONSTRAINT fk_match_used_content FOREIGN KEY (content_id) REFERENCES content_catalog(id),
  CONSTRAINT fk_match_used_team FOREIGN KEY (team_id) REFERENCES teams(id)
);
