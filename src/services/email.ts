import { Resend } from 'resend';

type OrderEmailPayload = {
  orderNumber: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  total: number;
  status: string;
};

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY || !process.env.SENDER_EMAIL) {
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
};

const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

const safeSend = async (to: string, subject: string, html: string) => {
  const resend = getResendClient();
  const configuredFrom = process.env.SENDER_EMAIL;
  const from = configuredFrom && configuredFrom.includes('@') ? configuredFrom : 'onboarding@resend.dev';
  if (configuredFrom && /(gmail\.com|yahoo\.com|outlook\.com)$/i.test(configuredFrom.split('@')[1] || '')) {
    console.warn(`SENDER_EMAIL (${configuredFrom}) is likely not a verified domain sender in Resend.`);
  }
  if (!resend || !from) {
    console.warn('Email not sent: RESEND_API_KEY or SENDER_EMAIL is missing.');
    return;
  }

  try {
    const result = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
    });
    if (result?.error) {
      console.error('Resend email error:', result.error);
      return;
    }
    console.info(`Email sent successfully to ${to}. id=${result?.data?.id || 'n/a'}`);
  } catch (error) {
    console.error('Resend email failed:', error);
  }
};

export const sendOrderPlacedEmail = async (payload: OrderEmailPayload) => {
  const orderUrl = `${getFrontendUrl()}/orders`;
  const subject = `Order placed successfully - ${payload.orderNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Thank you for your order, ${payload.customerName || 'Customer'}!</h2>
      <p>Your order <strong>${payload.orderNumber}</strong> has been placed successfully.</p>
      <p><strong>Order Total:</strong> INR ${Number(payload.total || 0).toLocaleString('en-IN')}</p>
      <p><strong>Status:</strong> ${payload.status}</p>
      <p>You can track your order status from your account.</p>
      <p><a href="${orderUrl}" target="_blank" rel="noreferrer">View My Orders</a></p>
      <p style="margin-top: 24px;">Team Shan Decor</p>
    </div>
  `;

  await safeSend(payload.customerEmail, subject, html);
};

export const sendOrderStatusEmail = async (
  payload: Omit<OrderEmailPayload, 'status'> & { oldStatus?: string; newStatus: string },
) => {
  const orderUrl = `${getFrontendUrl()}/orders`;
  const subject = `Order update - ${payload.orderNumber} is now ${payload.newStatus}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Order status updated</h2>
      <p>Hi ${payload.customerName || 'Customer'},</p>
      <p>Your order <strong>${payload.orderNumber}</strong> status has been updated.</p>
      ${payload.oldStatus ? `<p><strong>Previous Status:</strong> ${payload.oldStatus}</p>` : ''}
      <p><strong>Current Status:</strong> ${payload.newStatus}</p>
      <p><strong>Order Total:</strong> INR ${Number(payload.total || 0).toLocaleString('en-IN')}</p>
      <p><a href="${orderUrl}" target="_blank" rel="noreferrer">Track your order</a></p>
      <p style="margin-top: 24px;">Team Shan Decor</p>
    </div>
  `;

  await safeSend(payload.customerEmail, subject, html);
};
