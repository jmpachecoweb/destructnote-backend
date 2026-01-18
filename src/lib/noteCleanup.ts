/**
 * Note Cleanup Utility
 *
 * Automatically deletes unread notes that are older than 30 days.
 * This runs periodically to keep the database clean.
 */

import { db } from "../db";

const DAYS_UNTIL_EXPIRY = 30;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every hour

/**
 * Delete all unread notes older than 30 days
 */
export const cleanupExpiredNotes = async (): Promise<number> => {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - DAYS_UNTIL_EXPIRY);

  try {
    const result = await db.note.deleteMany({
      where: {
        viewed: false,
        createdAt: {
          lt: expiryDate,
        },
      },
    });

    if (result.count > 0) {
      console.log(`🧹 [Cleanup] Deleted ${result.count} expired unread notes (older than ${DAYS_UNTIL_EXPIRY} days)`);
    }

    return result.count;
  } catch (error) {
    console.error("❌ [Cleanup] Failed to delete expired notes:", error);
    return 0;
  }
};

/**
 * Start the periodic cleanup job
 */
export const startCleanupJob = (): ReturnType<typeof setInterval> => {
  console.log(`🧹 [Cleanup] Starting cleanup job (runs every hour, deletes unread notes older than ${DAYS_UNTIL_EXPIRY} days)`);

  // Run immediately on startup
  cleanupExpiredNotes();

  // Then run periodically
  return setInterval(cleanupExpiredNotes, CLEANUP_INTERVAL_MS);
};
