SET NAMES utf8mb4;

SET @has_characters_bible_json = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'characters'
    AND COLUMN_NAME = 'bible_json'
);

SET @add_characters_bible_json = IF(
  @has_characters_bible_json = 0,
  "ALTER TABLE characters ADD COLUMN bible_json JSON NULL COMMENT '角色结构化圣经：脸型/眼型/发型/服装/穿戴配饰/气质/音色等' AFTER description",
  'SELECT 1'
);
PREPARE stmt_add_characters_bible_json FROM @add_characters_bible_json;
EXECUTE stmt_add_characters_bible_json;
DEALLOCATE PREPARE stmt_add_characters_bible_json;

UPDATE characters
SET bible_json = JSON_OBJECT(
  'schema_version', 1,
  'source', 'migration_description_fallback',
  'identity', description,
  'wearable_accessories', JSON_ARRAY(),
  'voice', '',
  'visual_anchors', JSON_OBJECT()
)
WHERE bible_json IS NULL OR JSON_TYPE(bible_json) = 'NULL';

SET @nullable_characters_bible_json = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'characters'
    AND COLUMN_NAME = 'bible_json'
    AND IS_NULLABLE = 'YES'
);

SET @alter_characters_bible_json = IF(
  @nullable_characters_bible_json > 0,
  "ALTER TABLE characters MODIFY COLUMN bible_json JSON NOT NULL COMMENT '角色结构化圣经：脸型/眼型/发型/服装/穿戴配饰/气质/音色等'",
  'SELECT 1'
);
PREPARE stmt_alter_characters_bible_json FROM @alter_characters_bible_json;
EXECUTE stmt_alter_characters_bible_json;
DEALLOCATE PREPARE stmt_alter_characters_bible_json;

-- Rollback:
-- ALTER TABLE characters DROP COLUMN bible_json;
