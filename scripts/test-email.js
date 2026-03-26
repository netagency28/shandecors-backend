#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const { Resend } = require('resend');

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  const to = process.argv[2] || from;

  if (!apiKey) {
    console.error('Missing RESEND_API_KEY in backend/.env');
    process.exit(1);
  }

  if (!to) {
    console.error('Pass recipient email: node scripts/test-email.js you@example.com');
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [to],
    subject: 'Shan Decor - Resend test email',
    html: '<p>This is a test email from Shan Decor backend.</p>',
  });

  if (result?.error) {
    console.error('Resend API error:', result.error);
    process.exit(1);
  }

  console.log('Email sent:', result.data);
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message || err);
  process.exit(1);
});

