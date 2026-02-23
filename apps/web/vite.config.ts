import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, path.resolve(__dirname, '../../'), '');
    const port = parseInt(env.WEB_PORT || '3000');
    const apiPort = env.PORT || '3006';

    return {
        plugins: [
            react(),
            VitePWA({
                registerType: 'autoUpdate',
                includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
                manifest: {
                    name: 'Woolet - Money Tracker',
                    short_name: 'Woolet',
                    description: 'Track your spending, debts, and financial products',
                    theme_color: '#0f172a',
                    background_color: '#0f172a',
                    display: 'standalone',
                    orientation: 'portrait',
                    scope: '/',
                    start_url: '/',
                    icons: [
                        {
                            src: '/android-chrome-192x192.png',
                            sizes: '192x192',
                            type: 'image/png',
                        },
                        {
                            src: '/android-chrome-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                        },
                        {
                            src: '/android-chrome-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any maskable',
                        },
                    ],
                },
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                    runtimeCaching: [
                        {
                            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'google-fonts-cache',
                                expiration: {
                                    maxEntries: 10,
                                    maxAgeSeconds: 60 * 60 * 24 * 365,
                                },
                                cacheableResponse: {
                                    statuses: [0, 200],
                                },
                            },
                        },
                        {
                            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'gstatic-fonts-cache',
                                expiration: {
                                    maxEntries: 10,
                                    maxAgeSeconds: 60 * 60 * 24 * 365,
                                },
                                cacheableResponse: {
                                    statuses: [0, 200],
                                },
                            },
                        },
                    ],
                },
            }),
        ],
        envDir: '../../',
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        optimizeDeps: {
            include: ['react-grid-layout'],
        },
        server: {
            port: port,
            proxy: {
                '/trpc': {
                    target: `http://localhost:${apiPort}`,
                    changeOrigin: true,
                },
            },
        },
    };
});
