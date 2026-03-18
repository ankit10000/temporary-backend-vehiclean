require('./setup');
const request = require('supertest');
const app = require('./app');
const Admin = require('../src/models/Admin');
const User = require('../src/models/User');
const Partner = require('../src/models/Partner');
const Service = require('../src/models/Service');
const Booking = require('../src/models/Booking');
const Car = require('../src/models/Car');
const PromoCode = require('../src/models/PromoCode');
const Withdrawal = require('../src/models/Withdrawal');
const { generateToken } = require('../src/utils/jwt');

/**
 * Helper: create an admin and return { admin, token }
 */
async function createAdmin(overrides = {}) {
  const data = {
    email: 'admin@vehiclean.com',
    password: 'admin123',
    name: 'Admin',
    ...overrides,
  };
  const admin = await Admin.create(data);
  const token = generateToken({ id: admin._id, role: 'admin' });
  return { admin, token };
}

/**
 * Helper: seed a user
 */
async function seedUser(overrides = {}) {
  return User.create({
    name: 'Seed User',
    email: `user${Date.now()}@test.com`,
    phone: `98${Date.now().toString().slice(-8)}`,
    password: 'password123',
    ...overrides,
  });
}

/**
 * Helper: seed a partner
 */
async function seedPartner(overrides = {}) {
  return Partner.create({
    name: 'Seed Partner',
    email: `partner${Date.now()}@test.com`,
    phone: `97${Date.now().toString().slice(-8)}`,
    password: 'password123',
    city: 'Mumbai',
    ...overrides,
  });
}

