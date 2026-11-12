import { z } from "zod";

export const PROACTIVE_KINDS = ["budget_over", "budget_near", "inactivity"] as const;
export type ProactiveKind = (typeof PROACTIVE_KINDS)[number];

export const PROACTIVE_FEEDBACK_VALUES = ["helpful", "inaccurate", "mute"] as const;
export type ProactiveFeedback = (typeof PROACTIVE_FEEDBACK_VALUES)[number];

export const proactiveFeedbackRequestSchema = z.object({
  value: z.enum(PROACTIVE_FEEDBACK_VALUES),
});

export const proactiveFeedbackResponseSchema = z.object({
  ok: z.boolean(),
  snooze_until: z.string().nullable(),
});

export type ProactiveFeedbackResponse = z.infer<typeof proactiveFeedbackResponseSchema>;
