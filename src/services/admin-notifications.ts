import { Resend } from 'resend';
import getPrismaClient from './database';

const DEFAULT_ADMIN_EMAIL = 'sanjayvihaan111@gmail.com';

export type AdminOrderEventType = 'order_placed' | 'payment_confirmed' | 'payment_failed';

export type AdminOrderItemLine = {
  name: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

export type AdminOrderPayload = {
  event: AdminOrderEventType;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  subtotal: number;
  tax: number;
  shippingFee: number;
  total: number;
  paymentStatus: string;
  paymentMethod?: string;
  items: AdminOrderItemLine[];
  shippingAddress: Record<string, string>;
  billingAddress?: Record<string, string>;
  notes?: string;
  createdAt?: string;
  failureReason?: string;
};

export type AdminAlertPayload = {
  title: string;
  message: string;
  context?: Record<string, string | number | boolean | undefined>;
  severity?: 'warning' | 'error' | 'critical';
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const parseEmailList = (value?: string) => {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes('@'));
};

const getExcludedEmails = (): Set<string> => {
  const excluded = parseEmailList(process.env.ADMIN_NOTIFICATION_EXCLUDE);
  return new Set(excluded.map(normalizeEmail));
};

const shouldUseDbAdmins = () => process.env.ADMIN_NOTIFY_DB_ADMINS !== 'false';

/**
 * Resolves who receives admin emails:
 * 1. Users with role ADMIN in the database (unless ADMIN_NOTIFY_DB_ADMINS=false)
 * 2. Extra addresses from ADMIN_NOTIFICATION_EMAIL (comma-separated)
 * 3. Default fallback if the list would otherwise be empty
 * Minus any address in ADMIN_NOTIFICATION_EXCLUDE (comma-separated)
 */
export const resolveAdminNotificationRecipients = async (): Promise<string[]> => {
  const excluded = getExcludedEmails();
  const seen = new Set<string>();
  const recipients: string[] = [];

  const addEmail = (email: string) => {
    const trimmed = email.trim();
    const normalized = normalizeEmail(trimmed);
    if (!normalized.includes('@')) return;
    if (excluded.has(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    recipients.push(trimmed);
  };

  if (shouldUseDbAdmins()) {
    try {
      const prisma = getPrismaClient();
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { email: true },
      });
      admins.forEach((admin) => addEmail(admin.email));
    } catch (error) {
      console.error('[AdminNotify] Failed to load admin users:', error);
    }
  }

  parseEmailList(process.env.ADMIN_NOTIFICATION_EMAIL).forEach(addEmail);

  if (recipients.length === 0) {
    addEmail(DEFAULT_ADMIN_EMAIL);
  }

  return recipients;
};

const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY || !process.env.SENDER_EMAIL) return null;
  return new Resend(process.env.RESEND_API_KEY);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeTelegramHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const formatInr = (amount: number) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

const eventLabels: Record<AdminOrderEventType, { subject: string; heading: string; emoji: string }> = {
  order_placed: {
    subject: 'New Order Received',
    heading: 'A new order has been placed',
    emoji: '🛒',
  },
  payment_confirmed: {
    subject: 'Order Payment Confirmed',
    heading: 'Payment received — order confirmed',
    emoji: '✅',
  },
  payment_failed: {
    subject: 'Order Payment Failed',
    heading: 'A customer payment attempt failed',
    emoji: '❌',
  },
};

