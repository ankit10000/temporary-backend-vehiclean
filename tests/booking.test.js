require('./setup');
const request = require('supertest');
const app = require('./app');
const User = require('../src/models/User');
const Partner = require('../src/models/Partner');
const Car = require('../src/models/Car');
const Service = require('../src/models/Service');
const Booking = require('../src/models/Booking');
const PromoCode = require('../src/models/PromoCode');
const { generateToken } = require('../src/utils/jwt');

/**
 * Helper: create a user and return { user, token }
 */
async function createUser(overrides = {}) {
  const data = {
    name: 'Test User',
    email: 'bookinguser@test.com',
    phone: '9876543210',
    password: 'password123',
    ...overrides,
  };
  const user = await User.create(data);
  const token = generateToken({ id: user._id, role: 'user' });
  return { user, token };
}

/**
 * Helper: create an approved, online partner and return { partner, token }
 */
async function createPartner(overrides = {}) {
  const data = {
    name: 'Test Partner',
    email: 'bookingpartner@test.com',
    phone: '9876543211',
    password: 'password123',
    city: 'Mumbai',
    status: 'approved',
    isActive: true,
    isOnline: true,
    ...overrides,
  };
  const partner = await Partner.create(data);
  const token = generateToken({ id: partner._id, role: 'partner' });
  return { partner, token };
}

/**
 * Helper: create a service
 */
async function createService(overrides = {}) {
  return Service.create({
    name: 'Basic Wash',
    price: 500,
    duration: 60,
    category: 'washing',
    ...overrides,
  });
}

/**
 * Helper: create a car for a user
 */
async function createCar(userId, overrides = {}) {
  return Car.create({
    userId,
    make: 'Toyota',
    model: 'Camry',
    registrationNo: 'MH01AB1234',
    ...overrides,
  });
}

/**
 * Helper: get a future date string "YYYY-MM-DD"
 */
