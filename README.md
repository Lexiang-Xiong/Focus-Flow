# 浮动待办 (Floating Todo)

一个简洁优雅的浮动工作清单工具，支持番茄钟计时，帮助你保持专注。

![Floating Todo Preview](https://i.imgur.com/placeholder.png)

## ✨ 功能特性

- **浮动窗口** - 始终置顶，无边框设计，可拖拽移动
- **任务管理** - 添加、完成、编辑、删除任务，支持优先级标记
- **番茄钟** - 25分钟专注 + 5分钟休息，自动循环
- **智能提醒** - 计时完成声音提醒和通知
- **数据持久化** - 本地存储，刷新不丢失
- **毛玻璃效果** - 现代 UI 设计，美观不遮挡

## 🚀 快速开始

### 浏览器演示

直接在浏览器中打开 `demo/index.html` 即可体验基础功能。

### 桌面应用（推荐）

#### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) 1.70+

#### 安装步骤

1. 克隆仓库
```bash
git clone <repository-url>
cd floating-todo
```

2. 安装依赖
```bash
npm install
```

3. 开发模式运行
```bash
npm run tauri-dev
```

4. 构建生产版本
```bash
npm run tauri-build
```

构建完成后，安装包位于 `src-tauri/target/release/bundle/` 目录。

## 📖 使用说明

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + Shift + T` | 显示/隐藏窗口 |

### 窗口控制

- **拖拽移动** - 按住标题栏任意位置拖动
- **置顶/取消置顶** - 点击图钉按钮
- **最小化** - 点击减号按钮
- **关闭** - 点击 X 按钮

### 任务管理

1. **添加任务** - 在输入框输入任务内容，按回车或点击 + 按钮
2. **设置优先级** - 点击左侧圆点选择高/中/低优先级
3. **完成任务** - 点击任务左侧方框
4. **编辑任务** - 点击编辑图标
5. **删除任务** - 点击垃圾桶图标

### 番茄钟

1. 选择要专注的任务
2. 点击"开始专注"按钮
3. 25分钟后自动进入休息模式
4. 完成4个番茄钟后进入长休息（15分钟）

## 🛠️ 技术栈

- **前端**: React + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **桌面框架**: Tauri v2
- **状态管理**: React Hooks + LocalStorage

## 📁 项目结构

```
floating-todo/
├── src/
│   ├── components/       # React 组件
│   │   ├── FloatWindow.tsx    # 浮动窗口容器
│   │   ├── PomodoroTimer.tsx  # 番茄钟组件
│   │   ├── TaskList.tsx       # 任务列表
│   │   └── TaskItem.tsx       # 任务项
│   ├── hooks/           # 自定义 Hooks
│   │   ├── useStorage.ts      # 本地存储
│   │   ├── useTasks.ts        # 任务管理
│   │   └── useTimer.ts        # 计时器
│   ├── types/           # TypeScript 类型
│   └── App.tsx          # 主应用
├── src-tauri/           # Tauri 配置
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/main.rs
├── demo/                # 浏览器演示
└── dist/                # 构建输出
```

## 🔧 配置说明

### 番茄钟时长设置

编辑 `src/hooks/useStorage.ts` 修改默认时长：

```typescript
const defaultState: AppState = {
  settings: {
    workDuration: 25 * 60,        // 工作时长（秒）
    breakDuration: 5 * 60,        // 休息时长（秒）
    longBreakDuration: 15 * 60,   // 长休息时长（秒）
    autoStartBreak: false,        // 自动开始休息
    soundEnabled: true,           // 声音提醒
  },
};
```

### 窗口配置

编辑 `src-tauri/tauri.conf.json` 修改窗口属性：

```json
{
  "windows": [{
    "width": 340,
    "height": 500,
    "alwaysOnTop": true,      // 始终置顶
    "decorations": false,      // 无边框
    "transparent": true        // 透明背景
  }]
}
```

## 📝 开发计划

- [x] 基础浮动窗口
- [x] 任务管理功能
- [x] 番茄钟计时器
- [x] 数据持久化
- [x] 毛玻璃效果
- [ ] 系统托盘图标
- [ ] 全局快捷键自定义
- [ ] 数据统计图表
- [ ] 多语言支持
- [ ] 云同步功能

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

Made with ❤️ for better productivity