const sendAdminEmail = async (subject: string, html: string): Promise<{ ok: boolean; recipients: string[]; error?: string }> => {
  const resend = getResendClient();
  const configuredFrom = process.env.SENDER_EMAIL;
  const from = configuredFrom && configuredFrom.includes('@') ? configuredFrom : 'onboarding@resend.dev';
  const recipients = await resolveAdminNotificationRecipients();

  if (!resend) {
    console.warn('[AdminNotify] Email skipped — RESEND_API_KEY or SENDER_EMAIL missing');
    return { ok: false, recipients: [], error: 'RESEND_API_KEY or SENDER_EMAIL missing' };
  }

  if (recipients.length === 0) {
    console.warn('[AdminNotify] Email skipped — no recipients after exclusions');
    return { ok: false, recipients: [], error: 'No recipients after exclusions' };
  }

  try {
    const result = await resend.emails.send({
      from,
      to: recipients,
      subject: `[Shan Decors] ${subject}`,
      html,
    });
    if (result?.error) {
      const errMsg = String((result.error as { message?: string })?.message || 'Resend send failed');
      console.error('[AdminNotify] Email failed:', result.error);
      return { ok: false, recipients, error: errMsg };
    }
    console.info(`[AdminNotify] Email sent to ${recipients.length} recipient(s)`);
    return { ok: true, recipients };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Email send error';
    console.error('[AdminNotify] Email error:', error);
    return { ok: false, recipients, error: errMsg };
  }
};

type TelegramSendResult = {
  ok: boolean;
  configured: boolean;
  chatId?: string;
  error?: string;
  messageId?: number;
};

const sendTelegram = async (text: string): Promise<TelegramSendResult> => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    console.warn('[AdminNotify] Telegram skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing');
    return { ok: false, configured: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing' };
  }

  try {
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

    const body = await response.json().catch(() => ({})) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };

    if (!response.ok || !body.ok) {
      const errMsg = body.description || `HTTP ${response.status}`;
      console.error(`[AdminNotify] Telegram failed (${response.status}):`, JSON.stringify(body));
      return { ok: false, configured: true, chatId, error: errMsg };
    }

    console.info(`[AdminNotify] Telegram sent to chat ${chatId} (message_id=${body.result?.message_id ?? 'n/a'})`);
    return { ok: true, configured: true, chatId, messageId: body.result?.message_id };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Telegram send error';
    console.error('[AdminNotify] Telegram error:', error);
    return { ok: false, configured: true, chatId, error: errMsg };
  }
};

const buildContextLines = (context?: AdminAlertPayload['context']) => {
  if (!context) return '';
  return Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `<tr><td style="padding:6px 12px;color:#8b7355;font-size:13px;">${escapeHtml(key)}</td><td style="padding:6px 12px;color:#2d2926;font-size:13px;">${escapeHtml(String(value))}</td></tr>`)
    .join('');
};

const adminEmailLayout = (heading: string, body: string) => `
<div style="background-color:#f9f7f2;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e0d6;">
    <div style="padding:24px 32px;border-bottom:1px solid #e8e0d6;">
      <p style="margin:0;font-size:12px;color:#8b7355;letter-spacing:1px;text-transform:uppercase;">Shan Decors Admin</p>
      <h1 style="margin:8px 0 0;font-size:20px;color:#2d2926;font-weight:normal;">${escapeHtml(heading)}</h1>
    </div>
    <div style="padding:28px 32px;color:#4a4540;font-size:14px;line-height:1.7;">
      ${body}
    </div>
  </div>
</div>
`;

const getShippingAddress = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getString = (value: unknown) => (typeof value === 'string' ? value : '');

const getNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const addressToFields = (value: unknown): Record<string, string> => {
  const raw = getShippingAddress(value);
  const fields: Record<string, string> = {};
  const keys = [
    'full_name',
    'email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postal_code',
    'country',
  ] as const;

  keys.forEach((key) => {
    const val = getString(raw[key]);
    if (val) fields[key] = val;
  });

  return fields;
};

const formatAddressLines = (address: Record<string, string>) => {
  const lines: string[] = [];
  if (address.full_name) lines.push(address.full_name);
  if (address.phone) lines.push(address.phone);
  if (address.email) lines.push(address.email);

  const street = [address.address_line1, address.address_line2].filter(Boolean).join(', ');
  if (street) lines.push(street);

  const locality = [address.city, address.state, address.postal_code].filter(Boolean).join(', ');
  if (locality) lines.push(locality);

  if (address.country) lines.push(address.country);
  return lines;
};

