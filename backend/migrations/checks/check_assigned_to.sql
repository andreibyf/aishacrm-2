SELECT column_name, data_type, udt_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'leads' AND column_name = 'assigned_to';
