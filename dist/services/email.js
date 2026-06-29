"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendContactAcknowledgementEmail = exports.sendPasswordResetEmail = exports.sendSignupConfirmationEmail = exports.sendPaymentFailedEmail = exports.sendOrderStatusEmail = exports.sendOrderPlacedEmail = void 0;
const resend_1 = require("resend");
const Sentry = __importStar(require("@sentry/node"));
const BRAND = {
    email: 'shandecor01@gmail.com',
    phone: '+91 90033 42466',
    address: '5th Cross Street, Periya Pudur, Salem, Tamil Nadu – 636016',
};
const getResendClient = () => {
    if (!process.env.RESEND_API_KEY || !process.env.SENDER_EMAIL) {
        return null;
    }
    return new resend_1.Resend(process.env.RESEND_API_KEY);
};
const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';
const safeSend = async (to, subject, html) => {
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
            const errMsg = String(result.error?.message || '');
            const statusCode = result.error?.statusCode ?? result.error?.status ?? 0;
            // Resend rejects non-verified / disallowed sender domains with 403 or 422
            const isDomainError = statusCode === 403 ||
                statusCode === 422 ||
                errMsg.toLowerCase().includes('not verified') ||
                errMsg.toLowerCase().includes('domain') ||
                errMsg.toLowerCase().includes('not allowed');
            if (isDomainError && from !== 'onboarding@resend.dev') {
                console.warn(`[Email] Sender domain not allowed for "${from}" — retrying with onboarding@resend.dev`);
                const retry = await resend.emails.send({ from: 'onboarding@resend.dev', to: [to], subject, html });
                if (retry?.error) {
                    Sentry.captureMessage(`Resend fallback error: ${retry.error?.message}`, {
                        level: 'error',
                        tags: { email_type: subject },
                        extra: { error: retry.error },
                    });
                    console.error('[Email] Fallback send failed:', retry.error);
                }
                else {
                    console.info(`[Email] Sent via fallback sender. id=${retry?.data?.id || 'n/a'} to=<redacted>`);
                }
                return;
            }
            Sentry.captureMessage(`Resend error: ${errMsg}`, {
                level: 'error',
                tags: { email_type: subject },
                extra: { error: result.error, statusCode },
            });
            console.error(`[Email] Send failed (status=${statusCode}):`, result.error);
            return;
        }
        console.info(`[Email] Sent successfully. id=${result?.data?.id || 'n/a'}`);
    }
    catch (error) {
        Sentry.captureException(error, { tags: { email_type: subject } });
        console.error('[Email] Unexpected error:', error);
    }
};
const emailLayout = (body) => `
<div style="background-color:#f9f7f2;padding:40px 20px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e0d6;">
    <div style="padding:28px 40px 20px;border-bottom:1px solid #e8e0d6;text-align:center;">
      <a href="https://shandecors.store" style="display:inline-block;">
        <img src="https://qkrcnxrabkmqrnlplagf.supabase.co/storage/v1/object/public/uploads/logos/shandecors_column_logo.png" alt="Shan Decors" style="height:60px;width:auto;display:block;margin:0 auto;" />
      </a>
      <p style="font-size:11px;color:#8b7355;letter-spacing:1px;margin:8px 0 0;font-style:italic;">Nature to Your Hands</p>
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
const orderTable = (orderNumber, total, extra) => `
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
const paymentStatusLabel = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('cod'))
        return 'Cash on Delivery';
    if (normalized === 'completed' || normalized === 'paid')
        return 'Paid';
    if (normalized === 'pending' || normalized === 'processing')
        return 'Awaiting payment';
    if (normalized === 'failed')
        return 'Payment failed';
    return status || 'Pending';
};
/** Reserved for COD / pay-later flows — not used for online checkout (Cashfree). */
const sendOrderPlacedEmail = async (payload) => {
    const paymentLabel = paymentStatusLabel(payload.status);
    const html = emailLayout(`
    <p>Dear ${payload.customerName || 'Customer'},</p>
    <p>Thank you for choosing Shan Decors.</p>
    <p>We've received your order. ${paymentLabel === 'Awaiting payment' ? 'Please complete payment to confirm your order.' : 'Our team will begin preparing it with care.'}</p>
    ${orderTable(payload.orderNumber, payload.total, paymentLabel)}
    <p>If you have any questions regarding your order, feel free to reach out to us anytime at <a href="mailto:${BRAND.email}" style="color:#8b7355;">${BRAND.email}</a>.</p>
    <p>Thank you for supporting handmade craftsmanship and being a part of our journey.</p>
  `);
    const subject = paymentLabel === 'Awaiting payment'
        ? `Your Shan Decors Order — Complete Payment 🌿`
        : `Your Shan Decors Order Has Been Received 🌿`;
    await safeSend(payload.customerEmail, subject, html);
};
exports.sendOrderPlacedEmail = sendOrderPlacedEmail;
const statusEmailContent = (payload) => {
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
const sendOrderStatusEmail = async (payload) => {
    const content = statusEmailContent(payload);
    const html = emailLayout(content.body);
    await safeSend(payload.customerEmail, content.subject, html);
};
exports.sendOrderStatusEmail = sendOrderStatusEmail;
const sendPaymentFailedEmail = async (payload) => {
    const reasonLine = payload.failureReason
        ? `<p style="color:#c0392b;background:#fdf2f2;border-left:3px solid #c0392b;padding:10px 14px;margin:16px 0;font-size:14px;"><strong>Reason:</strong> ${payload.failureReason}</p>`
        : '';
    const html = emailLayout(`
    <p>Dear ${payload.customerName || 'Customer'},</p>
    <p>Unfortunately, we were unable to process your payment for the order below.</p>
    ${orderTable(payload.orderNumber, payload.total)}
    ${reasonLine}
    <p>Your cart has been preserved — you can head back and try again at your convenience.</p>
    <p>If you continue to face issues, please reach out to us at <a href="mailto:support@shandecors.store" style="color:#8b7355;">csupport@shandecors.store</a> or call us at ${BRAND.phone}.</p>
  `);
    await safeSend(payload.customerEmail, `Payment Failed for Your Shan Decors Order`, html);
};
exports.sendPaymentFailedEmail = sendPaymentFailedEmail;
const sendSignupConfirmationEmail = async (email, name, confirmUrl) => {
    const displayName = name || email.split('@')[0];
    const html = emailLayout(`
    <p>Dear ${displayName},</p>
    <p>Welcome to Shan Decors! Thank you for creating an account with us.</p>
    <p>Please confirm your email address to activate your account and start exploring our handcrafted home décor collection.</p>
    <p style="margin:28px 0;text-align:center;">
      <a href="${confirmUrl}" style="display:inline-block;background:#2d2926;color:#ffffff;padding:14px 32px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Confirm Email Address</a>
    </p>
    <p style="font-size:13px;color:#8b7355;">If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${confirmUrl}" style="color:#8b7355;word-break:break-all;">${confirmUrl}</a></p>
    <p style="font-size:13px;color:#bbb;">If you didn't create this account, you can safely ignore this email.</p>
  `);
    await safeSend(email, 'Confirm Your Shan Decors Account 🌿', html);
};
exports.sendSignupConfirmationEmail = sendSignupConfirmationEmail;
const sendPasswordResetEmail = async (email, resetUrl) => {
    const html = emailLayout(`
    <p>Hello,</p>
    <p>We received a request to reset the password for your Shan Decors account.</p>
    <p>Click the button below to choose a new password. This link expires in 24 hours.</p>
    <p style="margin:28px 0;text-align:center;">
      <a href="${resetUrl}" style="display:inline-block;background:#2d2926;color:#ffffff;padding:14px 32px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Reset Password</a>
    </p>
    <p style="font-size:13px;color:#8b7355;">If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${resetUrl}" style="color:#8b7355;word-break:break-all;">${resetUrl}</a></p>
    <p style="font-size:13px;color:#bbb;">If you didn't request a password reset, you can safely ignore this email.</p>
  `);
    await safeSend(email, 'Reset Your Shan Decors Password', html);
};
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const sendContactAcknowledgementEmail = async (name, email) => {
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
exports.sendContactAcknowledgementEmail = sendContactAcknowledgementEmail;
//# sourceMappingURL=email.js.map