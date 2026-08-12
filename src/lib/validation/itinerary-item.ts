import { z } from "zod";
import { ITINERARY_ITEM_TYPES } from "@/types/domain";

/**
 * Input validation for itinerary edits.
 *
 * Shared by the API routes and any client that edits a day. Times are minutes
 * from midnight, matching the pure edit operations, so nothing has to convert
 * between representations mid-flight.
 */

export const newItemSchema = z.object({
  tripDayId: z
    .string({ message: "Pick a day." })
    .uuid({ message: "Pick a day." }),
  type: z.enum(ITINERARY_ITEM_TYPES, {
    message: "Pick what kind of thing this is.",
  }),
  title: z
    .string({ message: "Give this a name." })
    .trim()
    .min(2, { message: "Give this a name." })
    .max(160, { message: "Keep this under 160 characters." }),
  description: z.string({ message: "Notes must be text." }).trim().max(600).default(""),
  startMinute: z
    .number({ message: "Pick a time." })
    .int({ message: "Pick a time." })
    .min(0, { message: "Pick a time." })
    .max(1_439, { message: "Pick a time." }),
  durationMinutes: z
    .number({ message: "How long does this take?" })
    .int({ message: "Whole minutes only." })
    .min(5, { message: "Allow at least five minutes." })
    .max(720, { message: "Split anything longer than twelve hours." }),
  locationName: z.string().trim().max(160).optional(),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  estimatedCostCents: z.number().int().min(0).default(0),
  reservationRequired: z.boolean().default(false),
});

export const updateItemSchema = z
  .object({
    startMinute: z.number().int().min(0).max(1_439).optional(),
    durationMinutes: z.number().int().min(5).max(720).optional(),
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(600).optional(),
    completed: z.boolean().optional(),
    /** Push this item and everything after it by this many minutes. */
    shiftFollowingBy: z.number().int().min(-720).max(720).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to change.",
  });

export type NewItemPayload = z.infer<typeof newItemSchema>;
export type UpdateItemPayload = z.infer<typeof updateItemSchema>;
