import { h } from 'koishi'

declare module 'koishi' {
  interface User {
    announceEnabled?: boolean
  }
  interface Channel {
    announceEnabled?: boolean
  }
}

export interface AnnouncementConfig {
  enabled: boolean
  debug: boolean
  sendInterval: number
  collectTimeout: number
}

export interface TargetUser {
  platform: string
  userId: string
  nickname: string
}

export interface TargetChannel {
  platform: string
  groupId: string
  groupName: string
}

export interface TargetUserWithBot extends TargetUser {
  bot: any
}

export interface TargetChannelWithBot extends TargetChannel {
  bot: any
}

export interface PendingState {
  content: h[]
  users: TargetUserWithBot[]
  channels: TargetChannelWithBot[]
  expireAt: number
}

export interface CollectState {
  text: string
  imageUrls: string[]
  target: string
  timer: ReturnType<typeof setTimeout>
}