<div align="center">

# 🎯 Focus Flow
### 浮动待办 & 番茄钟 / Floating Todo & Pomodoro

<p>
  <a href="README.md">🇨🇳 简体中文</a> | <a href="README.md">🇬🇧 English</a>
</p>

<!-- 主图：展示最丰富的全局视图 -->
<img src="assets/1.png" alt="Focus Flow Main Interface" width="800" />

</div>

---

## 🇨🇳 简体中文

**Focus Flow** 是一个简洁优雅的桌面生产力工具，结合了**浮动待办清单**与**番茄工作法**。它采用始终置顶的浮动窗口设计，支持多语言、多工作区管理及强大的任务视图，帮助你保持心流，高效工作。

### ✨ 核心特性

#### 🖥️ 沉浸式专注体验
- **始终置顶**：窗口悬浮于所有应用之上，不打扰工作流。
- **极简设计**：无边框毛玻璃（Glassmorphism）效果，支持透明度调节。
- **悬浮球模式**：点击折叠按钮，窗口瞬间变身为迷你"悬浮条"，仅显示当前任务倒计时，极致节省屏幕空间。

#### 🍅 番茄钟系统
- **自动循环**：25分钟专注 + 5分钟短休，每4个循环自动进入长休（支持自定义时长）。
- **任务关联**：计时器与当前选中的任务绑定，自动记录每个任务的累计专注时间。
- **声音提醒**：结束时播放提示音（可配置）。

<div align="center">
  <img src="assets/4.png" alt="Leaf Node Mode" width="800" />
  <p><i>番茄钟系统</i></p>
</div>

#### 📊 强大的视图管理
- **全局视图 (Global View)**：在一个界面概览所有分区的任务，并允许可以在该视图下按照不同的排序规则查看。
- **叶子节点模式 (Leaf Node Mode)**：一键过滤掉复杂的文件夹层级，仅展示最底层可执行的具体任务。配合**面包屑导航**，让行动更加直接。
- **智能排序**：支持按**优先级**、**紧急度**（截止日期）、**加权分数**或**预估时间**排序。

<div align="center">
  <img src="assets/2.png" alt="Leaf Node Mode" width="800" />
  <p><i>叶子节点模式：直面可执行任务，告别层级干扰</i></p>
</div>

#### ✅ 任务与分区系统
- **多工作区 (Zones)**：创建不同的分区（如：开发项目、备考、生活），支持自定义颜色。
- **树形结构**：支持无限层级的子任务，将大目标拆解为可执行的行动，并进入具体的任务内创建和拆解。
- **紧急度色条**：任务左侧色条根据截止日期自动变色。
- **重要性设置**: 允许自定义任务的重要性，然后参与叶子节点排序时根据智能算法加权确定最终优先级。

<div align="center">
  <img src="assets/3.png" alt="Zone View" width="800" />
  <p><i>分区视图：清晰的树形结构与进度管理</i></p>
</div>

#### ⚙️ 自动化与数据安全
- **自动化规则**：设置周期性任务（如"每2天提醒喝水"、"每周五生成周报"），系统自动创建。
- **环境快照**：一键保存当前的所有设置和规则。
- **历史回溯**：内置 SQLite 数据库，支持每 120秒 **自动保存**，并可随时查看和恢复历史快照。

<div align="center">
  <table>
    <tr>
      <td align="center"><img src="assets/6.png" alt="Automation Rules" width="400" /><br /><b>自动化规则配置</b></td>
      <td align="center"><img src="assets/7.png" alt="History Snapshots" width="400" /><br /><b>历史版本回溯</b></td>
    </tr>
  </table>
</div>

### 🚀 快速开始

#### 下载安装
请前往 [Releases 页面](https://github.com/Lexiang-Xiong/Focus-Flow/releases) 下载适用于您系统的安装包：
- **Windows**: `.exe` (NSIS)
- **macOS**: `.dmg` (支持 Intel & Apple Silicon)
- **Linux**: `.AppImage` / `.deb`

#### 开发环境运行
1. **环境要求**: Node.js 20+, Rust 1.70+
2. **安装依赖**:
   ```bash
   npm install
   ```
3. **启动开发模式**:
   ```bash
   npm run tauri-dev
   ```
4. **构建生产包**:
   ```bash
   npm run tauri build
   ```

### 📖 使用指南

| 操作 | 说明 |
|------|------|
| **添加任务** | 在输入框输入内容，按 `Enter`。 |
| **添加子任务** | 点击任务右侧的 `+` 号。 |
| **开始专注** | 点击任务选中它，然后点击顶部的"开始专注"按钮。 |
| **调整窗口** | 拖动顶部标题栏移动；点击右上角图钉图标切换"始终置顶"。 |
| **收起窗口** | 点击右上角"折叠"图标，变为迷你悬浮球。 |

### 紧急度颜色说明
任务左侧的色条代表紧急程度：
- 🔴 **深红**: 已逾期
- 🔴 **红**: 12小时内到期
- 🟠 **橙/黄**: 24小时内到期
- 🟢 **绿**: 2天内到期
- 🔵 **蓝/紫**: 还有充足时间
- ⚪ **灰**: 未设置截止日期

### 🛠️ 技术栈
- **前端**: React 19, TypeScript, Vite 5
- **UI 框架**: Tailwind CSS, shadcn/ui, Radix UI
- **桌面运行时**: Tauri v2 (Rust)
- **状态管理**: Zustand (配合 SQLite 持久化)
- **国际化**: i18next

---

<div align="center">
  <p>Made with ❤️ for better productivity</p>
  <p>MIT License</p>
</div>