const formatDateIst = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatItemsForTelegram = (items: AdminOrderItemLine[]) =>
  items.map((item) => `  • ${item.name} × ${item.quantity} — ${formatInr(item.lineTotal)}`).join('\n');

const formatItemsForEmail = (items: AdminOrderItemLine[]) => {
  if (!items.length) return '<p>No items listed.</p>';
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0ebe3;">${escapeHtml(item.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0ebe3;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0ebe3;text-align:right;">${escapeHtml(formatInr(item.price))}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0ebe3;text-align:right;">${escapeHtml(formatInr(item.lineTotal))}</td>
        </tr>`,
    )
    .join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <thead>
        <tr style="background:#f9f7f2;">
          <th style="padding:8px 12px;text-align:left;color:#8b7355;font-size:12px;">Item</th>
          <th style="padding:8px 12px;text-align:center;color:#8b7355;font-size:12px;">Qty</th>
          <th style="padding:8px 12px;text-align:right;color:#8b7355;font-size:12px;">Price</th>
          <th style="padding:8px 12px;text-align:right;color:#8b7355;font-size:12px;">Line total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

export const buildOrderAdminPayload = (
  order: {
    id: string;
    orderNumber: string;
    status?: string;
    subtotal?: unknown;
    tax?: unknown;
    shipping?: unknown;
    total: unknown;
    paymentMethod?: string | null;
    paymentStatus: string;
    shippingAddress?: unknown;
    billingAddress?: unknown;
    notes?: string | null;
    createdAt?: Date | string;
    user?: { name?: string | null; email?: string | null; phone?: string | null } | null;
    items?: Array<{ quantity: number; price: unknown; productSnapshot?: unknown }>;
  },
  event: AdminOrderEventType,
  options?: { failureReason?: string },
): AdminOrderPayload => {
  const shippingAddress = addressToFields(order.shippingAddress);
  const billingAddress = addressToFields(order.billingAddress);
  const hasBilling =
    Object.keys(billingAddress).length > 0 &&
    JSON.stringify(billingAddress) !== JSON.stringify(shippingAddress);

  const items = (order.items || []).map((item) => {
    const snapshot = getShippingAddress(item.productSnapshot);
    const name = getString(snapshot.product_name) || 'Item';
    const price = getNumber(item.price);
    const quantity = item.quantity || 1;
    return {
      name,
      quantity,
      price,
      lineTotal: price * quantity,
    };
  });

  return {
    event,
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: String(order.status || 'PENDING'),
    customerName:
      getString(order.user?.name) ||
      shippingAddress.full_name ||
      'Customer',
    customerEmail:
      getString(order.user?.email) ||
      shippingAddress.email ||
      undefined,
    customerPhone:
      getString(order.user?.phone) ||
      shippingAddress.phone ||
      undefined,
    subtotal: getNumber(order.subtotal),
    tax: getNumber(order.tax),
    shippingFee: getNumber(order.shipping),
    total: getNumber(order.total),
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod || undefined,
    items,
    shippingAddress,
    billingAddress: hasBilling ? billingAddress : undefined,
    notes: order.notes || undefined,
    createdAt: order.createdAt
      ? new Date(order.createdAt).toISOString()
      : undefined,
    failureReason: options?.failureReason,
  };
};

const buildOrderEmailBody = (payload: AdminOrderPayload, adminOrderUrl: string) => {
  const placedAt = formatDateIst(payload.createdAt);
  const shippingLines = formatAddressLines(payload.shippingAddress);
  const billingLines = payload.billingAddress ? formatAddressLines(payload.billingAddress) : [];

  const summaryRows = [
    ['Order number', payload.orderNumber],
    ['Order status', payload.orderStatus],
    ['Payment status', payload.paymentStatus],
    payload.paymentMethod ? ['Payment method', payload.paymentMethod] : null,
    placedAt ? ['Placed at', placedAt] : null,
    ['Customer', payload.customerName],
    payload.customerEmail ? ['Email', payload.customerEmail] : null,
    payload.customerPhone ? ['Phone', payload.customerPhone] : null,
    payload.failureReason ? ['Failure reason', payload.failureReason] : null,
  ].filter(Boolean) as Array<[string, string]>;

  const summaryTable = summaryRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;color:#8b7355;font-size:13px;width:150px;border-bottom:1px solid #f0ebe3;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #f0ebe3;">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  const addressBlock = (title: string, lines: string[]) => `
    <h3 style="margin:24px 0 8px;font-size:14px;color:#2d2926;">${escapeHtml(title)}</h3>
    <p style="margin:0;white-space:pre-line;">${escapeHtml(lines.join('\n') || '—')}</p>
  `;

  const totalsTable = `
    <table style="width:100%;max-width:320px;margin:16px 0 0 auto;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#8b7355;">Subtotal</td><td style="padding:6px 0;text-align:right;">${escapeHtml(formatInr(payload.subtotal))}</td></tr>
      <tr><td style="padding:6px 0;color:#8b7355;">Shipping</td><td style="padding:6px 0;text-align:right;">${escapeHtml(formatInr(payload.shippingFee))}</td></tr>
      <tr><td style="padding:6px 0;color:#8b7355;">Tax</td><td style="padding:6px 0;text-align:right;">${escapeHtml(formatInr(payload.tax))}</td></tr>
      <tr><td style="padding:8px 0;font-weight:bold;border-top:1px solid #e8e0d6;">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;border-top:1px solid #e8e0d6;">${escapeHtml(formatInr(payload.total))}</td></tr>
    </table>
  `;

  return `
    <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">${summaryTable}</table>
    ${addressBlock('Shipping address', shippingLines)}
    ${billingLines.length ? addressBlock('Billing address', billingLines) : ''}
    <h3 style="margin:24px 0 8px;font-size:14px;color:#2d2926;">Items</h3>
    ${formatItemsForEmail(payload.items)}
    ${totalsTable}
    ${payload.notes ? `<h3 style="margin:24px 0 8px;font-size:14px;color:#2d2926;">Customer notes</h3><p style="margin:0;">${escapeHtml(payload.notes)}</p>` : ''}
    <p style="margin:24px 0 0;"><a href="${adminOrderUrl}" style="color:#8b7355;">View order in admin panel →</a></p>
  `;
};

const buildOrderTelegramMessage = (payload: AdminOrderPayload, meta: { subject: string; emoji: string }, adminOrderUrl: string) => {
  const placedAt = formatDateIst(payload.createdAt);
  const shippingLines = formatAddressLines(payload.shippingAddress);
  const billingLines = payload.billingAddress ? formatAddressLines(payload.billingAddress) : [];

  const lines = [
    `<b>${meta.emoji} ${escapeTelegramHtml(meta.subject)}</b>`,
    '',
    `<b>Order:</b> ${escapeTelegramHtml(payload.orderNumber)}`,
    `<b>Order status:</b> ${escapeTelegramHtml(payload.orderStatus)}`,
    `<b>Payment:</b> ${escapeTelegramHtml(payload.paymentStatus)}${payload.paymentMethod ? ` (${escapeTelegramHtml(payload.paymentMethod)})` : ''}`,
    placedAt ? `<b>Placed:</b> ${escapeTelegramHtml(placedAt)}` : null,
    '',
    '<b>👤 Customer</b>',
    `<b>Name:</b> ${escapeTelegramHtml(payload.customerName)}`,
    payload.customerEmail ? `<b>Email:</b> ${escapeTelegramHtml(payload.customerEmail)}` : null,
    payload.customerPhone ? `<b>Phone:</b> ${escapeTelegramHtml(payload.customerPhone)}` : null,
    '',
    '<b>📍 Shipping address</b>',
    shippingLines.length
      ? shippingLines.map((line) => escapeTelegramHtml(line)).join('\n')
      : '—',
    billingLines.length ? '' : null,
    billingLines.length ? '<b>📍 Billing address</b>' : null,
    billingLines.length ? billingLines.map((line) => escapeTelegramHtml(line)).join('\n') : null,
    '',
    '<b>📦 Items</b>',
    payload.items.length ? formatItemsForTelegram(payload.items) : '  • No items listed',
    '',
    '<b>💰 Summary</b>',
    `<b>Subtotal:</b> ${escapeTelegramHtml(formatInr(payload.subtotal))}`,
    `<b>Shipping:</b> ${escapeTelegramHtml(formatInr(payload.shippingFee))}`,
    `<b>Tax:</b> ${escapeTelegramHtml(formatInr(payload.tax))}`,
    `<b>Total:</b> ${escapeTelegramHtml(formatInr(payload.total))}`,
    payload.notes ? '' : null,
    payload.notes ? `<b>📝 Notes:</b> ${escapeTelegramHtml(payload.notes)}` : null,
    payload.failureReason ? `<b>❗ Reason:</b> ${escapeTelegramHtml(payload.failureReason)}` : null,
    '',
    `<a href="${adminOrderUrl}">Open in admin panel</a>`,
  ];

  return lines.filter((line) => line !== null).join('\n');
};

export const notifyAdminOrderEvent = async (payload: AdminOrderPayload) => {
  const meta = eventLabels[payload.event];
  const adminOrderUrl = `${getFrontendUrl()}/admin/orders/${payload.orderId}`;

  const emailHtml = adminEmailLayout(meta.heading, buildOrderEmailBody(payload, adminOrderUrl));
  const telegramText = buildOrderTelegramMessage(payload, meta, adminOrderUrl);

  await Promise.all([
    sendAdminEmail(meta.subject, emailHtml),
    sendTelegram(telegramText),
  ]);
};

export const notifyAdminAlert = async (payload: AdminAlertPayload) => {
  const severity = payload.severity || 'error';
  const emoji = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : '🔧';
  const contextRows = buildContextLines(payload.context);
  const contextTable = contextRows
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${contextRows}</table>`
    : '';

  const emailHtml = adminEmailLayout(
    payload.title,
    `<p style="margin:0 0 12px;">${escapeHtml(payload.message)}</p>${contextTable}`,
  );

  const telegramContext = payload.context
    ? Object.entries(payload.context)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `<b>${escapeTelegramHtml(key)}:</b> ${escapeTelegramHtml(String(value))}`)
        .join('\n')
    : '';

  const telegramText = [
    `<b>${emoji} ${escapeTelegramHtml(payload.title)}</b>`,
    '',
    escapeTelegramHtml(payload.message),
    telegramContext ? `\n${telegramContext}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await Promise.all([
    sendAdminEmail(`Alert: ${payload.title}`, emailHtml),
    sendTelegram(telegramText),
  ]);
};

/** Fire-and-forget helper — never throws */
export const notifyAdminOrderEventSafe = (payload: AdminOrderPayload) => {
  notifyAdminOrderEvent(payload).catch((error) =>
    console.error('[AdminNotify] Order event failed (non-fatal):', error),
  );
};

export const notifyAdminAlertSafe = (payload: AdminAlertPayload) => {
  notifyAdminAlert(payload).catch((error) =>
    console.error('[AdminNotify] Alert failed (non-fatal):', error),
  );
};

export type AdminNotificationTestResult = {
  timestamp: string;
  email: { ok: boolean; recipients: string[]; error?: string };
  telegram: TelegramSendResult;
};

/** Send a test admin notification — use from admin API or scripts/test-telegram.js */
export const testAdminNotifications = async (): Promise<AdminNotificationTestResult> => {
  const timestamp = new Date().toISOString();
  const testMessage = [
    '<b>🧪 Shan Decors — Test notification</b>',
    '',
    'If you see this, Telegram admin alerts are working.',
    `<i>${escapeTelegramHtml(timestamp)}</i>`,
  ].join('\n');

  const [email, telegram] = await Promise.all([
    sendAdminEmail('Test notification', adminEmailLayout(
      'Test notification',
      `<p>This is a test email from Shan Decors admin notifications.</p><p>Sent at ${escapeHtml(timestamp)}</p>`,
    )),
    sendTelegram(testMessage),
  ]);

  return { timestamp, email, telegram };
};
