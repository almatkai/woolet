export interface EmailMessage {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
}

function parseBool(value: string | undefined, defaultValue = false): boolean {
    if (value === undefined) return defaultValue;
    return value === 'true' || value === '1';
}

function getSmtpConfig(): SmtpConfig | null {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || '587');
    const secure = parseBool(process.env.SMTP_SECURE, port === 465);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
        return null;
    }

    const fromEmail = process.env.SMTP_FROM_EMAIL || user;
    const fromName = process.env.SMTP_FROM_NAME || 'Woolet';

    return {
        host,
        port,
        secure,
        user,
        pass,
        from: `${fromName} <${fromEmail}>`,
    };
}

export function isSmtpConfigured(): boolean {
    return !!getSmtpConfig();
}

export async function sendEmailNotification(message: EmailMessage): Promise<boolean> {
    const config = getSmtpConfig();
    if (!config) {
        console.warn('SMTP not configured - skipping email notification');
        return false;
    }

    try {
        const modName = 'nodemailer';
        const nodemailer = await import(modName as string);
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.pass,
            },
        } as any);

        await transporter.sendMail({
            from: config.from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html || `<p>${message.text}</p>`,
        });

        return true;
    } catch (error) {
        console.error('Failed to send SMTP email notification:', error);
        return false;
    }
}