function futureDate(daysFromNow = 1) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe('Booking API', () => {
  // ─── Get Available Slots ──────────────────────────────────────────────

  describe('GET /api/bookings/slots/:date', () => {
    it('should return default slots for a date with no existing slots', async () => {
      const date = futureDate(2);
      const res = await request(app).get(`/api/bookings/slots/${date}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slots).toBeDefined();
      expect(res.body.data.slots.length).toBeGreaterThan(0);
      expect(res.body.data.isHoliday).toBe(false);

      // Default slots should be from 08:00 to 19:00
      const times = res.body.data.slots.map(s => s.time);
      expect(times).toContain('08:00');
      expect(times).toContain('19:00');
    });
  });

  // ─── Create Booking ───────────────────────────────────────────────────

  describe('POST /api/bookings', () => {
    let userToken, userId, carId, serviceId;

    beforeEach(async () => {
      const { user, token } = await createUser();
      userToken = token;
      userId = user._id;

      const car = await createCar(userId);
      carId = car._id;

      const service = await createService();
      serviceId = service._id;
    });

    it('should create a booking successfully', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          carId: carId.toString(),
          serviceId: serviceId.toString(),
          slotDate: futureDate(1),
          slotTime: '10:00',
          paymentMethod: 'cod',
          amount: 500,
          address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.slotTime).toBe('10:00');
      expect(res.body.data.amount).toBe(500);
      expect(res.body.data.finalAmount).toBe(500);
    });

    it('should assign available partner automatically', async () => {
      await createPartner({ city: 'Mumbai' });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          carId: carId.toString(),
          serviceId: serviceId.toString(),
          slotDate: futureDate(1),
          slotTime: '10:00',
          paymentMethod: 'cod',
          amount: 500,
          address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
          city: 'Mumbai',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.partnerId).toBeDefined();
      expect(res.body.data.status).toBe('assigned');
    });

    it('should create booking as pending when no partner available', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          carId: carId.toString(),
          serviceId: serviceId.toString(),
          slotDate: futureDate(1),
          slotTime: '10:00',
          paymentMethod: 'cod',
          amount: 500,
          address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
    });

    it('should reject booking without authentication', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          carId: carId.toString(),
          serviceId: serviceId.toString(),
          slotDate: futureDate(1),
          slotTime: '10:00',
          paymentMethod: 'cod',
          amount: 500,
          address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
        });

      expect(res.status).toBe(401);
    });

    it('should reject booking with missing required fields', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          slotDate: futureDate(1),
          slotTime: '10:00',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Get User Bookings ────────────────────────────────────────────────

  describe('GET /api/bookings/user', () => {
    let userToken, userId;

    beforeEach(async () => {
      const { user, token } = await createUser();
      userToken = token;
      userId = user._id;

      const car = await createCar(userId);
      const service = await createService();

      // Create a couple of bookings directly
      await Booking.create({
        userId,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'pending',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      await Booking.create({
        userId,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(futureDate(2)),
        slotTime: '14:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'completed',
        address: { full: '456 Test Ave', lat: 19.076, lng: 72.8777 },
      });
    });

    it('should return all bookings for the user', async () => {
      const res = await request(app)
        .get('/api/bookings/user')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('should filter bookings by status', async () => {
      const res = await request(app)
        .get('/api/bookings/user?status=pending')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('pending');
    });
  });

  // ─── Get Booking By ID ────────────────────────────────────────────────

  describe('GET /api/bookings/:id', () => {
    it('should return booking by ID', async () => {
      const { user, token } = await createUser();
      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .get(`/api/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(booking._id.toString());
    });

    it('should return 404 for nonexistent booking', async () => {
      const { token } = await createUser();
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .get(`/api/bookings/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Cancel Booking ───────────────────────────────────────────────────

  describe('PATCH /api/bookings/:id/cancel', () => {
    it('should cancel a pending booking', async () => {
      const { user, token } = await createUser();
      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'pending',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Changed my mind' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.cancelReason).toBe('Changed my mind');
      expect(res.body.data.cancelledBy).toBe('user');
    });

    it('should cancel an assigned booking', async () => {
      const { user, token } = await createUser();
      const { partner } = await createPartner();
      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        partnerId: partner._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'assigned',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('should not cancel a completed booking', async () => {
      const { user, token } = await createUser();
      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'completed',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should not cancel an in_progress booking', async () => {
      const { user, token } = await createUser();
      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'in_progress',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Validate Promo Code ──────────────────────────────────────────────

  describe('POST /api/bookings/validate-promo', () => {
    let userToken;

    beforeEach(async () => {
      const { token } = await createUser();
      userToken = token;

      await PromoCode.create({
        code: 'FLAT100',
        discountType: 'flat',
        discountValue: 100,
        minOrder: 300,
        maxDiscount: 0,
        maxUses: 10,
        usedCount: 0,
        validFrom: new Date(Date.now() - 86400000), // yesterday
        validTo: new Date(Date.now() + 86400000 * 30), // 30 days from now
        isActive: true,
      });

      await PromoCode.create({
        code: 'PERCENT20',
        discountType: 'percentage',
        discountValue: 20,
        minOrder: 200,
        maxDiscount: 150,
        maxUses: 0, // unlimited
        usedCount: 0,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000 * 30),
        isActive: true,
      });
    });

    it('should validate a flat discount promo code', async () => {
      const res = await request(app)
        .post('/api/bookings/validate-promo')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'FLAT100', amount: 500 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discount).toBe(100);
      expect(res.body.data.finalAmount).toBe(400);
      expect(res.body.data.code).toBe('FLAT100');
    });

    it('should validate a percentage discount promo code', async () => {
      const res = await request(app)
        .post('/api/bookings/validate-promo')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'PERCENT20', amount: 1000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // 20% of 1000 = 200, capped at maxDiscount 150
      expect(res.body.data.discount).toBe(150);
      expect(res.body.data.finalAmount).toBe(850);
    });

    it('should reject invalid promo code', async () => {
      const res = await request(app)
        .post('/api/bookings/validate-promo')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'INVALID', amount: 500 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject promo code when order is below minimum', async () => {
      const res = await request(app)
        .post('/api/bookings/validate-promo')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'FLAT100', amount: 200 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject promo code when usage limit reached', async () => {
      await PromoCode.findOneAndUpdate(
        { code: 'FLAT100' },
        { usedCount: 10 }
      );

      const res = await request(app)
        .post('/api/bookings/validate-promo')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'FLAT100', amount: 500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject expired promo code', async () => {
      await PromoCode.create({
        code: 'EXPIRED',
        discountType: 'flat',
        discountValue: 50,
        minOrder: 0,
        maxUses: 0,
        validFrom: new Date(Date.now() - 86400000 * 30),
        validTo: new Date(Date.now() - 86400000), // expired yesterday
        isActive: true,
      });

      const res = await request(app)
        .post('/api/bookings/validate-promo')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'EXPIRED', amount: 500 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should be case-insensitive for promo codes', async () => {
      const res = await request(app)
        .post('/api/bookings/validate-promo')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'flat100', amount: 500 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Partner: Respond to Booking ──────────────────────────────────────

  describe('PATCH /api/bookings/:id/respond', () => {
    it('should allow partner to accept a pending booking', async () => {
      const { user } = await createUser();
      const { partner, token: partnerToken } = await createPartner();
      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'pending',
        partnerId: null,
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/respond`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('accepted');
      expect(res.body.data.partnerId.toString()).toBe(partner._id.toString());
    });

    it('should allow partner to reject an assigned booking', async () => {
      const { user } = await createUser();
      const { partner, token: partnerToken } = await createPartner();
      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        partnerId: partner._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'assigned',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/respond`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ action: 'reject' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.partnerId).toBeNull();
    });
  });

  // ─── Partner: Update Job Status ───────────────────────────────────────

  describe('PATCH /api/bookings/:id/status', () => {
    let partnerToken, partnerId, bookingId;

    beforeEach(async () => {
      const { user } = await createUser();
      const { partner, token } = await createPartner();
      partnerToken = token;
      partnerId = partner._id;

      const car = await createCar(user._id);
      const service = await createService();

      const booking = await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        partnerId: partner._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'accepted',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });
      bookingId = booking._id;
    });

    it('should update status from accepted to started', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ status: 'started' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('started');
    });

    it('should update status from started to in_progress', async () => {
      await Booking.findByIdAndUpdate(bookingId, { status: 'started' });

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('should complete booking and update partner earnings', async () => {
      await Booking.findByIdAndUpdate(bookingId, { status: 'in_progress' });

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completedAt).toBeDefined();

      // Verify partner earnings updated
      const partner = await Partner.findById(partnerId);
      // Default commission is 20%, so earning = 500 * 80% = 400
      expect(partner.totalEarnings).toBe(400);
      expect(partner.walletBalance).toBe(400);
    });

    it('should reject invalid status transition', async () => {
      // Trying to jump from accepted to completed
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject status update by non-assigned partner', async () => {
      const { token: otherToken } = await createPartner({
        email: 'other@test.com',
        phone: '9876543299',
      });

      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'started' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Partner Bookings ─────────────────────────────────────────────────

  describe('GET /api/bookings/partner', () => {
    it('should return bookings for the partner', async () => {
      const { user } = await createUser();
      const { partner, token: partnerToken } = await createPartner();
      const car = await createCar(user._id);
      const service = await createService();

      await Booking.create({
        userId: user._id,
        carId: car._id,
        serviceId: service._id,
        partnerId: partner._id,
        slotDate: new Date(futureDate(1)),
        slotTime: '10:00',
        paymentMethod: 'cod',
        amount: 500,
        finalAmount: 500,
        status: 'assigned',
        address: { full: '123 Test St', lat: 19.076, lng: 72.8777 },
      });

      const res = await request(app)
        .get('/api/bookings/partner')
        .set('Authorization', `Bearer ${partnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
