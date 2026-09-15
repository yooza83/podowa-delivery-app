/**
 * 지오코딩 결과(주소→좌표) 임시 캐시.
 *
 * TMap 이용약관: 좌표/경로 데이터는 24시간을 넘겨 보관 금지.
 * → DB에 쌓지 않고 서버 메모리에만 두며, GEOCODE_CACHE_TTL_HOURS가 지나면
 *   자동 폐기한다(서버 재시작 시에도 당연히 전부 사라짐).
 * 개인정보 최소화: 여기 들어가는 건 '주소 문자열 → 좌표'뿐이며
 * 고객명/연락처는 이 서버에 전혀 저장되지 않는다(프론트에만 존재).
 */

interface CacheEntry {
  lat: number;
  lng: number;
  cachedAt: number; // epoch ms
}

const TTL_MS =
  Number(process.env.GEOCODE_CACHE_TTL_HOURS || 12) * 60 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

function normalize(address: string): string {
  return address.trim().replace(/\s+/g, " ");
}

export function getCached(address: string): { lat: number; lng: number } | null {
  const key = normalize(address);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return { lat: hit.lat, lng: hit.lng };
}

export function setCached(address: string, lat: number, lng: number): void {
  cache.set(normalize(address), { lat, lng, cachedAt: Date.now() });
}

/** TTL이 지난 항목을 주기적으로 청소. server.ts에서 setInterval로 호출. */
export function sweepExpired(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt > TTL_MS) {
      cache.delete(key);
      removed++;
    }
  }
  return removed;
}

export function cacheSize(): number {
  return cache.size;
}
