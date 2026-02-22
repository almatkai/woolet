import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, path.resolve(__dirname, '../../'), '');
    const port = parseInt(env.WEB_PORT || '3000');
    const apiPort = env.PORT || '3006';

    return {
        plugins: [react()],
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
