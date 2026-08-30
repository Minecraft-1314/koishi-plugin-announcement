import { Bot, Context, Logger } from 'koishi'
import { TargetUserWithBot, TargetChannelWithBot } from './types'
import { getDisabledUserIds, getDisabledChannelIds } from './database'

const MAX_PAGES = 20

async function getBotFriends(bot: Bot, logger: Logger, debug: boolean): Promise<TargetUserWithBot[]> {
  try {
    const result = await bot.getFriendList()
    const list = Array.isArray(result) ? result : result?.data
    if (!Array.isArray(list)) return []
    const users: TargetUserWithBot[] = []
    for (const f of list as any[]) {
      const user = f.user ?? f
      const userId = String(user.id ?? user.userId ?? user.user_id ?? '')
      if (!userId) continue
      users.push({
        bot,
        platform: bot.platform || 'unknown',
        userId,
        nickname: f.nick ?? user.nickname ?? user.name ?? user.nick ?? ''
      })
    }
    return users
  } catch (e) {
    if (debug) logger.warn(`机器人 ${bot.selfId} 获取好友列表失败: ${e}`)
    return []
  }
}

async function getBotGroups(bot: Bot, logger: Logger, debug: boolean): Promise<TargetChannelWithBot[]> {
  const groups: TargetChannelWithBot[] = []
  let next: string | undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    let result: any
    try {
      result = await bot.getGuildList(next)
    } catch (e) {
      if (debug) logger.warn(`机器人 ${bot.selfId} 获取群列表失败: ${e}`)
      break
    }
    const list = Array.isArray(result) ? result : result?.data
    if (!Array.isArray(list)) break
    for (const g of list) {
      const id = String(g.id || '')
      if (!id) continue
      groups.push({
        bot,
        platform: bot.platform || 'unknown',
        groupId: id,
        groupName: g.name || `群组-${id.slice(-4)}`
      })
    }
    next = Array.isArray(result) ? undefined : result?.next
    if (!next) break
  }
  return groups
}

export async function collectTargets(ctx: Context, bots: Bot[], logger: Logger, debug: boolean) {
  const users: TargetUserWithBot[] = []
  const channels: TargetChannelWithBot[] = []
  const seenUsers = new Set<string>()
  const seenChannels = new Set<string>()

  for (const bot of bots) {
    const platform = bot.platform || 'unknown'
    const friends = await getBotFriends(bot, logger, debug)
    if (friends.length) {
      const disabled = await getDisabledUserIds(ctx, platform, friends.map(f => f.userId))
      for (const f of friends) {
        const key = `${platform}:${f.userId}`
        if (disabled.has(f.userId) || seenUsers.has(key)) continue
        seenUsers.add(key)
        users.push(f)
      }
    }
    const groups = await getBotGroups(bot, logger, debug)
    if (groups.length) {
      const disabled = await getDisabledChannelIds(ctx, platform, groups.map(g => g.groupId))
      for (const g of groups) {
        const key = `${platform}:${g.groupId}`
        if (disabled.has(g.groupId) || seenChannels.has(key)) continue
        seenChannels.add(key)
        channels.push(g)
      }
    }
  }

  return { users, channels }
}