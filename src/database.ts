import { Context } from 'koishi'

export async function isUserEnabled(ctx: Context, platform: string, userId: string): Promise<boolean> {
  const user = await ctx.database.getUser(platform, userId, ['announceEnabled']) as any
  return user?.announceEnabled !== false
}

export async function setUserPreference(ctx: Context, platform: string, userId: string, enabled: boolean) {
  const data = { announceEnabled: enabled }
  try {
    await ctx.database.setUser(platform, userId, data)
  } catch {
    await ctx.database.createUser(platform, userId, data)
  }
}

export async function getDisabledUserIds(ctx: Context, platform: string, pids: string[]): Promise<Set<string>> {
  if (pids.length === 0) return new Set()
  const bindings = await ctx.database.get('binding', { platform, pid: { $in: pids } } as any, ['aid', 'pid']) as any[]
  if (bindings.length === 0) return new Set()
  const pidByAid = new Map<number, string>()
  for (const b of bindings) pidByAid.set(b.aid, b.pid)
  const aids = [...pidByAid.keys()]
  const users = await ctx.database.get('user', { id: { $in: aids } } as any, ['id', 'announceEnabled']) as any[]
  const disabled = new Set<string>()
  for (const u of users) {
    if (u.announceEnabled === false) {
      const pid = pidByAid.get(u.id)
      if (pid) disabled.add(pid)
    }
  }
  return disabled
}

export async function isChannelEnabled(ctx: Context, platform: string, channelId: string): Promise<boolean> {
  const channel = await ctx.database.getChannel(platform, channelId, ['announceEnabled']) as any
  return channel?.announceEnabled !== false
}

export async function setChannelPreference(ctx: Context, platform: string, channelId: string, enabled: boolean) {
  const channel = await ctx.database.getChannel(platform, channelId, ['announceEnabled']) as any
  if (channel) {
    await ctx.database.setChannel(platform, channelId, { announceEnabled: enabled })
  } else {
    try {
      await ctx.database.createChannel(platform, channelId, { announceEnabled: enabled })
    } catch {
      await ctx.database.setChannel(platform, channelId, { announceEnabled: enabled })
    }
  }
}

export async function getDisabledChannelIds(ctx: Context, platform: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await ctx.database.get('channel', { platform, id: { $in: ids } } as any, ['id', 'announceEnabled']) as any[]
  const disabled = new Set<string>()
  for (const row of rows) {
    if (row.announceEnabled === false) disabled.add(row.id)
  }
  return disabled
}