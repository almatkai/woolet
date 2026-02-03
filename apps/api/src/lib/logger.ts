import pino from 'pino';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
        env: process.env.NODE_ENV,
        service: 'woolet-api',
    },
    redact: {
        paths: [
            'password',
            'token',
            'authorization',
            'headers.authorization',
            'cookie',
            'headers.cookie',
            'email',
            'clerk_secret_key',
            'database_url',
        ],
        remove: true,
    },
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});
