import type { DeliveryOrder } from "../types";

export interface ParsedAddress {
  sido: string;
  sigungu: string;
  eupmyeondong: string;
}

/**
 * 한국 주소 문자열을 시/도 > 시/군/구 > 읍/면/동 3단계로 대략 분리한다.
 * (지역 필터 UI용 휴리스틱. 정밀 좌표 변환은 TMap 지오코딩이 담당하므로
 *  여기서는 완벽할 필요 없이 '필터가 그럴듯하게 묶이는 정도'면 충분하다.)
 */
export function parseAddressHierarchy(address: string): ParsedAddress {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  const sido = tokens[i] || "";
  if (sido) i++;

  let sigungu = "";
  // "성남시 분당구"처럼 시+구가 붙어 나오는 경우를 하나로 묶는다
  if (tokens[i] && /시$/.test(tokens[i]) && tokens[i + 1] && /구$/.test(tokens[i + 1])) {
    sigungu = `${tokens[i]} ${tokens[i + 1]}`;
    i += 2;
  } else if (tokens[i] && /(시|군|구)$/.test(tokens[i])) {
    sigungu = tokens[i];
    i += 1;
  }

  let eupmyeondong = "";
  if (tokens[i] && /(읍|면|동|가|리)$/.test(tokens[i])) {
    eupmyeondong = tokens[i];
    i += 1;
  }

  return { sido, sigungu, eupmyeondong };
}

export function applyAddressHierarchy(order: DeliveryOrder): DeliveryOrder {
  const parsed = parseAddressHierarchy(order.address);
  return { ...order, ...parsed };
}

/** buildRegionTree와 동일한 규칙(미분류 대체)으로 leaf key를 만든다. 필터링 시 이 함수로 매칭해야 한다. */
export function regionLeafKey(order: DeliveryOrder): string {
  const sido = order.sido || "(미분류)";
  const sigungu = order.sigungu || "(미분류)";
  const dong = order.eupmyeondong || "(미분류)";
  return `${sido}/${sigungu}/${dong}`;
}

export interface RegionNode {
  key: string;
  label: string;
  count: number;
  children: RegionNode[];
}

/** 필터용 시/도 > 시군구 > 읍면동 트리 생성 */
export function buildRegionTree(orders: DeliveryOrder[]): RegionNode[] {
  const sidoMap = new Map<string, Map<string, Map<string, number>>>();

  for (const o of orders) {
    const sido = o.sido || "(미분류)";
    const sigungu = o.sigungu || "(미분류)";
    const dong = o.eupmyeondong || "(미분류)";

    if (!sidoMap.has(sido)) sidoMap.set(sido, new Map());
    const sigunguMap = sidoMap.get(sido)!;
    if (!sigunguMap.has(sigungu)) sigunguMap.set(sigungu, new Map());
    const dongMap = sigunguMap.get(sigungu)!;
    dongMap.set(dong, (dongMap.get(dong) || 0) + 1);
  }

  const tree: RegionNode[] = [];
  for (const [sido, sigunguMap] of sidoMap) {
    const sidoChildren: RegionNode[] = [];
    let sidoCount = 0;
    for (const [sigungu, dongMap] of sigunguMap) {
      const sigunguChildren: RegionNode[] = [];
      let sigunguCount = 0;
      for (const [dong, count] of dongMap) {
        sigunguChildren.push({ key: `${sido}/${sigungu}/${dong}`, label: dong, count, children: [] });
        sigunguCount += count;
      }
      sigunguChildren.sort((a, b) => a.label.localeCompare(b.label, "ko"));
      sidoChildren.push({ key: `${sido}/${sigungu}`, label: sigungu, count: sigunguCount, children: sigunguChildren });
      sidoCount += sigunguCount;
    }
    sidoChildren.sort((a, b) => a.label.localeCompare(b.label, "ko"));
    tree.push({ key: sido, label: sido, count: sidoCount, children: sidoChildren });
  }
  tree.sort((a, b) => a.label.localeCompare(b.label, "ko"));
  return tree;
}

/** 트리 노드 이하 모든 leaf(읍/면/동) key를 모은다. */
export function collectLeafKeys(node: RegionNode): string[] {
  if (node.children.length === 0) return [node.key];
  return node.children.flatMap(collectLeafKeys);
}
