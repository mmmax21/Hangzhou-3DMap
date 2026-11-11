/**
 * 所有可调视觉参数集中在这里（PRD 第 9 节第 4 条）。
 * 每个颜色都是 { day, night } 一对，由全局 uNight（0 白天 → 1 夜晚）插值。
 * 色值起点取自 PRD 第 2.2 节；标注「新增」的是 PRD 表里没有、骨架需要的补充色。
 */
export type DN<T> = { day: T; night: T }

export const style = {
  colors: {
    background: { day: '#C9AE96', night: '#0F151F' },
    base: { day: '#D5B088', night: '#14171C' },
    baseTop: { day: '#E3CDA8', night: '#171A1F' }, // 新增：底座顶面留边
    baseEdge: { day: '#B8955A', night: '#8A6A30' }, // 白天为新增的淡金细线
    water: { day: '#ECD8BA', night: '#1C3648' },
    waterDeep: { day: '#F0DFC4', night: '#13283A' },
    waterShore: { day: '#BDB98E', night: '#203C48' }, // 新增：近岸倒影色
    mountainHigh: { day: '#2F6F8F', night: '#0A1E26' },
    mountainHigh2: { day: '#4C787E', night: '#0D2229' },
    mountainMid: { day: '#7AA67D', night: '#1F2923' },
    mountainMid2: { day: '#4E9A6C', night: '#1A2620' }, // 新增：石绿偏深的笔触色
    mountainFoot: { day: '#C5AF75', night: '#1B1C17' },
    plain: { day: '#DDCBA4', night: '#171A1B' }, // 新增：平原城区地面
    shore: { day: '#7FA163', night: '#1C2620' }, // 新增：湖岸绿带（岸边树木，勾勒湖形）
    ridgeGold: { day: '#D4A94A', night: '#E0B050' },
    wall: { day: '#F2E8D5', night: '#2A2E36' },
    roof: { day: '#7E7C77', night: '#16191E' }, // 白天比 PRD 的 #5A5A58 浅，俯视时屋顶占比大，太深会让城区发黑
    tower: { day: '#DCD6CC', night: '#252A31' }, // 新增：高楼墙面（降饱和）
    road: { day: '#E8DCC0', night: '#3A3226' }, // 新增
    light: { day: '#FFB45A', night: '#FFB45A' },
    moon: { day: '#F1C085', night: '#F1C085' },
    moonReflection: { day: '#D3A56E', night: '#D3A56E' },
    seal: { day: '#B5352A', night: '#B5352A' },
    plateInk: { day: '#4A3A28', night: '#C9A15A' }, // 新增：铭牌文字
    mist: { day: '#F4EEE2', night: '#253035' },
    willow: { day: '#A9B04F', night: '#4C512F' },
    forest: { day: '#575932', night: '#1E2A22' },
    trunk: { day: '#826B43', night: '#302C22' },
    placeholder: { day: '#B5352A', night: '#6A2A22' }, // 新增：景点占位方块
  },

  trees: {
    seed: 137, forestSpacing: 7.5, forestProbability: 0.78,
    shoreSpacing: 7, dikeSpacing: 6, shoreOffset: 2.2,
    crownRadius: 3.4, crownHeight: 3.5, trunkHeight: 3.2,
    willowHeight: 6.2, willowRadius: 2.5, variation: 0.32,
    minMountainY: 7, maxMountainY: 105, edgeMargin: 12,
    landmarkClearance: 8, nightGlow: 0.08,
    crownSegments: 7, crownRings: 5,
  },

  mist: {
    grid: 65, minY: 12, maxY: 65, lift: 4, width: 115, height: 15,
    opacity: { day: 0.34, night: 0.25 }, drift: 0.8, noiseScale: 5,
    edgeMargin: 35, landmarkClearance: 25,
  },

  terrain: {
    exaggeration: 3.5, // PRD 第 3 节：只作用于地形
    peakCurve: 0.2, // 高处额外加陡：海拔差达到 peakRef 时再乘 1.2
    peakRef: 240,
    segments: 512, // 网格细分（长边），三角面约 2*512*472
    // 高程分带（米，海拔）。噪声会扰动分界，形成笔触感的色块
    footTop: 24,
    midTop: 70,
    highTop: 150,
    bandNoise: 38, // 分界扰动幅度（米）
    slopeToBlue: 0.8, // 坡度越陡越偏石青
    brushScale: 0.04, // 笔触沿等高线方向的频率（1/场景单位）
    brushContour: 0.12, // 笔触跨等高线的频率（1/米），越大皴纹越密
    ridgeBlue: 0.0065, // 凸度达到此值时山脊完全偏石青（高度图凸度 90 分位约 0.008）
    ridgeHighlight: 0.6, // 山脊提亮
    brushStrength: 0.3,
    valleyDarken: 0.3, // 山谷（凹处）压暗
    shoreWidth: 0.22, // 湖岸绿带宽度（watermask B 通道单位，1 = 48 像素 ≈ 450 米）
    edgeFalloff: 18, // 八边形边缘地形压低过渡宽度（场景单位）
    ridge: {
      width: 2.0, // 主脊线宽（屏幕像素），弱山脊按强度缩到 0.6 倍
      minStrength: 0.3, // ridges.png G 通道（山脊强度）低于此值的支脉不画，越大越少
      strength: { day: 0.8, night: 0.4 },
      glow: { day: 0.0, night: 0.55 }, // 夜晚额外发光倍数（颜色乘 1+glow，超过辉光阈值的部分发光）
    },
  },

  lighting: {
    // 主光方向（从地面指向光源），白天来自西南偏上，夜晚为月光方向
    sunDir: { day: [-0.45, 0.8, 0.35], night: [0.55, 0.55, -0.6] } as DN<[number, number, number]>,
    sunColor: { day: '#FFF4E2', night: '#9FB4D8' },
    sunIntensity: { day: 0.75, night: 0.8 },
    ambient: { day: 0.5, night: 0.85 }, // 自定义着色器里的环境光比例（阴影很淡）
    // 给 GLB 模型用的 three.js 灯光强度
    hemiSky: { day: '#FFF6E8', night: '#33415A' },
    hemiGround: { day: '#B9A27E', night: '#0C1014' },
    hemiIntensity: { day: 1.6, night: 0.6 },
    dirIntensity: { day: 1.4, night: 0.35 },
  },

  water: {
    rippleScale: 0.08,
    rippleStrength: { day: 0.015, night: 0.025 },
    shoreTint: 0.55, // 近岸倒影强度
    moonBand: { width: 0.03, breakFreq: 0.45, strength: 2.6 }, // width：倒影带的角半宽（弧度）；breakFreq：碎光沿带方向的频率
    shoreLights: { strength: 1.1, reach: 0.07, streak: 18.0 }, // 岸灯倒影：reach 为离岸距离（watermask G 通道单位）
  },

  buildings: {
    sink: 1.5, // 向地下延伸，避免坡地悬空（场景单位）
    clearRadius: 12, // 景点周围清空建筑的半径（场景单位）
    towerHeight: 40, // 高于此（米）视为高楼，降饱和
    windowFloor: 3.2, // 窗格层高（米）
    windowSpacing: 4.5, // 窗格水平间距（米）
    windowLitRatio: 0.5,
    windowGlow: 3.2, // 夜晚窗灯亮度（>1 进入辉光）
    windowMinPx: 2.5, // 远处每个窗格至少占多少像素（LOD 合并）
    wallGlow: 0.03, // 夜晚墙体整体微光
  },

  roads: {
    width: { trunk: 1.8, primary: 1.6, secondary: 1.2, tertiary: 0.9 } as Record<string, number>,
    lift: 0.35,
    dayOpacity: 0.55,
    nightOpacity: 0.3,
    nightMix: 0.16, // 夜晚道路颜色向灯光色混合的比例
    nightGlow: 0.8,
    keepClasses: ['trunk', 'primary'], // 这些等级全部保留
    lakeReach: 0.3, // 其它等级只保留离湖这么近的（watermask B 通道单位，0.3 ≈ 90 米）
  },

  shoreLights: {
    spacing: 9, // 场景单位
    size: 5.0, // 光点直径（场景单位）
    glow: 1.7,
  },

  landmarks: {
    placeholderSize: [7, 12, 7] as [number, number, number],
    nightGlow: 1.8,
  },

  base: {
    rim: 10, // 地形外留边宽度
    thickness: 82,
    chamfer: 0.2, // 切角占短边比例
    topY: 0.1, // 底座顶面高度（与地形边缘相接）
    innerFloorY: -2, // 地形下方的封底高度，必须低于湖底
  },

  moon: {
    screen: [0.32, 0.8] as [number, number], // 月亮在画面中的位置（NDC，-1..1），随相机固定在右上方
    distance: 2600,
    size: 70,
    glow: 1.7,
  },

  camera: {
    fov: 32,
    position: [0, 700, 910] as [number, number, number],
    target: [0, 0, 20] as [number, number, number],
    minDistance: 100,
    maxDistance: 1600,
    minPitchDeg: 20,
    maxPitchDeg: 75,
    autoRotateSpeed: 0.25,
    idleResumeSec: 10,
  },

  post: {
    bloomIntensity: { day: 0.25, night: 0.9 },
    bloomThreshold: { day: 0.92, night: 0.7 },
    bloomSmoothing: 0.25,
    vignette: { day: 0.32, night: 0.55 },
    vignetteOffset: 0.32,
    tiltShift: { blur: 0.05, taper: 0.6, start: [0.5, 0.0] as [number, number], end: [0.5, 1.0] as [number, number] },
    paper: { strength: 0.06, fiber: 0.035 }, // 宣纸纹理，只在白天
    warmth: { day: 0.0, night: 0.0 },
  },

  transition: { duration: 3 },

  render: {
    maxDpr: 1.5, // PRD 允许最高 2；骨架阶段取 1.5 保帧率，画质分档阶段再按设备调
    msaa: 4,
    tiltShiftSamples: 6,
  },
} as const
