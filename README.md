# AI Chat Memory Extension

一个支持ChatGPT、Gemini和Monica的AI聊天记忆扩展，可以自动保存和管理你的AI对话记录。

## 🌟 功能特性

- **多平台支持**: 支持 ChatGPT、Google Gemini、Monica
- **自动保存**: 智能检测新消息并自动保存
- **手动保存**: 支持手动触发保存
- **搜索功能**: 快速搜索历史对话
- **导出功能**: 支持导出选中的对话或全部对话
- **悬浮标签**: 在聊天页面显示可拖动的悬浮标签
- **智能增量更新**: 只保存新增或变化的消息

## 🚀 安装方式

### 开发者模式安装
1. 克隆或下载此项目
2. 打开Chrome浏览器，进入 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `chat-memory-extension` 文件夹

## 📁 项目结构

```
chat-memory-extension/
├── manifest.json          # 扩展清单文件
├── js/
│   ├── background.js      # 后台脚本
│   ├── popup.js         # 侧边栏脚本
│   ├── content_common.js # 通用内容脚本
│   ├── core/           # 核心模块
│   │   ├── base.js     # 基础适配器
│   │   ├── storage-manager.js
│   │   └── compatibility.js
│   └── adapters/       # 平台适配器
│       ├── chatgpt.js  # ChatGPT适配器
│       ├── gemini.js   # Gemini适配器
│       └── monica.js   # Monica适配器
├── css/
│   └── content.css     # 样式文件
├── html/
│   └── popup.html      # 侧边栏页面
├── icons/
│   └── logo.svg       # 图标文件
└── README.md
```

## 🛠️ 技术实现

### 架构设计
- **适配器模式**: 每个平台有独立的适配器，继承自BasePlatformAdapter
- **模块化设计**: 核心功能与平台特定代码分离
- **智能更新**: 使用增量保存策略，只保存变化的内容

### 核心组件
1. **BasePlatformAdapter**: 基础适配器，包含通用逻辑
2. **StorageManager**: 数据存储管理，使用IndexedDB
3. **Platform Adapters**: 各平台特定的消息提取和URL处理
4. **Background Script**: 后台服务，处理数据同步
5. **Content Scripts**: 页面注入脚本，负责消息提取和UI交互

### 消息提取策略
- **ChatGPT**: 通过 `data-message-author-role` 和 `data-testid` 属性识别消息
- **Gemini**: 通过自定义元素标签和CSS类名识别
- **Monica**: 智能分析DOM结构，兼容多种消息格式

## 🎯 使用方法

### 自动保存模式
1. 访问支持的AI聊天网站
2. 开始正常聊天
3. 扩展会自动检测并保存新消息
4. 悬浮标签显示"自动记忆"状态

### 手动保存模式
1. 在设置中切换到手动保存模式
2. 点击悬浮标签中的保存按钮
3. 手动触发当前对话的保存

### 查看和管理
1. 点击扩展图标或悬浮标签
2. 打开侧边栏查看所有保存的对话
3. 使用搜索功能快速查找特定对话
4. 选择对话并导出

## 🔧 自定义配置

### 添加新平台支持
1. 在 `js/adapters/` 目录下创建新的适配器文件
2. 继承 `BasePlatformAdapter` 类
3. 实现必要的抽象方法：
   - `isValidConversationUrl(url)`
   - `extractConversationInfo(url)`
   - `extractMessages()`
   - `isMessageElement(node)`

4. 在 `manifest.json` 中添加新的content script配置
5. 在后台脚本中添加支持的平台

### 配置示例
```javascript
class NewPlatformAdapter extends BasePlatformAdapter {
  constructor() {
    super('newplatform');
  }

  isValidConversationUrl(url) {
    // 实现URL验证逻辑
  }

  extractMessages() {
    // 实现消息提取逻辑
  }

  // 其他必要方法...
}
```

## 🐛 常见问题

### Q: 为什么某些消息没有被保存？
A: 可能的原因：
- 页面DOM结构发生变化，需要更新适配器
- 用户正在编辑消息，系统会跳过提取
- 网络延迟导致消息加载缓慢

### Q: 如何调试特定平台的问题？
A:
1. 打开开发者工具查看控制台日志
2. 检查适配器是否正确加载
3. 验证DOM选择器是否仍然有效
4. 使用断点调试消息提取逻辑

### Q: 扩展会保存我的数据到哪？
A: 数据保存在本地的IndexedDB中，具体是：
- 数据库名: `AIChatMemoryDB`
- 存储名称: `conversations`
- 所有数据都保存在本地，不会上传到任何服务器

## 📄 许可证

MIT License - 详见项目根目录的LICENSE文件

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个扩展！

## 📞 联系方式

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件到 [your-email@example.com]

---

**注意**: 这是一个示例扩展，仅供学习和参考使用。在实际使用前，请根据各平台的最新UI变化进行相应的适配器更新。