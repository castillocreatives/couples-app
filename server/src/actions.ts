import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { and, asc, desc, eq, or } from "drizzle-orm";
import * as schema from "./schema";

const profileShape = z.object({ id: z.number(), name: z.string(), roleOrder: z.number() });
const capacityShape = z.object({
  id: z.number(), profileId: z.number(), score: z.number(), careCue: z.string(), note: z.string(), localDate: z.string(), createdAt: z.string(),
});
const frictionShape = z.object({
  id: z.number(), profileId: z.number(), authorName: z.string(), body: z.string(), need: z.string(),
  audioUrl: z.string().nullable(), audioDurationSeconds: z.number().nullable(),
  visibility: z.enum(["private", "shared"]), status: z.enum(["open", "resolved"]), createdAt: z.string(),
});
const reminderShape = z.object({
  morningEnabled: z.boolean(), morningTime: z.string(), eveningEnabled: z.boolean(), eveningTime: z.string(), gentleNudgesEnabled: z.boolean(),
});
const reflectionShape = z.object({
  profileId: z.number(), name: z.string(), submitted: z.boolean(), isMine: z.boolean(),
  rating: z.number().nullable(), appreciate: z.string().nullable(), own: z.string().nullable(), intention: z.string().nullable(), submittedAt: z.string().nullable(),
});

