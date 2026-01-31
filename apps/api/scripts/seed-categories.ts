
async function main() {
    console.log('ℹ️ Default categories are no longer seeded by code.');
    process.exit(0);
}

main().catch((err) => {
    console.error('Error seeding categories:', err);
    process.exit(1);
});
