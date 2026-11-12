/**
 * 所有可调视觉参数集中在这里（PRD 第 9 节第 4 条）。
 * 每个颜色都是 { day, night } 一对，由全局 uNight（0 白天 → 1 夜晚）插值。
 * 色值起点取自 PRD 第 2.2 节；标注「新增」的是 PRD 表里没有、骨架需要的补充色。
 */
export type DN<T> = { day: T; night: T }

export const style = {
  colors: {
    background: { day: '#C9AE96', night: '#0F151F' },
    base: { day: '#D5B088', night: '#30343B' },
    baseTop: { day: '#E3CDA8', night: '#171A1F' }, // 新增：底座顶面留边
    baseEdge: { day: '#B8955A', night: '#8A6A30' }, // 白天为新增的淡金细线
    // 白天水色改为淡青瓷色：原来的米色和平地几乎同色，湖读不出来
    water: { day: '#D9E4D3', night: '#1C3648' },
    waterDeep: { day: '#CADDD2', night: '#13283A' },
    waterShore: { day: '#93B48A', night: '#203C48' }, // 近岸倒影色
    waterFar: { day: '#F3EFE2', night: '#2A4658' }, // 远处水面泛天光（只在没有真实倒影的低画质档使用）
    sunGlint: { day: '#FFF7E4', night: '#000000' }, // 白天波光
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
    willow: { day: '#B9C766', night: '#5A6335' }, // 比 PRD 的 #A9B04F 亮：受光后才接近定稿图的柳色
    forest: { day: '#7FA862', night: '#24332A' }, // PRD 的 #575932 受光后近黑，盖住青绿山体，改为石绿系
    trunk: { day: '#826B43', night: '#302C22' },
    placeholder: { day: '#DDD2BC', night: '#3A3A3A' }, // 模型加载中或加载失败时的占位，用石色，不再用红色
  },

  trees: {
    // 1 单位 = 10 米。树高约 3 到 4 个单位，景点高 12 到 34，树不能比景点大
    seed: 137, forestSpacing: 4.6, forestProbability: 0.8,
    shoreSpacing: 4.2, dikeSpacing: 3.6, shoreOffset: 1.5,
    crownRadius: 1.7, crownHeight: 1.8, trunkHeight: 1.3,
    willowHeight: 3.2, willowRadius: 1.3, variation: 0.3,
    minMountainY: 7, edgeMargin: 12,
    footMaxY: 40, // 山上的树只长到这个高度，再往上露出青绿山体和金线
    footFade: 1.6, // 越大，树越集中在山脚
    tint: 0.16, // 每棵树的明暗随机幅度
    shadeLow: 0.6, shadeHigh: 1.14, // 树冠底部和顶部的明暗
    landmarkClearance: 15, nightGlow: 0.08,
    crownSegments: 6, crownRings: 4,
  },

  mist: {
    grid: 46, minY: 18, maxY: 105, lift: 7, width: 105, height: 24,
    opacity: { day: 0.6, night: 0.4 }, drift: 0.8, noiseScale: 4,
    edgeMargin: 60, landmarkClearance: 30,
  },

  terrain: {
    exaggeration: 4.6, // 为主镜头的山势再加高，不再追求真实比例
    peakCurve: 0.3, // 高处额外加陡：海拔差达到 peakRef 时再乘 1.2
    peakRef: 240,
    segments: 480, // 为景点精模留出三角面预算
    lowSegments: 224, smoothingWeights: [4, 2, 1] as const,
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
      width: 2.3, // 主脊线宽（屏幕像素），弱山脊按强度缩到 0.6 倍
      minStrength: 0.3, // ridges.png G 通道（山脊强度）低于此值的支脉不画，越大越少
      strength: { day: 1.15, night: 0.4 },
      glow: { day: 0.0, night: 0.55 }, // 夜晚额外发光倍数（颜色乘 1+glow，超过辉光阈值的部分发光）
    },
  },

  lighting: {
    // 主光方向（从地面指向光源），白天来自西南偏上，夜晚为月光方向
    sunDir: { day: [-0.45, 0.8, 0.35], night: [0.55, 0.55, -0.6] } as DN<[number, number, number]>,
    sunColor: { day: '#FFF4E2', night: '#9FB4D8' },
    sunIntensity: { day: 0.92, night: 0.8 },
    ambient: { day: 0.43, night: 0.85 }, // 自定义着色器里的环境光比例（阴影很淡）
    // 给 GLB 模型用的 three.js 灯光强度
    hemiSky: { day: '#FFF6E8', night: '#33415A' },
    hemiGround: { day: '#B9A27E', night: '#0C1014' },
    hemiIntensity: { day: 1.6, night: 0.6 },
    dirIntensity: { day: 1.4, night: 0.35 },
  },

  water: {
    rippleScale: 0.11,
    rippleSpeed: 0.11,
    rippleStrength: { day: 0.05, night: 0.09 },
    // 真实倒影（高画质）
    reflect: { day: 0.82, night: 0.95 }, // 倒影总强度
    reflectBase: 0.2, // 垂直俯视时的倒影比例，越大水越像镜子
    distort: 0.55, // 波纹对倒影的扰动
    stretch: 0.012, // 倒影沿竖直方向拉长的幅度
    reflectResolution: 0.45, // 倒影贴图相对画面的分辨率
    glint: 0.9, glintPower: 220, // 白天波光的强度和集中程度
    shoreTint: 0.6, // 近岸倒影强度
    farTint: 0.75, // 掠射角处水面泛天光的强度
    moonBand: { width: 0.016, breakFreq: 0.45, strength: 2.6 }, // width：倒影带的角半宽（弧度）；breakFreq：碎光沿带方向的频率
    shoreLights: { strength: 1.1, reach: 0.07, streak: 18.0 }, // 岸灯倒影：reach 为离岸距离（watermask G 通道单位）
  },

  buildings: {
    sink: 1.5, // 向地下延伸，避免坡地悬空（场景单位）
    clearRadius: 17, // 景点周围清空建筑的半径（场景单位）
    towerHeight: 40, // 高于此（米）视为高楼，降饱和
    windowFloor: 3.2, // 窗格层高（米）
    windowSpacing: 4.5, // 窗格水平间距（米）
    windowLitRatio: 0.9,
    windowGlow: 4.2, // 夜晚窗灯亮度（>1 进入辉光）
    windowMinPx: 2.5, // 远处每个窗格至少占多少像素（LOD 合并）
    wallGlow: 0.08, // 夜晚墙体整体微光
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
    nightGlow: 1.15, // 夜晚自发光强度，发光跟随贴图，保留屋檐和柱子的明暗
    modelSize: 22, hoverLift: 0, // 悬停时不再上浮，只显示名称
    hoverDamping:10, flightDuration: 1.5,
    modelSaturation: .82, modelGain: 1.22, modelRoughness: .9,
    shadowScale: .62, shadowOpacity: .38, shadowOffset: [.25, -.12] as [number, number], // 接触阴影：半径相对模型高度，偏向背光一侧
    // 模型高度（场景单位）。为了在全景里看得见，比真实比例夸张得多：塔约 4 到 5 倍，亭和殿更大
    sizes: { leifeng:34, baochu:27, duanqiao:9, huxinting:14, santan:13, quyuan:13, huagang:9.5, yuewang:15, sudi:6 } as Record<string,number>,
    rotations: { duanqiao:-.65, sudi:1.4 } as Record<string,number>,
    stoneSize: 4, stoneOffsets: [[-11,0,20],[0,0,28],[11,0,20]] as [number,number,number][],
    flightOffset: [0, 75, 115] as [number, number, number],
    clickMaxDrag: 3, markerRadius:2.2, markerHeight:2, markerSegments:16, labelLift:4,
  },

  ui: { background: {day: 'rgba(242,232,213,.9)',night:'rgba(20,23,28,.9)'}, text:{day:'#4a3a28',night:'#e0b050'}, border:{day:'#b8955a',night:'#8a6a30'}, inset:20, width:280, padding:16, fontSize:16, headingSize:22, compactWidth:620 },

  base: {
    rim: 10, // 地形外留边宽度
    thickness: 82,
    chamfer: 0.2, // 切角占短边比例
    topY: 0.1, // 底座顶面高度（与地形边缘相接）
    innerFloorY: -2, // 地形下方的封底高度，必须低于湖底
  },

  backdrop: {
    radius: 4000,
    top: { day: '#D9C3A6', night: '#0B1220' },
    horizon: { day: '#F1E6D2', night: '#1B2836' },
    far: { day: '#B9C6C2', night: '#16222E' },
    near: { day: '#8FA9A8', night: '#0F1A24' },
    ridgeBase: 0.015, ridgeStep: 0.03, ridgeHeight: 0.11, hazeDepth: 0.07,
  },

  // 运行时自适应画质，见 state/perf.ts
  adaptive: {
    minFps: 45, // 平均帧率低于这个值就降一档
    windowMs: 250, windows: 12, threshold: 0.8, // 每 250 毫秒取一次样，12 次里有八成不达标才降档
    settle: 3, // 开场结束后再等几秒才开始监测
    dpr: [1.5, 1.25, 1] as readonly number[], // 各档的像素比上限
  },

  tour: {
    fly: 3.2, // 两站之间飞行的秒数
    dwell: 6.2, // 每站停留的秒数，期间镜头缓推
    textLead: 0.6, // 诗句在镜头到位前多久开始浮现
    overviewPush: 0.07, // 全景站缓推的比例
    autoDelay: 2.5, // 开场结束后多久自动开始导览
  },

  weather: {
    count: 1600, radius: 150, height: 130, opacity: 0.9, maxPx: 9, // maxPx：粒子在屏幕上的最大像素，避免贴近镜头的那几粒过大
    snowSpeed: 9, snowSway: 2.2, snowSize: 1.3, snowColor: '#FFFFFF',
    petalSpeed: 6, petalSway: 4.5, petalSize: 1.4, petalColor: '#F7C6CF',
  },

  skyLanterns: { count: 80, radius: 250, rise: 330, speed: 0.022, sway: 5, drift: 30, size: 5.5, glow: 2.4 },

  boats: {
    count: 6, length: 7.5, speed: 2.2, // speed：场景单位每秒
    spread: 150, minRadius: 16, maxRadius: 36, shoreClear: 0.2, glow: 2.6,
    hull: { day: '#6B4A33', night: '#241C17' }, cabin: { day: '#B0553F', night: '#5A3324' }, roof: { day: '#4A4E52', night: '#14171B' },
  },

  city: {
    reach: 0.75, // 只保留离湖这么近的建筑（watermask B 通道单位，1 约 450 米），更远处留白
    feather: 0.45, // 留白的过渡宽度，越大边缘越散
  },

  moon: {
    screen: [0.32, 0.8] as [number, number], // 月亮在画面中的位置（NDC，-1..1），随相机固定在右上方
    distance: 2600,
    size: 70,
    glow: 1.7,
  },

  camera: {
    fov: 32,
    // 主镜头：从湖东岸向西看，雷峰塔在左前，群山作背景，城区落在镜头之外
    position: [455, 150, 175] as [number, number, number],
    target: [-75, 22, -15] as [number, number, number],
    minDistance: 40, // 导览的近景需要靠近景点
    maxDistance: 1600,
    minPitchDeg: 4, // 导览的近景几乎平视，才能把远山收进画面
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

  transition: { duration: 5.5 }, // 入夜时灯火从东向西依次点亮，需要足够长才看得出先后

  // 开场：先是高处俯视的一幅平铺水墨，随后山隆起、颜色晕开、镜头降到主镜头
  entrance: {
    duration: 6.2, baseDuration: .8, initialScale: .001,
    terrainStart: 1.0, terrainDuration: 2.8,
    objectsStart: 2.6, objectsDuration: 1.5,
    landmarkStart: 3.2, landmarkDuration: 1.4,
    inkStart: 1.6, inkDuration: 3.0,
    cameraFrom: [60, 820, 230] as [number, number, number], cameraStart: .9, cameraDuration: 5.2,
  },

  // 阶段 8：日光投影，见 scene/Shadows.tsx。主光方向沿用 lighting.sunDir（shared.uSunDir）
  shadows: {
    // 物体（景点、树、建筑）投到地面和建筑上的影子强度：0 无影，1 完全挡住主光
    strength: { day: 0.62, night: 0.04 } as DN<number>,
    // 山体投影与背光面（按主光方向在高度图上步进求遮蔽）的强度
    terrainStrength: { day: 0.48, night: 0.04 } as DN<number>,
    tint: '#6F8FA0', // 影子里偏一点石青，避免发灰发黑
    tintAmount: 0.22,
    mapSize: 2048, // 阴影贴图边长，覆盖整个沙盘约 0.45 单位一个像素
    radius: 3, // three 自带 PCF 的模糊半径（景点、树受影）
    bias: -0.0006, normalBias: 0.35,
    maskSize: 1536, // 地面阴影遮罩边长：只在主光方向变化时重算，地形每像素只取样一次
    maskSoft: 1.6, // 地面遮罩 PCF 的取样间距（阴影贴图像素），越大越柔
    maskBias: 1.2, // 地面遮罩比较深度的偏移（场景单位），地面不投影，只用来避免网格与高度图的微小差异
    occSteps: 40, occDistance: 260, // 山体遮蔽的步进次数和最远距离（场景单位）
    occSoft: 3.5, // 山体遮蔽的柔和度，越小半影越宽
    casterTop: 200, // 投影者的最高高度（场景单位），用于拟合阴影相机
    minAngle: 0.003, // 主光方向变化超过这个弧度才重算
    interval: 0.2, // 主光方向持续变化时（昼夜过渡）两次重算的最短间隔（秒）
    contactKeep: 0.45, // 有真实投影时接触阴影保留的比例；第 2 档没有投影，接触阴影保持原样
  },

  // 阶段 8：曲院风荷的荷叶与荷花，见 scene/Lotus.tsx
  lotus: {
    radius: 72, // 以曲院风荷为中心的铺设半径（场景单位）
    center: [0, 0] as [number, number], // 相对景点坐标的偏移
    spacing: 2.1, // 候选点网格间距
    density: 1, // 候选点保留概率（边缘按距离再衰减）
    clusterScale: 0.075, // 成片分布的噪声频率，越小片越大
    clusterCut: 0.24, // 噪声低于这个值的地方留出水面
    shoreMin: 0.008, shoreMax: 0.34, // 只铺在离岸这段距离内（watermask G 通道单位）
    modelClear: 11, // 离水榭模型的最小距离
    boatClear: 9, // 离游船航线的最小距离
    leafSize: [1.4, 2.6] as [number, number], // 荷叶半径范围
    leafLift: [0.12, 0.9] as [number, number], // 荷叶离水面高度范围（少数立叶高出水面）
    standRatio: 0.18, // 立叶（高出水面、略倾斜）的比例
    flowerRatio: 0.1, // 荷花数量相对荷叶的比例
    flowerSize: 1.0, flowerLift: 1.3,
    sway: 0.06, swaySpeed: 0.7, // 起伏动画
    leaf: { day: '#4E8C5C', night: '#14241A' },
    leafEdge: { day: '#86B86C', night: '#1D3022' },
    flower: { day: '#F29BB0', night: '#3A2230' },
    flowerCore: { day: '#FFE7A8', night: '#4A3C22' },
    lowFraction: 0.35, // 第 2 档只保留这么多
  },

  render: {
    maxDpr: 1.5, // PRD 允许最高 2；骨架阶段取 1.5 保帧率，画质分档阶段再按设备调
    msaa: 4,
    tiltShiftSamples: 6,
    lowDpr: 1, lowMsaa: 0, lowTreeFraction: .3, mobileWidth: 768, lowCpuCores: 4, lowMemoryGb: 4,
  },
} as const