export const Actions = {
  getHome: defineAction({
    request: z.object({ localDate: z.string().min(10).max(10) }),
    response: z.object({ profiles: z.array(profileShape), today: z.array(capacityShape), recent: z.array(capacityShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [profiles, recent] = await Promise.all([
        db.select().from(schema.profiles).orderBy(asc(schema.profiles.roleOrder)),
        db.select().from(schema.capacityCheckins).orderBy(desc(schema.capacityCheckins.createdAt)).limit(30),
      ]);
      const today = recent.filter((row) => row.localDate === args.localDate).filter((row, index, all) => all.findIndex((item) => item.profileId === row.profileId) === index);
      const mapCapacity = (row: typeof recent[number]) => ({
        id: row.id, profileId: row.profileId, score: row.score, careCue: row.careCue, note: row.note,
        localDate: row.localDate, createdAt: row.createdAt.toISOString(),
      });
      return {
        profiles: profiles.map((row) => ({ id: row.id, name: row.name, roleOrder: row.roleOrder })),
        today: today.map(mapCapacity),
        recent: recent.map(mapCapacity),
      };
    },
  }),

  setup: defineAction({
    request: z.object({ firstName: z.string().trim().min(1).max(30), secondName: z.string().trim().min(1).max(30) }),
    response: z.object({ profiles: z.array(profileShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db.select().from(schema.profiles).orderBy(asc(schema.profiles.roleOrder));
      if (existing.length === 0) {
        await db.insert(schema.profiles).values([
          { name: args.firstName, roleOrder: 1 },
          { name: args.secondName, roleOrder: 2 },
        ]);
      }
      const profiles = await db.select().from(schema.profiles).orderBy(asc(schema.profiles.roleOrder));
      ctx.invalidateQueries();
      return { profiles: profiles.map((row) => ({ id: row.id, name: row.name, roleOrder: row.roleOrder })) };
    },
  }),

  saveCapacity: defineAction({
    request: z.object({ profileId: z.number().int().positive(), score: z.number().int().min(1).max(10), careCue: z.string().trim().min(1).max(80), note: z.string().trim().max(280), localDate: z.string().min(10).max(10) }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db.insert(schema.capacityCheckins).values(args).returning({ id: schema.capacityCheckins.id });
      const inserted = result[0];
      if (!inserted) throw new Error("Could not save the check-in.");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  listFriction: defineAction({
    request: z.object({ profileId: z.number().int().positive() }),
    response: z.object({ notes: z.array(frictionShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select({
        id: schema.frictionNotes.id, profileId: schema.frictionNotes.profileId, authorName: schema.profiles.name,
        body: schema.frictionNotes.body, need: schema.frictionNotes.need, audioBlobKey: schema.frictionNotes.audioBlobKey,
        audioDurationSeconds: schema.frictionNotes.audioDurationSeconds, visibility: schema.frictionNotes.visibility,
        status: schema.frictionNotes.status, createdAt: schema.frictionNotes.createdAt,
      }).from(schema.frictionNotes).innerJoin(schema.profiles, eq(schema.frictionNotes.profileId, schema.profiles.id))
        .where(or(eq(schema.frictionNotes.profileId, args.profileId), eq(schema.frictionNotes.visibility, "shared")))
        .orderBy(desc(schema.frictionNotes.createdAt));
      const notes = await Promise.all(rows.map(async (row) => ({
        id: row.id,
        profileId: row.profileId,
        authorName: row.authorName,
        body: row.body,
        need: row.need,
        audioUrl: row.audioBlobKey ? await ctx.blobs.getUrl(row.audioBlobKey) : null,
        audioDurationSeconds: row.audioDurationSeconds,
        visibility: row.visibility,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })));
      return { notes };
    },
  }),

  addFriction: defineAction({
    request: z.object({
      profileId: z.number().int().positive(), body: z.string().trim().max(1200), need: z.string().trim().max(300),
      visibility: z.enum(["private", "shared"]).default("private"),
      audio: z.object({ dataBase64: z.string().max(16_000_000), mimeType: z.enum(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"]), durationSeconds: z.number().int().min(1).max(600) }).nullable(),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      if (!args.body && !args.audio) throw new Error("Add a thought or a voice note before saving.");
      const db = ctx.db<typeof schema>();
      let audioBlobKey: string | null = null;
      if (args.audio) {
        audioBlobKey = `voice-notes/${args.profileId}/${crypto.randomUUID()}`;
        await ctx.blobs.put(audioBlobKey, Buffer.from(args.audio.dataBase64, "base64"), { contentType: args.audio.mimeType });
      }
      const result = await db.insert(schema.frictionNotes).values({
        profileId: args.profileId,
        body: args.body,
        need: args.need,
        visibility: args.visibility,
        audioBlobKey,
        audioMimeType: args.audio?.mimeType ?? null,
        audioDurationSeconds: args.audio?.durationSeconds ?? null,
      }).returning({ id: schema.frictionNotes.id });
      const inserted = result[0];
      if (!inserted) throw new Error("Could not save the note.");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  updateFriction: defineAction({
    request: z.object({ id: z.number().int().positive(), profileId: z.number().int().positive(), visibility: z.enum(["private", "shared"]).optional(), status: z.enum(["open", "resolved"]).optional() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const patch: { visibility?: "private" | "shared"; status?: "open" | "resolved" } = {};
      if (args.visibility) patch.visibility = args.visibility;
      if (args.status) patch.status = args.status;
      if (Object.keys(patch).length > 0) {
        await db.update(schema.frictionNotes).set(patch).where(and(eq(schema.frictionNotes.id, args.id), eq(schema.frictionNotes.profileId, args.profileId)));
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listDigIns: defineAction({
    request: z.object({ profileId: z.number().int().positive() }),
    response: z.object({ sessions: z.array(z.object({ id: z.number(), topic: z.string(), request: z.string(), createdAt: z.string() })) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.digIns).where(eq(schema.digIns.profileId, args.profileId)).orderBy(desc(schema.digIns.createdAt)).limit(20);
      return { sessions: rows.map((row) => ({ id: row.id, topic: row.topic, request: row.request, createdAt: row.createdAt.toISOString() })) };
    },
  }),

  saveDigIn: defineAction({
    request: z.object({
      profileId: z.number().int().positive(), topic: z.string().trim().min(1).max(160), observation: z.string().trim().min(1).max(700),
      story: z.string().trim().min(1).max(700), impact: z.string().trim().min(1).max(700), need: z.string().trim().min(1).max(500), request: z.string().trim().min(1).max(500),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db.insert(schema.digIns).values(args).returning({ id: schema.digIns.id });
      const inserted = result[0];
      if (!inserted) throw new Error("Could not save the conversation prep.");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  getWeekly: defineAction({
    request: z.object({ profileId: z.number().int().positive(), weekKey: z.string().min(10).max(10) }),
    response: z.object({ unlocked: z.boolean(), reflections: z.array(reflectionShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [profiles, rows] = await Promise.all([
        db.select().from(schema.profiles).orderBy(asc(schema.profiles.roleOrder)),
        db.select().from(schema.weeklyReflections).where(eq(schema.weeklyReflections.weekKey, args.weekKey)),
      ]);
      const unlocked = profiles.length >= 2 && profiles.every((profile) => rows.some((row) => row.profileId === profile.id));
      return {
        unlocked,
        reflections: profiles.map((profile) => {
          const row = rows.find((item) => item.profileId === profile.id);
          const canRead = profile.id === args.profileId || unlocked;
          return {
            profileId: profile.id, name: profile.name, submitted: Boolean(row), isMine: profile.id === args.profileId,
            rating: row && canRead ? row.rating : null,
            appreciate: row && canRead ? row.appreciate : null,
            own: row && canRead ? row.own : null,
            intention: row && canRead ? row.intention : null,
            submittedAt: row && canRead ? row.submittedAt.toISOString() : null,
          };
        }),
      };
    },
  }),

  saveWeekly: defineAction({
    request: z.object({ profileId: z.number().int().positive(), weekKey: z.string().min(10).max(10), rating: z.number().int().min(1).max(10), appreciate: z.string().trim().min(1).max(600), own: z.string().trim().min(1).max(600), intention: z.string().trim().min(1).max(600) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const existing = await db.select({ id: schema.weeklyReflections.id }).from(schema.weeklyReflections)
        .where(and(eq(schema.weeklyReflections.profileId, args.profileId), eq(schema.weeklyReflections.weekKey, args.weekKey))).limit(1);
      const row = existing[0];
      if (row) {
        await db.update(schema.weeklyReflections).set({ rating: args.rating, appreciate: args.appreciate, own: args.own, intention: args.intention, submittedAt: new Date() }).where(eq(schema.weeklyReflections.id, row.id));
      } else {
        await db.insert(schema.weeklyReflections).values(args);
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getReminders: defineAction({
    request: z.object({ profileId: z.number().int().positive() }),
    response: reminderShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.reminderPreferences).where(eq(schema.reminderPreferences.profileId, args.profileId)).limit(1);
      const row = rows[0];
      return {
        morningEnabled: row?.morningEnabled ?? false,
        morningTime: row?.morningTime ?? "08:00",
        eveningEnabled: row?.eveningEnabled ?? false,
        eveningTime: row?.eveningTime ?? "20:00",
        gentleNudgesEnabled: row?.gentleNudgesEnabled ?? false,
      };
    },
  }),

  saveReminders: defineAction({
    request: z.object({
      profileId: z.number().int().positive(), morningEnabled: z.boolean(), morningTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      eveningEnabled: z.boolean(), eveningTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), gentleNudgesEnabled: z.boolean(),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db.select({ id: schema.reminderPreferences.id }).from(schema.reminderPreferences).where(eq(schema.reminderPreferences.profileId, args.profileId)).limit(1);
      const existing = rows[0];
      const values = {
        morningEnabled: args.morningEnabled, morningTime: args.morningTime, eveningEnabled: args.eveningEnabled,
        eveningTime: args.eveningTime, gentleNudgesEnabled: args.gentleNudgesEnabled, updatedAt: new Date(),
      };
      if (existing) {
        await db.update(schema.reminderPreferences).set(values).where(eq(schema.reminderPreferences.id, existing.id));
      } else {
        await db.insert(schema.reminderPreferences).values({ profileId: args.profileId, ...values });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
