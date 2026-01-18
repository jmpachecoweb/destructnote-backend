import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createNoteRequestSchema,
  upgradeRequestSchema,
  type CreateNoteResponse,
  type GetNoteResponse,
  type NoteErrorResponse,
  type NoteUsageResponse,
  type UpgradeResponse,
} from "../shared/contracts";
import { type AppType } from "../types";
import { db } from "../db";
import { hasActivePremium, isRevenueCatConfigured } from "../lib/revenuecat";

const notesRouter = new Hono<AppType>();

const FREE_NOTE_LIMIT = 5;

// Helper to get TOTAL lifetime usage for a device (no monthly reset)
const getOrCreateUsage = async (deviceId: string, verifySubscription = false) => {
  // Find the most recent usage record for this device (any month/year)
  let usage = await db.noteUsage.findFirst({
    where: { deviceId },
    orderBy: { id: 'desc' },
  });

  // If no record exists, create one with month=0, year=0 to indicate lifetime tracking
  if (!usage) {
    usage = await db.noteUsage.create({
      data: { deviceId, month: 0, year: 0, count: 0, isPremium: false },
    });
  }

  // Only verify with RevenueCat if explicitly requested AND user is NOT marked as premium
  // This prevents downgrading users who just purchased but RevenueCat hasn't synced yet
  // Users marked as premium in our DB are trusted until they explicitly need re-verification
  if (verifySubscription && !usage.isPremium && isRevenueCatConfigured()) {
    const hasPremium = await hasActivePremium(deviceId);

    if (hasPremium) {
      // User has premium in RevenueCat but not in our DB - upgrade them
      console.log(`⬆️ [Notes] Found active premium in RevenueCat for device ${deviceId}, upgrading`);
      usage = await db.noteUsage.update({
        where: { id: usage.id },
        data: { isPremium: true },
      });
    }
  }

  return usage;
};

// ============================================
// GET /api/notes/usage/:deviceId - Get note usage
// ============================================
notesRouter.get("/usage/:deviceId", async (c) => {
  const deviceId = c.req.param("deviceId");
  console.log(`📊 [Notes] Checking usage for device: ${deviceId}`);

  try {
    // Verify subscription status with RevenueCat
    const usage = await getOrCreateUsage(deviceId, true);
    const canCreate = usage.isPremium || usage.count < FREE_NOTE_LIMIT;

    return c.json({
      count: usage.count,
      limit: FREE_NOTE_LIMIT,
      isPremium: usage.isPremium,
      canCreate,
    } satisfies NoteUsageResponse);
  } catch (error) {
    console.error("❌ [Notes] Failed to get usage:", error);
    return c.json({
      count: 0,
      limit: FREE_NOTE_LIMIT,
      isPremium: false,
      canCreate: true,
    } satisfies NoteUsageResponse);
  }
});

// ============================================
// POST /api/notes/upgrade - Mark device as premium
// ============================================
notesRouter.post("/upgrade", zValidator("json", upgradeRequestSchema), async (c) => {
  const { deviceId } = c.req.valid("json");
  console.log(`⭐ [Notes] Upgrading device to premium: ${deviceId}`);

  try {
    // Get or create the lifetime usage record
    const usage = await getOrCreateUsage(deviceId);

    // Update to premium
    await db.noteUsage.update({
      where: { id: usage.id },
      data: { isPremium: true },
    });

    console.log(`✅ [Notes] Device upgraded to premium: ${deviceId}`);
    return c.json({ success: true, isPremium: true } satisfies UpgradeResponse);
  } catch (error) {
    console.error("❌ [Notes] Failed to upgrade:", error);
    return c.json({ success: false, isPremium: false } satisfies UpgradeResponse, 500);
  }
});

// ============================================
// POST /api/notes - Create a new self-destructing note
// ============================================
notesRouter.post("/", zValidator("json", createNoteRequestSchema), async (c) => {
  const { content, deviceId } = c.req.valid("json");
  console.log(`📝 [Notes] Creating new self-destructing note for device: ${deviceId}`);

  try {
    // Check usage limit (verify subscription status with RevenueCat)
    const usage = await getOrCreateUsage(deviceId, true);

    if (!usage.isPremium && usage.count >= FREE_NOTE_LIMIT) {
      console.log(`🚫 [Notes] Free limit reached for device: ${deviceId}`);
      return c.json(
        { error: "Free note limit reached", code: "LIMIT_REACHED" } satisfies NoteErrorResponse,
        403
      );
    }

    // Create the note
    const note = await db.note.create({
      data: {
        content,
        deviceId,
      },
    });

    // Increment usage count on the lifetime record
    await db.noteUsage.update({
      where: { id: usage.id },
      data: { count: { increment: 1 } },
    });

    console.log(`✅ [Notes] Note created with ID: ${note.id}`);
    return c.json({ id: note.id, success: true } satisfies CreateNoteResponse);
  } catch (error) {
    console.error("❌ [Notes] Failed to create note:", error);
    return c.json({ error: "Failed to create note", code: "NOT_FOUND" } satisfies NoteErrorResponse, 500);
  }
});

// ============================================
// GET /api/notes/:id - Get and destroy a note
// ============================================
notesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  console.log(`📝 [Notes] Attempting to retrieve note: ${id}`);

  try {
    // Find the note
    const note = await db.note.findUnique({
      where: { id },
    });

    // Note doesn't exist
    if (!note) {
      console.log(`❌ [Notes] Note not found: ${id}`);
      return c.json(
        { error: "Note not found", code: "NOT_FOUND" } satisfies NoteErrorResponse,
        404
      );
    }

    // Note has already been viewed
    if (note.viewed) {
      console.log(`🔒 [Notes] Note already viewed: ${id}`);
      return c.json(
        { error: "This note has already been viewed and destroyed", code: "ALREADY_VIEWED" } satisfies NoteErrorResponse,
        410
      );
    }

    // Mark as viewed (self-destruct)
    await db.note.update({
      where: { id },
      data: { viewed: true },
    });

    console.log(`💥 [Notes] Note viewed and marked for destruction: ${id}`);

    // Delete the note content after a short delay for extra security
    // (keeping the record to show "already viewed" message)
    setTimeout(async () => {
      try {
        await db.note.update({
          where: { id },
          data: { content: "[DESTROYED]" },
        });
        console.log(`🗑️ [Notes] Note content destroyed: ${id}`);
      } catch {
        // Note might have been deleted already
      }
    }, 5000);

    return c.json({ content: note.content, destroyed: true } satisfies GetNoteResponse);
  } catch (error) {
    console.error("❌ [Notes] Error retrieving note:", error);
    return c.json(
      { error: "Failed to retrieve note", code: "NOT_FOUND" } satisfies NoteErrorResponse,
      500
    );
  }
});

export { notesRouter };
