// Content script for Stripe pages

console.log('Woolet Stripe Parser Loaded');

interface ParsedData {
    name?: string;
    amount?: string;
    cardBrand?: string;
    last4Digits?: string;
    frequency?: string;
    startDate?: string;
    paymentMethod?: string;
}

function parseStripePage() {
    const data: ParsedData = {};

    // Helper to clean text
    const clean = (text: string) => text?.trim().replace(/\s+/g, ' ');

    // --- Scenario 1: "Complete your purchase" Modal (from image) ---
    // Look for "Complete your purchase" header
    const modalHeader = Array.from(document.querySelectorAll('h2, div')).find(el => (el as HTMLElement).innerText?.includes('Complete your purchase'));

    if (modalHeader) {
        // Find container (usually a parent or closest dialog)
        const container = (modalHeader as HTMLElement).closest('[role="dialog"]') || document.body;

        // 1. Name: "Registration fee" - often a label or p above price
        // In the image it is "Registration fee" -> "$5.00" on the same row or close
        const feeLabel = Array.from(container.querySelectorAll('div, span, p')).find(el => (el as HTMLElement).innerText === 'Registration fee');
        if (feeLabel) {
            data.name = 'Registration fee';
        }

        // 2. Price: "$5.00"
        // Look for price pattern in the container
        const priceElement = Array.from(container.querySelectorAll('div, span')).find(el => /^\$\d+\.\d{2}$/.test((el as HTMLElement).innerText?.trim()));
        if (priceElement) {
            data.amount = clean((priceElement as HTMLElement).innerText);
        }

        // 3. Card: "Visa •••• 3362"
        // Look for "Visa" and dots
        const cardElement = Array.from(container.querySelectorAll('div, span')).find(el => {
            const txt = (el as HTMLElement).innerText;
            return txt?.includes('Visa') && txt?.includes('••••');
        });

        if (cardElement) {
            const txt = (cardElement as HTMLElement).innerText;
            data.cardBrand = 'Visa'; // Simplify for now
            const last4 = txt.match(/(\d{4})$/);
            if (last4) data.last4Digits = last4[1];
        }
    }

    // --- Scenario 2: "Pay without Link" Page (from user text) ---
    // Text: "opencode credits" ... "$21.23" ... "Pay without Link"
    const payWithoutLinkBtn = Array.from(document.querySelectorAll('button, a')).find(el => (el as HTMLElement).innerText?.includes('Pay without Link'));

    if (payWithoutLinkBtn || document.body.innerText.includes('Pay without Link')) {
        // This is likely the "Link" authentication page or similar

        // 1. Name: "opencode credits"
        // It seems to be a prominent text. Let's look for large text or specific classes if we knew them.
        // Heuristic: Look for the text before the price?
        // Let's try to find the "opencode credits" text specifically if possible, or assume layout.
        // In the specific example: "US $21.23 ... opencode credits"

        const possibleNames = Array.from(document.querySelectorAll('h1, h2, h3, div')).filter(el => {
            const txt = clean((el as HTMLElement).innerText);
            // Exclude common UI text
            return txt && !['KZ', 'US', 'processing fee'].includes(txt) && txt.length < 30 && /^[a-zA-Z\s]+$/.test(txt);
        });

        // Use first possible name if found
        if (!data.name && possibleNames.length > 0) {
            data.name = clean((possibleNames[0] as HTMLElement).innerText);
        }

        // "opencode credits" might be in this list. 
        // Let's prioritize by proximity to price.

        // 2. Price: "$21.23"
        const priceEl = Array.from(document.querySelectorAll('div, span, h1, h2')).find(el => /^\$\d+\.\d{2}$/.test((el as HTMLElement).innerText?.trim()));
        if (priceEl) {
            data.amount = (priceEl as HTMLElement).innerText.trim();
            // Frequency might not be here if it's a one-time charge or different view
        }

        // Name might be "opencode credits" - detected by user example
        if (document.body.innerText.includes('opencode credits')) {
            data.name = 'opencode credits';
        }
    }

    // --- Scenario 3: General Billing Page Fallback (Existing Logic) ---
    if (!data.name || !data.amount) {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
        const subHeading = headings.find(h => (h as HTMLElement).innerText.includes('Subscription'));
        if (subHeading) data.name = (subHeading as HTMLElement).innerText;

        const elements = document.querySelectorAll('div, span, p, td');
        for (const el of elements) {
            const text = (el as HTMLElement).innerText?.trim();
            if (!text) continue;

            if (!data.amount && /[$€£¥]\s?\d+/.test(text)) {
                if (text.includes('per year') || text.includes('per month')) {
                    const parts = text.split('per');
                    data.amount = parts[0].trim();
                    data.frequency = 'per ' + parts[1].trim();
                }
            }

            if (!data.startDate && (text.includes('Cancels') || text.includes('end on') || text.includes('renews on'))) {
                const dateMatch = text.match(/([A-Z][a-z]+ \d{1,2}(, \d{4})?)/);
                if (dateMatch) data.startDate = dateMatch[0];
            }
        }
    }

    // --- Card Fallback (Global) ---
    if (!data.last4Digits) {
        const elements = document.querySelectorAll('div, span, p');
        for (const el of elements) {
            const text = (el as HTMLElement).innerText?.trim();
            if (text && /••••\s?\d{4}/.test(text)) {
                const match = text.match(/••••\s?(\d{4})/);
                if (match) data.last4Digits = match[1];
                if (text.toLowerCase().includes('visa')) data.cardBrand = 'Visa';
                else if (text.toLowerCase().includes('master')) data.cardBrand = 'MasterCard';
            }
        }
    }

    // --- Google Pay Check ---
    // User asked to handle "google pay".
    // We check if "Google Pay" text exists prominently or as a payment method
    if (document.body.innerText.includes('Google Pay')) {
        data.paymentMethod = 'Google Pay';
        // Note: Google Pay hides real card numbers often, so last4 might not be available
        // or might be a virtual card.
    }

    console.log('Parsed Data:', data);

    if (data.amount || data.last4Digits || (data.name && data.paymentMethod)) {
        // Debounce or check for changes before sending? 
        // For now, just send. receiver handles logic.
        chrome.runtime.sendMessage({
            type: 'SUBSCRIPTION_DETECTED',
            data
        });
    }
}

// Run on load and on mutation (SPA changes)
parseStripePage();

const observer = new MutationObserver(() => {
    parseStripePage();
});

observer.observe(document.body, { childList: true, subtree: true });
