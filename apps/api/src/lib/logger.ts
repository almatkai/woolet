import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';

const logLevel = process.env.LOG_LEVEL || 'trace';
const logDir = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');
const logFilePath = process.env.LOG_FILE_PATH || path.join(logDir, 'api.log');

fs.mkdirSync(logDir, { recursive: true });

const fileDestination = pino.destination({
    dest: logFilePath,
    sync: true,
    mkdir: true,
});

const stdoutDestination = pino.destination({
    fd: 1,
    sync: false,
});

export const logger = pino({
    level: logLevel,
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
}, pino.multistream([
    { stream: stdoutDestination },
    { stream: fileDestination },
]));

logger.info({
    event: 'logger.initialized',
    logLevel,
    logFilePath,
});
