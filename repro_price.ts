
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.TWELVE_DATA;
console.log(`API Key: '${apiKey}'`);
console.log(`Length: ${apiKey?.length}`);

const BASE_URL = 'https://api.twelvedata.com';
const symbol = 'UNH';
const date = '2025-08-15';

async function fetchPrice() {
    const outputSize = 10;
    // Mimic the service logic
    let url = `${BASE_URL}/time_series?symbol=${symbol}&interval=1day&outputsize=${outputSize}&apikey=${apiKey}`;
    // Add start/end dates to match code logic roughly, or just try the simple fetch
    // The code does: startDate (target-7), endDate (target)

    // Let's just try the exact URL the code would generate
    const targetDate = new Date(date);
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 7);
    const startStr = startDate.toISOString().split('T')[0];

    url += `&start_date=${startStr}&end_date=${date}`;

    console.log(`Fetching URL: ${url}`);

    try {
        const response = await fetch(url.trim()); // fetch might handle space in URL?
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

fetchPrice();
