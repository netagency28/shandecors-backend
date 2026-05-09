import { Resend } from 'resend';

type OrderEmailPayload = {
  orderNumber: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  total: number;
  status: string;
};

const BRAND = {
  email: 'shandecor01@gmail.com',
  phone: '+91 94420 42466',
  address: '5th Cross Street, Periya Pudur, Salem, Tamil Nadu – 636016',
} as const;

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
    const result = await resend.emails.send({ from, to: [to], subject, html });
    if (result?.error) {
      const isDomainError = (result.error as any)?.statusCode === 403 || String((result.error as any)?.message).includes('not verified');
      if (isDomainError && from !== 'onboarding@resend.dev') {
        console.warn(`Domain not verified for ${from}, retrying with onboarding@resend.dev`);
        const retry = await resend.emails.send({ from: 'onboarding@resend.dev', to: [to], subject, html });
        if (retry?.error) {
          console.error('Resend email error (fallback):', retry.error);
        } else {
          console.info(`Email sent (fallback) to ${to}. id=${retry?.data?.id || 'n/a'}`);
        }
        return;
      }
      console.error('Resend email error:', result.error);
      return;
    }
    console.info(`Email sent successfully to ${to}. id=${result?.data?.id || 'n/a'}`);
  } catch (error) {
    console.error('Resend email failed:', error);
  }
};

const emailLayout = (body: string) => `
<div style="background-color:#f9f7f2;padding:40px 20px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e0d6;">
    <div style="padding:28px 40px 20px;border-bottom:1px solid #e8e0d6;text-align:center;">
      <p style="font-size:20px;letter-spacing:3px;color:#2d2926;margin:0;font-weight:normal;">SHAN DECORS</p>
      <p style="font-size:11px;color:#8b7355;letter-spacing:1px;margin:5px 0 0;font-style:italic;">Nature to Your Hands</p>
    </div>
    <div style="padding:32px 40px;color:#4a4540;font-size:15px;line-height:1.8;">
      ${body}
    </div>
    <div style="padding:20px 40px 28px;border-top:1px solid #e8e0d6;">
      <p style="color:#8b7355;font-size:13px;margin:0;">Warm regards,</p>
      <p style="color:#2d2926;font-size:14px;margin:5px 0 2px;letter-spacing:1px;">SHAN DECORS</p>
      <p style="color:#8b7355;font-size:12px;margin:0;font-style:italic;">Nature to Your Hands 🌿</p>
      <p style="color:#bbb;font-size:11px;margin:14px 0 0;">${BRAND.email} &nbsp;|&nbsp; ${BRAND.phone}</p>
      <p style="color:#bbb;font-size:10px;margin:3px 0 0;">${BRAND.address}</p>
    </div>
  </div>
</div>
`;

const orderTable = (orderNumber: string, total: number, extra?: string) => `
  <table style="margin:24px 0;border-collapse:collapse;width:100%;border:1px solid #e8e0d6;">
    <tr style="background:#f9f7f2;">
      <td style="padding:10px 14px;color:#8b7355;font-size:13px;width:150px;border-bottom:1px solid #e8e0d6;">Order Number</td>
      <td style="padding:10px 14px;font-weight:bold;color:#2d2926;border-bottom:1px solid #e8e0d6;">${orderNumber}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;color:#8b7355;font-size:13px;width:150px;">Order Total</td>
      <td style="padding:10px 14px;font-weight:bold;color:#2d2926;">&#x20B9;${Number(total || 0).toLocaleString('en-IN')}</td>
    </tr>
    ${extra ? `<tr style="background:#f9f7f2;"><td style="padding:10px 14px;color:#8b7355;font-size:13px;border-top:1px solid #e8e0d6;">Payment</td><td style="padding:10px 14px;font-weight:bold;color:#2d2926;border-top:1px solid #e8e0d6;">${extra}</td></tr>` : ''}
  </table>
`;

export const sendOrderPlacedEmail = async (payload: OrderEmailPayload) => {
  const paymentLabel = String(payload.status).toLowerCase().includes('cod') ? 'Cash on Delivery' : 'Paid';
  const html = emailLayout(`
    <p>Dear ${payload.customerName || 'Customer'},</p>
    <p>Thank you for choosing Shan Decors.</p>
    <p>We're delighted to let you know that your order has been successfully placed and is now being prepared with care by our team.</p>
    ${orderTable(payload.orderNumber, payload.total, paymentLabel)}
    <p>As every piece is thoughtfully handcrafted, your order will now move into processing and preparation. We'll keep you updated throughout the journey via email, SMS, and WhatsApp.</p>
    <p>If you have any questions regarding your order, feel free to reach out to us anytime at <a href="mailto:${BRAND.email}" style="color:#8b7355;">${BRAND.email}</a>.</p>
    <p>Thank you for supporting handmade craftsmanship and being a part of our journey.</p>
  `);
  await safeSend(payload.customerEmail, `Your Shan Decors Order Has Been Confirmed 🌿`, html);
};

