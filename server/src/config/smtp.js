import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465');
const smtpSecure = process.env.SMTP_SECURE === 'true';

export function createTransport(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required to create SMTP transport');
  }

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: email,
      pass: password
    },
    logger: process.env.NODE_ENV === 'development',
    debug: process.env.NODE_ENV === 'development'
  });

  return transport;
}

export async function verifyTransport(transport) {
  try {
    await transport.verify();
    return { success: true, message: 'SMTP connection verified' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export const smtpConfig = {
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure
};

console.log(`SMTP configured: ${smtpHost}:${smtpPort} (secure: ${smtpSecure})`);
