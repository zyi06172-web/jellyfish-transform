BEGIN;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS agent_sessions (
  id VARCHAR(64) NOT NULL COMMENT 'Agent 会话 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '所属项目 ID',
  current_stage VARCHAR(32) NOT NULL DEFAULT 'intake' COMMENT '当前工作流阶段',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '会话状态',
  revision INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号，每次状态变更递增',
  state JSON NOT NULL COMMENT '会话状态快照（JSON）',
  workflow_version VARCHAR(32) NOT NULL DEFAULT 'flova-v2' COMMENT '工作流版本',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY ix_agent_sessions_project_id (project_id),
  KEY ix_agent_sessions_status (status),
  KEY ix_agent_sessions_project_stage (project_id, current_stage),
  KEY ix_agent_sessions_updated_at (updated_at),
  CONSTRAINT fk_agent_sessions_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Flova Agent 工作台会话';

ALTER TABLE agent_sessions
  MODIFY COLUMN revision INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号，每次状态变更递增';

CREATE TABLE IF NOT EXISTS agent_messages (
  id VARCHAR(64) NOT NULL COMMENT '消息 ID',
  session_id VARCHAR(64) NOT NULL COMMENT 'Agent 会话 ID',
  sequence INT NOT NULL COMMENT '会话内递增序号',
  role VARCHAR(16) NOT NULL COMMENT '消息角色：user/assistant/system',
  kind VARCHAR(32) NOT NULL DEFAULT 'text' COMMENT '消息类型：text/question_card/task_update/error',
  content TEXT NOT NULL COMMENT '消息正文',
  payload JSON NOT NULL COMMENT '消息结构化载荷（JSON）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_messages_session_sequence (session_id, sequence),
  KEY ix_agent_messages_session_id (session_id),
  KEY ix_agent_messages_session_created (session_id, created_at),
  CONSTRAINT fk_agent_messages_session_id FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Flova Agent 对话消息';

CREATE TABLE IF NOT EXISTS agent_checkpoints (
  id VARCHAR(64) NOT NULL COMMENT '确认点 ID',
  session_id VARCHAR(64) NOT NULL COMMENT 'Agent 会话 ID',
  stage VARCHAR(32) NOT NULL COMMENT '确认点所属阶段',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '确认点状态：pending/confirmed/rejected/superseded',
  question TEXT NOT NULL COMMENT '确认问题',
  options JSON NOT NULL COMMENT '问题卡选项（JSON 数组）',
  resolved_option_id VARCHAR(64) NULL COMMENT '已选择的选项 ID',
  resolution_payload JSON NULL COMMENT '确认结果结构化载荷（JSON）',
  message_id VARCHAR(64) NULL COMMENT '对应问题卡消息 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY ix_agent_checkpoints_session_id (session_id),
  KEY ix_agent_checkpoints_status (status),
  KEY ix_agent_checkpoints_message_id (message_id),
  KEY ix_agent_checkpoints_session_stage (session_id, stage),
  KEY ix_agent_checkpoints_session_status (session_id, status),
  CONSTRAINT fk_agent_checkpoints_session_id FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_checkpoints_message_id FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Flova Agent 阶段确认点';

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id VARCHAR(64) NOT NULL COMMENT '产物 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '所属项目 ID',
  kind VARCHAR(32) NOT NULL COMMENT '产物类型：story_summary/final_video_spec/storyboard',
  version INT NOT NULL DEFAULT 1 COMMENT '同类产物版本号',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT '产物状态：draft/confirmed/superseded',
  content_text TEXT NOT NULL COMMENT '产物文本内容',
  content_json JSON NOT NULL COMMENT '产物结构化内容（JSON）',
  created_by_message_id VARCHAR(64) NULL COMMENT '创建该产物的消息 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_artifacts_project_kind_version (project_id, kind, version),
  KEY ix_agent_artifacts_project_id (project_id),
  KEY ix_agent_artifacts_status (status),
  KEY ix_agent_artifacts_created_by_message_id (created_by_message_id),
  KEY ix_agent_artifacts_project_kind_status (project_id, kind, status),
  CONSTRAINT fk_agent_artifacts_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_artifacts_created_by_message_id FOREIGN KEY (created_by_message_id) REFERENCES agent_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Flova Agent 结构化产物版本';

CREATE TABLE IF NOT EXISTS agent_actions (
  id VARCHAR(64) NOT NULL COMMENT '动作 ID',
  session_id VARCHAR(64) NOT NULL COMMENT 'Agent 会话 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '所属项目 ID',
  message_id VARCHAR(64) NULL COMMENT '触发该动作的消息 ID',
  action_type VARCHAR(64) NOT NULL COMMENT '动作类型，按完整 Skill 预留',
  target_type VARCHAR(64) NOT NULL DEFAULT '' COMMENT '目标类型',
  target_id VARCHAR(64) NOT NULL DEFAULT '' COMMENT '目标 ID',
  idempotency_key VARCHAR(128) NOT NULL COMMENT '幂等键，全局唯一',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '动作状态',
  task_id VARCHAR(64) NULL COMMENT '关联异步生成任务 ID',
  input JSON NOT NULL COMMENT '动作输入（JSON）',
  output JSON NULL COMMENT '动作输出（JSON）',
  error TEXT NOT NULL COMMENT '失败原因',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uq_agent_actions_idempotency_key (idempotency_key),
  KEY ix_agent_actions_session_id (session_id),
  KEY ix_agent_actions_project_id (project_id),
  KEY ix_agent_actions_message_id (message_id),
  KEY ix_agent_actions_action_type (action_type),
  KEY ix_agent_actions_status (status),
  KEY ix_agent_actions_task_id (task_id),
  KEY ix_agent_actions_session_status (session_id, status),
  KEY ix_agent_actions_project_type_status (project_id, action_type, status),
  KEY ix_agent_actions_target (target_type, target_id),
  CONSTRAINT fk_agent_actions_session_id FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_actions_project_id FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_actions_message_id FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE SET NULL,
  CONSTRAINT fk_agent_actions_task_id FOREIGN KEY (task_id) REFERENCES generation_tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Flova Agent 确定性动作记录';

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS agent_actions;
-- DROP TABLE IF EXISTS agent_artifacts;
-- DROP TABLE IF EXISTS agent_checkpoints;
-- DROP TABLE IF EXISTS agent_messages;
-- DROP TABLE IF EXISTS agent_sessions;
