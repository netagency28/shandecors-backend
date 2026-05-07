// Mock authentication for development when Supabase is not available
export const mockUsers = [
  {
    id: 'mock-user-1',
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
    role: 'CUSTOMER'
  },
  {
    id: 'mock-admin-1',
    email: 'admin@example.com',
    password: 'admin123',
    name: 'Admin User',
    role: 'ADMIN'
  }
];

export const mockAuth = {
  async signIn(email: string, password: string) {
    const user = mockUsers.find(u => u.email === email && u.password === password);
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    return {
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { name: user.name }
      },
      session: {
        access_token: 'mock-token-' + Date.now(),
        refresh_token: 'mock-refresh-' + Date.now(),
        user: {
          id: user.id,
          email: user.email,
          user_metadata: { name: user.name }
        }
      }
    };
  },

  async signUp(email: string, password: string, name?: string) {
    if (mockUsers.find(u => u.email === email)) {
      throw new Error('User already exists');
    }

    const newUser = {
      id: 'mock-user-' + Date.now(),
      email,
      password,
      name: name || 'New User',
      role: 'CUSTOMER'
    };

    mockUsers.push(newUser);

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        user_metadata: { name: newUser.name }
      },
      session: {
        access_token: 'mock-token-' + Date.now(),
        refresh_token: 'mock-refresh-' + Date.now(),
        user: {
          id: newUser.id,
          email: newUser.email,
          user_metadata: { name: newUser.name }
        }
      }
    };
  },

  async resetPasswordForEmail(email: string) {
    // For mock system, accept any email and simulate success
    // In real app, would check if user exists and send email
    console.log(`Mock: Password reset requested for ${email}`);
    return { data: {}, error: null };
  }
};
