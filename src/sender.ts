import { h, Logger } from 'koishi'
import { TargetUserWithBot, TargetChannelWithBot } from './types'
import { delay } from './utils'

export function buildContent(text: string, imageUrls: string[]): h[] {
  const content: h[] = []
  const trimmed = text.trim()
  if (trimmed) content.push(h.text(trimmed))
  for (const url of imageUrls) content.push(h.image(url))
  return content
}

export async function sendToUsers(users: TargetUserWithBot[], content: h[], interval: number, logger: Logger, debug: boolean) {
  let success = 0
  let fail = 0
  for (const u of users) {
    try {
      await u.bot.sendPrivateMessage(u.userId, content)
      success++
      if (debug) logger.info(`私聊公告发送成功: ${u.platform}:${u.userId}`)
    } catch (e) {
      fail++
      logger.warn(`私聊公告发送失败: ${u.platform}:${u.userId} - ${e}`)
    }
    if (interval > 0) await delay(interval)
  }
  return { success, fail }
}

export async function sendToGroups(channels: TargetChannelWithBot[], content: h[], interval: number, logger: Logger, debug: boolean) {
  let success = 0
  let fail = 0
  for (const c of channels) {
    try {
      await c.bot.sendMessage(c.groupId, content)
      success++
      if (debug) logger.info(`群聊公告发送成功: ${c.platform}:${c.groupId}`)
    } catch (e) {
      fail++
      logger.warn(`群聊公告发送失败: ${c.platform}:${c.groupId} - ${e}`)
    }
    if (interval > 0) await delay(interval)
  }
  return { success, fail }
}