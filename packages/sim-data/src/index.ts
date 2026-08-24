import {
  buildTransitionGraph,
  fnv1a,
  type PlateType,
  type PoolSnapshot,
  type RegionProfile
} from "@platego/core";

export const SIM_DATA_VERSION = "sim-2026.08-v1";
export const SIM_DATA_GENERATED_AT = "2026-08-24T00:00:00.000+08:00";

export const REGIONS: RegionProfile[] = [
  { code: "110000", name: "北京市", shortName: "北京", authority: "A", provincePrefix: "京" },
  { code: "120000", name: "天津市", shortName: "天津", authority: "A", provincePrefix: "津" },
  { code: "130000", name: "河北省", shortName: "河北", authority: "A", provincePrefix: "冀" },
  { code: "140000", name: "山西省", shortName: "山西", authority: "A", provincePrefix: "晋" },
  { code: "150000", name: "内蒙古自治区", shortName: "内蒙古", authority: "A", provincePrefix: "蒙" },
  { code: "210000", name: "辽宁省", shortName: "辽宁", authority: "A", provincePrefix: "辽" },
  { code: "220000", name: "吉林省", shortName: "吉林", authority: "A", provincePrefix: "吉" },
  { code: "230000", name: "黑龙江省", shortName: "黑龙江", authority: "A", provincePrefix: "黑" },
  { code: "310000", name: "上海市", shortName: "上海", authority: "A", provincePrefix: "沪" },
  { code: "320000", name: "江苏省", shortName: "江苏", authority: "A", provincePrefix: "苏" },
  { code: "330000", name: "浙江省", shortName: "浙江", authority: "A", provincePrefix: "浙" },
  { code: "340000", name: "安徽省", shortName: "安徽", authority: "A", provincePrefix: "皖" },
  { code: "350000", name: "福建省", shortName: "福建", authority: "A", provincePrefix: "闽" },
  { code: "360000", name: "江西省", shortName: "江西", authority: "A", provincePrefix: "赣" },
  { code: "370000", name: "山东省", shortName: "山东", authority: "A", provincePrefix: "鲁" },
  { code: "410000", name: "河南省", shortName: "河南", authority: "A", provincePrefix: "豫" },
  { code: "420000", name: "湖北省", shortName: "湖北", authority: "A", provincePrefix: "鄂" },
  { code: "430000", name: "湖南省", shortName: "湖南", authority: "A", provincePrefix: "湘" },
  { code: "440000", name: "广东省", shortName: "广东", authority: "A", provincePrefix: "粤" },
  { code: "450000", name: "广西壮族自治区", shortName: "广西", authority: "A", provincePrefix: "桂" },
  { code: "460000", name: "海南省", shortName: "海南", authority: "A", provincePrefix: "琼" },
  { code: "500000", name: "重庆市", shortName: "重庆", authority: "A", provincePrefix: "渝" },
  { code: "510000", name: "四川省", shortName: "四川", authority: "A", provincePrefix: "川" },
  { code: "520000", name: "贵州省", shortName: "贵州", authority: "A", provincePrefix: "贵" },
  { code: "530000", name: "云南省", shortName: "云南", authority: "A", provincePrefix: "云" },
  { code: "540000", name: "西藏自治区", shortName: "西藏", authority: "A", provincePrefix: "藏" },
  { code: "610000", name: "陕西省", shortName: "陕西", authority: "A", provincePrefix: "陕" },
  { code: "620000", name: "甘肃省", shortName: "甘肃", authority: "A", provincePrefix: "甘" },
  { code: "630000", name: "青海省", shortName: "青海", authority: "A", provincePrefix: "青" },
  { code: "640000", name: "宁夏回族自治区", shortName: "宁夏", authority: "A", provincePrefix: "宁" },
  { code: "650000", name: "新疆维吾尔自治区", shortName: "新疆", authority: "A", provincePrefix: "新" }
];

const BLUE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const DIGITS = "012356789";
const CACHE = new Map<string, PoolSnapshot>();

