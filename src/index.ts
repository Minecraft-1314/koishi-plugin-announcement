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
  collectTimeout: number
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
  collectTimeout: Schema.number().min(10).step(1).default(120).description('收集模式超时时间（秒）'),
  announceCommandName: Schema.string().default('announce').description('发送公告命令名'),
  enableCommandName: Schema.string().default('announce.enable').description('开启接收公告命令名'),
  disableCommandName: Schema.string().default('announce.disable').description('关闭接收公告命令名'),
  statusCommandName: Schema.string().default('announce.status').description('查看接收状态命令名'),
})

export function apply(ctx: Context, config: AnnouncementConfig) {
  if (!config.enabled) return

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

  async function safeSend(session: any, message: any) {
    try {
      await session.send(message)
    } catch (e) {
      logger.warn(`消息发送失败: ${e}`)
    }
  }

  function decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }

  function getTextFromElements(elements?: any[]): string {
    if (!elements || !Array.isArray(elements)) return ''
    const texts = h.select(elements, 'text').map(el => el.attrs?.text || el.data?.text || '')
    return texts.join(' ').trim()
  }

  function hasImageElement(elements?: any[]): boolean {
    if (!elements || !Array.isArray(elements)) return false
    return elements.some(el => el.type === 'img' || el.type === 'image')
  }

  function getText(session: any): string {
    const elements = session.elements
    if (hasImageElement(elements)) {
      return getTextFromElements(elements)
    }
    const fromElements = getTextFromElements(elements)
    if (fromElements) return fromElements
    return session.content?.trim() || ''
  }

  async function setUserPreference(session: any, enabled: boolean) {
    const id = `${session.platform}:${session.userId}`
    const rows = await ctx.database!.get('user', { id } as any)
    if (Array.isArray(rows) && rows.length > 0) {
      await ctx.database!.set('user', { id } as any, { announceEnabled: enabled } as any)
    } else {
      await ctx.database!.create('user', { id, announceEnabled: enabled } as any)
    }
  }

  async function setChannelPreference(session: any, enabled: boolean) {
    const id = `${session.platform}:${session.guildId || session.channelId}`
    const rows = await ctx.database!.get('channel', { id } as any)
    if (Array.isArray(rows) && rows.length > 0) {
      await ctx.database!.set('channel', { id } as any, { announceEnabled: enabled } as any)
    } else {
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
        const data = Array.isArray(result) ? result : result?.data
        if (!Array.isArray(data)) break
        allGroups = allGroups.concat(
          data.map((g: any) => ({
            groupId: String(g.id),
            groupName: g.name || `群组-${String(g.id).slice(-4)}`
          }))
        )
        nextToken = result && !Array.isArray(result) ? result.next || null : null
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

  function buildContent(messageText: string, attachedImages: string[]): h[] {
    const content: h[] = []
    if (messageText && messageText.trim()) {
      content.push(h.text(messageText.trim()))
    }
    for (const url of attachedImages) {
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
  const collectSessions = new Map<string, { text: string; imageUrls: string[]; target: string; timer: NodeJS.Timeout }>()

  ctx.on('dispose', () => {
    for (const s of collectSessions.values()) clearTimeout(s.timer)
    collectSessions.clear()
    pendingMap.clear()
  })

  function startCollect(session: any, target: string) {
    const key = `${session.platform}:${session.userId}`
    if (collectSessions.has(key)) {
      safeSend(session, '你已在收集模式中')
      return
    }
    const collect = {
      text: '',
      imageUrls: [],
      target,
      timer: null as any
    }
    collect.timer = setTimeout(() => {
      collectSessions.delete(key)
      safeSend(session, '收集超时，已自动退出')
    }, config.collectTimeout * 1000)
    collectSessions.set(key, collect)
    safeSend(session, '已进入公告收集模式，可继续发送文本和图片。\n发送「预览」查看当前内容，发送「确认」结束收集并进入发送确认，发送「取消」退出。')
  }

  function resetCollectTimer(session: any, collect: any) {
    clearTimeout(collect.timer)
    collect.timer = setTimeout(() => {
      collectSessions.delete(`${session.platform}:${session.userId}`)
      safeSend(session, '收集超时，已自动退出')
    }, config.collectTimeout * 1000)
  }

  async function finalizeAnnouncement(session: any, text: string, target: string, imageUrls: string[] = []) {
    const { users: allUsers, channels: allChannels } = await collectTargets()
    let targetUsers = allUsers
    let targetChannels = allChannels
    if (target === 'private') targetChannels = []
    if (target === 'group') targetUsers = []

    if (targetUsers.length === 0 && targetChannels.length === 0) {
      await safeSend(session, '没有可接收公告的用户或群聊')
      return
    }

    const content = buildContent(text, imageUrls)
    if (content.length === 0) {
      await safeSend(session, '公告内容不能为空')
      return
    }

    const preview = formatTargetPreview(targetUsers, targetChannels)
    const textPreview = text.trim() || '(无文字)'
    const imageCount = imageUrls.length
    const contentPreview = `${textPreview}${imageCount > 0 ? `\n[包含 ${imageCount} 张图片]` : ''}`

    logger.info(`管理员 ${session.userId} 发起公告，目标: ${target}，内容预览: ${contentPreview}`)
    logTargetsSummary(targetUsers, targetChannels)

    const confirmText = `即将发送公告：\n\n内容：\n${contentPreview}\n\n目标：\n${preview}\n\n请回复“确认”发送，回复“取消”取消。`
    await safeSend(session, confirmText)

    pendingMap.set(`${session.platform}:${session.userId}`, {
      content,
      users: targetUsers,
      channels: targetChannels,
      expireAt: Date.now() + 120000
    })
  }

  ctx.command(`${config.announceCommandName} [message:text]`, '发送公告（仅限配置的管理员ID）')
    .option('target', '-t <target>', { type: /^(private|group|all)$/i, fallback: 'all' })
    .option('collect', '-c', { type: 'boolean' })
    .action(async ({ session, options }, message) => {
      if (!session) return '会话不可用'
      if (!hasAdmin(session)) return '你没有权限发送公告'

      const target = ((options?.target as string) || 'all').toLowerCase()
      const hasAttachedImage = session.elements?.some(el => el.type === 'image' || el.type === 'img') ?? false
      const useCollect = options?.collect || (!message && !hasAttachedImage)

      if (useCollect) {
        startCollect(session, target)
        return
      }

      const attachedImages: string[] = []
      if (session.elements) {
        for (const el of session.elements) {
          if (el.type === 'image' && el.data?.src) {
            attachedImages.push(decodeHtmlEntities(String(el.data.src)))
          } else if (el.type === 'img' && el.attrs?.src) {
            attachedImages.push(decodeHtmlEntities(String(el.attrs.src)))
          }
        }
      }

      const finalText = message || getText(session)

      return finalizeAnnouncement(session, finalText, target, attachedImages)
    })

  ctx.middleware(async (session, next) => {
    if (!session) return next()
    const userId = `${session.platform}:${session.userId}`

    const pending = pendingMap.get(userId)
    if (pending) {
      if (pending.expireAt < Date.now()) {
        pendingMap.delete(userId)
        return next()
      }
      const text = getText(session)
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
        logger.info(`管理员 ${session.userId} 确认发送公告，结果: ${resultText}`)
        return
      } else if (text === '取消') {
        pendingMap.delete(userId)
        await safeSend(session, '已取消发送公告')
        logger.info(`管理员 ${session.userId} 取消发送公告`)
        return
      } else {
        await safeSend(session, '请输入“确认”发送，“取消”取消')
        return
      }
    }

    const collect = collectSessions.get(userId)
    if (!collect) return next()

    const text = getText(session)
    if (text === '取消' || text === 'cancel') {
      clearTimeout(collect.timer)
      collectSessions.delete(userId)
      await safeSend(session, '已取消收集模式')
      return
    }
    if (text === '确认' || text === '开始' || text === 'start') {
      clearTimeout(collect.timer)
      collectSessions.delete(userId)
      if (!collect.text && collect.imageUrls.length === 0) {
        await safeSend(session, '公告内容不能为空')
        return
      }
      await finalizeAnnouncement(session, collect.text, collect.target, collect.imageUrls)
      return
    }
    if (text === '预览' || text === 'preview') {
      const previewText = collect.text || '(无文字)'
      const imgCount = collect.imageUrls.length
      await safeSend(session, `当前公告内容：\n${previewText}\n${imgCount > 0 ? `图片数量：${imgCount}` : ''}`)
      return
    }

    const imgs = [
      ...h.select(session.elements || [], 'img'),
      ...h.select(session.elements || [], 'image')
    ]
    const addedImages: string[] = []
    for (const img of imgs) {
      const src = img.attrs?.src || img.data?.src
      if (src) addedImages.push(decodeHtmlEntities(String(src)))
    }
    if (addedImages.length > 0) {
      collect.imageUrls.push(...addedImages)
      resetCollectTimer(session, collect)
    }

    const addedText = text && text !== '预览' && text !== '确认' && text !== '取消' && text !== '开始' && text !== 'start' && text !== 'cancel' ? text : ''
    if (addedText) {
      if (collect.text) collect.text += '\n' + addedText
      else collect.text = addedText
      resetCollectTimer(session, collect)
    }

    if (addedImages.length > 0 && addedText) {
      await safeSend(session, `已添加 ${addedImages.length} 张图片，当前共 ${collect.imageUrls.length} 张；文字已更新`)
    } else if (addedImages.length > 0) {
      await safeSend(session, `已添加 ${addedImages.length} 张图片，当前共 ${collect.imageUrls.length} 张`)
    } else if (addedText) {
      await safeSend(session, `当前已收集: ${collect.imageUrls.length} 张图片, 文字已更新`)
    }
    return
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
      const id = `${session.platform}:${session.guildId || session.channelId}`
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