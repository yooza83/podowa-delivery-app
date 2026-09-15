/**
 * TMap(SK Open API) REST 클라이언트.
 *
 * - 지오코딩(Full Text Geocoding): https://openapi.sk.com/products/detail?linkMenuSeq=25
 *   응답: { coordinateInfo: { coordinate: [ { newLat, newLon, lat, lon, ... } ] } }
 * - 경유지 순서 최적화: https://openapi.sk.com/products/detail?linkMenuSeq=50
 *   10/20/30/100개짜리가 별도 "상품"으로 나뉘어 있고, Free 요금제 기준 실측 결과
 *   상품마다 하루 호출 한도가 크게 다르다(100개 버전은 하루 1회, 10·20개 버전은
 *   하루 50회 — 대시보드 '사용 한도' 탭에서 직접 확인한 값. 요금제/계정에 따라
 *   달라질 수 있음). 그래서 몇 개짜리 상품을 쓸지 TMAP_ROUTE_OPT_SIZE 환경변수로
 *   고를 수 있게 했다(기본값 20 — 배송지 20곳까지 커버하면서 호출 여유도 있는 절충점).
 *   사용하려는 크기의 상품을 openapi.sk.com에서 미리 신청해둬야 한다.
 *   응답: GeoJSON FeatureCollection. 총 거리/시간/요금은 최상위 properties에 있고
 *   (각 feature 안이 아님!), 경유지 방문순서는 Point feature들의 properties.pointType
 *   ("S"=출발, "B1"~"Bn"=경유지, "E"=도착, "N"=일반 안내점)으로 구분한다.
 * 두 제품 모두 공식 문서(위 링크, 2026-09 확인)를 그대로 반영해 구현했다.
 *
 * 호출 한도(429 QUOTA_EXCEEDED): 상품별 "하루 몇 회"가 핵심 제약이라, 429가 나도
 * 짧게 재시도하는 건 의미가 없고(그날 한도가 이미 다 찼을 뿐 곧 풀리는 게 아님)
 * 오히려 한도를 더 깎아먹을 수 있어 자동 재시도는 넣지 않았다. 대신 여러 호출이
 * 겹치지 않도록 앱 전체에서 하나의 큐로 직렬화만 해둔다.
 */
import axios from "axios";

const REST_APP_KEY = process.env.TMAP_REST_APP_KEY || "";
const DEBUG = process.env.DEBUG_TMAP === "1";

const ALLOWED_ROUTE_OPT_SIZES = [10, 20, 30, 100] as const;
const ROUTE_OPT_SIZE = (() => {
  const raw = Number(process.env.TMAP_ROUTE_OPT_SIZE);
  return (ALLOWED_ROUTE_OPT_SIZES as readonly number[]).includes(raw) ? raw : 20;
})();

const client = axios.create({
  baseURL: "https://apis.openapi.sk.com",
  timeout: 15000,
});

function assertKey() {
  if (!REST_APP_KEY) {
    throw new Error(
      "TMAP_REST_APP_KEY가 설정되지 않았습니다. backend/.env 파일을 확인하세요."
    );
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 전역 호출 직렬화(동시에 여러 요청이 몰리는 것만 방지, 재시도는 하지 않음) ──
const MIN_CALL_INTERVAL_MS = 300;
let queueTail: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function callTmap<T>(fn: () => Promise<T>): Promise<T> {
  const result = queueTail.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_CALL_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  queueTail = result.catch(() => {}); // 한 건 실패해도 큐는 계속 진행
  return result;
}

/** 에러를 사용자에게 보여줄 한국어 메시지로 변환 */
function friendlyTmapError(err: any, fallback: string): string {
  if (err?.response?.status === 429) {
    return "TMap 호출 한도에 도달했습니다(하루 사용 한도가 있는 상품입니다). 내일 다시 시도하거나, 더 넉넉한 요금제/상품으로 변경해 주세요.";
  }
  return err?.response?.data?.error?.message || err.message || fallback;
}

export interface GeocodeResult {
  address: string;
  ok: boolean;
  lat?: number;
  lng?: number;
  message?: string;
}

/** 응답 객체를 재귀적으로 훑어 lat/lon(또는 newLat/newLon) 쌍을 찾는다. */
function findCoordinate(
  node: unknown
): { lat: number; lng: number } | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;

  const tryPair = (latKey: string, lonKey: string) => {
    const latRaw = obj[latKey];
    const lonRaw = obj[lonKey];
    if (latRaw === undefined || lonRaw === undefined) return null;
    const lat = Number(latRaw);
    const lng = Number(lonRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
    return null;
  };

  // 도로명(new) 좌표를 우선 사용
  const preferred =
    tryPair("newLat", "newLon") || tryPair("lat", "lon") || tryPair("frontLat", "frontLon");
  if (preferred) return preferred;

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findCoordinate(item);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findCoordinate(value);
      if (found) return found;
    }
  }
  return null;
}

/** 주소 1건을 지오코딩. 백엔드는 '주소 문자열'만 TMap으로 전송한다(이름/연락처 전송 금지). */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  try {
    assertKey();
    const res = await callTmap(() =>
      client.get("/tmap/geo/fullAddrGeo", {
        headers: { appKey: REST_APP_KEY },
        params: {
          version: 1,
          format: "json",
          fullAddr: address,
          addressFlag: "F00",
          coordType: "WGS84GEO",
          page: 1,
          count: 1,
        },
      })
    );
    if (DEBUG) console.log("[TMap geocode raw]", address, JSON.stringify(res.data));

    const coord = findCoordinate(res.data);
    if (!coord) {
      return { address, ok: false, message: "좌표를 찾지 못했습니다. 주소를 확인해 주세요." };
    }
    return { address, ok: true, lat: coord.lat, lng: coord.lng };
  } catch (err: any) {
    return {
      address,
      ok: false,
      message: friendlyTmapError(err, "지오코딩 실패"),
    };
  }
}

