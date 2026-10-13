CREATE TABLE IF NOT EXISTS players (
  id CHAR(36) NOT NULL PRIMARY KEY,
  display_name VARCHAR(24) NOT NULL,
  avatar_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  language_code VARCHAR(12) NOT NULL DEFAULT 'pt-MZ',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_categories_name_language (name, language_code)
);

CREATE TABLE IF NOT EXISTS cards (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(12) NOT NULL DEFAULT 'pt-MZ',
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cards_status (status),
  CONSTRAINT fk_cards_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS card_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  card_id VARCHAR(64) NOT NULL,
  item_order TINYINT UNSIGNED NOT NULL,
  text VARCHAR(120) NOT NULL,
  hint VARCHAR(500) NOT NULL,
  UNIQUE KEY uq_card_item_order (card_id, item_order),
  CONSTRAINT fk_card_items_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rooms (
  id CHAR(36) NOT NULL PRIMARY KEY,
  room_code CHAR(6) NOT NULL,
  host_player_id CHAR(36) NULL,
  status ENUM('open', 'playing', 'finished', 'closed') NOT NULL DEFAULT 'open',
  team_count TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  closed_at TIMESTAMP NULL,
  UNIQUE KEY uq_rooms_code (room_code),
  KEY idx_rooms_status (status),
  CONSTRAINT fk_rooms_host FOREIGN KEY (host_player_id) REFERENCES players(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  id CHAR(36) NOT NULL PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  team_id TINYINT UNSIGNED NOT NULL,
  role ENUM('host', 'player', 'bot') NOT NULL DEFAULT 'player',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_room_member UNIQUE (room_id, player_id),
  CONSTRAINT fk_room_members_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_room_members_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  mode ENUM('online') NOT NULL DEFAULT 'online',
  status ENUM('playing', 'finished', 'abandoned') NOT NULL DEFAULT 'playing',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  winner_team_id CHAR(36) NULL,
  KEY idx_matches_status_started (status, started_at),
  CONSTRAINT fk_matches_room FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id CHAR(36) NOT NULL PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  team_number TINYINT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  color VARCHAR(16) NOT NULL,
  board_position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_match_team_number (match_id, team_number),
  CONSTRAINT fk_teams_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_turns (
  id CHAR(36) NOT NULL PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  team_id CHAR(36) NOT NULL,
  player_id CHAR(36) NULL,
  card_id VARCHAR(64) NOT NULL,
  turn_number SMALLINT UNSIGNED NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  UNIQUE KEY uq_match_turn_number (match_id, turn_number),
  CONSTRAINT fk_match_turns_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_turns_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_match_turns_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL,
  CONSTRAINT fk_match_turns_card FOREIGN KEY (card_id) REFERENCES cards(id)
);

CREATE TABLE IF NOT EXISTS turn_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  turn_id CHAR(36) NOT NULL,
  card_item_id BIGINT UNSIGNED NOT NULL,
  is_correct BOOLEAN NOT NULL,
  resolved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_turn_item (turn_id, card_item_id),
  CONSTRAINT fk_turn_items_turn FOREIGN KEY (turn_id) REFERENCES match_turns(id) ON DELETE CASCADE,
  CONSTRAINT fk_turn_items_card_item FOREIGN KEY (card_item_id) REFERENCES card_items(id)
);

CREATE TABLE IF NOT EXISTS match_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  team_id CHAR(36) NOT NULL,
  final_score SMALLINT UNSIGNED NOT NULL,
  final_position SMALLINT UNSIGNED NOT NULL,
  placement SMALLINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_match_result_team (match_id, team_id),
  CONSTRAINT fk_match_results_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_results_team FOREIGN KEY (team_id) REFERENCES teams(id)
);
