# koishi-plugin-announcement

## 项目介绍 (Project Introduction)

### 中文
这是一个为 Koishi 机器人框架开发的**公告插件**，支持向所有私聊用户和群聊发送公告。管理员可通过命令快速广播消息，支持文字和图片。用户可自行选择是否接收私聊公告，群聊接收状态由管理员控制。插件基于 Koishi 数据库存储用户/群聊的接收偏好，实时获取机器人的好友和群列表，支持多平台、多机器人，并提供收集模式与发送前确认机制，避免误发。

### English
This is an **announcement plugin** developed for the Koishi robot framework. It supports sending announcements to all private chat users and group chats. Administrators can broadcast messages via commands, with support for text and images. Users can choose whether to receive private chat announcements, and group chat reception is controlled by administrators. The plugin stores user/group reception preferences in the Koishi database, retrieves friend and group lists in real time, supports multiple platforms and bots, and provides a collection mode and pre-send confirmation mechanism to avoid mistakes.

## 项目仓库 (Repository)
- GitHub: `https://github.com/Minecraft-1314/koishi-plugin-announcement`
- Issues: `https://github.com/Minecraft-1314/koishi-plugin-announcement/issues`

## 核心指令 (Core Commands)

| 指令 (Command) | 说明 (Description) | 示例 (Example) |
|----------------|--------------------|----------------|
| `announce` | 进入收集模式（默认目标为全部） | `announce` |
| `announce -t private` | 进入收集模式，仅发送给私聊用户 | `announce -t private` |
| `announce -t group` | 进入收集模式，仅发送给群聊 | `announce -t group` |
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
| `sendInterval` | number | 200 | 每条消息发送间隔 (ms) (Interval between each message) |
| `collectTimeout` | number | 120 | 收集模式超时时间（秒）(Collection mode timeout in seconds) |

## 使用方法 (Usage)

### 管理员发送公告 (Admin Sending Announcements)

**指定目标类型：**
- `announce -t private` 仅私聊
- `announce -t group` 仅群聊
- `announce -t all` 全部（默认）

1. 发送 `announce`（可搭配 `-t` 指定目标类型）进入收集模式。
2. 机器人提示后，你可以：
   - 发送文本消息（自动追加）
   - 发送图片消息（自动累积，最多 5 张）
3. 发送 `预览` 查看当前内容。
4. 发送 `确认` 结束收集，进入最终发送确认（仍需回复 `确认` 才会真正发送）。
5. 发送 `取消` 退出收集模式。
6. 超时（默认 120 秒）自动退出。

### 用户设置接收 (User Settings)

- **私聊中**：发送 `announce.disable` 关闭私聊公告接收，发送 `announce.enable` 重新开启，发送 `announce.status` 查看当前状态。
- **群聊中**：只有权限等级达到 4 的管理员可以使用 `announce.disable` / `announce.enable` 控制当前群聊是否接收公告。

## 注意事项 (Notes)

- 必须启用 Koishi 数据库插件（如 `@koishijs/plugin-database-sqlite`），否则插件无法存储接收偏好。
- 默认所有用户和群聊都接收公告，用户可自行关闭私聊接收，群聊由管理员控制。
- 发送大量用户时可能耗时较长，请合理设置 `sendInterval`。
- 调试模式会输出详细日志，建议仅在排查问题时开启。
- 只有权限等级达到 4 的用户可以发送公告。

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