INSERT IGNORE INTO match_used_items
  (match_id, room_id, turn_id, card_id, card_item_id, content_id, player_id, team_id, usage_status, used_at)
SELECT matches.id,
       matches.room_id,
       match_turns.id,
       match_turns.card_id,
       card_items.id,
       card_items.content_id,
       match_turns.player_id,
       match_turns.team_id,
       CASE
         WHEN matches.status = 'playing' AND match_turns.ended_at IS NULL THEN 'reserved'
         ELSE 'used'
       END,
       COALESCE(match_turns.ended_at, match_turns.started_at, matches.started_at)
  FROM matches
  JOIN match_turns ON match_turns.match_id = matches.id
  JOIN card_items ON card_items.card_id = match_turns.card_id
 WHERE card_items.content_id IS NOT NULL;
