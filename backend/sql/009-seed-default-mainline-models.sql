BEGIN;
SET NAMES utf8mb4;

INSERT IGNORE INTO providers (
  id,
  name,
  base_url,
  image_base_url,
  video_base_url,
  api_key,
  api_secret,
  description,
  status,
  created_by,
  created_at,
  updated_at
)
VALUES
  (
    'openai',
    'openai',
    'https://api.deepseek.com/v1',
    NULL,
    NULL,
    '',
    '',
    '默认文本模型供应商壳：DeepSeek OpenAI-compatible；部署后需填写 API Key。',
    'testing',
    'system',
    NOW(),
    NOW()
  ),
  (
    'volcengine',
    '火山引擎',
    'https://ark.cn-beijing.volces.com/api/v3',
    NULL,
    NULL,
    '',
    '',
    '默认图片/视频模型供应商壳：火山方舟；部署后需填写 API Key。',
    'testing',
    'system',
    NOW(),
    NOW()
  );

INSERT IGNORE INTO models (
  id,
  name,
  category,
  provider_id,
  params,
  description,
  created_by,
  created_at,
  updated_at
)
VALUES
  (
    'model-deepseek-v4-pro',
    'deepseek-v4-pro-260425',
    'text',
    'openai',
    JSON_OBJECT(),
    '默认文本模型壳：DeepSeek V4-pro，用于对话、剧本与拆分镜；不包含 API Key。',
    'system',
    NOW(),
    NOW()
  ),
  (
    'model-seedream-5-pro',
    'doubao-seedream-5-0-pro-260628',
    'image',
    'volcengine',
    JSON_OBJECT(),
    '默认出图模型壳：Seedream 5.0 Pro，用于角色、场景与首帧；不包含 API Key。',
    'system',
    NOW(),
    NOW()
  ),
  (
    'model-seedance-2',
    'doubao-seedance-2-0-260128',
    'video',
    'volcengine',
    JSON_OBJECT(),
    '默认视频模型壳：Seedance 2.0，用于竖屏短剧镜头生成；不包含 API Key。',
    'system',
    NOW(),
    NOW()
  );

INSERT INTO model_settings (
  id,
  default_text_model_id,
  default_image_model_id,
  default_video_model_id,
  api_timeout,
  log_level
)
VALUES (
  1,
  'model-deepseek-v4-pro',
  'model-seedream-5-pro',
  'model-seedance-2',
  300,
  'info'
)
ON DUPLICATE KEY UPDATE
  default_text_model_id = COALESCE(default_text_model_id, VALUES(default_text_model_id)),
  default_image_model_id = COALESCE(default_image_model_id, VALUES(default_image_model_id)),
  default_video_model_id = COALESCE(default_video_model_id, VALUES(default_video_model_id)),
  api_timeout = IF(api_timeout = 30, VALUES(api_timeout), api_timeout),
  log_level = COALESCE(log_level, VALUES(log_level));

COMMIT;
