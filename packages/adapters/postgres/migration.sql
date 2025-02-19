-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    -- Base entity columns
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    name TEXT,
    username TEXT,
    email TEXT,
    avatar_url TEXT,
    address TEXT UNIQUE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- CREATE TABLE IF NOT EXISTS threads (
--     -- Base entity columns
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
--     deleted_at TIMESTAMP WITH TIME ZONE,

--     title TEXT
-- );

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type_enum') THEN
        CREATE TYPE message_type_enum AS ENUM ('human', 'ai');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS messages (
    -- Base entity columns
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    content TEXT NOT NULL,
    "message_type" message_type_enum NOT NULL DEFAULT 'human',
    -- thread_id UUID,
    user_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Foreign key constraints
    -- CONSTRAINT fk_thread_id FOREIGN KEY (thread_id) REFERENCES threads(id),
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes
-- CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_updated_at ON messages(updated_at);

-- CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at);
-- CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);

COMMIT;