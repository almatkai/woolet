-- Seed default categories (system-wide, userId = null)
-- These have fixed UUIDs that must match across all environments for import/export to work
-- Uses ON CONFLICT DO NOTHING to be idempotent (safe to run multiple times)

INSERT INTO "categories" ("id", "user_id", "name", "icon", "color", "type", "created_at") VALUES
-- Income categories
('45f0dd51-d5a6-4f0b-898e-f99f6a51e82c', NULL, 'Scholarships', '🎓', '#17A2B8', 'income', NOW()),
('4f318874-0443-4c84-8cb2-55e0efc01287', NULL, 'Selling Items', '🛒', '#DC3545', 'income', NOW()),
('d3709261-062b-4ea3-ba48-bd7289374e48', NULL, 'Freelance Work', '🖋️', '#FF5733', 'income', NOW()),
('deab4778-5f33-4a99-baa0-6c0892a93882', NULL, 'Rental Income', '🏠', '#FFC107', 'income', NOW()),
('199c0a04-80ad-440b-aa46-b195e96180b4', NULL, 'Savings Interest', '💰', '#6610F2', 'income', NOW()),
('dc69a927-72cd-40e7-8537-36afb8c44142', NULL, 'Pension', '🧓', '#6C757D', 'income', NOW()),
('e7335b45-7aa3-45bc-a21b-f18a40abdae6', NULL, 'Adjustment', '🔧', '#64748b', 'income', NOW()),
('a6c92f8f-dda0-4ce7-9ada-bf0b425c10e0', NULL, 'Debt', '💸', '#f43f5e', 'income', NOW()),
('849eaa5b-1b51-4df9-9003-7ebd7e206392', NULL, 'Refunds', '💵', '#20C997', 'income', NOW()),
('755a508e-60ed-42fe-9ee8-1af538b235ee', NULL, 'Salary', '💸', '#f43f5e', 'income', NOW()),
('730be7a8-edc9-4e73-b44f-3040d172278c', NULL, 'Dividends', '💹', '#17A2B8', 'income', NOW()),
('738c63ba-4b85-4e10-99d3-bf0e155764b0', NULL, 'Royalties', '🎵', '#6F42C1', 'income', NOW()),
('f0fadc7b-7cb4-4e9b-bb5a-aeffff2abb9b', NULL, 'Gifts', '🎁', '#E83E8C', 'income', NOW()),
('67f25e4f-9350-489a-85b8-384613826deb', NULL, 'Grants', '🎓', '#007BFF', 'income', NOW()),
('9339d123-4874-41b4-a020-9555a98ba7f5', NULL, 'Bonuses', '🎉', '#FD7E14', 'income', NOW()),
-- Expense categories
('68d23473-2b6a-404f-8643-0a2b89ff3d15', NULL, 'Food', '🍔', '#FF6B6B', 'expense', NOW()),
('c3c5712a-a9eb-494e-a2b0-131c899ab2fd', NULL, 'Grocery', '🛒', '#007BFF', 'expense', NOW()),
('de94facf-c349-4563-b9d4-a43b1de9f516', NULL, 'Transport', '🚗', '#4ECDC4', 'expense', NOW()),
('714b838b-d58d-42ed-8329-ba50d4d20986', NULL, 'Entertainment', '🎬', '#45B7D1', 'expense', NOW()),
('47d55bd9-0d2b-40b2-a660-af0cf2598c99', NULL, 'Shopping', '🛒', '#96CEB4', 'expense', NOW()),
('9be6d9e2-43c1-44ee-8e89-aed31958ca90', NULL, 'Bills', '📄', '#FFEAA7', 'expense', NOW()),
('0db8b29f-b7cc-4595-9349-c34125ea0b1f', NULL, 'Health', '🏥', '#DDA0DD', 'expense', NOW()),
('7107b00a-3cce-433d-9445-b9300accae02', NULL, 'Education', '📚', '#98D8C8', 'expense', NOW()),
('d2fe4af8-822a-48b4-b670-e40967d40a85', NULL, 'Unknown', '❓', '#95A5A6', 'expense', NOW()),
('6b385201-a7c6-40e1-b68d-f16050fed346', NULL, 'Other', '📦', '#BDC3C7', 'expense', NOW()),
('90e484eb-60d6-4bea-9bde-242539f7605e', NULL, 'Mortgage', '🏠', '#8B4513', 'expense', NOW())
ON CONFLICT ("id") DO NOTHING;
