const mongoose = require('mongoose');

/**
 * Try to run a function within a MongoDB transaction.
 * Falls back to running without a transaction if replica set is not available.
 */
async function withTransaction(fn) {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    session.endSession();
    return result;
  } catch (error) {
    if (session) {
      try { await session.abortTransaction(); } catch (_) {}
      session.endSession();
    }
    // If the error is about replica set, retry without transaction
    if (
      error.message?.includes('Transaction numbers are only allowed on a replica set') ||
      error.codeName === 'IllegalOperation'
    ) {
      return fn(null);
    }
    throw error;
  }
}

module.exports = { withTransaction };
