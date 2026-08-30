import { h, Logger } from 'koishi'

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function getTextFromElements(elements?: h[]): string {
  if (!elements || !Array.isArray(elements)) return ''
  return h.select(elements, 'text').map(el => el.attrs?.content || '').join(' ').trim()
}

export function getText(elements?: h[], content?: string): string {
  const fromElements = getTextFromElements(elements)
  if (fromElements) return fromElements
  if (!content) return ''
  try {
    return getTextFromElements(h.parse(content))
  } catch {
    return ''
  }
}

export function extractImages(elements?: h[]): string[] {
  if (!elements || !Array.isArray(elements)) return []
  const srcs: string[] = []
  for (const el of h.select(elements, 'img')) {
    const src = el.attrs?.src
    if (src) srcs.push(decodeHtmlEntities(String(src)))
  }
  for (const el of h.select(elements, 'image')) {
    const src = el.attrs?.src
    if (src) srcs.push(decodeHtmlEntities(String(src)))
  }
  return srcs
}

export async function safeSend(session: any, message: any, logger: Logger) {
  try {
    await session.send(message)
  } catch (e) {
    logger.warn(`消息发送失败: ${e}`)
  }
}