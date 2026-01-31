INSERT INTO categories (id, user_id, name, icon, color, type, created_at)
VALUES
    (gen_random_uuid(), NULL, 'Freelance Work', '🖋️', '#FF5733', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Investments', '📈', '#28A745', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Rental Income', '🏠', '#FFC107', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Dividends', '💹', '#17A2B8', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Royalties', '🎵', '#6F42C1', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Gifts', '🎁', '#E83E8C', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Grants', '🎓', '#007BFF', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Refunds', '💵', '#20C997', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Bonuses', '🎉', '#FD7E14', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Savings Interest', '💰', '#6610F2', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Pension', '🧓', '#6C757D', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Scholarships', '🎓', '#17A2B8', 'income', NOW()),
    (gen_random_uuid(), NULL, 'Selling Items', '🛒', '#DC3545', 'income', NOW());
