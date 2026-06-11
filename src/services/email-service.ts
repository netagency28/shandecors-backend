import { getSupabaseAdminClient } from './auth-service';
import { sendPasswordResetEmail as sendPasswordResetViaResend } from './email';

const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

export const emailService = {
  async sendPasswordResetEmail(email: string) {
    try {
      const admin = getSupabaseAdminClient();
      const frontendUrl = getFrontendUrl();

      if (!admin) {
        console.error('Password reset requires SUPABASE_SERVICE_ROLE_KEY');
        return { success: false, error: 'Email service is not configured' };
      }

      const { data, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${frontendUrl}/reset-password` },
      });

      if (linkError) {
        console.error('Supabase generateLink (recovery) error:', linkError);
        return { success: false, error: linkError.message || 'Could not generate reset link' };
      }

      const resetUrl = data?.properties?.action_link;
      if (!resetUrl) {
        return { success: false, error: 'Failed to generate reset link' };
      }

      await sendPasswordResetViaResend(email, resetUrl);
      return { success: true };
    } catch (error) {
      console.error('Email service error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
