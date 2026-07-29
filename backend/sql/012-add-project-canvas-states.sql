BEGIN;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS project_canvas_states (
  project_id VARCHAR(64) NOT NULL COMMENT '所属项目 ID',
  nodes JSON NOT NULL COMMENT 'React Flow 节点数组',
  edges JSON NOT NULL COMMENT 'React Flow 连线数组',
  viewport JSON NOT NULL COMMENT '画布视口：x/y/zoom',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (project_id),
  CONSTRAINT fk_project_canvas_states_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='女娲项目画布状态';

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS project_canvas_states;
