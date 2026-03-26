const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for admin operations
);

async function createAdminUser() {
  try {
    // Create admin user
    const { data: { user }, error } = await supabase.auth.admin.createUser({
      email: 'admin@shandecor.com',
      password: 'admin123456',
      email_confirm: true,
      user_metadata: {
        name: 'Admin User',
        role: 'ADMIN',
      },
    });

    if (error) {
      console.error('Error creating admin user:', error);
      return;
    }

    console.log('Admin user created successfully:', user);
    
    // Confirm the user's email
    const { error: confirmError } = await supabase.auth.admin.updateUserById(
      user.id,
      { email_confirm: true }
    );

    if (confirmError) {
      console.error('Error confirming admin email:', confirmError);
    } else {
      console.log('Admin email confirmed successfully');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

createAdminUser();
