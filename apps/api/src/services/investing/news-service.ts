import { investingCache, INVESTING_CACHE_TTL } from '../../lib/investing-cache';

export interface NewsItem {
    title: string;
    description: string;
    link: string;
    pubDate: string;
    category: string;
}

export class NewsService {
    private FEEDS = {
        latest: 'https://finance.yahoo.com/news/rssindex',
        ai: 'https://finance.yahoo.com/rss/technology', // Close enough to AI/Tech
        oil: 'https://finance.yahoo.com/rss/energy',
        medical: 'https://finance.yahoo.com/rss/healthcare',
    };

    private USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    async getNewsByCategory(category: keyof typeof this.FEEDS): Promise<NewsItem[]> {
        const url = this.FEEDS[category];
        if (!url) return [];

        const cacheKey = `news:${category}`;

        return await investingCache.getOrFetch<NewsItem[]>(
            cacheKey,
            async () => {
                try {
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': this.USER_AGENT,
                        },
                    });

                    if (!response.ok) {
                        console.error(`Failed to fetch news for ${category}: ${response.statusText}`);
                        return [];
                    }

                    const xml = await response.text();
                    return this.parseRss(xml, category).slice(0, 20);
                } catch (error) {
                    console.error(`Error fetching news for ${category}:`, error);
                    return [];
                }
            },
            INVESTING_CACHE_TTL.pricesRecent // 15 min cache is fine for news
        );
    }

    async getNewsForTicker(ticker: string): Promise<NewsItem[]> {
        const url = `https://finance.yahoo.com/rss/headline?s=${ticker}`;
        const cacheKey = `news:ticker:${ticker}`;

        return await investingCache.getOrFetch<NewsItem[]>(
            cacheKey,
            async () => {
                try {
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': this.USER_AGENT,
                        },
                    });

                    if (!response.ok) {
                        return [];
                    }

                    const xml = await response.text();
                    // Parse generic RSS, reuse the logic but categorize as 'stock'
                    return this.parseRss(xml, 'stock').slice(0, 20);
                } catch (error) {
                    console.error(`Error fetching news for ${ticker}:`, error);
                    return [];
                }
            },
            INVESTING_CACHE_TTL.pricesRecent
        );
    }

    private parseRss(xml: string, category: string): NewsItem[] {
        const items: NewsItem[] = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            const content = match[1];

            const titleMatch = content.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            const linkMatch = content.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
            const descMatch = content.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
            const dateMatch = content.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/);

            if (titleMatch && linkMatch) {
                let description = descMatch ? descMatch[1] : '';
                // Simple HTML tag removal and truncation for the "hook"
                description = description.replace(/<[^>]*>/g, '').trim();
                if (description.length > 150) {
                    description = description.substring(0, 147) + '...';
                }

                items.push({
                    title: this.decodeEntities(titleMatch[1].trim()),
                    description: this.decodeEntities(description),
                    link: linkMatch[1].trim(),
                    pubDate: dateMatch ? dateMatch[1].trim() : '',
                    category,
                });
            }
        }

        return items;
    }

    private decodeEntities(str: string): string {
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'");
    }
}

export const newsService = new NewsService();
