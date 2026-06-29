#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Test admin Telegram + email notifications without placing an order.
 *
 * Usage (from backend/):
 *   node scripts/test-telegram.js
 *
 * Requires in .env:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   RESEND_API_KEY, SENDER_EMAIL (for email part of test)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  console.log('--- Shan Decors notification test ---\n');

  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not set in backend/.env');
    process.exit(1);
  }
  if (!chatId) {
    console.error('❌ TELEGRAM_CHAT_ID is not set in backend/.env');
    console.error('   1. Message your bot /start in Telegram');
    console.error('   2. Open: https://api.telegram.org/bot<TOKEN>/getUpdates');
    console.error('   3. Copy chat.id into TELEGRAM_CHAT_ID');
    process.exit(1);
  }

  console.log(`Telegram chat id: ${chatId}`);
  console.log('Sending test message...\n');

  const text = [
    '🧪 <b>Shan Decors — Test notification</b>',
    '',
    'If you see this, Telegram admin alerts are working.',
    `<i>${new Date().toISOString()}</i>`,
  ].join('\n');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const body = await response.json();

  if (!response.ok || !body.ok) {
    console.error('❌ Telegram failed:', body.description || response.status);
    if (body.description === 'Bad Request: chat not found') {
      console.error('\nTips:');
      console.error('  • Send /start to your bot first');
      console.error('  • Double-check TELEGRAM_CHAT_ID from getUpdates');
      console.error('  • For groups, use the negative group id');
    }
    process.exit(1);
  }

  console.log('✅ Telegram message sent');
  console.log(`   message_id: ${body.result?.message_id}`);
  console.log('\nCheck your Telegram chat for the test message.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