describe('Admin API', () => {
  let adminToken;

  beforeEach(async () => {
    const { token } = await createAdmin();
    adminToken = token;
  });

  // ─── Dashboard Stats ──────────────────────────────────────────────────

  describe('GET /api/admin/dashboard', () => {
    it('should return dashboard stats', async () => {
      // Seed some data
      const user = await seedUser();
      const partner = await seedPartner({ status: 'pending' });

      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalUsers');
      expect(res.body.data).toHaveProperty('totalPartners');
      expect(res.body.data).toHaveProperty('totalBookings');
      expect(res.body.data).toHaveProperty('totalRevenue');
      expect(res.body.data).toHaveProperty('todayBookings');
      expect(res.body.data).toHaveProperty('pendingPartners');
      expect(res.body.data).toHaveProperty('activeBookings');
      expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(1);
      expect(res.body.data.totalPartners).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pendingPartners).toBeGreaterThanOrEqual(1);
    });

    it('should return zeros when database is empty (except admin)', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalUsers).toBe(0);
      expect(res.body.data.totalBookings).toBe(0);
      expect(res.body.data.totalRevenue).toBe(0);
    });
  });

  // ─── User Management ──────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('should return list of users', async () => {
      await seedUser({ name: 'Alice', email: 'alice@test.com', phone: '9876543210' });
      await seedUser({ name: 'Bob', email: 'bob@test.com', phone: '9876543211' });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users.length).toBe(2);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('should search users by name', async () => {
      await seedUser({ name: 'Alice Smith', email: 'alice@test.com', phone: '9876543210' });
      await seedUser({ name: 'Bob Jones', email: 'bob@test.com', phone: '9876543211' });

      const res = await request(app)
        .get('/api/admin/users?search=Alice')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBe(1);
      expect(res.body.data.users[0].name).toBe('Alice Smith');
    });

    it('should paginate users', async () => {
      for (let i = 0; i < 5; i++) {
        await seedUser({
          name: `User ${i}`,
          email: `user${i}@test.com`,
          phone: `987654321${i}`,
        });
      }

      const res = await request(app)
        .get('/api/admin/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(5);
      expect(res.body.data.pagination.pages).toBe(3);
    });

    it('should not return deleted users', async () => {
      await seedUser({ name: 'Active', email: 'active@test.com', phone: '9876543210' });
      await seedUser({ name: 'Deleted', email: 'deleted@test.com', phone: '9876543211', isDeleted: true });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBe(1);
      expect(res.body.data.users[0].name).toBe('Active');
    });
  });

  describe('PATCH /api/admin/users/:id/toggle-block', () => {
    it('should block an unblocked user', async () => {
      const user = await seedUser({ isBlocked: false, email: 'block@test.com', phone: '9876543210' });

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}/toggle-block`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isBlocked).toBe(true);
      expect(res.body.message).toMatch(/blocked/i);
    });

    it('should unblock a blocked user', async () => {
      const user = await seedUser({ isBlocked: true, email: 'unblock@test.com', phone: '9876543210' });

      const res = await request(app)
        .patch(`/api/admin/users/${user._id}/toggle-block`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isBlocked).toBe(false);
      expect(res.body.message).toMatch(/unblocked/i);
    });

    it('should return 404 for nonexistent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .patch(`/api/admin/users/${fakeId}/toggle-block`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('should soft-delete a user', async () => {
      const user = await seedUser({ email: 'todelete@test.com', phone: '9876543210' });

      const res = await request(app)
        .delete(`/api/admin/users/${user._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify soft delete
      const deleted = await User.findById(user._id);
      expect(deleted.isDeleted).toBe(true);
      expect(deleted.isBlocked).toBe(true);
      expect(deleted.deletedAt).toBeDefined();
    });
  });

  // ─── Partner Management ───────────────────────────────────────────────

  describe('GET /api/admin/partners', () => {
    it('should return list of partners', async () => {
      await seedPartner({ name: 'Partner A', email: 'a@test.com', phone: '9876543210', status: 'approved' });
      await seedPartner({ name: 'Partner B', email: 'b@test.com', phone: '9876543211', status: 'pending' });

      const res = await request(app)
        .get('/api/admin/partners')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.partners.length).toBe(2);
    });

    it('should filter partners by status', async () => {
      await seedPartner({ name: 'Approved', email: 'approved@test.com', phone: '9876543210', status: 'approved' });
      await seedPartner({ name: 'Pending', email: 'pending@test.com', phone: '9876543211', status: 'pending' });

      const res = await request(app)
        .get('/api/admin/partners?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.partners.length).toBe(1);
      expect(res.body.data.partners[0].name).toBe('Pending');
    });
  });

  describe('GET /api/admin/partners/:id', () => {
    it('should return partner details with booking stats', async () => {
      const partner = await seedPartner({ email: 'detail@test.com', phone: '9876543210' });

      const res = await request(app)
        .get(`/api/admin/partners/${partner._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalBookings');
      expect(res.body.data).toHaveProperty('totalEarningsFromBookings');
    });

    it('should return 404 for nonexistent partner', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .get(`/api/admin/partners/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/admin/partners/:id/status', () => {
    it('should approve a pending partner', async () => {
      const partner = await seedPartner({ status: 'pending', email: 'approve@test.com', phone: '9876543210' });

      const res = await request(app)
        .patch(`/api/admin/partners/${partner._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('approved');
    });

    it('should reject a partner', async () => {
      const partner = await seedPartner({ status: 'pending', email: 'reject@test.com', phone: '9876543210' });

      const res = await request(app)
        .patch(`/api/admin/partners/${partner._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'rejected' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
    });

    it('should reject invalid status', async () => {
      const partner = await seedPartner({ email: 'invalid@test.com', phone: '9876543210' });

      const res = await request(app)
        .patch(`/api/admin/partners/${partner._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/admin/partners/:id/commission', () => {
    it('should update partner commission', async () => {
      const partner = await seedPartner({ email: 'commission@test.com', phone: '9876543210' });

      const res = await request(app)
        .patch(`/api/admin/partners/${partner._id}/commission`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commission: 15 });

      expect(res.status).toBe(200);
      expect(res.body.data.commission).toBe(15);
    });

    it('should reject commission over 100', async () => {
      const partner = await seedPartner({ email: 'comm100@test.com', phone: '9876543210' });

      const res = await request(app)
        .patch(`/api/admin/partners/${partner._id}/commission`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ commission: 150 });

      expect(res.status).toBe(400);
    });
  });

  // ─── Service Management ───────────────────────────────────────────────

  describe('Service CRUD', () => {
    it('should create a new service', async () => {
      const res = await request(app)
        .post('/api/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Premium Wash',
          price: 1500,
          duration: 120,
          category: 'premium',
          description: 'Full premium wash service',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Premium Wash');
      expect(res.body.data.price).toBe(1500);
    });

    it('should reject service without required fields', async () => {
      const res = await request(app)
        .post('/api/admin/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Missing name and price' });

      expect(res.status).toBe(400);
    });

    it('should list all services', async () => {
      await Service.create({ name: 'Wash A', price: 500, duration: 60, category: 'basic' });
      await Service.create({ name: 'Wash B', price: 1000, duration: 90, category: 'premium' });

      const res = await request(app)
        .get('/api/admin/services')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.services.length).toBe(2);
    });

    it('should update a service', async () => {
      const service = await Service.create({
        name: 'Old Name',
        price: 500,
        duration: 60,
        category: 'basic',
      });

      const res = await request(app)
        .put(`/api/admin/services/${service._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name', price: 750 });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New Name');
      expect(res.body.data.price).toBe(750);
    });

    it('should delete a service', async () => {
      const service = await Service.create({
        name: 'To Delete',
        price: 500,
        duration: 60,
        category: 'basic',
      });

      const res = await request(app)
        .delete(`/api/admin/services/${service._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const found = await Service.findById(service._id);
      expect(found).toBeNull();
    });
  });

  // ─── Promo Code Management ────────────────────────────────────────────

  describe('Promo Code CRUD', () => {
    it('should create a promo code', async () => {
      const res = await request(app)
        .post('/api/admin/promos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'SAVE50',
          discountType: 'flat',
          discountValue: 50,
          validFrom: new Date(),
          validTo: new Date(Date.now() + 86400000 * 30),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('SAVE50');
      expect(res.body.data.discountType).toBe('flat');
    });

    it('should list promo codes', async () => {
      await PromoCode.create({
        code: 'PROMO1',
        discountType: 'flat',
        discountValue: 100,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 86400000 * 30),
      });

      const res = await request(app)
        .get('/api/admin/promos')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.promos.length).toBe(1);
    });

    it('should update a promo code', async () => {
      const promo = await PromoCode.create({
        code: 'UPDATE',
        discountType: 'flat',
        discountValue: 100,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 86400000 * 30),
      });

      const res = await request(app)
        .put(`/api/admin/promos/${promo._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ discountValue: 200 });

      expect(res.status).toBe(200);
      expect(res.body.data.discountValue).toBe(200);
    });

    it('should delete a promo code', async () => {
      const promo = await PromoCode.create({
        code: 'DELETE',
        discountType: 'percentage',
        discountValue: 10,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 86400000 * 30),
      });

      const res = await request(app)
        .delete(`/api/admin/promos/${promo._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const found = await PromoCode.findById(promo._id);
      expect(found).toBeNull();
    });
  });

  // ─── Booking Management ───────────────────────────────────────────────

  describe('Booking Management', () => {
    it('should list all bookings', async () => {
      const user = await seedUser({ email: 'bookingadmin@test.com', phone: '9876543210' });
      const car = await Car.create({ userId: user._id, make: 'Toyota', model: 'Camry', registrationNo: 'MH01AB1234' });
      const service = await Service.create({ name: 'Wash', price: 500, duration: 60, category: 'basic' });

      await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        address: { full: '123 Test St', lat: 0, lng: 0 },
      });

      const res = await request(app)
        .get('/api/admin/bookings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.bookings.length).toBe(1);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('should filter bookings by status', async () => {
      const user = await seedUser({ email: 'filterbooking@test.com', phone: '9876543210' });
      const car = await Car.create({ userId: user._id, make: 'Honda', model: 'City', registrationNo: 'MH01CD5678' });
      const service = await Service.create({ name: 'Wash', price: 500, duration: 60, category: 'basic' });

      await Booking.create({
        userId: user._id, carId: car._id, serviceId: service._id,
        slotDate: new Date(), slotTime: '10:00', paymentMethod: 'cod',
        amount: 500, finalAmount: 500, status: 'pending',
        address: { full: '123 Test St', lat: 0, lng: 0 },
      });

      await Booking.create({
        userId: user._id, carId: car._id, serviceId: service._id,
        slotDate: new Date(), slotTime: '11:00', paymentMethod: 'cod',
        amount: 500, finalAmount: 500, status: 'completed',
        address: { full: '456 Test Ave', lat: 0, lng: 0 },
      });

      const res = await request(app)
        .get('/api/admin/bookings?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.bookings.length).toBe(1);
      expect(res.body.data.bookings[0].status).toBe('pending');
    });

    it('should assign a partner to a booking', async () => {
      const user = await seedUser({ email: 'assign@test.com', phone: '9876543210' });
      const partner = await seedPartner({ email: 'assignpartner@test.com', phone: '9876543211', status: 'approved' });
      const car = await Car.create({ userId: user._id, make: 'Toyota', model: 'Camry', registrationNo: 'MH01AB1234' });
      const service = await Service.create({ name: 'Wash', price: 500, duration: 60, category: 'basic' });

      const booking = await Booking.create({
        userId: user._id, carId: car._id, serviceId: service._id,
        slotDate: new Date(), slotTime: '10:00', paymentMethod: 'cod',
        amount: 500, finalAmount: 500, status: 'pending',
        address: { full: '123 Test St', lat: 0, lng: 0 },
      });

      const res = await request(app)
        .patch(`/api/admin/bookings/${booking._id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ partnerId: partner._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.partnerId.toString()).toBe(partner._id.toString());
      expect(res.body.data.status).toBe('assigned');
    });

    it('should admin-cancel a booking', async () => {
      const user = await seedUser({ email: 'canceladmin@test.com', phone: '9876543210' });
      const car = await Car.create({ userId: user._id, make: 'Toyota', model: 'Camry', registrationNo: 'MH01AB1234' });
      const service = await Service.create({ name: 'Wash', price: 500, duration: 60, category: 'basic' });

      const booking = await Booking.create({
        userId: user._id, carId: car._id, serviceId: service._id,
        slotDate: new Date(), slotTime: '10:00', paymentMethod: 'cod',
        amount: 500, finalAmount: 500, status: 'pending',
        address: { full: '123 Test St', lat: 0, lng: 0 },
      });

      const res = await request(app)
        .patch(`/api/admin/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Admin cancelled for testing' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.cancelledBy).toBe('admin');
    });
  });

  // ─── Withdrawal Management ────────────────────────────────────────────

  describe('Withdrawal Management', () => {
    it('should list withdrawals', async () => {
      const partner = await seedPartner({ email: 'withdrawpartner@test.com', phone: '9876543210' });

      await Withdrawal.create({ partnerId: partner._id, amount: 500, status: 'pending' });

      const res = await request(app)
        .get('/api/admin/withdrawals')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.withdrawals.length).toBe(1);
    });

    it('should approve a withdrawal', async () => {
      const partner = await seedPartner({ email: 'approvewd@test.com', phone: '9876543210' });
      const withdrawal = await Withdrawal.create({ partnerId: partner._id, amount: 500, status: 'pending' });

      const res = await request(app)
        .patch(`/api/admin/withdrawals/${withdrawal._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved', transactionId: 'TXN123456' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('approved');
    });

    it('should reject a withdrawal and refund balance', async () => {
      const partner = await seedPartner({
        email: 'rejectwd@test.com',
        phone: '9876543210',
        walletBalance: 500,
      });
      const withdrawal = await Withdrawal.create({ partnerId: partner._id, amount: 300, status: 'pending' });

      const res = await request(app)
        .patch(`/api/admin/withdrawals/${withdrawal._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'rejected', rejectionReason: 'Invalid bank details' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');

      // Verify balance was refunded
      const updatedPartner = await Partner.findById(partner._id);
      expect(updatedPartner.walletBalance).toBe(800); // 500 + 300 refunded
    });
  });

  // ─── Notification ─────────────────────────────────────────────────────

  describe('Notification', () => {
    it('should send a notification to all', async () => {
      const res = await request(app)
        .post('/api/admin/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'System Update',
          body: 'We are updating our systems.',
          targetType: 'all',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('System Update');
      expect(res.body.data.targetType).toBe('all');
    });

    it('should list notifications', async () => {
      // Send a notification first
      await request(app)
        .post('/api/admin/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test',
          body: 'Test body',
          targetType: 'all',
        });

      const res = await request(app)
        .get('/api/admin/notifications')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.notifications.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject notification without required fields', async () => {
      const res = await request(app)
        .post('/api/admin/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── Settings ─────────────────────────────────────────────────────────

  describe('Settings', () => {
    it('should get settings (creates default if none exist)', async () => {
      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should update settings', async () => {
      // First get settings to create default
      await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);

      const res = await request(app)
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ appName: 'Vehiclean Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Authorization Guard ──────────────────────────────────────────────

  describe('Authorization', () => {
    it('should reject regular user accessing admin endpoints', async () => {
      const user = await seedUser({ email: 'regular@test.com', phone: '9876543210' });
      const userToken = generateToken({ id: user._id, role: 'user' });

      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject partner accessing admin endpoints', async () => {
      const partner = await seedPartner({ email: 'partneradmin@test.com', phone: '9876543210' });
      const partnerToken = generateToken({ id: partner._id, role: 'partner' });

      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${partnerToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app).get('/api/admin/dashboard');

      expect(res.status).toBe(401);
    });
  });
});
