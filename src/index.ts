import { Context, Schema, Logger, h } from 'koishi'
import { AnnouncementConfig, PendingState, CollectState, TargetUserWithBot, TargetChannelWithBot } from './types'
import { setUserPreference, setChannelPreference, isUserEnabled, isChannelEnabled } from './database'
import { collectTargets } from './collector'
import { buildContent, sendToUsers, sendToGroups } from './sender'
import { getText, extractImages, safeSend } from './utils'

export const name = 'announcement'
export const inject = ['database']

export const Config: Schema<AnnouncementConfig> = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用公告插件'),
  debug: Schema.boolean().default(false).description('调试模式（详细日志输出）'),
  sendInterval: Schema.number().min(0).step(1).default(200).description('每条消息发送间隔 (ms)'),
  collectTimeout: Schema.number().min(10).step(1).default(120).description('收集模式超时时间（秒）'),
})

const MAX_IMAGES = 5
const PENDING_TIMEOUT = 120_000

function formatTargetPreview(users: TargetUserWithBot[], channels: TargetChannelWithBot[], maxShow = 10) {
  const lines: string[] = []
  lines.push(`私聊用户 (${users.length})：`)
  for (const u of users.slice(0, maxShow)) {
    lines.push(`- ${u.platform}:${u.userId} (${u.nickname || u.userId})`)
  }
  if (users.length > maxShow) lines.push(`... 其余 ${users.length - maxShow} 个用户`)
  lines.push(`群聊 (${channels.length})：`)
  for (const c of channels.slice(0, maxShow)) {
    lines.push(`- ${c.platform}:${c.groupId} (${c.groupName || c.groupId})`)
  }
  if (channels.length > maxShow) lines.push(`... 其余 ${channels.length - maxShow} 个群聊`)
  return lines.join('\n')
}

function logTargetsSummary(users: TargetUserWithBot[], channels: TargetChannelWithBot[], logger: Logger, debug: boolean) {
  logger.info(`公告目标: 私聊用户 ${users.length} 个, 群聊 ${channels.length} 个`)
  if (debug) {
    for (const u of users) logger.info(`  私聊: ${u.platform}:${u.userId} (${u.nickname || u.userId})`)
    for (const c of channels) logger.info(`  群聊: ${c.platform}:${c.groupId} (${c.groupName || c.groupId})`)
  }
}

