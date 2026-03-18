require('./setup');
const request = require('supertest');
const app = require('./app');
const User = require('../src/models/User');
const Partner = require('../src/models/Partner');
const Admin = require('../src/models/Admin');

describe('Auth API', () => {
  // ─── User Registration ───────────────────────────────────────────────

  describe('POST /api/auth/user/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Test User',
          email: 'testuser@test.com',
          phone: '9876543210',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('testuser@test.com');
      expect(res.body.data.user.name).toBe('Test User');
    });

    it('should reject duplicate email', async () => {
      await User.create({
        name: 'Existing User',
        email: 'duplicate@test.com',
        phone: '9876543211',
        password: 'password123',
      });

      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Another User',
          email: 'duplicate@test.com',
          phone: '9876543212',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject duplicate phone', async () => {
      await User.create({
        name: 'Existing User',
        email: 'existing@test.com',
        phone: '9876543211',
        password: 'password123',
      });

      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Another User',
          email: 'another@test.com',
          phone: '9876543211',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Test User',
          email: 'not-an-email',
          phone: '9876543210',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          phone: '9876543210',
          password: '12345',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid phone (non-10 digits)', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          phone: '12345',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/user/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── User Login ───────────────────────────────────────────────────────

  describe('POST /api/auth/user/login', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Login User',
        email: 'login@test.com',
        phone: '9876543210',
        password: 'password123',
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({ email: 'login@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('login@test.com');
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({ email: 'login@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid/i);
    });

    it('should reject nonexistent user', async () => {
      const res = await request(app)
        .post('/api/auth/user/login')
        .send({ email: 'nobody@test.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject blocked user', async () => {
      await User.findOneAndUpdate(
        { email: 'login@test.com' },
        { isBlocked: true }
      );

      const res = await request(app)
        .post('/api/auth/user/login')
        .send({ email: 'login@test.com', password: 'password123' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/blocked/i);
    });

    it('should reject deleted user', async () => {
      await User.findOneAndUpdate(
        { email: 'login@test.com' },
        { isDeleted: true }
      );

      const res = await request(app)
        .post('/api/auth/user/login')
        .send({ email: 'login@test.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Partner Registration ─────────────────────────────────────────────

  describe('POST /api/auth/partner/register', () => {
    it('should register a new partner', async () => {
      const res = await request(app)
        .post('/api/auth/partner/register')
        .send({
          name: 'Test Partner',
          email: 'partner@test.com',
          phone: '9876543210',
          password: 'password123',
          city: 'Mumbai',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.partner.email).toBe('partner@test.com');
      expect(res.body.data.partner.status).toBe('pending');
    });

    it('should reject duplicate partner email', async () => {
      await Partner.create({
        name: 'Existing Partner',
        email: 'partner@test.com',
        phone: '9876543211',
        password: 'password123',
        city: 'Mumbai',
      });

      const res = await request(app)
        .post('/api/auth/partner/register')
        .send({
          name: 'New Partner',
          email: 'partner@test.com',
          phone: '9876543212',
          password: 'password123',
          city: 'Delhi',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing city', async () => {
      const res = await request(app)
        .post('/api/auth/partner/register')
        .send({
          name: 'Test Partner',
          email: 'partner@test.com',
          phone: '9876543210',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Partner Login ────────────────────────────────────────────────────

  describe('POST /api/auth/partner/login', () => {
    beforeEach(async () => {
      await Partner.create({
        name: 'Login Partner',
        email: 'loginpartner@test.com',
        phone: '9876543210',
        password: 'password123',
        city: 'Mumbai',
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/partner/login')
        .send({ email: 'loginpartner@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.partner.email).toBe('loginpartner@test.com');
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/partner/login')
        .send({ email: 'loginpartner@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject suspended partner', async () => {
      await Partner.findOneAndUpdate(
        { email: 'loginpartner@test.com' },
        { isActive: false }
      );

      const res = await request(app)
        .post('/api/auth/partner/login')
        .send({ email: 'loginpartner@test.com', password: 'password123' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/suspended/i);
    });
  });

  // ─── Admin Login ──────────────────────────────────────────────────────

  describe('POST /api/auth/admin/login', () => {
    beforeEach(async () => {
      await Admin.create({
        email: 'admin@vehiclean.com',
        password: 'admin123',
        name: 'Admin',
      });
    });

    it('should login as admin with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/admin/login')
        .send({ email: 'admin@vehiclean.com', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.admin.email).toBe('admin@vehiclean.com');
    });

    it('should reject wrong admin password', async () => {
      const res = await request(app)
        .post('/api/auth/admin/login')
        .send({ email: 'admin@vehiclean.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject nonexistent admin email', async () => {
      const res = await request(app)
        .post('/api/auth/admin/login')
        .send({ email: 'nobody@admin.com', password: 'admin123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Forgot Password ─────────────────────────────────────────────────

  describe('POST /api/auth/forgot-password', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Forgot User',
        email: 'forgot@test.com',
        phone: '9876543210',
        password: 'password123',
      });
    });

    it('should send OTP for existing user email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'forgot@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('forgot@test.com');

      // Verify OTP was saved in the database
      const user = await User.findOne({ email: 'forgot@test.com' });
      expect(user.resetOtp).toBeDefined();
      expect(user.resetOtpExpires).toBeDefined();
    });

    it('should return 404 for nonexistent email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@test.com' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should send OTP for partner role', async () => {
      await Partner.create({
        name: 'Partner Forgot',
        email: 'partnerforgot@test.com',
        phone: '9876543211',
        password: 'password123',
        city: 'Mumbai',
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'partnerforgot@test.com', role: 'partner' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Reset Password ──────────────────────────────────────────────────

  describe('POST /api/auth/reset-password', () => {
    let savedOtp;

    beforeEach(async () => {
      const user = await User.create({
        name: 'Reset User',
        email: 'reset@test.com',
        phone: '9876543210',
        password: 'oldpassword',
      });

      // Simulate forgot-password: set OTP directly
      savedOtp = '123456';
      user.resetOtp = savedOtp;
      user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save({ validateModifiedOnly: true });
    });

    it('should reset password with valid OTP', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'reset@test.com',
          otp: savedOtp,
          newPassword: 'newpassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify new password works
      const loginRes = await request(app)
        .post('/api/auth/user/login')
        .send({ email: 'reset@test.com', password: 'newpassword123' });
      expect(loginRes.status).toBe(200);
    });

    it('should reject invalid OTP', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'reset@test.com',
          otp: '999999',
          newPassword: 'newpassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid|expired/i);
    });

    it('should reject expired OTP', async () => {
      // Set OTP to be already expired
      await User.findOneAndUpdate(
        { email: 'reset@test.com' },
        { resetOtpExpires: new Date(Date.now() - 1000) }
      );

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'reset@test.com',
          otp: savedOtp,
          newPassword: 'newpassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Get Profile ──────────────────────────────────────────────────────

  describe('GET /api/auth/profile', () => {
    it('should return profile for authenticated user', async () => {
      const registerRes = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Profile User',
          email: 'profile@test.com',
          phone: '9876543210',
          password: 'password123',
        });

      const token = registerRes.body.data.token;

      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('profile@test.com');
      expect(res.body.data.password).toBeUndefined();
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/profile');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token-here');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return partner profile', async () => {
      const registerRes = await request(app)
        .post('/api/auth/partner/register')
        .send({
          name: 'Profile Partner',
          email: 'profilepartner@test.com',
          phone: '9876543210',
          password: 'password123',
          city: 'Mumbai',
        });

      const token = registerRes.body.data.token;

      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('profilepartner@test.com');
    });
  });

  // ─── Change Password ─────────────────────────────────────────────────

  describe('POST /api/auth/change-password', () => {
    let token;

    beforeEach(async () => {
      const registerRes = await request(app)
        .post('/api/auth/user/register')
        .send({
          name: 'Change PW User',
          email: 'changepw@test.com',
          phone: '9876543210',
          password: 'oldpassword',
        });
      token = registerRes.body.data.token;
    });

    it('should change password with correct current password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify new password works
      const loginRes = await request(app)
        .post('/api/auth/user/login')
        .send({ email: 'changepw@test.com', password: 'newpassword' });
      expect(loginRes.status).toBe(200);
    });

    it('should reject wrong current password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/incorrect/i);
    });

    it('should reject without authentication', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject short new password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'oldpassword',
          newPassword: '12345',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
