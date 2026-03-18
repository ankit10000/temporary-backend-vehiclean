require('./setup');
const request = require('supertest');
const app = require('./app');
const Partner = require('../src/models/Partner');
const Booking = require('../src/models/Booking');
const User = require('../src/models/User');
const Car = require('../src/models/Car');
const Service = require('../src/models/Service');
const Notification = require('../src/models/Notification');
const { generateToken } = require('../src/utils/jwt');

/**
 * Helper: create an approved partner and return { partner, token }
 */
async function createApprovedPartner(overrides = {}) {
  const data = {
    name: 'Partner Pro',
    email: 'partnerpro@test.com',
    phone: '9876543210',
    password: 'password123',
    city: 'Mumbai',
    status: 'approved',
    isActive: true,
    isOnline: false,
    walletBalance: 1000,
    totalEarnings: 5000,
    ...overrides,
  };
  const partner = await Partner.create(data);
  const token = generateToken({ id: partner._id, role: 'partner' });
  return { partner, token };
}

describe('Partner API', () => {
  // ─── Toggle Online/Offline Status ─────────────────────────────────────

  describe('PATCH /api/partners/toggle-status', () => {
    it('should toggle partner to online', async () => {
      const { token } = await createApprovedPartner({ isOnline: false });

      const res = await request(app)
        .patch('/api/partners/toggle-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ isOnline: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isOnline).toBe(true);
      expect(res.body.message).toMatch(/online/i);
    });

    it('should toggle partner to offline', async () => {
      const { token } = await createApprovedPartner({ isOnline: true });

      const res = await request(app)
        .patch('/api/partners/toggle-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ isOnline: false });

      expect(res.status).toBe(200);
      expect(res.body.data.isOnline).toBe(false);
      expect(res.body.message).toMatch(/offline/i);
    });

    it('should auto-toggle when no isOnline is provided', async () => {
      const { token } = await createApprovedPartner({ isOnline: false });

      const res = await request(app)
        .patch('/api/partners/toggle-status')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.isOnline).toBe(true);
    });

    it('should reject toggle for unapproved partner', async () => {
      const { token } = await createApprovedPartner({ status: 'pending' });

      const res = await request(app)
        .patch('/api/partners/toggle-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ isOnline: true });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Update Working Hours ─────────────────────────────────────────────

  describe('PATCH /api/partners/working-hours', () => {
    it('should update working hours', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .patch('/api/partners/working-hours')
        .set('Authorization', `Bearer ${token}`)
        .send({ start: '09:00', end: '18:00' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workingHours.start).toBe('09:00');
      expect(res.body.data.workingHours.end).toBe('18:00');
    });

    it('should reject invalid time format', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .patch('/api/partners/working-hours')
        .set('Authorization', `Bearer ${token}`)
        .send({ start: '9am', end: '6pm' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Update Service Radius ────────────────────────────────────────────

  describe('PATCH /api/partners/radius', () => {
    it('should update service radius', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .patch('/api/partners/radius')
        .set('Authorization', `Bearer ${token}`)
        .send({ radius: 25 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.serviceRadius).toBe(25);
    });

    it('should reject radius out of range', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .patch('/api/partners/radius')
        .set('Authorization', `Bearer ${token}`)
        .send({ radius: 100 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Update Location ──────────────────────────────────────────────────

  describe('PATCH /api/partners/location', () => {
    it('should update partner location', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .patch('/api/partners/location')
        .set('Authorization', `Bearer ${token}`)
        .send({ lat: 19.076, lng: 72.8777 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.location.coordinates[0]).toBe(72.8777);
      expect(res.body.data.location.coordinates[1]).toBe(19.076);
    });

    it('should reject invalid coordinates', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .patch('/api/partners/location')
        .set('Authorization', `Bearer ${token}`)
        .send({ lat: 200, lng: 400 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Update Profile ───────────────────────────────────────────────────

  describe('PATCH /api/partners/profile', () => {
    it('should update partner profile', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .patch('/api/partners/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name', city: 'Delhi' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.city).toBe('Delhi');
    });
  });

  // ─── Get Earnings ─────────────────────────────────────────────────────

  describe('GET /api/partners/earnings', () => {
    it('should return earnings dashboard data', async () => {
      const { partner, token } = await createApprovedPartner({
        totalEarnings: 5000,
        walletBalance: 3000,
        commission: 20,
      });

      // Create a completed booking for today
      const user = await User.create({
        name: 'Earnings User',
        email: 'earningsuser@test.com',
        phone: '9876543299',
        password: 'password123',
      });
      const car = await Car.create({
        userId: user._id,
        make: 'Honda',
        model: 'City',
        registrationNo: 'MH01CD5678',
      });
      const service = await Service.create({
        name: 'Premium Wash',
        price: 1000,
        duration: 90,
        category: 'washing',
      });

      await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        partnerId: partner._id,
        slotDate: new Date(),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 1000,
        finalAmount: 1000,
        status: 'completed',
        completedAt: new Date(),
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .get('/api/partners/earnings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalEarnings).toBe(5000);
      expect(res.body.data.walletBalance).toBe(3000);
      expect(res.body.data.commission).toBe(20);
      expect(res.body.data.totalJobs).toBe(1);
      expect(res.body.data.todayEarnings).toBeGreaterThanOrEqual(0);
      expect(res.body.data.weeklyEarnings).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Request Withdrawal ───────────────────────────────────────────────

  describe('POST /api/partners/withdrawals', () => {
    it('should create a withdrawal request', async () => {
      const { token } = await createApprovedPartner({ walletBalance: 1000 });

      const res = await request(app)
        .post('/api/partners/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 500 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(500);
      expect(res.body.data.status).toBe('pending');

      // Verify wallet balance deducted
      const partner = await Partner.findOne({ email: 'partnerpro@test.com' });
      expect(partner.walletBalance).toBe(500);
    });

    it('should reject withdrawal exceeding balance', async () => {
      const { token } = await createApprovedPartner({ walletBalance: 100 });

      const res = await request(app)
        .post('/api/partners/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/insufficient/i);
    });

    it('should reject withdrawal with zero amount', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .post('/api/partners/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 0 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Get Withdrawal History ───────────────────────────────────────────

  describe('GET /api/partners/withdrawals', () => {
    it('should return empty list when no withdrawals exist', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .get('/api/partners/withdrawals')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  // ─── Get Notifications ────────────────────────────────────────────────

  describe('GET /api/partners/notifications', () => {
    it('should return notifications for the partner', async () => {
      const { partner, token } = await createApprovedPartner();

      await Notification.create({
        title: 'Test Notification',
        body: 'This is a test',
        type: 'general',
        targetType: 'partner',
        targetId: partner._id,
      });

      await Notification.create({
        title: 'Broadcast',
        body: 'This is for everyone',
        type: 'general',
        targetType: 'all',
      });

      const res = await request(app)
        .get('/api/partners/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });
  });

  // ─── Mark Notification as Read ────────────────────────────────────────

  describe('PATCH /api/partners/notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const { partner, token } = await createApprovedPartner();

      const notification = await Notification.create({
        title: 'Read Me',
        body: 'Mark this as read',
        type: 'general',
        targetType: 'partner',
        targetId: partner._id,
        isRead: false,
      });

      const res = await request(app)
        .patch(`/api/partners/notifications/${notification._id}/read`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isRead).toBe(true);
    });
  });

  // ─── Save Push Token ──────────────────────────────────────────────────

  describe('POST /api/partners/push-token', () => {
    it('should save push notification token', async () => {
      const { token } = await createApprovedPartner();

      const res = await request(app)
        .post('/api/partners/push-token')
        .set('Authorization', `Bearer ${token}`)
        .send({ pushToken: 'ExponentPushToken[test123]' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const partner = await Partner.findOne({ email: 'partnerpro@test.com' });
      expect(partner.fcmToken).toBe('ExponentPushToken[test123]');
    });
  });

  // ─── Authorization Guard ──────────────────────────────────────────────

  describe('Authorization', () => {
    it('should reject user trying to access partner endpoints', async () => {
      const user = await User.create({
        name: 'Normal User',
        email: 'normaluser@test.com',
        phone: '9876543299',
        password: 'password123',
      });
      const userToken = generateToken({ id: user._id, role: 'user' });

      const res = await request(app)
        .patch('/api/partners/toggle-status')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ isOnline: true });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/partners/earnings');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
