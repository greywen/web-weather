'use client';

import { useEffect, useRef } from 'react';
import { WeatherType, WeatherConfig } from './weather-types';

interface WeatherCanvasProps {
  weather: WeatherType;
  sunProgress: number;
  config: WeatherConfig;
  opacity?: number;
  className?: string;
  onLightningStrike?: () => void;
  onFpsUpdate?: (fps: number) => void;
}

export default function WeatherCanvas({ weather, sunProgress, config, opacity = 1, className = '', onLightningStrike, onFpsUpdate }: WeatherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const thunderEnabledRef = useRef(Boolean(config.thunder));
  const thunderTriggerOnceRef = useRef(false);
  
  const onLightningStrikeRef = useRef(onLightningStrike);
  onLightningStrikeRef.current = onLightningStrike;

  const onFpsUpdateRef = useRef(onFpsUpdate);
  onFpsUpdateRef.current = onFpsUpdate;

  // Store latest config in ref to avoid animation reset from useEffect re-triggering
  const configRef = useRef(config);
  const opacityRef = useRef(opacity);
  
  // Update ref on every render
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const thunderNow = Boolean(config.thunder);
    if (!thunderEnabledRef.current && thunderNow) {
      thunderTriggerOnceRef.current = true;
    }
    thunderEnabledRef.current = thunderNow;
  }, [config.thunder]);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Use configRef instead of destructuring from closure's local config
    // const { speed: speedMult, wind: windVal, intensity, temperature = 0, time = 12 } = config;

    let width = window.innerWidth;
    let height = window.innerHeight;
    
    // Ground collision line: page bottom (leave a few pixels for splash/snow visibility)
    let groundLevel = height - 4;

    canvas.width = width;
    canvas.height = height;

    // --- Particle class definitions ---

    // 1. Splash particles — using object pool to avoid GC pressure
    const SPLASH_POOL_SIZE = 256;
    const splashPool = {
      x:       new Float32Array(SPLASH_POOL_SIZE),
      y:       new Float32Array(SPLASH_POOL_SIZE),
      vx:      new Float32Array(SPLASH_POOL_SIZE),
      vy:      new Float32Array(SPLASH_POOL_SIZE),
      life:    new Float32Array(SPLASH_POOL_SIZE),
      count:   0,
      spawn(sx: number, sy: number) {
        if (this.count >= SPLASH_POOL_SIZE) return;
        const i = this.count++;
        this.x[i] = sx;
        this.y[i] = sy;
        this.vx[i] = (Math.random() - 0.5) * 4;
        this.vy[i] = -(Math.random() * 3 + 2);
        this.life[i] = 1.0;
      },
      update() {
        const gravity = 0.2;
        let i = 0;
        while (i < this.count) {
          this.vx[i]; // no horizontal drag
          this.vy[i] += gravity;
          this.x[i] += this.vx[i];
          this.y[i] += this.vy[i];
          this.life[i] -= 0.05;
          if (this.life[i] <= 0) {
            // swap-and-pop: overwrite current with last element, O(1) removal
            const last = this.count - 1;
            if (i < last) {
              this.x[i] = this.x[last];
              this.y[i] = this.y[last];
              this.vx[i] = this.vx[last];
              this.vy[i] = this.vy[last];
              this.life[i] = this.life[last];
            }
            this.count--;
            // Don't increment i, recheck the swapped-in element
          } else {
            i++;
          }
        }
      },
      draw(ctx: CanvasRenderingContext2D) {
        if (this.count === 0) return;
        ctx.fillStyle = 'rgba(200, 220, 255, 0.6)';
        // Merge all rects into one path, single fill call
        ctx.beginPath();
        for (let i = 0; i < this.count; i++) {
          ctx.rect(this.x[i] - 1, this.y[i] - 1, 2, 2);
        }
        ctx.fill();
      },
      clear() {
        this.count = 0;
      }
    };

    // 2. Rain particles — SoA layout + bin-grouped drawing
    const MAX_RAIN = 600;
    // Pre-allocate bin indices: avoid 3 full scans per frame
    const BIN_COUNT = 3;
    const binThresholds: [number, number][] = [[0, 0.2], [0.2, 0.35], [0.35, 0.6]];
    // Pre-compute fillStyle strings, avoid repeated string concatenation per frame
    const binFillStyles = binThresholds.map(([lo, hi]) => `rgba(180, 200, 235, ${((lo + hi) / 2).toFixed(2)})`);
    const binIndices: Int16Array[] = Array.from({length: BIN_COUNT}, () => new Int16Array(MAX_RAIN));
    const binSizes = new Int32Array(BIN_COUNT);
    const rainData = {
      x:         new Float32Array(MAX_RAIN),
      y:         new Float32Array(MAX_RAIN),
      baseSpeed: new Float32Array(MAX_RAIN),
      length:    new Float32Array(MAX_RAIN),
      opacity:   new Float32Array(MAX_RAIN),
      count:     0,
      init(i: number) {
        this.x[i] = Math.random() * width;
        this.y[i] = Math.random() * height;
        this.baseSpeed[i] = Math.random() * 15 + 15;
        this.length[i] = Math.random() * 20 + 20;
        this.opacity[i] = Math.random() * 0.4 + 0.1;
        // Assign to bin
        this._assignBin(i);
      },
      _assignBin(i: number) {
        const o = this.opacity[i];
        for (let b = 0; b < BIN_COUNT; b++) {
          if (o >= binThresholds[b][0] && o < binThresholds[b][1]) {
            binIndices[b][binSizes[b]++] = i;
            return;
          }
        }
        // fallback to last bin
        binIndices[BIN_COUNT - 1][binSizes[BIN_COUNT - 1]++] = i;
      },
      setCount(n: number) {
        const target = Math.min(n, MAX_RAIN);
        while (this.count < target) { this.init(this.count); this.count++; }
        if (this.count > target) {
          // Rebuild bin indices
          this.count = target;
          this._rebuildBins();
        }
      },
      _rebuildBins() {
        for (let b = 0; b < BIN_COUNT; b++) binSizes[b] = 0;
        for (let i = 0; i < this.count; i++) {
          const o = this.opacity[i];
          for (let b = 0; b < BIN_COUNT; b++) {
            if (o >= binThresholds[b][0] && o < binThresholds[b][1]) {
              binIndices[b][binSizes[b]++] = i;
              break;
            }
          }
        }
      },
      updateAll(windVal: number, speedMult: number) {
        for (let i = 0; i < this.count; i++) {
          const spd = this.baseSpeed[i] * speedMult;
          this.y[i] += spd;
          this.x[i] += windVal;

          // Collision: spawn splash when reaching page bottom
          if (this.y[i] > groundLevel && this.y[i] < groundLevel + spd) {
            // Reduce splash probability at high speed to avoid pool saturation
            if (splashPool.count < SPLASH_POOL_SIZE - 8) {
              const splashCount = Math.floor(Math.random() * 2) + 1;
              for (let s = 0; s < splashCount; s++) {
                splashPool.spawn(this.x[i], groundLevel);
              }
            }
            this.y[i] = -this.length[i];
            this.x[i] = Math.random() * width;
          } else if (this.y[i] > height || this.x[i] > width + 100 || this.x[i] < -100) {
            this.y[i] = -this.length[i];
            if (windVal > 0) {
              this.x[i] = Math.random() * (width + 200) - 200;
            } else {
              this.x[i] = Math.random() * (width + 200);
            }
          }
        }
      },
      drawAll(ctx: CanvasRenderingContext2D, windVal: number) {
        if (this.count === 0) return;
        const windOffset = windVal * 2;
        const topHalfWidth = 0.3;
        const bottomHalfWidth = 1.2;
        // Draw directly from pre-grouped bins, no 3x full scan per frame
        for (let b = 0; b < BIN_COUNT; b++) {
          const size = binSizes[b];
          if (size === 0) continue;
          ctx.fillStyle = binFillStyles[b];
          ctx.beginPath();
          const idx = binIndices[b];
          for (let j = 0; j < size; j++) {
            const i = idx[j];
            const tx = this.x[i];
            const ty = this.y[i];
            const bx = tx + windOffset;
            const by = ty + this.length[i];
            ctx.moveTo(tx - topHalfWidth, ty);
            ctx.lineTo(tx + topHalfWidth, ty);
            ctx.lineTo(bx + bottomHalfWidth, by);
            ctx.lineTo(bx - bottomHalfWidth, by);
          }
          ctx.fill();
        }
      },
      clear() {
        this.count = 0;
        for (let b = 0; b < BIN_COUNT; b++) binSizes[b] = 0;
      }
    };

    // 3. Snowflake particles
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

        // Collision: accumulate snow when reaching page bottom
        const hitGround = this.y > groundLevel && this.y < groundLevel + 5;

        // If hitting ground and snow pile manager is provided
        if (snowPile && hitGround) {
             // Register snow pile point
             snowPile.add(this.x);
             // Reset to top immediately
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

    // Snow pile manager class
    class SnowPile {
        flakes: {x: number, y: number, size: number, life: number}[] = [];

        add(x: number) {
            // Limit total snow pile count to avoid performance issues
            if (this.flakes.length > 500) {
               this.flakes.shift(); // Remove oldest snow pile
            }
            this.flakes.push({
                x: x,
                y: groundLevel + 2, // Slightly lower, flush with edge
                size: Math.random() * 4 + 3, // Larger snow chunks, easier to form patches
                life: 1.0
            });
        }

        update() {
            // Read real-time config
            const { temperature = 0 } = configRef.current;

            // Temperature controls melt rate
            // Temp > 0: melting (0.002 base + 0.0005 * temp)
            // Temp <= 0: freezing/accumulation (0 or very slow decay)
            let meltRate = 0.002; 
            if (temperature !== undefined) {
               if (temperature > 0) {
                   meltRate = 0.002 + (temperature * 0.002); // Higher temp melts faster
               } else {
                   // Low temp freezing, almost no melting, or very slow sublimation
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
            
          // Read real-time config
          const { temperature = 0 } = configRef.current;

          // Color varies with temperature
          // Deep freeze (<= -5): ice blue
          // Other: soft white
          const isDeepFreeze = temperature !== undefined && temperature <= -5;
          const baseColor = isDeepFreeze
            ? "rgba(200, 235, 255, 0.95)"
            : "rgba(255, 255, 255, 0.9)";

          // Draw base layer first (ice/snow)
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          for (let f of this.flakes) {
            // Draw snow chunks, overlapping to form irregular surface
            ctx.moveTo(f.x, f.y);
            ctx.arc(f.x, f.y, f.size * f.life, Math.PI, 0);
          }
          ctx.fill();

          // When freezing and snow accumulates, white cover should appear gradually
          if (isDeepFreeze) {
            const startWhiteAt = 90;
            const fullWhiteAt = 220;
            const count = this.flakes.length;
            if (count > startWhiteAt) {
              const t = Math.min(1, Math.max(0, (count - startWhiteAt) / (fullWhiteAt - startWhiteAt)));
              // Coverage and opacity grow with t
              const topLayerRatio = 0.1 + t * 0.35; // 10% -> 45%
              const topLayerCount = Math.max(12, Math.floor(count * topLayerRatio));
              const startIndex = Math.max(0, count - topLayerCount);
              const alpha = 0.2 + t * 0.7; // 0.2 -> 0.9

              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.beginPath();
              for (let i = startIndex; i < count; i++) {
                const f = this.flakes[i];
                // Top snow layer slightly smaller, showing snow cover effect
                ctx.moveTo(f.x, f.y);
                ctx.arc(f.x, f.y, f.size * f.life * 0.9, Math.PI, 0);
              }
              ctx.fill();
            }
          }
        }
    }


    // 4. Sun effect
    // Includes: sun core, star rays, and bottom lens flares
    class SunEffect {
        // Lens flares / bokeh configuration
        flares: { 
             distRatio: number; // Distance ratio relative to screen center
             size: number; 
             opacity: number; 
             color: string;
        }[] = [];

        constructor() {
            // Initialize fixed flare parameters
            // distRatio: ratio relative to (Center - Sun) vector
            // Sun -> Center -> Flare
            // Negative: closer to sun side
            // Positive: opposite to sun side (screen bottom/diagonal)
            this.flares = [
              // 1. Decorative flare near the sun
              { distRatio: -0.2, size: 60, opacity: 0.06, color: '255, 255, 255' },
                
              // 2. Transition flare in the middle of screen
              { distRatio: 0.4, size: 30, opacity: 0.035, color: '200, 240, 255' }, 
                
              // 3. Main flares on navbar/bottom area
              // When the sun is above, these flares land at screen bottom
              { distRatio: 1.0, size: 80, opacity: 0.08, color: '255, 245, 220' }, // Large soft glow at bottom
              { distRatio: 1.5, size: 50, opacity: 0.08, color: '255, 250, 230' },  // Brighter overlapping flare
              { distRatio: 2.0, size: 100, opacity: 0.1, color: '255, 240, 200' }, // Extra-large warm glow at very bottom, covering navbar
            ];
        }

        // Draw cross star rays - REMOVED

        // Draw sun core
        drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, intensity: number) {
            // 1. Large outer glow
            // Dynamically adjust glow radius: base 0.4 + intensity factor
            const glowRadius = Math.max(ctx.canvas.width, ctx.canvas.height) * (0.4 + intensity * 0.4);
            const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
            
            // Dynamic intensity control
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

        // Draw bottom ground glow
        drawBottomGlow(
          ctx: CanvasRenderingContext2D,
          sunX: number,
          screenW: number,
          screenH: number,
          intensity: number
        ) {
          const glowHeight = 30;
          const glowY = screenH - glowHeight;

          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          // Flare position: map sun horizontal position to screen width
          const sunRatio = Math.max(0, Math.min(1, sunX / screenW));
          const glowX = sunRatio * screenW;

          const baseRadius = Math.max(60, screenW * 0.15);
          const glowRadius = baseRadius * (0.6 + intensity * 0.4);

          ctx.translate(glowX, glowY);
          ctx.scale(2.5, 0.3);

          const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${0.35 * intensity})`);
          gradient.addColorStop(0.35, `rgba(255, 250, 230, ${0.12 * intensity})`);
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
        }

        // Draw lens flares (simulating light reaching bottom)
        drawFlares(ctx: CanvasRenderingContext2D, sunX: number, sunY: number, screenW: number, screenH: number, intensity: number) {
            const centerX = screenW / 2;
            const centerY = screenH / 2;
            
            ctx.globalCompositeOperation = 'screen';

            this.flares.forEach(flare => {
                const realX = centerX + (centerX - sunX) * flare.distRatio;
                const realY = centerY + (centerY - sunY) * flare.distRatio;

                // Intensity-adjusted opacity, capped to prevent over-bright flares
                const intensityScale = 0.7 + intensity * 0.3;
                const currentOpacity = Math.min(flare.opacity * intensityScale, 0.12);

                // Size adjustment: fine-tune with intensity, greatly reduced variation
                // Previously too large per user feedback, now adjusted to:
                // intensity=1 ~ original size (1.0x), intensity=3 ~ only 1.2x
                const currentSize = flare.size * (0.9 + intensity * 0.1);

                ctx.fillStyle = `rgba(${flare.color}, ${currentOpacity})`;
                ctx.beginPath();
                ctx.arc(realX, realY, currentSize, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalCompositeOperation = 'source-over';
        }
    }

    // 5. Lightning - enhanced version
    class Lightning {
        life: number;
        x: number;
        segments: {x: number, y: number}[][]; // Supports multiple branches
        alpha: number;

        constructor(width: number, height: number) {
            this.x = Math.random() * width;
            this.life = 15 + Math.random() * 10;
            this.alpha = 1;
            this.segments = [];

            // Main bolt (depth 0)
            this.createBolt(this.x, 0, height, 100, 0); 
        }

        // Recursively generate lightning 
        // depth: 0=main bolt, 1=branch. Limit depth to avoid excessive density
        createBolt(startX: number, startY: number, height: number, maxOffset: number, depth: number) {
            let currentX = startX;
            let currentY = startY;
            const path: {x: number, y: number}[] = [{x: currentX, y: currentY}];
            let branchCount = 0; // Limit branch count per segment
            
            while(currentY < height) {
                // Step size (main bolt takes larger steps, branches smaller)
                const stepY = Math.random() * 40 + 20; 
                currentY += stepY;
                
                // Offset (make lightning path more spread out)
                const offset = (Math.random() - 0.5) * maxOffset;
                currentX += offset;
                
                path.push({x: currentX, y: currentY});
                
                // Random branching control:
                // 1. Only main bolt (depth=0) can produce branches
                // 2. Limited to max 3 branches from main bolt to avoid excessive density
                if (depth === 0 && Math.random() < 0.12 && height - currentY > 150 && branchCount < 3) {
                     // Create a branch with limited length
                     // Branch slightly diverges from main bolt angle
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
            
            // Intense flicker effect
            const flicker = Math.random();
            if (flicker > 0.8) return; 

            let drawAlpha = this.alpha;
            if (this.life < 10) drawAlpha = this.life / 10;

            // Double-line draw instead of shadowBlur (GPU gaussian blur, very expensive)
            // Pass 1: thick semi-transparent line → simulates glow
            ctx.strokeStyle = `rgba(180, 210, 255, ${drawAlpha * 0.3})`;
            for(let i=0; i<this.segments.length; i++) {
                const seg = this.segments[i];
                ctx.lineWidth = i === 0 ? 8 : 4;
                ctx.beginPath();
                for(let j=0; j<seg.length; j++) {
                    const p = seg[j];
                    if (j===0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
            // Pass 2: thin bright line → lightning body
            ctx.strokeStyle = `rgba(230, 245, 255, ${drawAlpha})`;
            for(let i=0; i<this.segments.length; i++) {
                const seg = this.segments[i];
                ctx.lineWidth = i === 0 ? 2.5 : 1.0;
                ctx.beginPath();
                for(let j=0; j<seg.length; j++) {
                    const p = seg[j];
                    if (j===0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
        }
    }

    // 6. Cloud - realistic stratocumulus optimization
    class Cloud {
      x: number;
      y: number;
      speed: number;
      scale: number;
      // Store the set of circles composing the cloud
      puffs: {x: number, y: number, r: number, opacity: number}[];
        
      constructor(width: number, height: number) {
        // Clouds are generally large and slow
        this.scale = Math.random() * 0.6 + 0.7; // 0.7 - 1.3
        this.x = Math.random() * width;
        this.y = Math.random() * (height * 0.45); 
        this.speed = (Math.random() * 0.12 + 0.04); 
            
        this.puffs = [];
        // Build thicker cumulus: main body + side clusters + flat bottom
        const coreRadius = (55 + Math.random() * 20) * this.scale;
        this.puffs.push({ x: 0, y: 0, r: coreRadius, opacity: 1 });

        // Main body wings
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

        // Top small puffs, add depth
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
                 this.y = Math.random() * (window.innerHeight * 0.4); // Random height on reset
             }
        }
        
        draw(ctx: CanvasRenderingContext2D, cloudCover: number) {
           const baseOpacity = 0.25 + cloudCover * 0.65; // Higher cloud cover, more prominent clouds
             
           ctx.save();
           ctx.translate(this.x, this.y);
           // Flatten cloud, more like stratocumulus
           ctx.scale(1.4, 0.9);

           // 1. Soft shadow layer (blur + offset)
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

           // 2. Body layer (warm white + cool gray gradient)
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

           // 3. Top highlight (subtle screen blend)
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

    // 7. Fog - offscreen canvas cached gradient texture
    const FOG_TEX_SIZE = 128;
    const fogTexCanvas = document.createElement('canvas');
    fogTexCanvas.width = FOG_TEX_SIZE;
    fogTexCanvas.height = FOG_TEX_SIZE;
    const fogTexCtx = fogTexCanvas.getContext('2d')!;
    (() => {
      const cx = FOG_TEX_SIZE / 2;
      const g = fogTexCtx.createRadialGradient(cx, cx, 0, cx, cx, cx);
      // White gradient, runtime opacity via globalAlpha, color via tint
      g.addColorStop(0,   'rgba(225, 235, 240, 1)');
      g.addColorStop(0.4, 'rgba(215, 225, 235, 0.8)');
      g.addColorStop(0.7, 'rgba(205, 220, 235, 0.3)');
      g.addColorStop(1,   'rgba(205, 220, 235, 0)');
      fogTexCtx.fillStyle = g;
      fogTexCtx.fillRect(0, 0, FOG_TEX_SIZE, FOG_TEX_SIZE);
    })();

    class FogPuff {
        x: number;
        y: number;
        radius: number;
        baseRadius: number;
        speed: number;
        opacity: number;
        oscillationOffset: number;
        
        constructor(canvasW: number, canvasH: number) {
            const minDim = Math.min(canvasW, canvasH);
            this.x = Math.random() * (canvasW + 400) - 200;
            this.y = Math.random() * (canvasH + 200) - 100;
            const zFactor = Math.random();
            // Limit max radius to 400px, avoid huge drawImage blit
            this.baseRadius = Math.min(minDim * (0.2 + zFactor * 0.5), 400);
            this.radius = this.baseRadius;
            const driftDir = Math.random() > 0.5 ? 1 : -1;
            this.speed = (0.2 + zFactor * 0.5) * driftDir;
            this.opacity = 0.05 + Math.random() * 0.12;
            this.oscillationOffset = Math.random() * Math.PI * 2;
        }
    }

    // Fog batch update + draw (no class methods, reduces virtual call overhead)
    function updateFogs(fogArr: FogPuff[], canvasW: number, canvasH: number, now: number, windVal: number) {
      for (let i = 0; i < fogArr.length; i++) {
        const f = fogArr[i];
        f.x += f.speed + windVal * 3.0;
        f.y += Math.sin(now * 0.0008 + f.oscillationOffset) * 0.15;
        const boundary = f.radius + 100;
        if (f.x > canvasW + boundary) {
          f.x = -boundary;
          f.y = Math.random() * canvasH;
        } else if (f.x < -boundary) {
          f.x = canvasW + boundary;
          f.y = Math.random() * canvasH;
        }
      }
    }

    function drawFogs(c: CanvasRenderingContext2D, fogArr: FogPuff[], density: number) {
      for (let i = 0; i < fogArr.length; i++) {
        const f = fogArr[i];
        const finalOpacity = f.opacity * (0.6 + density * 0.8);
        if (finalOpacity <= 0.01) continue;
        const diam = f.radius * 2;
        // Skip fog completely off-screen
        if (f.x + f.radius < 0 || f.x - f.radius > width || f.y + f.radius < 0 || f.y - f.radius > height) continue;
        c.globalAlpha = finalOpacity;
        c.drawImage(fogTexCanvas, f.x - f.radius, f.y - f.radius, diam, diam);
      }
      c.globalAlpha = 1;
    }

    // --- Initialize collections ---
    let snows: SnowFlake[] = [];
    let sunEffect: SunEffect | null = null;
    let snowPile: SnowPile | null = null;
    
    let lightnings: Lightning[] = [];
    let fogs: FogPuff[] = [];
    let nextLightningAt = 0;
    let flashOpacity = 0;
    let lightningCount = 0;

    const getNextLightningDelayMs = () => {
      // Base interval 6-14s, progressively longer as more strikes occur.
      // Each strike adds ~2s to the base, capped so it doesn't grow forever.
      const extraDelay = Math.min(lightningCount * 2000, 20000);
      lightningCount++;
      return 6000 + extraDelay + Math.random() * 8000;
    };

    const initParticles = () => {
      // Reset all particle systems
      rainData.clear();
      splashPool.clear();
      snows = [];
      snowPile = null;
      sunEffect = null;
      lightnings = [];
      fogs = [];
      flashOpacity = 0;
      lightningCount = 0;
      
      const { particleCount } = configRef.current;

      if (weather === 'rainy') {
        rainData.setCount(particleCount);
        nextLightningAt = performance.now() + getNextLightningDelayMs();
      } else if (weather === 'snowy') {
        snowPile = new SnowPile();
        for (let i = 0; i < particleCount; i++) {
          snows.push(new SnowFlake());
        }
      } else if (weather === 'sunny') {
        sunEffect = new SunEffect();
      } else if (weather === 'foggy') {
        const fogCount = 10;
        for(let i=0; i<fogCount; i++) {
             fogs.push(new FogPuff(width, height));
        }
      }
    };

    initParticles();
    
    // REMOVED drawIceVignette

    // --- FPS counter ---
    let fpsFrameCount = 0;
    let fpsLastTime = performance.now();
    let fpsDisplay = 0;

    // --- Animation loop ---
    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      const now = performance.now();

      // FPS calculation
      fpsFrameCount++;
      if (now - fpsLastTime >= 1000) {
        fpsDisplay = fpsFrameCount;
        fpsFrameCount = 0;
        fpsLastTime = now;
        onFpsUpdateRef.current?.(fpsDisplay);
      }
      
      const { intensity, time = 12 } = configRef.current; // Use latest config

      // --- Global Day/Night Cycle ---
      // Calculate darkness level for current time (overlay opacity)
      // 0:00 (0) -> Dark
      // 6:00 (6) -> Dawn (Transition)
      // 12:00 (12) -> Noon (Bright)
      // 18:00 (18) -> Dusk (Transition)
      // 24:00 (24) -> Dark
      let darkness = 0;
      if (time < 6 || time > 18) {
        // Night period
        if (time < 6) { 
           // 0 -> 6: darkness 0.8 -> 0
           darkness = 0.85 * (1 - (time / 6));
        } else {
           // 18 -> 24: darkness 0 -> 0.8
           darkness = 0.85 * ((time - 18) / 6);
        }
      } else {
        // Daytime period
        darkness = 0;
      }

      // For rainy/snowy, background is already dark, only slight overlay needed for night
      if (weather !== 'sunny') {
         // Rainy/snowy nights are darker (but background is already dark)
         // Only minor adjustment needed here
         darkness *= 0.6; 
      }

      // Draw night overlay (on top of CSS background)
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
        // Calculate sun position
        // Use config.time (0-24) to calculate progress
        // Assume sunrise 6:00, sunset 18:00
        // Progress: 6 -> 0, 12 -> 0.5, 18 -> 1
        const calculatedProgress = (time - 6) / 12;
        
        const sunX = width * (0.1 + calculatedProgress * 0.8);
        const sunY = height * 0.15 + Math.pow(Math.abs(calculatedProgress - 0.5) * 2, 2) * (height * 0.3);
        
        // Calculate sun intensity factor (0-1)
        // Combine natural daily cycle with config intensity
        const sunCycle = Math.sin(Math.max(0, Math.min(1, calculatedProgress)) * Math.PI) * 0.7 + 0.3;
        const currentIntensity = sunCycle * intensity; 
        const sunFade = Math.pow(Math.max(0, Math.min(1, opacityRef.current)), 1.8);
        const adjustedIntensity = currentIntensity * sunFade;

        // Only draw sun when it's in a reasonable range
        // Since user selected sunny mode, keep drawing even at extreme times (like polar day)

        // 1. Draw sun body (glow)
        if (adjustedIntensity > 0.01) {
          sunEffect.drawSun(ctx, sunX, sunY, adjustedIntensity);

          // 2. Draw lens flares
          sunEffect.drawFlares(ctx, sunX, sunY, width, height, adjustedIntensity);
        
          // 3. Draw bottom ground glow
          sunEffect.drawBottomGlow(
            ctx,
            sunX,
            width,
            height,
            adjustedIntensity
          );
        }
      }
      
      // RAINY
      else if (weather === 'rainy') {
        const { particleCount, thunder, wind: windVal, speed: speedMult } = configRef.current;

        // Thunder Logic
        if (thunder) {
          if (thunderTriggerOnceRef.current) {
             flashOpacity = 0.6 + Math.random() * 0.4;
             lightnings.push(new Lightning(width, height));
             nextLightningAt = now + getNextLightningDelayMs();
             onLightningStrikeRef.current?.();
             thunderTriggerOnceRef.current = false;
          }

            if (now >= nextLightningAt) {
                 flashOpacity = 0.6 + Math.random() * 0.4;
                 lightnings.push(new Lightning(width, height));
                 nextLightningAt = now + getNextLightningDelayMs();
                 onLightningStrikeRef.current?.();
            }
        } else {
          thunderTriggerOnceRef.current = false;
        }

        for(let i = lightnings.length - 1; i>=0; i--) {
            const l = lightnings[i];
            l.update();
            l.draw(ctx);
            if (l.life <= 0) lightnings.splice(i, 1);
        }

        // Dynamic Particle Count Adjustment
        rainData.setCount(particleCount);

        // Update all raindrops + batch draw
        rainData.updateAll(windVal, speedMult);
        rainData.drawAll(ctx, windVal);

        // Splash update + batch draw
        splashPool.update();
        splashPool.draw(ctx);
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

        // Removed drawIceVignette, user feedback said the large circle looked bad
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
          const { fogDensity = 0.5, wind: windVal = 0 } = configRef.current;
          
          // Draw full-screen base fog - use pre-computed solid color instead of per-frame createLinearGradient
          if (fogDensity > 0.05) {
              ctx.globalAlpha = fogDensity * 0.5;
              ctx.fillStyle = 'rgb(180, 195, 210)';
              ctx.fillRect(0, 0, width, height);
              ctx.globalAlpha = 1;
          }
          
          updateFogs(fogs, width, height, now, windVal);
          drawFogs(ctx, fogs, fogDensity);
      }



      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      groundLevel = height - 4;

      canvas.width = width;
      canvas.height = height;
      // Don't call initParticles(), avoid all particles rebuilding simultaneously
      // causing synchronized splash animation.
      // Existing particles will naturally recycle to new bounds through their own update loop.
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [weather, sunProgress]); // Removed config dependency, use ref instead

  return (
    <canvas
      ref={canvasRef}
      className={`absolute top-0 left-0 w-full h-full pointer-events-none transition-opacity duration-700 ${className}`}
      style={{ opacity }}
    />
  );
}
