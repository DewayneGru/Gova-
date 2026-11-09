import { db } from './index.ts';
import { users, snnPersonalities, watchdogAuditLogs } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error: any) {
    console.warn('Database query notice in getOrCreateUser:', error?.message || 'Transient connection state');
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserPersonalities(uid: string) {
  try {
    const rows = await db
      .select({
        id: snnPersonalities.id,
        profileId: snnPersonalities.profileId,
        name: snnPersonalities.name,
        description: snnPersonalities.description,
        category: snnPersonalities.category,
        payloadJson: snnPersonalities.payloadJson,
        createdAt: snnPersonalities.createdAt,
      })
      .from(snnPersonalities)
      .innerJoin(users, eq(snnPersonalities.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(snnPersonalities.createdAt));

    return rows.map((r) => {
      try {
        return JSON.parse(r.payloadJson);
      } catch {
        return {
          id: r.profileId,
          name: r.name,
          description: r.description,
          category: r.category,
        };
      }
    });
  } catch (error: any) {
    console.warn('Database query notice in getUserPersonalities:', error?.message || 'Transient connection state');
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function saveUserPersonality(uid: string, email: string, profile: any) {
  try {
    const userRecord = await getOrCreateUser(uid, email);
    const profileId = String(profile.id || `personality-${Date.now()}`);
    const name = String(profile.name || 'Custom SNN Personality');
    const description = String(profile.description || 'User-saved SNN tuning profile');
    const category = String(profile.category || 'custom');
    const payloadJson = JSON.stringify({
      ...profile,
      id: profileId,
    });

    const inserted = await db
      .insert(snnPersonalities)
      .values({
        userId: userRecord.id,
        profileId,
        name,
        description,
        category,
        payloadJson,
      })
      .returning();

    return JSON.parse(inserted[0].payloadJson);
  } catch (error: any) {
    console.warn('Database query notice in saveUserPersonality:', error?.message || 'Transient connection state');
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserWatchdogLogs(uid: string) {
  try {
    const rows = await db
      .select({
        id: watchdogAuditLogs.id,
        proposalId: watchdogAuditLogs.proposalId,
        stageTag: watchdogAuditLogs.stageTag,
        verdict: watchdogAuditLogs.verdict,
        payloadJson: watchdogAuditLogs.payloadJson,
        createdAt: watchdogAuditLogs.createdAt,
      })
      .from(watchdogAuditLogs)
      .innerJoin(users, eq(watchdogAuditLogs.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(watchdogAuditLogs.createdAt));

    return rows.map((r) => {
      try {
        return JSON.parse(r.payloadJson);
      } catch {
        return {
          id: r.proposalId,
          stageTag: r.stageTag,
          verdict: r.verdict,
        };
      }
    });
  } catch (error: any) {
    console.warn('Database query notice in getUserWatchdogLogs:', error?.message || 'Transient connection state');
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function saveUserWatchdogLog(uid: string, email: string, entry: any) {
  try {
    const userRecord = await getOrCreateUser(uid, email);
    const proposalId = String(entry.proposalId || entry.id || `prop-${Date.now()}`);
    const stageTag = String(entry.stageTag || 'Ghost-Protocol-Passed');
    const verdict = String(entry.decision?.verdict || entry.verdict || 'APPROVED');
    const payloadJson = JSON.stringify(entry);

    const inserted = await db
      .insert(watchdogAuditLogs)
      .values({
        userId: userRecord.id,
        proposalId,
        stageTag,
        verdict,
        payloadJson,
      })
      .returning();

    return JSON.parse(inserted[0].payloadJson);
  } catch (error: any) {
    console.warn('Database query notice in saveUserWatchdogLog:', error?.message || 'Transient connection state');
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
