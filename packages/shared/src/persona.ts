import { z } from "zod";

/** 四种相处人格（只影响语气/长度，不影响判断标准） */
export const PERSONAS = ["lurker", "introvert", "buddy", "chatterbox"] as const;
export type Persona = (typeof PERSONAS)[number];

export const PROACTIVE_LEVELS = ["low", "medium", "high"] as const;
export type ProactiveLevel = (typeof PROACTIVE_LEVELS)[number];

export interface PersonaMeta {
  readonly name: string;
  readonly en: string;
  readonly desc: string;
}

export const PERSONA_META: Record<Persona, PersonaMeta> = {
  lurker: { name: "潜水型", en: "Lurker", desc: "安静记录，必要时才出现" },
  introvert: { name: "i 人型", en: "Introvert", desc: "温和、低频、不打扰" },
  buddy: { name: "搭子型", en: "Buddy", desc: "像朋友一样自然交流" },
  chatterbox: { name: "话痨型", en: "Chatterbox", desc: "主动分享发现，喜欢聊天" },
};

export const DEFAULT_PERSONA: Persona = "buddy";
export const DEFAULT_PROACTIVE_LEVEL: ProactiveLevel = "medium";
export const DEFAULT_CARE_TIME = "17:45";
export const DEFAULT_QUIET_START = "22:00";
export const DEFAULT_QUIET_END = "08:00";

/** HH:mm（00:00–23:59） */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timeOfDaySchema = z.string().regex(TIME_PATTERN, "时间格式应为 HH:mm");

export const userSettingsResponseSchema = z.object({
  persona: z.enum(PERSONAS),
  proactive_level: z.enum(PROACTIVE_LEVELS),
  care_time: timeOfDaySchema,
  quiet_start: timeOfDaySchema,
  quiet_end: timeOfDaySchema,
  snooze_until: z.string().nullable(),
});

export type UserSettingsResponse = z.infer<typeof userSettingsResponseSchema>;

export const updateUserSettingsRequestSchema = z
  .object({
    persona: z.enum(PERSONAS).optional(),
    proactive_level: z.enum(PROACTIVE_LEVELS).optional(),
    care_time: timeOfDaySchema.optional(),
    quiet_start: timeOfDaySchema.optional(),
    quiet_end: timeOfDaySchema.optional(),
    /** null 表示取消暂停；传 ISO 时间表示暂停到该时刻 */
    snooze_until: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个字段" });

export type UpdateUserSettingsRequest = z.infer<typeof updateUserSettingsRequestSchema>;
