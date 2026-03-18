/**
 * Vehiclean Load Test — 5000 Users, 1000 Partners, 5000 Bookings
 *
 * Tests:
 * 1. Bulk create 5000 users + 1000 partners (direct DB)
 * 2. Create cars + service
 * 3. Book 5 bookings per partner (5000 total) via API
 * 4. Partner accepts → starts → completes each booking
 * 5. Test earnings, withdrawals, notifications
 * 6. Measure response times & throughput
 * 7. Clean up all test data
 *
 * Usage: node src/loadTest.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const http = require('http');

// Models
const User = require('./models/User');
const Partner = require('./models/Partner');
const Car = require('./models/Car');
const Service = require('./models/Service');
const Booking = require('./models/Booking');
const Notification = require('./models/Notification');
const Withdrawal = require('./models/Withdrawal');
const Payment = require('./models/Payment');
const TimeSlot = require('./models/TimeSlot');
const { generateToken } = require('./utils/jwt');

const API_BASE = `http://localhost:${process.env.PORT || 5001}/api`;
const TEST_PREFIX = 'LOADTEST_';
const PASSWORD = 'test123456';
const CONCURRENCY = 50; // parallel API calls at a time

// ─── Helpers ─────────────────────────────────────────────
const stats = { requests: 0, errors: 0, times: [] };

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Load-Test': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const start = Date.now();
    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (d) => (chunks += d));
      res.on('end', () => {
        const elapsed = Date.now() - start;
        stats.requests++;
        stats.times.push(elapsed);
        try {
          const json = JSON.parse(chunks);
          if (!json.success) {
            stats.errors++;
          }
          resolve({ status: res.statusCode, data: json, elapsed });
        } catch {
          stats.errors++;
          resolve({ status: res.statusCode, data: chunks, elapsed });
        }
      });
    });
    req.on('error', (err) => {
      stats.errors++;
      reject(err);
    });
    if (data) req.write(data);
    req.end();
  });
}

async function runBatch(tasks, concurrency) {
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
    if (i % (concurrency * 5) === 0 && i > 0) {
      process.stdout.write(`  ${i}/${tasks.length} done\r`);
    }
  }
  return results;
}

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function printStats(label) {
  if (stats.times.length === 0) return;
  const avg = (stats.times.reduce((a, b) => a + b, 0) / stats.times.length).toFixed(0);
  const p50 = percentile(stats.times, 50);
  const p95 = percentile(stats.times, 95);
  const p99 = percentile(stats.times, 99);
  console.log(`  [${label}] Requests: ${stats.requests} | Errors: ${stats.errors} | Avg: ${avg}ms | P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms`);
}

function resetStats() {
  stats.requests = 0;
  stats.errors = 0;
  stats.times = [];
}

// ─── Phase 1: Create Test Data (Direct DB) ───────────────
async function createTestData() {
  console.log('\n========================================');
  console.log('  VEHICLEAN LOAD TEST');
  console.log('  5000 Users | 1000 Partners | 5000 Bookings');
  console.log('========================================\n');

  const hashedPassword = await bcrypt.hash(PASSWORD, 4); // low rounds for speed

  // --- Create 5000 Users ---
  console.log('Phase 1: Creating test data via direct DB insert...');
  const startUsers = Date.now();
  const users = [];
  for (let i = 0; i < 5000; i++) {
    users.push({
      name: `${TEST_PREFIX}User_${i}`,
      email: `${TEST_PREFIX.toLowerCase()}user${i}@test.com`,
      phone: `9${String(i).padStart(9, '0')}`,
      password: hashedPassword,
      city: ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai'][i % 5],
      location: {
        type: 'Point',
        coordinates: [77.1 + (Math.random() * 0.5), 28.5 + (Math.random() * 0.5)],
      },
    });
  }
  await User.insertMany(users, { ordered: false });
  console.log(`  5000 users created in ${Date.now() - startUsers}ms`);

  // --- Create 1000 Partners ---
  const startPartners = Date.now();
  const partners = [];
  for (let i = 0; i < 1000; i++) {
    partners.push({
      name: `${TEST_PREFIX}Partner_${i}`,
      email: `${TEST_PREFIX.toLowerCase()}partner${i}@test.com`,
      phone: `8${String(i).padStart(9, '0')}`,
      password: hashedPassword,
      city: ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai'][i % 5],
      status: 'approved',
      isActive: true,
      isOnline: true,
      commission: 20,
      maxBookings: 50, // high limit for test
      serviceRadius: 15,
      location: {
        type: 'Point',
        coordinates: [77.1 + (Math.random() * 0.5), 28.5 + (Math.random() * 0.5)],
      },
    });
  }
  await Partner.insertMany(partners, { ordered: false });
  console.log(`  1000 partners created in ${Date.now() - startPartners}ms`);

  // --- Create 1 Service ---
  const service = await Service.create({
    name: `${TEST_PREFIX}Basic_Wash`,
    description: 'Load test service',
    price: 500,
    duration: 30,
    category: 'general',
    isActive: true,
  });
  console.log(`  1 service created: ${service._id}`);

  // --- Create 1 Car per User (first 5000) ---
  const startCars = Date.now();
  const dbUsers = await User.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').lean();
  const cars = dbUsers.map((u, i) => ({
    userId: u._id,
    make: ['Maruti', 'Hyundai', 'Tata', 'Honda', 'Toyota'][i % 5],
    model: ['Swift', 'i20', 'Nexon', 'City', 'Innova'][i % 5],
    year: 2020 + (i % 5),
    registrationNo: `DL${String(i).padStart(2, '0')}AB${String(i).padStart(4, '0')}`,
    color: ['White', 'Black', 'Silver', 'Red', 'Blue'][i % 5],
  }));
  await Car.insertMany(cars, { ordered: false });
  console.log(`  5000 cars created in ${Date.now() - startCars}ms`);

  return { service };
}

// ─── Phase 2: Book 5 Bookings per Partner via API ────────
async function createBookings(service) {
  console.log('\nPhase 2: Creating 5000 bookings via API (5 per partner)...');
  resetStats();

  const dbUsers = await User.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').lean();
  const dbCars = await Car.find({ userId: { $in: dbUsers.map((u) => u._id) } }, '_id userId').lean();
  const dbPartners = await Partner.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').lean();

  // Build user→car map
  const userCarMap = {};
  for (const car of dbCars) {
    userCarMap[car.userId.toString()] = car._id.toString();
  }

  // Generate JWT tokens for users (fast, no API call)
  const userTokens = dbUsers.map((u) => ({
    userId: u._id.toString(),
    token: generateToken({ id: u._id.toString(), role: 'user' }),
    carId: userCarMap[u._id.toString()],
  }));

  // Build booking tasks: 5 bookings per partner = 5000 total
  // Spread across 100 days × 12 time slots × 100 bookings per slot = 120,000 capacity
  const slotTimes = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

  // Create TimeSlot entries with high max bookings (100 per slot) for load test
  const TimeSlot = require('./models/TimeSlot');
  const dates = [];
  for (let d = 1; d <= 100; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    date.setHours(0, 0, 0, 0);
    dates.push(date);
  }

  // Bulk create TimeSlots with maxBookings=100
  const slotDocs = dates.map((date) => ({
    date,
    isHoliday: false,
    slots: slotTimes.map((time) => ({
      time,
      maxBookings: 100,
      currentBookings: 0,
      isBlocked: false,
    })),
  }));
  await TimeSlot.insertMany(slotDocs, { ordered: false }).catch(() => {});
  console.log(`  ${slotDocs.length} TimeSlot entries created (100 max/slot)`);

  const bookingTasks = [];
  let userIdx = 0;
  let slotIdx = 0;

  for (let p = 0; p < dbPartners.length; p++) {
    for (let b = 0; b < 5; b++) {
      const user = userTokens[userIdx % userTokens.length];
      const dateIdx = Math.floor(slotIdx / slotTimes.length) % dates.length;
      const slotTime = slotTimes[slotIdx % slotTimes.length];
      const slotDate = dates[dateIdx].toISOString().split('T')[0];
      userIdx++;
      slotIdx++;

      bookingTasks.push(() =>
        apiCall('POST', '/bookings', {
          carId: user.carId,
          serviceId: service._id.toString(),
          slotDate,
          slotTime,
          paymentMethod: 'cod',
          amount: 500,
          finalAmount: 500,
          address: '123 Test Street, Delhi',
          city: 'Delhi',
          lat: 28.6 + Math.random() * 0.1,
          lng: 77.2 + Math.random() * 0.1,
        }, user.token)
      );
    }
  }

  console.log(`  Sending ${bookingTasks.length} booking requests (concurrency: ${CONCURRENCY})...`);
  const startTime = Date.now();
  const results = await runBatch(bookingTasks, CONCURRENCY);
  const elapsed = Date.now() - startTime;

  const successful = results.filter((r) => r.status === 'fulfilled' && r.value?.data?.success).length;
  const failed = results.length - successful;

  // Log first few errors for debugging
  const errors = results.filter((r) => r.status === 'fulfilled' && !r.value?.data?.success).slice(0, 3);
  if (errors.length > 0) {
    console.log('  Sample errors:');
    for (const e of errors) {
      console.log(`    Status ${e.value?.status}: ${e.value?.data?.message || JSON.stringify(e.value?.data).slice(0, 200)}`);
    }
  }
  const rejected = results.filter((r) => r.status === 'rejected').slice(0, 3);
  if (rejected.length > 0) {
    console.log('  Rejected errors:');
    for (const e of rejected) {
      console.log(`    ${e.reason?.message || e.reason}`);
    }
  }

  console.log(`  ${successful} bookings created, ${failed} failed in ${elapsed}ms`);
  console.log(`  Throughput: ${((successful / elapsed) * 1000).toFixed(1)} bookings/sec`);
  printStats('Bookings');
}

// ─── Phase 3: Partner Accept + Complete Flow ─────────────
async function testBookingFlow() {
  console.log('\nPhase 3: Testing booking lifecycle (accept → start → in_progress → complete)...');
  resetStats();

  const dbPartners = await Partner.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').lean();
  const partnerTokens = dbPartners.map((p) => ({
    partnerId: p._id.toString(),
    token: generateToken({ id: p._id.toString(), role: 'partner' }),
  }));

  // Get all pending/assigned bookings
  const bookings = await Booking.find({
    status: { $in: ['pending', 'assigned'] },
    partnerId: { $in: dbPartners.map((p) => p._id) },
  }, '_id partnerId status').lean();

  // Also get unassigned pending ones
  const unassigned = await Booking.find({
    status: 'pending',
    partnerId: null,
  }, '_id').limit(2000).lean();

  console.log(`  Found ${bookings.length} assigned + ${unassigned.length} unassigned bookings`);

  // Build partner token map
  const partnerTokenMap = {};
  for (const pt of partnerTokens) {
    partnerTokenMap[pt.partnerId] = pt.token;
  }

  // --- Accept bookings ---
  console.log('  Step 1: Partners accepting bookings...');
  const acceptTasks = [];

  // Accept assigned bookings
  for (const b of bookings) {
    if (b.partnerId) {
      const token = partnerTokenMap[b.partnerId.toString()];
      if (token) {
        acceptTasks.push(() =>
          apiCall('PATCH', `/bookings/${b._id}/respond`, { action: 'accept' }, token)
        );
      }
    }
  }

  // Accept unassigned bookings (round-robin to partners)
  for (let i = 0; i < unassigned.length; i++) {
    const pt = partnerTokens[i % partnerTokens.length];
    acceptTasks.push(() =>
      apiCall('PATCH', `/bookings/${unassigned[i]._id}/respond`, { action: 'accept' }, pt.token)
    );
  }

  if (acceptTasks.length > 0) {
    const startAccept = Date.now();
    await runBatch(acceptTasks, CONCURRENCY);
    console.log(`  ${acceptTasks.length} accept calls in ${Date.now() - startAccept}ms`);
    printStats('Accept');
    resetStats();
  }

  // --- Start → In Progress → Complete (status transitions) ---
  const acceptedBookings = await Booking.find({
    status: 'accepted',
    partnerId: { $in: dbPartners.map((p) => p._id) },
  }, '_id partnerId').limit(5000).lean();

  console.log(`  Step 2: Progressing ${acceptedBookings.length} bookings through lifecycle...`);

  for (const statusStep of ['started', 'in_progress', 'completed']) {
    const stepTasks = acceptedBookings.map((b) => {
      const token = partnerTokenMap[b.partnerId.toString()];
      return () => apiCall('PATCH', `/bookings/${b._id}/status`, { status: statusStep }, token);
    });

    const stepStart = Date.now();
    await runBatch(stepTasks, CONCURRENCY);
    console.log(`  ${statusStep}: ${stepTasks.length} calls in ${Date.now() - stepStart}ms`);
    printStats(statusStep);
    resetStats();

    // Update local booking references for next step
    if (statusStep !== 'completed') {
      // bookings now in next status, query again
      const nextBookings = await Booking.find({
        status: statusStep,
        partnerId: { $in: dbPartners.map((p) => p._id) },
      }, '_id partnerId').limit(5000).lean();
      acceptedBookings.length = 0;
      acceptedBookings.push(...nextBookings);
    }
  }
}

// ─── Phase 4: Test Read Endpoints Under Load ─────────────
async function testReadEndpoints() {
  console.log('\nPhase 4: Testing read endpoints under load...');

  const dbUsers = await User.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').limit(100).lean();
  const dbPartners = await Partner.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').limit(100).lean();

  const userTokens = dbUsers.map((u) => generateToken({ id: u._id.toString(), role: 'user' }));
  const partnerTokens = dbPartners.map((p) => generateToken({ id: p._id.toString(), role: 'partner' }));

  // Test various endpoints concurrently
  const endpoints = [
    { name: 'GET /services', tasks: Array(200).fill(null).map(() => () => apiCall('GET', '/services', null, null)) },
    { name: 'GET /banners', tasks: Array(200).fill(null).map(() => () => apiCall('GET', '/banners', null, null)) },
    {
      name: 'GET /bookings (user)',
      tasks: userTokens.map((t) => () => apiCall('GET', '/bookings', null, t)),
    },
    {
      name: 'GET /bookings/partner',
      tasks: partnerTokens.map((t) => () => apiCall('GET', '/bookings/partner', null, t)),
    },
    {
      name: 'GET /partners/earnings',
      tasks: partnerTokens.map((t) => () => apiCall('GET', '/partners/earnings', null, t)),
    },
    {
      name: 'GET /partners/earnings/summary',
      tasks: partnerTokens.map((t) => () => apiCall('GET', '/partners/earnings/summary', null, t)),
    },
  ];

  for (const ep of endpoints) {
    resetStats();
    const start = Date.now();
    await runBatch(ep.tasks, CONCURRENCY);
    const elapsed = Date.now() - start;
    printStats(ep.name);
    console.log(`  Throughput: ${((ep.tasks.length / elapsed) * 1000).toFixed(1)} req/sec | Total: ${elapsed}ms`);
  }
}

// ─── Phase 5: Test Withdrawal Under Concurrency ──────────
async function testWithdrawals() {
  console.log('\nPhase 5: Testing concurrent withdrawals...');
  resetStats();

  // Get partners with positive wallet balance
  const richPartners = await Partner.find({
    name: { $regex: `^${TEST_PREFIX}` },
    walletBalance: { $gt: 100 },
  }, '_id walletBalance').limit(100).lean();

  console.log(`  ${richPartners.length} partners with positive balance`);

  if (richPartners.length > 0) {
    const tasks = richPartners.map((p) => {
      const token = generateToken({ id: p._id.toString(), role: 'partner' });
      return () => apiCall('POST', '/partners/withdrawals', { amount: 100 }, token);
    });

    const start = Date.now();
    await runBatch(tasks, 30);
    console.log(`  ${tasks.length} withdrawal requests in ${Date.now() - start}ms`);
    printStats('Withdrawals');

    // Verify no overdraw happened
    const overdraw = await Partner.find({
      name: { $regex: `^${TEST_PREFIX}` },
      walletBalance: { $lt: 0 },
    }).countDocuments();
    console.log(`  Overdraw check: ${overdraw === 0 ? 'PASSED (0 negative balances)' : `FAILED (${overdraw} negative balances!)`}`);
  }
}

// ─── Phase 6: Summary & Verification ─────────────────────
async function verifyCounts() {
  console.log('\nPhase 6: Verification...');

  const [userCount, partnerCount, bookingCount, completedCount, carCount, notifCount] = await Promise.all([
    User.countDocuments({ name: { $regex: `^${TEST_PREFIX}` } }),
    Partner.countDocuments({ name: { $regex: `^${TEST_PREFIX}` } }),
    Booking.countDocuments(),
    Booking.countDocuments({ status: 'completed' }),
    Car.countDocuments({ make: { $in: ['Maruti', 'Hyundai', 'Tata', 'Honda', 'Toyota'] } }),
    Notification.countDocuments(),
  ]);

  console.log(`  Users: ${userCount}`);
  console.log(`  Partners: ${partnerCount}`);
  console.log(`  Total Bookings: ${bookingCount}`);
  console.log(`  Completed Bookings: ${completedCount}`);
  console.log(`  Cars: ${carCount}`);
  console.log(`  Notifications generated: ${notifCount}`);

  // Check partner earnings
  const topPartners = await Partner.find({ name: { $regex: `^${TEST_PREFIX}` } })
    .sort('-totalEarnings')
    .limit(5)
    .select('name totalEarnings totalBookings walletBalance')
    .lean();

  console.log('\n  Top 5 Partners by Earnings:');
  for (const p of topPartners) {
    console.log(`    ${p.name}: ₹${p.totalEarnings} | ${p.totalBookings} jobs | Wallet: ₹${p.walletBalance}`);
  }
}

// ─── Phase 7: Cleanup ────────────────────────────────────
async function cleanup() {
  console.log('\nPhase 7: Cleaning up test data...');
  const start = Date.now();

  const testUserIds = await User.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').lean();
  const testPartnerIds = await Partner.find({ name: { $regex: `^${TEST_PREFIX}` } }, '_id').lean();
  const userIds = testUserIds.map((u) => u._id);
  const partnerIds = testPartnerIds.map((p) => p._id);

  // Build date range for timeslot cleanup
  const slotDateStart = new Date();
  slotDateStart.setDate(slotDateStart.getDate() + 1);
  slotDateStart.setHours(0, 0, 0, 0);
  const slotDateEnd = new Date();
  slotDateEnd.setDate(slotDateEnd.getDate() + 101);

  const [delUsers, delPartners, delCars, delBookings, delNotifs, delWithdrawals, delPayments, delService, delSlots] = await Promise.all([
    User.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } }),
    Partner.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } }),
    Car.deleteMany({ userId: { $in: userIds } }),
    Booking.deleteMany({ $or: [{ userId: { $in: userIds } }, { partnerId: { $in: partnerIds } }] }),
    Notification.deleteMany({ $or: [{ targetId: { $in: [...userIds, ...partnerIds] } }, { targetType: 'all' }] }),
    Withdrawal.deleteMany({ partnerId: { $in: partnerIds } }),
    Payment.deleteMany({ userId: { $in: userIds } }),
    Service.deleteMany({ name: { $regex: `^${TEST_PREFIX}` } }),
    TimeSlot.deleteMany({ date: { $gte: slotDateStart, $lte: slotDateEnd } }),
  ]);

  console.log(`  Deleted: ${delUsers.deletedCount} users, ${delPartners.deletedCount} partners, ${delCars.deletedCount} cars`);
  console.log(`  Deleted: ${delBookings.deletedCount} bookings, ${delNotifs.deletedCount} notifications`);
  console.log(`  Deleted: ${delWithdrawals.deletedCount} withdrawals, ${delPayments.deletedCount} payments, ${delService.deletedCount} services, ${delSlots.deletedCount} timeslots`);
  console.log(`  Cleanup done in ${Date.now() - start}ms`);
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  const totalStart = Date.now();

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 50,
      minPoolSize: 10,
    });
    console.log('Connected to MongoDB');

    // Check if test data already exists
    const existing = await User.countDocuments({ name: { $regex: `^${TEST_PREFIX}` } });
    if (existing > 0) {
      console.log(`Found ${existing} existing test records. Cleaning first...`);
      await cleanup();
    }

    const { service } = await createTestData();
    await createBookings(service);
    await testBookingFlow();
    await testReadEndpoints();
    await testWithdrawals();
    await verifyCounts();
    await cleanup();

    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
    console.log(`\n========================================`);
    console.log(`  LOAD TEST COMPLETE — ${totalElapsed}s total`);
    console.log(`========================================\n`);
  } catch (error) {
    console.error('Load test failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
