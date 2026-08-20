# koishi-plugin-announcement

## 项目介绍 (Project Introduction)

### 中文
这是一个为 Koishi 机器人框架开发的**公告插件**，支持向所有私聊用户和群聊发送公告。管理员可通过命令快速广播消息，支持文字和图片。用户可自行选择是否接收私聊公告，群聊接收状态由管理员控制。插件基于 Koishi 数据库存储用户/群聊的接收偏好，实时获取机器人的好友和群列表，支持多平台、多机器人，并提供收集模式与发送前确认机制，避免误发。

### English
This is an **announcement plugin** developed for the Koishi robot framework. It supports sending announcements to all private chat users and group chats. Administrators can broadcast messages via commands, with support for text and images. Users can choose whether to receive private chat announcements, and group chat reception is controlled by administrators. The plugin stores user/group reception preferences in the Koishi database, retrieves friend and group lists in real time, supports multiple platforms and bots, and provides a collection mode and pre-send confirmation mechanism to avoid mistakes.

## 项目仓库 (Repository)
- GitHub: `https://github.com/Minecraft-1314/koishi-plugin-announcement`
- Issues: `https://github.com/Minecraft-1314/koishi-plugin-announcement/issues`

## 功能特性 (Features)

- ✅ 支持向所有私聊用户发送公告
- ✅ 支持向所有群聊发送公告
- ✅ 支持指定目标类型（私聊 / 群聊 / 全部）
- ✅ 管理员 ID 白名单控制发送权限
- ✅ 用户可在私聊中自行开启/关闭公告接收
- ✅ 群聊接收状态可由管理员在群内设置
- ✅ 支持文字与图片公告（图片 URL 自动识别，收集模式可发送图片）
- ✅ 支持收集模式：连续发送文本和图片，最后确认发送
- ✅ 发送前显示目标预览和内容预览，可确认/取消/修改
- ✅ 调试模式输出详细日志
- ✅ 实时获取好友和群列表（支持分页）
- ✅ 多平台、多机器人自动去重发送
- ✅ 数据库存储接收偏好，默认全部开启

## 核心指令 (Core Commands)

| 指令 (Command) | 说明 (Description) | 示例 (Example) |
|----------------|--------------------|----------------|
| `announce <内容>` | 直接发送公告（默认目标为全部） | `announce 服务器将于今晚维护` |
| `announce -t private <内容>` | 仅发送给私聊用户 | `announce -t private 你好` |
| `announce -t group <内容>` | 仅发送给群聊 | `announce -t group 群公告测试` |
| `announce` | 进入收集模式（可继续发送文本/图片） | `announce` |
| `announce -c` | 强制进入收集模式 | `announce -c` |
| `announce.enable` | 开启接收公告（私聊中个人设置，群聊中管理员设置） | `announce.enable` |
| `announce.disable` | 关闭接收公告（私聊中个人设置，群聊中管理员设置） | `announce.disable` |
| `announce.status` | 查看当前接收状态（私聊/群聊） | `announce.status` |

### 收集模式交互指令 (Collection Mode Commands)

在收集模式中，你可以使用以下指令：

| 指令 | 说明 |
|------|------|
| `预览` | 查看当前收集到的文本和图片数量 |
| `确认` | 结束收集，进入最终发送确认 |
| `取消` | 退出收集模式，丢弃内容 |
| 发送文本 | 追加到公告文本 |
| 发送图片 | 添加到公告图片列表 |

## 配置项说明 (Configuration)

### 基本设置 (Basic Settings)

| 配置项 (Config) | 类型 (Type) | 默认值 (Default) | 说明 (Description) |
|----------------|-------------|-------------------|---------------------|
| `enabled` | boolean | true | 是否启用公告插件 (Enable plugin) |
| `debug` | boolean | false | 调试模式（详细日志输出）(Debug mode with detailed logs) |
| `adminIds` | string | 空 | 管理员用户ID（逗号分隔，仅这些用户可发送公告）(Admin user IDs, comma separated, only these users can send announcements) |
| `sendInterval` | number | 200 | 每条消息发送间隔 (ms) (Interval between each message) |
| `collectTimeout` | number | 120 | 收集模式超时时间（秒）(Collection mode timeout in seconds) |
| `announceCommandName` | string | `announce` | 发送公告命令名 (Command name for sending announcements) |
| `enableCommandName` | string | `announce.enable` | 开启接收公告命令名 (Command name for enabling reception) |
| `disableCommandName` | string | `announce.disable` | 关闭接收公告命令名 (Command name for disabling reception) |
| `statusCommandName` | string | `announce.status` | 查看接收状态命令名 (Command name for checking status) |

