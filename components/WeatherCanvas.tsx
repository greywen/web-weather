'use client';

import { useEffect, useRef } from 'react';
import { WeatherType, WeatherConfig } from './weather-types';

interface WeatherCanvasProps {
  weather: WeatherType;
  sunProgress: number;
  config: WeatherConfig;
  opacity?: number;
  className?: string;
}

export default function WeatherCanvas({ weather, sunProgress, config, opacity = 1, className = '' }: WeatherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // 使用 Ref 存储最新配置，避免 useEffect 重复触发导致动画重置
  const configRef = useRef(config);
  const opacityRef = useRef(opacity);
  
  // 每次渲染都更新 Ref
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 不再从闭包中的 local config 解构，而是使用 configRef
    // const { speed: speedMult, wind: windVal, intensity, temperature = 0, time = 12 } = config;

    let width = window.innerWidth;
    let height = window.innerHeight;
    
    // 导航栏参数计算
    let navWidth = Math.min(width * 0.9, 448); // max-w-md is 28rem = 448px
    // 底部 24px (bottom-6) + 高度 80px (h-20)
    // 碰撞面在导航栏顶部
    const navBottomOffset = 24; 
    const navContentHeight = 80;
    const groundLevel = height - navBottomOffset - navContentHeight;
    let navLeftX = (width - navWidth) / 2;
    let navRightX = navLeftX + navWidth;

    canvas.width = width;
    canvas.height = height;

    // --- 粒子类定义 ---

    // 1. 溅水粒子 (Splash)
    class Splash {
      x: number;
      y: number;
      vx: number;
      vy: number;
      gravity: number;
      life: number;
      
      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4; 
        this.vy = -(Math.random() * 3 + 2);   
        this.gravity = 0.2;
        this.life = 1.0;
      }

      update() {
        this.x += this.vx;
        this.vy += this.gravity;
        this.y += this.vy;
        this.life -= 0.03;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        // 稍微带点蓝白色
        ctx.fillStyle = `rgba(200, 220, 255, ${this.life})`;
        ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. 雨滴粒子 (Rain)
    class RainDrop {
      x: number;
      y: number;
      baseSpeed: number;
      length: number;
      opacity: number;
      
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        // Base speed without multiplier
        this.baseSpeed = (Math.random() * 15 + 15); 
        this.length = Math.random() * 20 + 20;
        this.opacity = Math.random() * 0.4 + 0.1;
      }

      update(splashes: Splash[]) {
        // 读取实时配置
        const { wind: windVal, speed: speedMult } = configRef.current;
        const currentSpeed = this.baseSpeed * speedMult;

        this.y += currentSpeed;
        this.x += windVal; // 加入风力影响横向位置
        
        // 核心修改：碰撞检测逻辑优化
        // 1. 检查高度是否到达导航栏顶部
        const hitGround = this.y > groundLevel && this.y < groundLevel + currentSpeed;
        // 2. 检查横向是否在导航栏范围内
        const hitNavbar = this.x > navLeftX + 10 && this.x < navRightX - 10; // +10/-10 是为了内缩一点，不要在边缘太极限

        if (hitGround && hitNavbar) {
          // 只有打在导航栏上才溅射
          for (let i = 0; i < Math.floor(Math.random() * 3) + 2; i++) {
             splashes.push(new Splash(this.x, groundLevel));
          }
          // 在导航栏上消失 (重置)
          this.y = -this.length;
          this.x = Math.random() * width;
        } else if (this.y > height || this.x > width + 100 || this.x < -100) { // 增加左右边界重置
          // 没打中导航栏，落出屏幕或者飞出左右边界才重置
          this.y = -this.length;
          // 重置X位置逻辑优化：根据风向从上风向生成
          if (windVal > 0) {
            // 风向右吹，雨从左边或上边来 (-width/2 到 width/2 以覆盖倾斜) -> 简化为全屏随机即可，大风时会有空白区问题
            // 优化：从 -200 到 width 随机，保证左侧源源不断
            this.x = Math.random() * (width + 200) - 200;
          } else {
            this.x = Math.random() * (width + 200);
          }
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        // 读取实时风力用于绘制倾斜
        const { wind: windVal } = configRef.current;

        ctx.beginPath();
        ctx.strokeStyle = `rgba(180, 200, 235, ${this.opacity})`;
        ctx.lineWidth = 1.5;
        
        // 雨滴绘制也要根据风斜向绘制
        // 使用简单的三角比率：windVal * 2 可以让倾斜感更明显一点
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + windVal * 2, this.y + this.length);
        
        ctx.stroke();
      }
    }

    // 3. 雪花粒子 (Snow)
    class SnowFlake {
      x: number;
      y: number;
      radius: number;
      baseSpeed: number;
      baseWind: number; // Random horizontal drift per flake
      angle: number;
      opacity: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.radius = Math.random() * 3 + 1;
        
        // Base values without config multipliers
        this.baseSpeed = (Math.random() * 1.5 + 0.5); 
        this.baseWind = (Math.random() - 0.5) * 0.5; // Natural drift

        this.angle = Math.random() * Math.PI * 2;
        this.opacity = Math.random() * 0.6 + 0.2;
      }

      update(snowPile: SnowPile | null) {
        const { speed: speedMult, wind: windConfig } = configRef.current;
        const currentSpeed = this.baseSpeed * speedMult;
        const currentWind = this.baseWind + windConfig;

        this.y += currentSpeed;
        this.x += currentWind + Math.sin(this.angle) * 0.5;
        this.angle += 0.05;

        // 碰撞检测：积雪逻辑
        const hitGround = this.y > groundLevel && this.y < groundLevel + 5;
        const hitNavbar = this.x > navLeftX + 5 && this.x < navRightX - 5;

        // 如果击中导航栏且传入了积雪管理器
        if (snowPile && hitGround && hitNavbar) {
             // 注册积雪点
             snowPile.add(this.x);
             // 立即重置回顶部
             this.reset();
        } else if (this.y > height) {
          this.reset();
        }
      }

      reset() {
          this.y = -10;
          this.x = Math.random() * width;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 积雪管理器类
    class SnowPile {
        flakes: {x: number, y: number, size: number, life: number}[] = [];

        add(x: number) {
            // 限制积雪总数，避免性能爆炸
            if (this.flakes.length > 500) {
               this.flakes.shift(); // 移除最早的积雪
            }
            this.flakes.push({
                x: x,
                y: groundLevel + 2, // 稍微向下一点，贴合边缘
                size: Math.random() * 4 + 3, // 稍微大一点的积雪块，容易连成片
                life: 1.0
            });
        }

        update() {
            // 读取实时配置
            const { temperature = 0 } = configRef.current;

            // 温度决定融化速度 (Temperature controls melt rate)
            // Temp > 0: 融化 (0.002 base + 0.0005 * temp)
            // Temp <= 0: "结冰/堆积" (0 or very slow decay)
            let meltRate = 0.002; 
            if (temperature !== undefined) {
               if (temperature > 0) {
                   meltRate = 0.002 + (temperature * 0.002); // 热融化更快
               } else {
                   // 低温结冰，几乎不融化，或者极慢升华
                   meltRate = 0.0001; 
               }
            }

            for (let i = this.flakes.length - 1; i >= 0; i--) {
                this.flakes[i].life -= meltRate;
                if (this.flakes[i].life <= 0) {
                    this.flakes.splice(i, 1);
                }
            }
        }

        draw(ctx: CanvasRenderingContext2D) {
          if (this.flakes.length === 0) return;
            
          // 读取实时配置
          const { temperature = 0 } = configRef.current;

          // 颜色随温度变化
          // 深低温(<= -5): 冰蓝
          // 其它: 软白
          const isDeepFreeze = temperature !== undefined && temperature <= -5;
          const baseColor = isDeepFreeze
            ? "rgba(200, 235, 255, 0.95)"
            : "rgba(255, 255, 255, 0.9)";

          // 先画基础层(冰/雪)
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          for (let f of this.flakes) {
            // 绘制积雪块，利用重叠形成不规则表面
            ctx.moveTo(f.x, f.y);
            ctx.arc(f.x, f.y, f.size * f.life, Math.PI, 0);
          }
          ctx.fill();

          // 当结冰且积雪增加时，白雪覆盖应当渐进出现
          if (isDeepFreeze) {
            const startWhiteAt = 90;
            const fullWhiteAt = 220;
            const count = this.flakes.length;
            if (count > startWhiteAt) {
              const t = Math.min(1, Math.max(0, (count - startWhiteAt) / (fullWhiteAt - startWhiteAt)));
              // 覆盖范围与不透明度随 t 增长
              const topLayerRatio = 0.1 + t * 0.35; // 10% -> 45%
              const topLayerCount = Math.max(12, Math.floor(count * topLayerRatio));
              const startIndex = Math.max(0, count - topLayerCount);
              const alpha = 0.2 + t * 0.7; // 0.2 -> 0.9

              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.beginPath();
              for (let i = startIndex; i < count; i++) {
                const f = this.flakes[i];
                // 顶部雪层略小一点，表现覆雪效果
                ctx.moveTo(f.x, f.y);
                ctx.arc(f.x, f.y, f.size * f.life * 0.9, Math.PI, 0);
              }
              ctx.fill();
            }
          }
        }
    }


    // 4. 太阳特效 (Sun Effect)
    // 包含：太阳核心、星芒、以及底部的镜头光斑
    class SunEffect {
        // 镜头光斑 (Lens Flares / Bokeh) 配置
        flares: { 
             distRatio: number; // 距离太阳中心的距离比例 (relative to screen center)
             size: number; 
             opacity: number; 
             color: string;
        }[] = [];

        constructor() {
            // 初始化一些固定的光斑参数
            // distRatio: 相对于(Center - Sun)向量的比例
            // Sun -> Center -> Flare
            // Negative: 靠近太阳一侧
            // Positive: 远离太阳一侧 (屏幕下方/对角线)
            this.flares = [
                // 1. 靠近太阳的装饰光斑
                { distRatio: -0.2, size: 60, opacity: 0.1, color: '255, 255, 255' },
                
                // 2. 屏幕中间的过渡
                { distRatio: 0.4, size: 30, opacity: 0.05, color: '200, 240, 255' }, 
                
                // 3. 照射在导航栏/底部区域的主光斑 (关键修改: 增加不透明度，使用正比例)
                // 当太阳在上方时，这些光斑会落在屏幕下方
                { distRatio: 1.0, size: 80, opacity: 0.15, color: '255, 245, 220' }, // 底部大范围柔光
                { distRatio: 1.5, size: 50, opacity: 0.15, color: '255, 250, 230' },  // 叠加的较亮光斑
                { distRatio: 2.0, size: 100, opacity: 0.18, color: '255, 240, 200' }, // 最底部的超大暖光，覆盖导航栏
            ];
        }

        // 绘制十字星芒 - REMOVED

        // 绘制太阳核心
        drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, intensity: number) {
            // 1. 巨大的外围辉光 (Glow)
            // 动态调整光晕半径：基础0.4 + 强度系数，确保在 intensity=1 时接近原值(0.8)
            const glowRadius = Math.max(ctx.canvas.width, ctx.canvas.height) * (0.4 + intensity * 0.4);
            const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
            
            // 动态强度控制
            const baseOpacity = 0.6 * intensity;
            
            glow.addColorStop(0, `rgba(255, 255, 255, ${baseOpacity})`); 
            glow.addColorStop(0.1, `rgba(255, 255, 255, ${baseOpacity * 0.3})`);
            glow.addColorStop(0.5, `rgba(255, 255, 255, ${baseOpacity * 0.08})`);
            glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = glow;
            ctx.globalCompositeOperation = 'screen'; 
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            ctx.globalCompositeOperation = 'source-over';
        }

        // 绘制底部导航栏光效 (专门增强)
        drawBottomGlow(
          ctx: CanvasRenderingContext2D,
          sunX: number,
          screenW: number,
          navLeft: number,
          navRight: number,
          navTop: number,
          navHeight: number,
          intensity: number
        ) {
          // 仅在导航栏上沿绘制细条反光
          const navWidth = navRight - navLeft;
          if (navWidth <= 0 || navHeight <= 0) return;

          const edgeHeight = Math.max(6, navHeight * 0.18);
          const radius = Math.min(16, navHeight * 0.5, navWidth * 0.5);

          const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
            const rr = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.lineTo(x + w - rr, y);
            ctx.arcTo(x + w, y, x + w, y + rr, rr);
            ctx.lineTo(x + w, y + h - rr);
            ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
            ctx.lineTo(x + rr, y + h);
            ctx.arcTo(x, y + h, x, y + h - rr, rr);
            ctx.lineTo(x, y + rr);
            ctx.arcTo(x, y, x + rr, y, rr);
            ctx.closePath();
          };

          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          // 先裁剪为导航栏圆角，再裁剪到顶部细条区域，避免圆角被直角覆盖
          roundRectPath(navLeft, navTop, navWidth, navHeight, radius);
          ctx.clip();
          ctx.beginPath();
          ctx.rect(navLeft, navTop, navWidth, edgeHeight);
          ctx.clip();

          // 光斑位置：根据太阳水平位置映射到导航栏宽度
          const sunRatio = Math.max(0, Math.min(1, sunX / screenW));
          const glowX = navLeft + sunRatio * navWidth;
          const glowY = navTop + edgeHeight * 0.6;

          // 更窄的椭圆形高光，限制在上边缘
            const baseRadius = Math.max(30, navWidth * 0.12);
            const glowRadius = baseRadius * (0.6 + intensity * 0.4);

          ctx.translate(glowX, glowY);
            ctx.scale(1.8, 0.35);

            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${0.5 * intensity})`);
          gradient.addColorStop(0.35, `rgba(255, 250, 230, ${0.18 * intensity})`);
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

          ctx.fillStyle = gradient;
          ctx.beginPath();
            ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
        }

        // 绘制镜头光斑 (模拟光照射到底部)
        drawFlares(ctx: CanvasRenderingContext2D, sunX: number, sunY: number, screenW: number, screenH: number, intensity: number) {
            const centerX = screenW / 2;
            const centerY = screenH / 2;
            
            ctx.globalCompositeOperation = 'screen';

            this.flares.forEach(flare => {
                const realX = centerX + (centerX - sunX) * flare.distRatio;
                const realY = centerY + (centerY - sunY) * flare.distRatio;

                // 强度修正不透明度
                const currentOpacity = flare.opacity * intensity;

                // 尺寸修正：随强度微调，大幅减小变化幅度
                // 用户反馈之前太大，现在调整为：
                // intensity=1 时接近原大小(1.0x), intensity=3 时仅放大到 1.2x
                const currentSize = flare.size * (0.9 + intensity * 0.1);

                ctx.fillStyle = `rgba(${flare.color}, ${currentOpacity})`;
                ctx.beginPath();
                ctx.arc(realX, realY, currentSize, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalCompositeOperation = 'source-over';
        }
    }

    // 5. 闪电 (Lightning) - 增强版
    class Lightning {
        life: number;
        x: number;
        segments: {x: number, y: number}[][]; // 支持多条分支
        alpha: number;

        constructor(width: number, height: number) {
            this.x = Math.random() * width;
            this.life = 15 + Math.random() * 10;
            this.alpha = 1;
            this.segments = [];

            // 主干 (depth 0)
            this.createBolt(this.x, 0, height, 100, 0); 
        }

        // 递归生成闪电 
        // depth: 0=主干, 1=分支。限制 depth 避免过于密集
        createBolt(startX: number, startY: number, height: number, maxOffset: number, depth: number) {
            let currentX = startX;
            let currentY = startY;
            const path: {x: number, y: number}[] = [{x: currentX, y: currentY}];
            let branchCount = 0; // 限制当前段的分支数
            
            while(currentY < height) {
                // 步进 (主干步进大一点，分支小一点)
                const stepY = Math.random() * 40 + 20; 
                currentY += stepY;
                
                // 偏移 (让闪电走势更舒展)
                const offset = (Math.random() - 0.5) * maxOffset;
                currentX += offset;
                
                path.push({x: currentX, y: currentY});
                
                // 随机分支控制：
                // 1. 只有主干(depth=0)能产生分支，或者第一级分支能产生极短的二级分支(depth=1)
                // 2. 这里的实现限制为：只有主干产生分支，且最多3条，避免加上过于密集
                if (depth === 0 && Math.random() < 0.12 && height - currentY > 150 && branchCount < 3) {
                     // 开启一个分支，长度有限
                     // 分支稍微偏离主干一点角度
                     const branchHeight = currentY + Math.random() * 250 + 100;
                     this.createBolt(currentX, currentY, branchHeight, maxOffset * 0.6, depth + 1);
                     branchCount++;
                }
            }
            this.segments.push(path);
        }

        update() {
            this.life--;
        }

        draw(ctx: CanvasRenderingContext2D) {
            if (this.life <= 0) return;
            
            // 剧烈的闪烁效果
            const flicker = Math.random();
            if (flicker > 0.8) return; 

            let drawAlpha = this.alpha;
            if (this.life < 10) drawAlpha = this.life / 10;

            ctx.shadowBlur = 25;
            ctx.shadowColor = "rgba(180, 210, 255, 0.8)";
            ctx.strokeStyle = `rgba(230, 245, 255, ${drawAlpha})`;
            
            for(let i=0; i<this.segments.length; i++) {
                const seg = this.segments[i];
                // 主干粗，分支细
                ctx.lineWidth = i === 0 ? 3.0 : 1.2; 
                
                ctx.beginPath();
                for(let j=0; j<seg.length; j++) {
                    const p = seg[j];
                    if (j===0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }
    }

    // 6. 云朵 (Cloud) - 拟真/层积云优化
    class Cloud {
      x: number;
      y: number;
      speed: number;
      scale: number;
      // 存储构成云朵的这一组圆
      puffs: {x: number, y: number, r: number, opacity: number}[];
        
      constructor(width: number, height: number) {
        // 云朵一般比较大且慢
        this.scale = Math.random() * 0.6 + 0.7; // 0.7 - 1.3
        this.x = Math.random() * width;
        this.y = Math.random() * (height * 0.45); 
        this.speed = (Math.random() * 0.12 + 0.04); 
            
        this.puffs = [];
        // 构造更“厚实”的积云：主团 + 次团 + 底部拉平
        const coreRadius = (55 + Math.random() * 20) * this.scale;
        this.puffs.push({ x: 0, y: 0, r: coreRadius, opacity: 1 });

        // 主体侧翼
        const wingCount = 5 + Math.floor(Math.random() * 4);
        for (let i = 0; i < wingCount; i++) {
          const offsetX = (Math.random() * 120 - 60) * this.scale;
          const offsetY = (Math.random() * 30 + 5) * this.scale; 
          const r = (25 + Math.random() * 30) * this.scale;
          this.puffs.push({
            x: offsetX,
            y: offsetY,
            r,
            opacity: 0.85 + Math.random() * 0.15,
          });
        }

        // 顶部小绒团，增加层次
        const topCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < topCount; i++) {
          const offsetX = (Math.random() * 90 - 45) * this.scale;
          const offsetY = -(Math.random() * 25 + 10) * this.scale;
          const r = (18 + Math.random() * 20) * this.scale;
          this.puffs.push({
            x: offsetX,
            y: offsetY,
            r,
            opacity: 0.8 + Math.random() * 0.2,
          });
        }
      }
        
        update(width: number, speedMult: number) {
             this.x += this.speed * speedMult;
             if (this.x > width + 200 * this.scale) {
                 this.x = -200 * this.scale;
                 this.y = Math.random() * (window.innerHeight * 0.4); // 重置时随机高度
             }
        }
        
        draw(ctx: CanvasRenderingContext2D, cloudCover: number) {
           const baseOpacity = 0.25 + cloudCover * 0.65; // 云量越大，云越显著
             
           ctx.save();
           ctx.translate(this.x, this.y);
           // 让云更扁一些，更像层积云
           ctx.scale(1.4, 0.9);

           // 1. 软阴影层（模糊 + 偏移）
           ctx.save();
           ctx.filter = `blur(${8 * this.scale}px)`;
           ctx.globalAlpha = baseOpacity * 0.35;
           ctx.fillStyle = 'rgba(120, 135, 155, 1)';
           ctx.beginPath();
           for (let p of this.puffs) {
             ctx.moveTo(p.x + 18, p.y + 16);
             ctx.arc(p.x + 18, p.y + 16, p.r, 0, Math.PI * 2);
           }
           ctx.fill();
           ctx.restore();

           // 2. 主体层（暖白 + 冷灰渐变）
           for (let p of this.puffs) {
             const lightX = p.x - p.r * 0.2;
             const lightY = p.y - p.r * 0.25;
             const g = ctx.createRadialGradient(lightX, lightY, p.r * 0.2, p.x, p.y, p.r);
             g.addColorStop(0, `rgba(255, 255, 255, ${baseOpacity * 0.95 * p.opacity})`);
             g.addColorStop(0.55, `rgba(235, 240, 248, ${baseOpacity * 0.75 * p.opacity})`);
             g.addColorStop(1, 'rgba(220, 228, 238, 0)');
             ctx.fillStyle = g;
             ctx.beginPath();
             ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
             ctx.fill();
           }

           // 3. 顶部高光（轻微屏幕叠加）
           ctx.globalCompositeOperation = 'screen';
           ctx.globalAlpha = baseOpacity * 0.25;
           for (let p of this.puffs) {
             const g2 = ctx.createRadialGradient(p.x - p.r * 0.1, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r * 0.8);
             g2.addColorStop(0, 'rgba(255, 255, 255, 1)');
             g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
             ctx.fillStyle = g2;
             ctx.beginPath();
             ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
             ctx.fill();
           }
           ctx.restore();
        }
    }

    // 7. 雾 (Fog) - "团状"沉浸式雾气
    class FogPuff {
        x: number;
        y: number;
        radius: number;
        baseRadius: number;
        speed: number;
        opacity: number;
        
        // 浮动参数
        oscillationOffset: number;
        
        constructor(canvasW: number, canvasH: number) {
            const minDim = Math.min(canvasW, canvasH);
            
            // 初始化位置：覆盖全屏，稍微向外延伸
            this.x = Math.random() * (canvasW + 400) - 200;
            this.y = Math.random() * (canvasH + 200) - 100;
            
            // 模拟远近感 (Z轴)
            // zFactor 0 (远) -> 1 (近)
            const zFactor = Math.random();
            
            // 半径：近处的大(身在其中)，远处的相对小但依然是团状
            // 范围：屏幕最小边的 30% ~ 120%
            this.baseRadius = minDim * (0.3 + zFactor * 0.9);
            this.radius = this.baseRadius;
            
            // 速度：近处快，远处慢。整体还是比较慢的飘动
            const driftDir = Math.random() > 0.5 ? 1 : -1;
            this.speed = (0.2 + zFactor * 0.5) * driftDir;
            
            // 不透明度：近处淡一点以免遮挡太多，远处稍微实一点堆积背景
            this.opacity = 0.05 + Math.random() * 0.12;
            
            this.oscillationOffset = Math.random() * Math.PI * 2;
        }
        
        update(canvasW: number, canvasH: number, time: number) {
            const { wind = 0 } = configRef.current;
            
            // 1. 水平位移 (自身速度 + 风力)
            // 风力对所有层都有很大影响，但近处(大球)受影响视觉上更明显
            this.x += this.speed + (wind * 3.0);
            
            // 2. 垂直浮动 (呼吸感)
            this.y += Math.sin(time * 0.0008 + this.oscillationOffset) * 0.15;
            
            // 3. 尺寸脉动 (模拟雾气翻滚)
            // this.radius = this.baseRadius + Math.sin(time * 0.0005 + this.oscillationOffset) * (this.baseRadius * 0.1);
            
            // 4. 边界循环
            const boundary = this.radius + 100;
            
            if (this.x > canvasW + boundary) {
                this.x = -boundary;
                this.y = Math.random() * canvasH;
            } else if (this.x < -boundary) {
                this.x = canvasW + boundary;
                this.y = Math.random() * canvasH;
            }
        }
        
        draw(ctx: CanvasRenderingContext2D, density: number) {
            const finalOpacity = this.opacity * (0.6 + density * 0.8);
            if (finalOpacity <= 0.01) return;

            ctx.beginPath();
            
            // 径向渐变模拟球状团雾
            const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
            
            // 颜色：偏冷灰白，模拟水汽
            // 中心微亮
            g.addColorStop(0, `rgba(225, 235, 240, ${finalOpacity})`);
            // 中间过渡
            g.addColorStop(0.4, `rgba(215, 225, 235, ${finalOpacity * 0.8})`);
            g.addColorStop(0.7, `rgba(205, 220, 235, ${finalOpacity * 0.3})`);
            // 边缘完全透明
            g.addColorStop(1, `rgba(205, 220, 235, 0)`);
            
            ctx.fillStyle = g;
            // 绘制圆形
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- 初始化集合 ---
    let rains: RainDrop[] = [];
    let splashes: Splash[] = [];
    let snows: SnowFlake[] = [];
    let sunEffect: SunEffect | null = null;
    let snowPile: SnowPile | null = null; // 积雪管理器实例
    
    let lightnings: Lightning[] = [];
    let fogs: FogPuff[] = []; // Changed type
    let lightningTimer = 0;
    let flashOpacity = 0;

    const initParticles = () => {
      // 只有当粒子数量改变或天气类型改变时才真正重置粒子
      // 如果只是时间变化，不需要重置！
      // 这里简化：为了避免依赖复杂性，我们总是重置，但我们依靠上层 useEffect 的依赖项来控制
      // 现在的依赖项只有 [weather] 和 init 时的 config.particleCount
      
      rains = [];
      splashes = [];
      snows = [];
      snowPile = null;
      sunEffect = null;
      
      lightnings = [];
      fogs = [];
      flashOpacity = 0;
      
      const { particleCount } = configRef.current; // 使用最新配置
      const count = particleCount;

      if (weather === 'rainy') {
        const dropCount = count;
        for (let i = 0; i < dropCount; i++) {
          rains.push(new RainDrop());
        }
      } else if (weather === 'snowy') {
        snowPile = new SnowPile(); // 初始化积雪
        const snowCount = count;
        for (let i = 0; i < snowCount; i++) {
          snows.push(new SnowFlake());
        }
      } else if (weather === 'sunny') {
        sunEffect = new SunEffect();
      } else if (weather === 'foggy') {
        const fogCount = 25; // 大量随机团雾层叠
        for(let i=0; i<fogCount; i++) {
             fogs.push(new FogPuff(width, height));
        }
      }
    };

    initParticles();
    
    // REMOVED drawIceVignette

    // --- 动画循环 ---
    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      const now = performance.now();
      
      const { intensity, time = 12 } = configRef.current; // 使用最新配置

      // --- 全局昼夜交替效果 (Global Day/Night Cycle) ---
      // 计算当前时间的黑暗程度 (overlay opacity)
      // 0:00 (0) -> Dark
      // 6:00 (6) -> Dawn (Transition)
      // 12:00 (12) -> Noon (Bright)
      // 18:00 (18) -> Dusk (Transition)
      // 24:00 (24) -> Dark
      let darkness = 0;
      if (time < 6 || time > 18) {
        // 夜晚时段
        if (time < 6) { 
           // 0 -> 6: darkness 0.8 -> 0
           darkness = 0.85 * (1 - (time / 6));
        } else {
           // 18 -> 24: darkness 0 -> 0.8
           darkness = 0.85 * ((time - 18) / 6);
        }
      } else {
        // 白天时段
        darkness = 0;
      }

      // 如果是雨天或雪天，原本背景已经比较暗，不需要叠加太重的黑色，稍微一点模拟夜晚即可
      if (weather !== 'sunny') {
         // 雨雪天夜晚会更黑 (但背景已经是深色)
         // 这里只需要微调，或者让它更黑
         darkness *= 0.6; 
      }

      // 绘制夜幕遮罩 (叠加在 CSS 背景之上)
      if (darkness > 0.01) {
          ctx.fillStyle = `rgba(5, 5, 20, ${darkness})`;
          ctx.fillRect(0, 0, width, height);
      }

      // THUNDER FLASH
      if (flashOpacity > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${flashOpacity})`;
          ctx.fillRect(0, 0, width, height);
          flashOpacity -= 0.05;
          if (flashOpacity < 0) flashOpacity = 0;
      }

      // SUNNY
      if (weather === 'sunny' && sunEffect) {
        // 计算太阳位置
        // 使用 config.time (0-24) 计算进度
        // 假设日出 6:00, 日落 18:00
        // Progress: 6 -> 0, 12 -> 0.5, 18 -> 1
        const calculatedProgress = (time - 6) / 12;
        
        const sunX = width * (0.1 + calculatedProgress * 0.8);
        const sunY = height * 0.15 + Math.pow(Math.abs(calculatedProgress - 0.5) * 2, 2) * (height * 0.3);
        
        // 计算太阳强度系数 (0 ~ 1)
        // Combine natural daily cycle with config intensity
        const sunCycle = Math.sin(Math.max(0, Math.min(1, calculatedProgress)) * Math.PI) * 0.7 + 0.3;
        const currentIntensity = sunCycle * intensity; 
        const sunFade = Math.pow(Math.max(0, Math.min(1, opacityRef.current)), 1.8);
        const adjustedIntensity = currentIntensity * sunFade;

        // 只有当太阳在合理范围内才绘制 (或根据设计意图一直绘制但位置偏移)
        // 这里简单处理：如果彻底晚上了(prog < -0.2 or > 1.2), 就不画太阳了？
        // 不过用户选择了 sunny 模式，可能还是想看到个亮光，就像极昼一样。
        // 暂时保持绘制。

        // 1. 绘制太阳主体 (辉光)
        if (adjustedIntensity > 0.01) {
          sunEffect.drawSun(ctx, sunX, sunY, adjustedIntensity);

          // 2. 绘制镜头光斑
          sunEffect.drawFlares(ctx, sunX, sunY, width, height, adjustedIntensity);
        
          // 3. 绘制底部导航栏专属光效 (新增)
          sunEffect.drawBottomGlow(
            ctx,
            sunX,
            width,
            navLeftX,
            navRightX,
            groundLevel,
            navContentHeight,
            adjustedIntensity
          );
        }
      }
      
      // RAINY
      else if (weather === 'rainy') {
        const { particleCount, thunder } = configRef.current;

        // Thunder Logic
        if (thunder) {
            lightningTimer--;
            if (lightningTimer <= 0) {
                 // Trigger flash
                 flashOpacity = 0.6 + Math.random() * 0.4; 
                 // Spawn bolt
                 lightnings.push(new Lightning(width, height));
                 // Reset timer
                 lightningTimer = Math.random() * 300 + 60;
            }
        }
        
        // Draw lightnings (behind rain?) - maybe in front is better for drama
        for(let i = lightnings.length - 1; i>=0; i--) {
            const l = lightnings[i];
            l.update();
            l.draw(ctx);
            if (l.life <= 0) lightnings.splice(i, 1);
        }

        // Dynamic Particle Count Adjustment
        if (rains.length < particleCount) {
             for(let i=0; i < particleCount - rains.length; i++) rains.push(new RainDrop()); 
        } else if (rains.length > particleCount) {
             rains.splice(0, rains.length - particleCount);
        }

        rains.forEach(drop => {
          drop.update(splashes);
          drop.draw(ctx);
        });

        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i];
          s.update();
          s.draw(ctx);
          if (s.life <= 0) {
            splashes.splice(i, 1);
          }
        }
      } 
      
      // SNOWY
      else if (weather === 'snowy') {
        // Dynamic Particle Count Adjustment
        const { particleCount } = configRef.current;
        if (snows.length < particleCount) {
             for(let i=0; i < particleCount - snows.length; i++) snows.push(new SnowFlake());
        } else if (snows.length > particleCount) {
             snows.splice(0, snows.length - particleCount);
        }

        // 移除 drawIceVignette，用户反馈那个大圈圈很难看
        // drawIceVignette(ctx);

        snows.forEach(flake => {
          flake.update(snowPile);
          flake.draw(ctx);
        });

        if (snowPile) {
            snowPile.update();
            snowPile.draw(ctx);
        }
      }

      // ICY - REMOVED

      // FOGGY
      else if (weather === 'foggy') {
          const { fogDensity = 0.5 } = configRef.current;
          
          // 绘制全屏底雾 - 渐变背景
          if (fogDensity > 0.05) {
              const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
              // 上淡下浓
              bgGrad.addColorStop(0, `rgba(180, 195, 210, ${fogDensity * 0.3})`);
              bgGrad.addColorStop(1, `rgba(180, 195, 210, ${fogDensity * 0.7})`);
              ctx.fillStyle = bgGrad;
              ctx.fillRect(0,0,width,height);
          }
          
          fogs.forEach(f => {
               f.update(width, height, now); 
               f.draw(ctx, fogDensity);
          });
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      
      // 更新导航栏参数
      navWidth = Math.min(width * 0.9, 448);
      navLeftX = (width - navWidth) / 2;
      navRightX = navLeftX + navWidth;

      canvas.width = width;
      canvas.height = height;
      initParticles(); 
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [weather, sunProgress]); // 移除 config 依赖，改为使用 ref

  return (
    <canvas
      ref={canvasRef}
      className={`absolute top-0 left-0 w-full h-full pointer-events-none transition-opacity duration-700 ${className}`}
      style={{ opacity }}
    />
  );
}
