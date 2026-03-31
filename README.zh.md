# Web Weather — 交互式网页天气模拟

中文 | [English](README.md)

> **Windows 天气壁纸 **：[greywen/weather-wallpaper](https://github.com/greywen/weather-wallpaper)

**Web Weather** 是一个开源的交互式网页天气模拟项目，完全在浏览器中运行。基于 **Next.js**、**Canvas 2D** 和 **Web Audio API** 构建，可渲染逼真的雨、雪、雾、云、阳光和雷暴效果 —— 配合程序化音频合成、实时参数控制和基于地理定位的实时天气。

**在线演示** — [weather.anhejin.cn](https://weather.anhejin.cn)

> 关键词：网页天气、天气模拟、天气可视化、天气动画、浏览器天气、Canvas 天气特效、交互式天气、下雨动画、下雪动画、Web Weather、Weather Simulation

## 特性

- **6 种天气模式** — 晴天、雨天、雪天、多云、雾天、冰冻，支持平滑交叉过渡
- **Canvas 2D 粒子引擎** — 带飞溅粒子的雨滴、带积雪与融化物理的雪花、带镜头光晕的日光效果、分形闪电
- **程序化音频合成** — 雷声通过 Web Audio API 实时合成（电弧闪光 → 爆裂 → 低频冲击 → 滚动隆隆声），另有雨声和风声环境音
- **地理定位实时天气** — 自动通过 [Open-Meteo](https://open-meteo.com/) 获取你所在位置的真实天气（免费、无需 API Key），定位失败时回退到伦敦
- **丰富的控制面板** — 调节粒子数量、下落速度、风向风力、云量、雾密度、温度、时间（0–24h）等参数
- **昼夜循环** — 时间滑块平滑过渡天空亮度，太阳与月亮位置联动
- **沉浸式全屏模式** — 隐藏所有 UI，将天气模拟作为动态壁纸使用
- **温度驱动物理** — 雪在 0 °C 以上加速融化；-5 °C 以下变为冰蓝色
- **性能优化** — SoA（Struct of Arrays）+ Float32Array、批量渲染、对象池复用
- **响应式设计** — 桌面端侧边栏 + 移动端底部导航
- **Docker 部署** — 一行命令通过 Docker Compose 部署

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 框架 | Next.js (App Router) + React + TypeScript |
| 渲染 | Canvas 2D API、Web Animations API、CSS 动画 |
| 音频 | Web Audio API（程序化合成） |
| 样式 | Tailwind CSS v4、Framer Motion |
| 天气数据 | Open-Meteo API + 浏览器 Geolocation API |
| 图标 | lucide-react |
| 部署 | Docker + docker-compose |

## 快速开始

### 环境要求

- Node.js 20+
- npm / yarn / pnpm

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看效果。

### Docker 部署

```bash
# 先构建 Next.js 应用
npm run build

# 使用 Docker Compose 启动
docker compose up -d
```

应用将运行在 `http://localhost:6000`。

## 项目结构

```
app/
  layout.tsx          # 根布局，引入 Geist 字体
  page.tsx            # 入口页面
  globals.css         # 全局样式与动画定义
components/
  WeatherProvider.tsx  # 天气状态上下文 + Open-Meteo 集成
  WeatherCanvas.tsx    # Canvas 2D 粒子引擎（雨、雪、阳光、闪电）
  WeatherSettings.tsx  # 控制面板 UI（桌面端与沉浸模式）
  CloudOverlay.tsx     # 视差云层
  FogOverlay.tsx       # 雾效渐变与烟雾漂浮
  useWeatherAudio.ts   # 程序化音频合成（雷声、雨声、风声）
  weather-types.ts     # TypeScript 类型定义
public/
  images/              # 云层与烟雾纹理
  sounds/              # 雷声音频样本
```

## 工作原理

1. **渲染** — 全视口 `<canvas>` 通过 `requestAnimationFrame` 以 60fps 绘制天气粒子（雨滴、雪花、阳光光晕、闪电）。CSS 叠加层在上方添加视差云层和雾效。
2. **音频** — 雷声通过多阶段流水线程序化合成：闪电闪弧 → 电弧爆裂 → 低频扫频 → 滚动隆隆声，经压缩器和延迟网络处理。
3. **自动模式** — 浏览器 Geolocation API 获取坐标后，查询 Open-Meteo API，将 WMO 天气代码映射为视觉预设，每 10 分钟刷新。
4. **过渡** — 切换天气类型时触发双层交叉淡入淡出，支持可配置的缓动函数和持续时间（0.5–8 秒）。

## 许可证

MIT

## 致谢

- 天气数据由 [Open-Meteo](https://open-meteo.com/) 提供
- 字体：Vercel [Geist](https://vercel.com/font)