## 使用方法 (Usage)

### 管理员发送公告 (Admin Sending Announcements)

#### 方式一：直接发送

1. 在插件配置中填写 `adminIds`，例如 `123456,789012`。
2. 使用命令 `announce <公告内容>` 发起公告。
   - 可在文本中包含图片 URL（以 `.jpg`、`.png` 等结尾的链接），插件会自动提取并作为图片发送。
   - 也可在命令后直接附带图片（如果平台支持）。
3. 机器人会返回目标预览（私聊用户和群聊列表）和内容预览。
4. 回复 `确认` 发送，回复 `取消` 取消，回复 `修改` 重新输入。
5. 发送完成后会返回成功/失败统计。

**指定目标类型：**
- `announce -t private <内容>` 仅私聊
- `announce -t group <内容>` 仅群聊
- `announce -t all <内容>` 全部（默认）

#### 方式二：收集模式（支持多轮输入）

1. 发送 `announce` 或 `announce -c` 进入收集模式。
2. 机器人提示后，你可以：
   - 发送文本消息（自动追加）
   - 发送图片消息（自动累积，最多 5 张）
3. 发送 `预览` 查看当前内容。
4. 发送 `确认` 结束收集，进入最终发送确认（仍需回复 `确认` 才会真正发送）。
5. 发送 `取消` 退出收集模式。
6. 超时（默认 120 秒）自动退出。

### 用户设置接收 (User Settings)

- **私聊中**：发送 `announce.disable` 关闭私聊公告接收，发送 `announce.enable` 重新开启，发送 `announce.status` 查看当前状态。
- **群聊中**：只有管理员（`adminIds` 中的用户）可以使用 `announce.disable` / `announce.enable` 控制当前群聊是否接收公告。

## 发送流程 (Sending Flow)

1. 管理员执行 `announce` 命令或进入收集模式。
2. 插件实时获取所有已开启接收的好友和群列表。
3. 显示目标预览（前10个，超过部分折叠）和内容预览（含图片数量）。
4. 管理员回复 `确认` / `取消` / `修改`。
5. 确认后开始逐条发送，支持多平台、多机器人自动去重。
6. 发送完成后报告成功和失败数量。

## 注意事项 (Notes)

- 必须启用 Koishi 数据库插件（如 `@koishijs/plugin-database-sqlite`），否则插件无法存储接收偏好。
- 默认所有用户和群聊都接收公告，用户可自行关闭私聊接收，群聊由管理员控制。
- 发送大量用户时可能耗时较长，请合理设置 `sendInterval`。
- 图片支持：
  - 文本中的图片 URL 需以常见图片扩展名结尾（如 `https://example.com/image.jpg`）。
  - 收集模式中直接发送的图片会被提取 `img` 元素的 `src`。
- 调试模式会输出详细日志，建议仅在排查问题时开启。
- 未配置任何 `adminIds` 时，无人可以发送公告。
- 获取好友/群列表依赖机器人适配器实现 `getFriendList` / `getGuildList`；如果不支持，将忽略该平台。

## 项目贡献者 (Contributors)

| 贡献者 (Contributor) | 贡献内容 (Contribution) |
|----------------------|-------------------------|
| Minecraft-1314 | 插件开发 (Plugin development) |

（欢迎通过 Issues 或 PR 加入贡献者列表）  
(Welcome to join the contributor list via Issues or PR)

## 许可协议 (License)

本项目采用 MIT 许可证，详情参见 [LICENSE](LICENSE) 文件。  
This project is licensed under the MIT License, see the [LICENSE](LICENSE) file for details.

## 支持我们 (Support Us)

如果这个项目对您有帮助，欢迎点亮右上角的 Star ⭐ 支持我们！  
If this project is helpful to you, please feel free to star it in the upper right corner ⭐ to support us!