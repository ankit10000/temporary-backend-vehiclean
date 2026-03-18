const Booking = require('../models/Booking');

const TIMEOUT_MS = parseInt(process.env.ASSIGNMENT_TIMEOUT_MS, 10) || 120000; // 2 minutes

// In-memory map: bookingId (string) -> setTimeout handle
const timeouts = new Map();

/**
 * Start an assignment timeout for a booking.
 * When it fires, cascades to the next eligible partner.
 */
function startAssignmentTimeout(app, bookingId) {
  const id = bookingId.toString();
  clearAssignmentTimeout(id);

  const handle = setTimeout(async () => {
    timeouts.delete(id);
    try {
      // Lazy-require to avoid circular dependency
      const { cascadeToNextPartner } = require('./partnerAssignment');
      await cascadeToNextPartner(app, id);
    } catch (err) {
      console.error(`[AssignmentTimeout] Cascade failed for booking ${id}:`, err.message);
    }
  }, TIMEOUT_MS);

  timeouts.set(id, handle);
  console.log(`[AssignmentTimeout] Timer started for booking ${id} (${TIMEOUT_MS / 1000}s)`);
}

/**
 * Clear an existing assignment timeout for a booking.
 */
function clearAssignmentTimeout(bookingId) {
  const id = bookingId.toString();
  const handle = timeouts.get(id);
  if (handle) {
    clearTimeout(handle);
    timeouts.delete(id);
    console.log(`[AssignmentTimeout] Timer cleared for booking ${id}`);
  }
}

/**
 * On server startup, recover bookings stuck in 'assigned' state.
 * - If assignedAt + TIMEOUT_MS has passed, cascade immediately.
 * - Otherwise, start a timeout for the remaining time.
 */
async function recoverStaleAssignments(app) {
  try {
    const staleBookings = await Booking.find({
      status: 'assigned',
      assignedAt: { $exists: true, $ne: null },
    }).select('_id assignedAt');

    if (staleBookings.length === 0) return;

    console.log(`[AssignmentTimeout] Recovering ${staleBookings.length} stale assigned booking(s)`);
    const now = Date.now();

    for (const booking of staleBookings) {
      const elapsed = now - new Date(booking.assignedAt).getTime();
      const remaining = TIMEOUT_MS - elapsed;
      const id = booking._id.toString();

      if (remaining <= 0) {
        // Already overdue — cascade immediately
        try {
          const { cascadeToNextPartner } = require('./partnerAssignment');
          await cascadeToNextPartner(app, id);
        } catch (err) {
          console.error(`[AssignmentTimeout] Recovery cascade failed for ${id}:`, err.message);
        }
      } else {
        // Set timeout for remaining time
        const handle = setTimeout(async () => {
          timeouts.delete(id);
          try {
            const { cascadeToNextPartner } = require('./partnerAssignment');
            await cascadeToNextPartner(app, id);
          } catch (err) {
            console.error(`[AssignmentTimeout] Recovery cascade failed for ${id}:`, err.message);
          }
        }, remaining);
        timeouts.set(id, handle);
        console.log(`[AssignmentTimeout] Resumed timer for ${id} (${Math.round(remaining / 1000)}s remaining)`);
      }
    }
  } catch (err) {
    console.error('[AssignmentTimeout] Recovery error:', err.message);
  }
}

module.exports = { startAssignmentTimeout, clearAssignmentTimeout, recoverStaleAssignments, TIMEOUT_MS };
