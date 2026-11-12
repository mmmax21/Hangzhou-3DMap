/**
 * 画卷导览的脚本。每一站：景名、两句诗、出处、光线和天气、镜头。
 * 诗句只用有确切出处的名句，出处写明朝代、作者、篇名。不要让模型自行撰写诗句。
 * from / to 是相机相对景点地面位置的偏移（场景单位，X 东、Y 上、Z 南），镜头在停留期间从 from 缓推到 to。
 * id 为 null 的是全景站，使用主镜头。
 */
export type TourStop = {
  id: string | null
  title: string
  poem: [string, string]
  source: string
  night: number // 0 白天，1 夜晚，中间值是黄昏
  snow?: number
  petals?: number
  from?: [number, number, number]
  to?: [number, number, number]
  lift?: number // 注视点离地高度
}

export const tourStops: TourStop[] = [
  { id: null, title: '西湖', poem: ['湖上春来似画图', '乱峰围绕水平铺'], source: '唐 · 白居易《春题湖上》', night: 0 },
  { id: 'sudi', title: '苏堤春晓', poem: ['水光潋滟晴方好', '山色空蒙雨亦奇'], source: '宋 · 苏轼《饮湖上初晴后雨》', night: 0, petals: 1, from: [60, 18, 62], to: [48, 15, 50], lift: 9 },
  { id: 'quyuan', title: '曲院风荷', poem: ['接天莲叶无穷碧', '映日荷花别样红'], source: '宋 · 杨万里《晓出净慈寺送林子方》', night: 0, from: [84, 19, 58], to: [66, 16, 46], lift: 9 },
  { id: 'leifeng', title: '雷峰夕照', poem: ['湖上画船归欲尽', '孤峰犹带夕阳红'], source: '元 · 尹廷高《雷峰夕照》', night: 0.42, from: [112, 30, -40], to: [92, 26, -30], lift: 19 },
  { id: 'santan', title: '三潭印月', poem: ['松排山面千重翠', '月点波心一颗珠'], source: '唐 · 白居易《春题湖上》', night: 1, from: [92, 20, 56], to: [74, 17, 44], lift: 9 },
  { id: 'duanqiao', title: '断桥残雪', poem: ['断桥荒藓涩', '空院落花深'], source: '唐 · 张祜《题杭州孤山寺》', night: 0.15, snow: 1, from: [80, 19, 76], to: [62, 16, 58], lift: 8 },
  { id: null, title: '淡妆浓抹', poem: ['欲把西湖比西子', '淡妆浓抹总相宜'], source: '宋 · 苏轼《饮湖上初晴后雨》', night: 0 },
]
