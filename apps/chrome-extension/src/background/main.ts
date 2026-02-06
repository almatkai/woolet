// Background service worker
console.log('Woolet Background Service Worker Started');

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'SUBSCRIPTION_DETECTED') {
        console.log('Subscription detected:', message.data);
        // TODO: Store in local storage or Badge text
        chrome.action.setBadgeText({ text: '1', tabId: sender.tab?.id });
        chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });

        // Save to storage to read from popup
        chrome.storage.local.set({
            [`detected_sub_${sender.tab?.id}`]: message.data
        });
    }
});