function seedFrom(value: string): number {
  return Number.parseInt(fnv1a(value), 16) || 1;
}

function randomFactory(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function pick(random: () => number, source: string): string {
  return source[Math.floor(random() * source.length) % source.length];
}

function generateSuffixes(regionCode: string, plateType: PlateType): string[] {
  const random = randomFactory(seedFrom(`${SIM_DATA_VERSION}:${regionCode}:${plateType}`));
  const values = new Set<string>();
  const attractiveBlue = ["88888", "66666", "99999", "16888", "51888", "12345", "56789", "A8888", "B6666", "K9999", "52088", "25888"];
  const attractiveNev = ["D88888", "F66666", "D16888", "F51888", "D12345", "F56789", "D99999", "F52088"];
  for (const item of plateType === "small_nev" ? attractiveNev : attractiveBlue) values.add(item);

  while (values.size < 240) {
    if (plateType === "small_nev") {
      let suffix = random() > 0.5 ? "D" : "F";
      while (suffix.length < 6) suffix += pick(random, DIGITS);
      values.add(suffix);
    } else {
      let suffix = "";
      while (suffix.length < 5) suffix += pick(random, BLUE_ALPHABET);
      values.add(suffix);
    }
  }
  return [...values].sort();
}

export function getRegionProfile(regionCode: string): RegionProfile {
  return REGIONS.find((region) => region.code === regionCode) ?? REGIONS.find((region) => region.code === "310000")!;
}

export function getSimulatedPool(regionCode: string, plateType: PlateType): PoolSnapshot {
  const safeRegion = getRegionProfile(regionCode);
  const cacheKey = `${safeRegion.code}:${plateType}`;
  const existing = CACHE.get(cacheKey);
  if (existing) return existing;
  const prefix = `${safeRegion.provincePrefix}${safeRegion.authority}`;
  const suffixes = generateSuffixes(safeRegion.code, plateType);
  const snapshot: PoolSnapshot = {
    namespace: "simulation",
    regionCode: safeRegion.code,
    regionName: safeRegion.name,
    plateType,
    version: SIM_DATA_VERSION,
    generatedAt: SIM_DATA_GENERATED_AT,
    prefix,
    values: suffixes.map((suffix) => `${prefix}${suffix}`),
    graph: buildTransitionGraph(suffixes),
    source: "bundled-fixed",
    disclaimer: "固定模拟数据，仅用于免费练习与功能测试，不代表官方实时可用状态。"
  };
  CACHE.set(cacheKey, snapshot);
  return snapshot;
}

export function getCatalog() {
  return {
    simDataVersion: SIM_DATA_VERSION,
    generatedAt: SIM_DATA_GENERATED_AT,
    plateTypes: [
      { id: "small_blue" as const, label: "小型汽车蓝牌", suffixLength: 5 },
      { id: "small_nev" as const, label: "小型新能源汽车", suffixLength: 6 }
    ],
    regions: REGIONS
  };
}

export function getRandomBatch(snapshot: PoolSnapshot, batchIndex: number, size = 10): string[] {
  const values = snapshot.values;
  if (values.length === 0) return [];
  const offset = (seedFrom(`${snapshot.regionCode}:${snapshot.plateType}`) + batchIndex * size) % values.length;
  return Array.from({ length: Math.min(size, values.length) }, (_, index) => values[(offset + index) % values.length]);
}

export function getDemoLatestPool(regionCode: string, plateType: PlateType): PoolSnapshot {
  const fixed = getSimulatedPool(regionCode, plateType);
  const rotated = [...fixed.values.slice(19), ...fixed.values.slice(0, 19)].slice(0, 180);
  const suffixes = rotated.map((value) => value.slice(fixed.prefix.length));
  return {
    ...fixed,
    version: `local-demo-latest-${SIM_DATA_VERSION}`,
    generatedAt: new Date().toISOString(),
    values: rotated,
    graph: buildTransitionGraph(suffixes),
    source: "local-demo-latest",
    disclaimer: "本地开发用“最新数据”样例，仅验证密钥与同步流程，不是 12123 实时号池。"
  };
}