export interface OptimizeWaypoint {
  id: string;
  lat: number;
  lng: number;
}

export interface OptimizeStop {
  id: string; // "START" | "END" | waypoint id
  lat: number;
  lng: number;
}

export interface OptimizeResult {
  searchOption: number;
  label: string;
  ok: boolean;
  message?: string;
  totalDistanceM?: number;
  totalTimeSec?: number;
  totalFareWon?: number;
  visitOrder?: string[]; // waypoint id 순서 (START/END 제외)
  path?: [number, number][]; // [lng, lat] 폴리라인
}

const SEARCH_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "교통최적 + 추천" },
  { value: 2, label: "교통최적 + 최소시간" },
  { value: 10, label: "최단거리" },
];

function nowTmapFormat(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

function parseOptimizeResponse(data: any): {
  totalDistanceM?: number;
  totalTimeSec?: number;
  totalFareWon?: number;
  visitOrder: string[];
  path: [number, number][];
} {
  // 총 거리/시간/요금은 FeatureCollection 최상위 properties에 있다(개별 feature 안이 아님).
  const summary = data?.properties || {};
  const totalDistanceM = summary.totalDistance !== undefined ? Number(summary.totalDistance) : undefined;
  const totalTimeSec = summary.totalTime !== undefined ? Number(summary.totalTime) : undefined;
  const totalFareWon = summary.totalFare !== undefined ? Number(summary.totalFare) : undefined;

  const features: any[] = Array.isArray(data?.features) ? data.features : [];
  const path: [number, number][] = [];
  const visitOrder: string[] = [];

  for (const f of features) {
    const geomType = f?.geometry?.type;
    const props = f?.properties || {};

    if (geomType === "Point") {
      const pointType: string | undefined = props.pointType;
      const viaId: string | undefined = props.viaPointId;
      // pointType: S=출발, E=도착, N=일반 안내점, B1~Bn=경유지. 경유지만 방문순서에 기록.
      if (viaId && pointType && pointType !== "S" && pointType !== "E" && pointType !== "N") {
        visitOrder.push(String(viaId));
      }
    }

    if (geomType === "LineString" && Array.isArray(f?.geometry?.coordinates)) {
      for (const c of f.geometry.coordinates) {
        if (Array.isArray(c) && c.length >= 2) {
          path.push([Number(c[0]), Number(c[1])]);
        }
      }
    }
  }

  return { totalDistanceM, totalTimeSec, totalFareWon, visitOrder, path };
}

/**
 * 한 사람 분량(출발지 + 경유지들)에 대해 TMap 경유지 최적화 API를
 * searchOption 0 / 2 / 10 으로 각각 호출해 3가지 안을 반환한다.
 * (LLM 추측이 아닌 TMap 계산 결과 그대로 사용)
 */
export async function optimizeThreeWays(
  start: { name: string; lat: number; lng: number },
  waypoints: OptimizeWaypoint[]
): Promise<OptimizeResult[]> {
  assertKey();
  if (waypoints.length === 0) {
    throw new Error("경유지가 없습니다.");
  }
  if (waypoints.length > ROUTE_OPT_SIZE) {
    throw new Error(
      `현재 설정(routeOptimization${ROUTE_OPT_SIZE})은 한 번에 최대 ${ROUTE_OPT_SIZE}개 경유지까지 지원합니다. 현재 ${waypoints.length}개가 선택되었습니다. 담당자별로 ${ROUTE_OPT_SIZE}곳 이하로 나눠서 요청하거나, TMAP_ROUTE_OPT_SIZE를 더 큰 값으로 바꿔주세요(해당 상품을 먼저 신청해야 합니다).`
    );
  }

  // 마지막 경유지를 도착지로 사용(왕복이 아니라 마지막 배송지에서 종료).
  const last = waypoints[waypoints.length - 1];
  const middle = waypoints.slice(0, -1);

  const results = await Promise.all(
    SEARCH_OPTIONS.map(async ({ value, label }): Promise<OptimizeResult> => {
      try {
        const body = {
          startName: start.name || "출발지",
          startX: String(start.lng),
          startY: String(start.lat),
          startTime: nowTmapFormat(),
          endName: "도착",
          endX: String(last.lng),
          endY: String(last.lat),
          searchOption: String(value),
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
          viaPoints: middle.map((w, idx) => ({
            viaPointId: w.id,
            viaPointName: `경유지${idx + 1}`,
            viaX: String(w.lng),
            viaY: String(w.lat),
          })),
        };

        const res = await callTmap(() =>
          client.post(`/tmap/routes/routeOptimization${ROUTE_OPT_SIZE}`, body, {
            params: { version: 1 },
            headers: { appKey: REST_APP_KEY, "Content-Type": "application/json" },
          })
        );
        if (DEBUG) console.log(`[TMap optimize raw option=${value}]`, JSON.stringify(res.data));

        const parsed = parseOptimizeResponse(res.data);
        // 마지막 지점(도착지)을 방문순서 끝에 포함시켜 결과표에서 누락되지 않게 함
        const visitOrder = [...parsed.visitOrder, last.id];

        return {
          searchOption: value,
          label,
          ok: true,
          totalDistanceM: parsed.totalDistanceM,
          totalTimeSec: parsed.totalTimeSec,
          totalFareWon: parsed.totalFareWon,
          visitOrder,
          path: parsed.path,
        };
      } catch (err: any) {
        return {
          searchOption: value,
          label,
          ok: false,
          message: friendlyTmapError(err, "경로 계산 실패"),
        };
      }
    })
  );

  return results;
}
