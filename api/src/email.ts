import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// dev mode: no verified domain yet, so the sender must be onboarding@resend.dev
// and Resend only delivers to the inbox that owns the API key
const FROM = 'onchain-stripe <onboarding@resend.dev>';

export async function sendEmail(to: string, subject: string, html: string) {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) throw new Error(`resend: ${error.message}`);
}
