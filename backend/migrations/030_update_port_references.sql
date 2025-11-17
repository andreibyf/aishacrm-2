-- Update port references in database configuration
UPDATE modulesettings 
SET settings = jsonb_set(
    settings,
    '{apiUrl}',
    '"http://localhost:4001"'
)
WHERE module_name = 'system' 
AND settings->>'apiUrl' = 'http://localhost:3001';

-- Update any stored URLs in integration configs
UPDATE tenant_integrations 
SET config = jsonb_set(
    config,
    '{baseUrl}',
    '"http://localhost:4001"'
)
WHERE config->>'baseUrl' = 'http://localhost:3001';

-- Log the changes
INSERT INTO system_logs (
    tenant_id,
    log_type,
    message,
    metadata
) VALUES (
    'system',
    'configuration',
    'Updated service ports: Frontend 4000, Backend 4001',
    jsonb_build_object(
        'changes', jsonb_build_object(
            'frontend', '4000',
            'backend', '4001'
        ),
        'previous', jsonb_build_object(
            'frontend', '3000',
            'backend', '3001'
        )
    )
);