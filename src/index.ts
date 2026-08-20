import { Context, Schema, h, Logger } from 'koishi'

declare module 'koishi' {
  interface User {
    announceEnabled?: boolean
  }
  interface Channel {
    announceEnabled?: boolean
  }
}

export const name = 'announcement'
export const inject = ['database']

export interface AnnouncementConfig {
  enabled: boolean
  debug: boolean
  adminIds: string
  sendInterval: number
  announceCommandName: string
  enableCommandName: string
  disableCommandName: string
  statusCommandName: string
}

export const Config: Schema<AnnouncementConfig> = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用公告插件'),
  debug: Schema.boolean().default(false).description('调试模式（详细日志输出）'),
  adminIds: Schema.string().default('').description('管理员用户ID（逗号分隔，仅这些用户可发送公告）'),
  sendInterval: Schema.number().min(0).step(1).default(200).description('每条消息发送间隔 (ms)'),
  announceCommandName: Schema.string().default('announce').description('发送公告命令名'),
  enableCommandName: Schema.string().default('announce.enable').description('开启接收公告命令名'),
  disableCommandName: Schema.string().default('announce.disable').description('关闭接收公告命令名'),
  statusCommandName: Schema.string().default('announce.status').description('查看接收状态命令名'),
})

export function apply(ctx: Context, config: AnnouncementConfig) {
  const logger = new Logger(name)
  const debug = config.debug || false

  const adminIdSet = new Set<string>(
    (config.adminIds || '').split(',').map(s => s.trim()).filter(Boolean)
  )

  if (adminIdSet.size === 0) {
    logger.warn('未配置任何管理员ID，无人可以发送公告')
  }

  try {
    ctx.model.extend('user', { announceEnabled: 'boolean' } as any)
    ctx.model.extend('channel', { announceEnabled: 'boolean' } as any)
  } catch (e) {
    logger.warn('扩展数据库模型失败（可能已存在）', e)
  }

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  function hasAdmin(session: any): boolean {
    return adminIdSet.has(String(session.userId))
  }

  function isGroup(session: any): boolean {
    return Boolean(session.guildId)
  }

  async function safeSend(session: any, message: string | h) {
    try {
      await session.send(message)
    } catch (e) {
      logger.warn(`消息发送失败: ${e}`)
    }
  }

  async function setUserPreference(session: any, enabled: boolean) {
    const id = `${session.platform}:${session.userId}`
    try {
      await ctx.database!.set('user', { id } as any, { announceEnabled: enabled } as any)
    } catch {
      await ctx.database!.create('user', { id, announceEnabled: enabled } as any)
    }
  }

  async function setChannelPreference(session: any, enabled: boolean) {
    const id = `${session.platform}:${session.channelId}`
    try {
      await ctx.database!.set('channel', { id } as any, { announceEnabled: enabled } as any)
    } catch {
      await ctx.database!.create('channel', { id, announceEnabled: enabled } as any)
    }
  }

  async function getBotFriends(bot: any): Promise<{ userId: string; nickname: string }[]> {
    try {
      const result = await bot.getFriendList()
      const friends = Array.isArray(result) ? result : result?.data
      if (!Array.isArray(friends)) return []
      return friends.map((f: any) => ({
        userId: String(f.userId || f.user_id || f.id),
        nickname: f.nickname || f.name || ''
      }))
    } catch (e) {
      if (debug) logger.warn(`机器人 ${bot.selfId} 获取好友列表失败: ${e}`)
      return []
    }
  }

  async function getBotGroups(bot: any): Promise<{ groupId: string; groupName: string }[]> {
    let allGroups: { groupId: string; groupName: string }[] = []
    let nextToken: string | null = null
    let attempts = 0
    const maxAttempts = 20
    do {
      try {
        const result: any = await bot.getGuildList(nextToken)
        const data = Array.isArray(result.data) ? result.data : []
        allGroups = allGroups.concat(
          data.map((g: any) => ({
            groupId: String(g.id),
            groupName: g.name || `群组-${String(g.id).slice(-4)}`
          }))
        )
        nextToken = result.next || null
        attempts++
        if (attempts >= maxAttempts) {
          if (debug) logger.warn(`机器人 ${bot.selfId} 获取群列表达到最大尝试次数`)
          break
        }
      } catch (e) {
        if (debug) logger.warn(`机器人 ${bot.selfId} 获取群列表失败: ${e}`)
        break
      }
    } while (nextToken)
    return allGroups
  }

  async function isUserEnabled(platform: string, userId: string): Promise<boolean> {
    const rows = await ctx.database!.get('user', { id: `${platform}:${userId}` } as any)
    return rows?.[0]?.announceEnabled !== false
  }

  async function isChannelEnabled(platform: string, channelId: string): Promise<boolean> {
    const rows = await ctx.database!.get('channel', { id: `${platform}:${channelId}` } as any)
    return rows?.[0]?.announceEnabled !== false
  }

  async function collectTargets() {
    const users: { bot: any; userId: string; nickname: string }[] = []
    const channels: { bot: any; groupId: string; groupName: string }[] = []

    for (const bot of ctx.bots) {
      const platform = String(bot.platform || 'unknown')
      const friends = await getBotFriends(bot)
      for (const f of friends) {
        if (await isUserEnabled(platform, f.userId)) {
          users.push({ bot, userId: f.userId, nickname: f.nickname })
        }
      }
      const groups = await getBotGroups(bot)
      for (const g of groups) {
        if (await isChannelEnabled(platform, g.groupId)) {
          channels.push({ bot, groupId: g.groupId, groupName: g.groupName })
        }
      }
    }
    return { users, channels }
  }

  function formatTargetPreview(users: any[], channels: any[], maxShow = 10) {
    const lines: string[] = []
    lines.push(`私聊用户 (${users.length})：`)
    const showUsers = users.slice(0, maxShow)
    for (const u of showUsers) {
      lines.push(`- ${u.bot.platform}:${u.userId} (${u.nickname || u.userId})`)
    }
    if (users.length > maxShow) lines.push(`... 其余 ${users.length - maxShow} 个用户`)
    lines.push(`群聊 (${channels.length})：`)
    const showChannels = channels.slice(0, maxShow)
    for (const c of showChannels) {
      lines.push(`- ${c.bot.platform}:${c.groupId} (${c.groupName || c.groupId})`)
    }
    if (channels.length > maxShow) lines.push(`... 其余 ${channels.length - maxShow} 个群聊`)
    return lines.join('\n')
  }

  function logTargetsSummary(users: any[], channels: any[]) {
    logger.info(`公告目标: 私聊用户 ${users.length} 个, 群聊 ${channels.length} 个`)
    if (debug) {
      logger.info('私聊用户列表:')
      for (const u of users) {
        logger.info(`  ${u.bot.platform}:${u.userId} (${u.nickname || u.userId})`)
      }
      logger.info('群聊列表:')
      for (const c of channels) {
        logger.info(`  ${c.bot.platform}:${c.groupId} (${c.groupName || c.groupId})`)
      }
    }
  }

  function extractImageUrls(text: string): { cleanedText: string; imageUrls: string[] } {
    const imageUrlRegex = /https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif|webp|bmp)(?:\?[^\s]*)?/gi
    const imageUrls: string[] = []
    let match: RegExpExecArray | null
    const replacements: { start: number; end: number; url: string }[] = []
    imageUrlRegex.lastIndex = 0
    while ((match = imageUrlRegex.exec(text)) !== null) {
      imageUrls.push(match[0])
      replacements.push({ start: match.index, end: match.index + match[0].length, url: match[0] })
    }
    let cleanedText = text
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { start, end } = replacements[i]
      cleanedText = cleanedText.slice(0, start) + ' ' + cleanedText.slice(end)
    }
    cleanedText = cleanedText.trim().replace(/\s{2,}/g, ' ')
    return { cleanedText, imageUrls }
  }

  function buildContent(messageText: string, attachedImages: string[]): h[] {
    const { cleanedText, imageUrls } = extractImageUrls(messageText || '')
    const allImageUrls = [...imageUrls, ...attachedImages]
    const content: h[] = []
    if (cleanedText) {
      content.push(h.text(cleanedText))
    }
    for (const url of allImageUrls) {
      content.push(h.image(url))
    }
    return content
  }

  async function sendToUsers(content: h[], users: any[]) {
    let success = 0
    let fail = 0
    for (const u of users) {
      try {
        await u.bot.sendPrivateMessage(u.userId, content)
        success++
        if (debug) logger.info(`私聊公告发送成功: ${u.bot.platform}:${u.userId}`)
      } catch (e) {
        fail++
        logger.warn(`私聊公告发送失败: ${u.bot.platform}:${u.userId} - ${e}`)
      }
      await delay(config.sendInterval)
    }
    return { success, fail }
  }

  async function sendToGroups(content: h[], channels: any[]) {
    let success = 0
    let fail = 0
    for (const c of channels) {
      try {
        await c.bot.sendMessage(c.groupId, content)
        success++
        if (debug) logger.info(`群聊公告发送成功: ${c.bot.platform}:${c.groupId}`)
      } catch (e) {
        fail++
        logger.warn(`群聊公告发送失败: ${c.bot.platform}:${c.groupId} - ${e}`)
      }
      await delay(config.sendInterval)
    }
    return { success, fail }
  }

  const pendingMap = new Map<string, { content: h[]; users: any[]; channels: any[]; expireAt: number }>()

  ctx.command(`${config.announceCommandName} <message:text>`, '发送公告（仅限配置的管理员ID）')
    .option('target', '-t <target>', { type: /^(private|group|all)$/i, fallback: 'all' })
    .action(async ({ session, options }, message) => {
      if (!session) return '会话不可用'
      if (!hasAdmin(session)) return '你没有权限发送公告'
      if (!message && !(session.elements?.some(el => el.type === 'image'))) {
        return '请输入公告内容或附带图片'
      }
      const target = ((options?.target as string) || 'all').toLowerCase()
      const { users: allUsers, channels: allChannels } = await collectTargets()
      let targetUsers = allUsers
      let targetChannels = allChannels
      if (target === 'private') targetChannels = []
      if (target === 'group') targetUsers = []

      if (targetUsers.length === 0 && targetChannels.length === 0) return '没有可接收公告的用户或群聊'

      const attachedImages: string[] = []
      if (session.elements) {
        for (const el of session.elements) {
          if (el.type === 'image' && el.data?.src) {
            attachedImages.push(String(el.data.src))
          }
        }
      }

      const content = buildContent(message || '', attachedImages)
      if (content.length === 0) return '公告内容不能为空'

      const preview = formatTargetPreview(targetUsers, targetChannels)
      const textPreview = content.filter(el => el.type === 'text').map(el => el.data?.text).join(' ')
      const imageCount = content.filter(el => el.type === 'image').length
      const contentPreview = (textPreview || '(无文字)') + (imageCount > 0 ? `\n[包含 ${imageCount} 张图片]` : '')

      logger.info(`管理员 ${session.userId} 发起公告，目标: ${target}，内容预览: ${contentPreview}`)
      logTargetsSummary(targetUsers, targetChannels)

      const confirmText = `即将发送公告：\n\n内容：\n${contentPreview}\n\n目标：\n${preview}\n\n请回复“确认”发送，回复“取消”取消，回复“修改”重新输入。`

      await safeSend(session, confirmText)

      pendingMap.set(String(session.userId), {
        content,
        users: targetUsers,
        channels: targetChannels,
        expireAt: Date.now() + 60000
      })
    })

  ctx.middleware(async (session, next) => {
    if (!session) return next()
    const userId = String(session.userId)
    const pending = pendingMap.get(userId)
    if (!pending) return next()
    if (pending.expireAt < Date.now()) {
      pendingMap.delete(userId)
      return next()
    }
    const text = session.content?.trim() || ''
    if (text === '确认') {
      pendingMap.delete(userId)
      await safeSend(session, '开始发送公告...')
      let resultText = ''
      if (pending.users.length > 0) {
        const r = await sendToUsers(pending.content, pending.users)
        resultText += `私聊发送完成：成功 ${r.success}，失败 ${r.fail}\n`
      }
      if (pending.channels.length > 0) {
        const r = await sendToGroups(pending.content, pending.channels)
        resultText += `群聊发送完成：成功 ${r.success}，失败 ${r.fail}`
      }
      await safeSend(session, resultText || '没有发送任何公告')
      logger.info(`管理员 ${userId} 确认发送公告，结果: ${resultText}`)
      return
    } else if (text === '取消') {
      pendingMap.delete(userId)
      await safeSend(session, '已取消发送公告')
      logger.info(`管理员 ${userId} 取消发送公告`)
      return
    } else if (text === '修改') {
      pendingMap.delete(userId)
      await safeSend(session, '已取消，请重新使用公告命令输入新内容')
      logger.info(`管理员 ${userId} 选择修改公告，已取消`)
      return
    } else {
      await safeSend(session, '请输入“确认”发送，“取消”取消，“修改”重新输入')
      return
    }
  })

  ctx.command(config.enableCommandName, '开启接收公告').action(async ({ session }) => {
    if (!session) return '会话不可用'
    if (isGroup(session)) {
      if (!hasAdmin(session)) return '只有管理员可以修改本群公告接收'
      await setChannelPreference(session, true)
      return '已开启本群公告接收'
    } else {
      await setUserPreference(session, true)
      return '已开启私聊公告接收'
    }
  })

  ctx.command(config.disableCommandName, '关闭接收公告').action(async ({ session }) => {
    if (!session) return '会话不可用'
    if (isGroup(session)) {
      if (!hasAdmin(session)) return '只有管理员可以修改本群公告接收'
      await setChannelPreference(session, false)
      return '已关闭本群公告接收'
    } else {
      await setUserPreference(session, false)
      return '已关闭私聊公告接收'
    }
  })

  ctx.command(config.statusCommandName, '查看公告接收状态').action(async ({ session }) => {
    if (!session) return '会话不可用'
    if (!ctx.database) return '数据库不可用'
    if (isGroup(session)) {
      const id = `${session.platform}:${session.channelId}`
      const rows = await ctx.database.get('channel', { id } as any)
      const enabled = rows?.[0]?.announceEnabled !== false
      return `本群公告接收：${enabled ? '开启' : '关闭'}`
    } else {
      const id = `${session.platform}:${session.userId}`
      const rows = await ctx.database.get('user', { id } as any)
      const enabled = rows?.[0]?.announceEnabled !== false
      return `你的私聊公告接收：${enabled ? '开启' : '关闭'}`
    }
  })
}