const statusEmailContent = (
  payload: Omit<OrderEmailPayload, 'status'> & { oldStatus?: string; newStatus: string },
): { subject: string; body: string } => {
  const { customerName, orderNumber, newStatus, total } = payload;
  const name = customerName || 'Customer';
  const ordersUrl = `${getFrontendUrl()}/orders`;
  const table = orderTable(orderNumber, total);
  const viewLink = `<p style="margin-top:8px;"><a href="${ordersUrl}" style="color:#8b7355;font-size:14px;">View My Orders →</a></p>`;

  switch (newStatus) {
    case 'confirmed':
      return {
        subject: `Your Shan Decors Order Has Been Confirmed 🌿`,
        body: `
          <p>Dear ${name},</p>
          <p>Your Shan Decors order has been confirmed and is now being prepared with care by our team.</p>
          ${table}
          <p>We'll notify you again once your order has been dispatched.</p>
          ${viewLink}
        `,
      };

    case 'processing':
      return {
        subject: `Your Order is Being Prepared ✨`,
        body: `
          <p>Dear ${name},</p>
          <p>Your Shan Decors order <strong>${orderNumber}</strong> is currently being processed and carefully prepared by our team.</p>
          <p>As each product is handcrafted with intention and attention to detail, this stage ensures your piece is made and packed with the care it deserves.</p>
          ${table}
          <p>We'll notify you again once your order has been dispatched.</p>
          ${viewLink}
        `,
      };

    case 'shipped':
      return {
        subject: `Your Shan Decors Order Has Been Dispatched 📦`,
        body: `
          <p>Dear ${name},</p>
          <p>Good news — your Shan Decors order <strong>${orderNumber}</strong> has been successfully dispatched and is now on its way to you.</p>
          <p>Your handcrafted piece has been carefully packed and handed over for delivery with utmost care and attention.</p>
          ${table}
          <p>You will continue to receive updates regarding your order journey through email, SMS, and WhatsApp.</p>
          <p>Thank you for your patience and for supporting handmade craftsmanship.</p>
        `,
      };

    case 'out_for_delivery':
      return {
        subject: `Your Order is Out for Delivery 🌿`,
        body: `
          <p>Dear ${name},</p>
          <p>Your Shan Decors order <strong>${orderNumber}</strong> is out for delivery and will be reaching you soon.</p>
          <p>We hope your handcrafted piece brings warmth, beauty, and character into your space. Please ensure someone is available to receive the order at the delivery address.</p>
          ${table}
          <p>If you face any issues regarding delivery, feel free to reach out to us at <a href="mailto:${BRAND.email}" style="color:#8b7355;">${BRAND.email}</a>.</p>
        `,
      };

    case 'delivered':
      return {
        subject: `Your Shan Decors Order Has Been Delivered ✨`,
        body: `
          <p>Dear ${name},</p>
          <p>Your Shan Decors order <strong>${orderNumber}</strong> has been successfully delivered.</p>
          <p>We truly hope your handcrafted piece adds warmth, meaning, and elegance to your home. Thank you for trusting us and supporting a growing brand rooted in craftsmanship and thoughtful design.</p>
          ${table}
          <p>If you have a moment, we would love to hear your feedback and experience with your order.</p>
          <p>Thank you once again for being a part of our journey.</p>
        `,
      };

    case 'cancelled':
      return {
        subject: `Update on Your Shan Decors Order`,
        body: `
          <p>Dear ${name},</p>
          <p>We're writing to let you know that your Shan Decors order <strong>${orderNumber}</strong> has been cancelled.</p>
          ${table}
          <p>If you have any questions or would like to place a new order, please don't hesitate to reach out at <a href="mailto:${BRAND.email}" style="color:#8b7355;">${BRAND.email}</a>.</p>
        `,
      };

    default:
      return {
        subject: `Update on Your Shan Decors Order`,
        body: `
          <p>Dear ${name},</p>
          <p>Your Shan Decors order <strong>${orderNumber}</strong> has been updated.</p>
          ${table}
          ${viewLink}
        `,
      };
  }
};

export const sendOrderStatusEmail = async (
  payload: Omit<OrderEmailPayload, 'status'> & { oldStatus?: string; newStatus: string },
) => {
  const content = statusEmailContent(payload);
  const html = emailLayout(content.body);
  await safeSend(payload.customerEmail, content.subject, html);
};

export const sendPaymentFailedEmail = async (payload: Omit<OrderEmailPayload, 'status'>) => {
  const html = emailLayout(`
    <p>Dear ${payload.customerName || 'Customer'},</p>
    <p>Unfortunately, we were unable to process your payment for the order below.</p>
    ${orderTable(payload.orderNumber, payload.total)}
    <p>Your cart has been preserved — you can head back and try again at your convenience.</p>
    <p>If you continue to face issues, please reach out to us at <a href="mailto:${BRAND.email}" style="color:#8b7355;">${BRAND.email}</a> or call us at ${BRAND.phone}.</p>
  `);
  await safeSend(payload.customerEmail, `Payment Failed for Your Shan Decors Order`, html);
};

export const sendContactAcknowledgementEmail = async (name: string, email: string) => {
  const html = emailLayout(`
    <p>Dear ${name},</p>
    <p>Thank you for reaching out to Shan Decors. We have successfully received your message, and our team will get back to you as soon as possible.</p>
    <p>We truly appreciate your interest in our handcrafted creations and your patience while we review your enquiry.</p>
    <p>Our typical response time is within one business day. For urgent queries, feel free to reach us directly at <a href="mailto:${BRAND.email}" style="color:#8b7355;">${BRAND.email}</a> or call us at ${BRAND.phone}.</p>
    <p style="margin-top:20px;"><strong>Support Hours</strong><br>
    Monday – Friday: 10:00 AM – 7:00 PM (IST)<br>
    Saturday: 11:00 AM – 5:00 PM (IST)</p>
  `);
  await safeSend(email, `Thank you for reaching out to Shan Decors 🌿`, html);
};