export function apply(ctx: Context, config: AnnouncementConfig) {
  if (!config.enabled) return

  const logger = new Logger(name)
  const debug = config.debug || false

  try {
    ctx.model.extend('user', { announceEnabled: 'boolean' })
    ctx.model.extend('channel', { announceEnabled: 'boolean' })
  } catch (e) {
    logger.warn('扩展数据库模型失败（可能已存在）', e)
  }

  const pendingMap = new Map<string, PendingState>()
  const collectSessions = new Map<string, CollectState>()

  const sessionKey = (session: any) => `${session.platform}:${session.userId}`
  const isGroup = (session: any) => Boolean(session.guildId)

  function startCollect(session: any, target: string) {
    const key = sessionKey(session)
    if (collectSessions.has(key)) {
      safeSend(session, '你已在收集模式中', logger)
      return
    }
    const collect: CollectState = {
      text: '',
      imageUrls: [],
      target,
      timer: setTimeout(() => {
        collectSessions.delete(key)
        safeSend(session, '收集超时，已自动退出', logger)
      }, config.collectTimeout * 1000)
    }
    collectSessions.set(key, collect)
    safeSend(session, '已进入公告收集模式，可继续发送文本和图片。\n发送「预览」查看当前内容，发送「确认」结束收集并进入发送确认，发送「取消」退出。', logger)
  }

  function resetCollectTimer(session: any, collect: CollectState) {
    clearTimeout(collect.timer)
    collect.timer = setTimeout(() => {
      collectSessions.delete(sessionKey(session))
      safeSend(session, '收集超时，已自动退出', logger)
    }, config.collectTimeout * 1000)
  }

  async function finalizeAnnouncement(session: any, text: string, target: string, imageUrls: string[] = []) {
    const { users: allUsers, channels: allChannels } = await collectTargets(ctx, ctx.bots, logger, debug)
    let targetUsers = allUsers
    let targetChannels = allChannels
    if (target === 'private') targetChannels = []
    if (target === 'group') targetUsers = []

    if (targetUsers.length === 0 && targetChannels.length === 0) {
      await safeSend(session, '没有可接收公告的用户或群聊', logger)
      return
    }

    const content = buildContent(text, imageUrls)
    if (content.length === 0) {
      await safeSend(session, '公告内容不能为空', logger)
      return
    }

    const preview = formatTargetPreview(targetUsers, targetChannels)
    const textPreview = text.trim() || '(无文字)'
    const contentPreview = `${textPreview}${imageUrls.length > 0 ? `\n[包含 ${imageUrls.length} 张图片]` : ''}`

    logger.info(`管理员 ${session.userId} 发起公告，目标: ${target}，内容预览: ${contentPreview}`)
    logTargetsSummary(targetUsers, targetChannels, logger, debug)

    const confirmText = `即将发送公告：\n\n内容：\n${contentPreview}\n\n目标：\n${preview}\n\n请回复“确认”发送，回复“取消”取消。`
    await safeSend(session, confirmText, logger)

    pendingMap.set(sessionKey(session), {
      content,
      users: targetUsers,
      channels: targetChannels,
      expireAt: Date.now() + PENDING_TIMEOUT
    })
  }

  ctx.command('announce [message:text]', '发送公告（需要权限等级 4）', { authority: 4 })
    .option('target', '-t <target>', { type: /^(private|group|all)$/i, fallback: 'all' })
    .option('collect', '-c', { type: 'boolean' })
    .action(async ({ session, options }, message) => {
      if (!session) return '会话不可用'

      const target = ((options?.target as string) || 'all').toLowerCase()
      const attachedImages = extractImages(session.elements)
      const useCollect = options?.collect || (!message && attachedImages.length === 0)

      if (useCollect) {
        startCollect(session, target)
        return
      }

      const finalText = message || getText(session.elements, session.content)
      return finalizeAnnouncement(session, finalText, target, attachedImages)
    })

  ctx.middleware(async (session, next) => {
    if (!session) return next()
    const key = sessionKey(session)
    const text = getText(session.elements, session.content)

    const pending = pendingMap.get(key)
    if (pending) {
      if (pending.expireAt < Date.now()) {
        pendingMap.delete(key)
        return next()
      }
      if (text === '确认') {
        pendingMap.delete(key)
        await safeSend(session, '开始发送公告...', logger)
        let resultText = ''
        if (pending.users.length > 0) {
          const r = await sendToUsers(pending.users, pending.content, config.sendInterval, logger, debug)
          resultText += `私聊发送完成：成功 ${r.success}，失败 ${r.fail}\n`
        }
        if (pending.channels.length > 0) {
          const r = await sendToGroups(pending.channels, pending.content, config.sendInterval, logger, debug)
          resultText += `群聊发送完成：成功 ${r.success}，失败 ${r.fail}`
        }
        await safeSend(session, resultText || '没有发送任何公告', logger)
        logger.info(`管理员 ${session.userId} 确认发送公告，结果: ${resultText}`)
        return
      }
      if (text === '取消') {
        pendingMap.delete(key)
        await safeSend(session, '已取消发送公告', logger)
        return
      }
      await safeSend(session, '请输入“确认”发送，“取消”取消', logger)
      return
    }

    const collect = collectSessions.get(key)
    if (!collect) return next()

    if (text === '取消' || text === 'cancel') {
      clearTimeout(collect.timer)
      collectSessions.delete(key)
      await safeSend(session, '已取消收集模式', logger)
      return
    }
    if (text === '确认' || text === '开始' || text === 'start') {
      clearTimeout(collect.timer)
      collectSessions.delete(key)
      if (!collect.text && collect.imageUrls.length === 0) {
        await safeSend(session, '公告内容不能为空', logger)
        return
      }
      await finalizeAnnouncement(session, collect.text, collect.target, collect.imageUrls)
      return
    }
    if (text === '预览' || text === 'preview') {
      const previewText = collect.text || '(无文字)'
      const imgCount = collect.imageUrls.length
      await safeSend(session, `当前公告内容：\n${previewText}\n${imgCount > 0 ? `图片数量：${imgCount}` : ''}`, logger)
      return
    }

    const addedImages = extractImages(session.elements)
    let imgAccepted = 0
    if (addedImages.length > 0) {
      const remaining = MAX_IMAGES - collect.imageUrls.length
      imgAccepted = Math.min(addedImages.length, Math.max(remaining, 0))
      if (imgAccepted > 0) {
        collect.imageUrls.push(...addedImages.slice(0, imgAccepted))
        resetCollectTimer(session, collect)
      }
      if (imgAccepted < addedImages.length) {
        await safeSend(session, `最多支持 ${MAX_IMAGES} 张图片，本次已忽略 ${addedImages.length - imgAccepted} 张`, logger)
      }
    }

    if (text) {
      collect.text = collect.text ? collect.text + '\n' + text : text
      resetCollectTimer(session, collect)
    }

    if (imgAccepted > 0 && text) {
      await safeSend(session, `已添加 ${imgAccepted} 张图片，当前共 ${collect.imageUrls.length} 张；文字已更新`, logger)
    } else if (imgAccepted > 0) {
      await safeSend(session, `已添加 ${imgAccepted} 张图片，当前共 ${collect.imageUrls.length} 张`, logger)
    } else if (text) {
      await safeSend(session, `当前已收集: ${collect.imageUrls.length} 张图片, 文字已更新`, logger)
    }
    return
  })

  ctx.command('announce.enable', '开启接收公告').action(async ({ session }) => {
    if (!session) return '会话不可用'
    if (isGroup(session)) {
      const userData = await ctx.database.getUser(session.platform, session.userId!, ['authority']) as any
      if (!userData || (userData.authority ?? 0) < 4) return '只有管理员可以修改本群公告接收'
      await setChannelPreference(ctx, session.platform, (session.guildId || session.channelId)!, true)
      return '已开启本群公告接收'
    } else {
      await setUserPreference(ctx, session.platform, session.userId!, true)
      return '已开启私聊公告接收'
    }
  })

  ctx.command('announce.disable', '关闭接收公告').action(async ({ session }) => {
    if (!session) return '会话不可用'
    if (isGroup(session)) {
      const userData = await ctx.database.getUser(session.platform, session.userId!, ['authority']) as any
      if (!userData || (userData.authority ?? 0) < 4) return '只有管理员可以修改本群公告接收'
      await setChannelPreference(ctx, session.platform, (session.guildId || session.channelId)!, false)
      return '已关闭本群公告接收'
    } else {
      await setUserPreference(ctx, session.platform, session.userId!, false)
      return '已关闭私聊公告接收'
    }
  })

  ctx.command('announce.status', '查看公告接收状态').action(async ({ session }) => {
    if (!session) return '会话不可用'
    if (isGroup(session)) {
      const enabled = await isChannelEnabled(ctx, session.platform, (session.guildId || session.channelId)!)
      return `本群公告接收：${enabled ? '开启' : '关闭'}`
    } else {
      const enabled = await isUserEnabled(ctx, session.platform, session.userId!)
      return `你的私聊公告接收：${enabled ? '开启' : '关闭'}`
    }
  })

  ctx.on('dispose', () => {
    for (const s of collectSessions.values()) clearTimeout(s.timer)
    collectSessions.clear()
    pendingMap.clear()
  })
}