"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const resend_1 = require("resend");
const supabase_js_1 = require("@supabase/supabase-js");
const getResend = () => {
    if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY environment variable is not set');
    }
    return new resend_1.Resend(process.env.RESEND_API_KEY);
};
exports.emailService = {
    async sendPasswordResetEmail(email) {
        try {
            if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
                throw new Error('Supabase credentials not configured');
            }
            const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const { error: supabaseError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${frontendUrl}/reset-password`,
            });
            if (supabaseError) {
                console.error('Supabase reset password error:', supabaseError);
                return { success: false, error: supabaseError.message };
            }
            return { success: true };
        }
        catch (error) {
            console.error('Email service error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
    async sendOrderConfirmationEmail(email, orderNumber, total) {
        try {
            const resend = getResend();
            const { data, error } = await resend.emails.send({
                from: process.env.SENDER_EMAIL || 'noreply@shandecor.in',
                to: [email],
                subject: `Order Confirmed - ${orderNumber} | ShanDecor`,
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Order Confirmed!</h2>
            <p>Thank you for your order.</p>
            <p>Order Number: <strong>${orderNumber}</strong></p>
            <p>Total: <strong>₹${total.toLocaleString()}</strong></p>
            <p>We will notify you once your order is shipped.</p>
            <p>Thanks,<br>ShanDecor Team</p>
          </div>
        `,
            });
            if (error) {
                console.error('Order confirmation email error:', error);
                return { success: false, error: error.message };
            }
            return { success: true, data };
        }
        catch (error) {
            console.error('Email service error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },
};
//# sourceMappingURL=email-service.js.map