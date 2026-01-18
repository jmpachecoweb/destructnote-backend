// contracts.ts
// Shared API contracts (schemas and types) used by both the server and the app.
// Import in the app as: `import { type GetSampleResponse } from "@shared/contracts"`
// Import in the server as: `import { postSampleRequestSchema } from "@shared/contracts"`

import { z } from "zod";

// GET /api/sample
export const getSampleResponseSchema = z.object({
  message: z.string(),
});
export type GetSampleResponse = z.infer<typeof getSampleResponseSchema>;

// POST /api/sample
export const postSampleRequestSchema = z.object({
  value: z.string(),
});
export type PostSampleRequest = z.infer<typeof postSampleRequestSchema>;
export const postSampleResponseSchema = z.object({
  message: z.string(),
});
export type PostSampleResponse = z.infer<typeof postSampleResponseSchema>;

// POST /api/upload/image
export const uploadImageRequestSchema = z.object({
  image: z.instanceof(File),
});
export type UploadImageRequest = z.infer<typeof uploadImageRequestSchema>;
export const uploadImageResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  url: z.string(),
  filename: z.string(),
});
export type UploadImageResponse = z.infer<typeof uploadImageResponseSchema>;

// ============================================
// DestructNote API Contracts
// ============================================

// POST /api/notes - Create a new self-destructing note
export const createNoteRequestSchema = z.object({
  content: z.string().min(1, "Note content is required").max(10000, "Note is too long"),
  deviceId: z.string().min(1, "Device ID is required"),
});
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

export const createNoteResponseSchema = z.object({
  id: z.string(),
  success: z.boolean(),
});
export type CreateNoteResponse = z.infer<typeof createNoteResponseSchema>;

// GET /api/notes/:id - Get and destroy a note
export const getNoteResponseSchema = z.object({
  content: z.string(),
  destroyed: z.boolean(),
});
export type GetNoteResponse = z.infer<typeof getNoteResponseSchema>;

// Error response for note not found or already viewed
export const noteErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum(["NOT_FOUND", "ALREADY_VIEWED", "LIMIT_REACHED"]),
});
export type NoteErrorResponse = z.infer<typeof noteErrorResponseSchema>;

// GET /api/notes/usage/:deviceId - Get note usage for a device
export const noteUsageResponseSchema = z.object({
  count: z.number(),
  limit: z.number(),
  isPremium: z.boolean(),
  canCreate: z.boolean(),
});
export type NoteUsageResponse = z.infer<typeof noteUsageResponseSchema>;

// POST /api/notes/upgrade - Mark device as premium
export const upgradeRequestSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
});
export type UpgradeRequest = z.infer<typeof upgradeRequestSchema>;

export const upgradeResponseSchema = z.object({
  success: z.boolean(),
  isPremium: z.boolean(),
});
export type UpgradeResponse = z.infer<typeof upgradeResponseSchema>;
