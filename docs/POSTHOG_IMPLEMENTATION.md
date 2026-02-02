# PostHog Implementation Documentation

This document outlines the PostHog integration used for tracking user behavior, feature usage, and technical performance in the Woolet application.

## 🚀 Setup

PostHog is integrated primarily in the `apps/web` client.

### Configuration
- **Location**: [apps/web/src/lib/posthog.ts](../apps/web/src/lib/posthog.ts)
- **Environment Variables**:
  - `VITE_PUBLIC_POSTHOG_KEY`: The project API key.
  - `VITE_PUBLIC_POSTHOG_HOST`: The PostHog instance URL (defaults to `https://us.i.posthog.com`).

### Initialization
PostHog is initialized in the `PostHogProvider` component which wraps the entire application in `main.tsx`.

## 📊 Tracked Behaviors

### 1. User Identification
- Users are identified via their Clerk ID.
- Properties captured: `email`, `fullName`, `username`.
- Identity is reset on logout.

### 2. Navigation & Discovery
- **Pageviews**: Automatically captured on every route change via TanStack Router integration in `PostHogPageviewTracker`.
- **Most Used Modules**: Tracked through path analysis in the PostHog dashboard.

### 3. Financial Module Usage
- **Accounts**:
  - `accounts_viewed`: Captured when visiting the Accounts page.
  - Person Properties: `bank_count`, `account_count`.
- **Investing**:
  - Portfolio summary loading events.
- **Spending**:
  - `spending_viewed`: Captured when visiting the Spending page.
  - `transaction_added`: Details of new transactions (type, amount, split status).
  - `shortcut_opened`: Tracked when a user uses a spending shortcut.
  - Person Properties: `total_shortcuts_count`, `favorite_shortcuts_count`.

### 4. AI & LLM Engagement
- `ai_digest_loaded`: Tracked when the AI Market Insight Digest is displayed.
- `ai_message_sent`: Tracked when a user interacts with the Woo AI chat.
  - Captured properties: `session_id`, `message_length`.

### 5. Personalization & Preferences
- **Theme**: `theme_changed` event plus a persistent `theme` person property (Tracks `light`, `dark`, or `super-dark`).
- **Currency**: Captured as a person property based on user settings.

### 6. Technical Context
PostHog automatically captures:
- **Browser**: Chrome, Safari, Firefox, etc.
- **Device**: Desktop, Mobile, Tablet.
- **Location**: Country/Region/City (via IP, anonymized based on project settings).

## 🛠 Adding New Events

To track new events, use the `posthog` instance from `posthog-js`:

```typescript
import posthog from 'posthog-js';

posthog.capture('event_name', {
    property_key: 'property_value'
});
```
