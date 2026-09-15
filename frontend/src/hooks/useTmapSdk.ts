import { useEffect, useState } from "react";

declare global {
  interface Window {
    Tmapv2?: any;
  }
}

/**
 * TMap JS SDK는 index.html의 정적 <script> 태그로 이미 로드된다(빌드 타임에
 * VITE_TMAP_JS_APP_KEY가 심어짐). 여기서는 그 스크립트의 로딩 완료만 기다린다.
 * (동적으로 <script>를 주입하면 SDK 내부의 document.write 호출이 브라우저에
 *  막혀버리므로 반드시 정적 태그로 로드해야 한다 — index.html 참고)
 */
export function useTmapSdk() {
  const [ready, setReady] = useState(Boolean(window.Tmapv2?.LatLng));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.Tmapv2?.LatLng) {
        if (!cancelled) setReady(true);
        clearInterval(timer);
      } else if (attempts > 100) {
        // 10초 넘게 안 뜨면 포기 (키 미설정, 네트워크 문제 등)
        if (!cancelled) setError("TMap 지도 스크립트를 불러오지 못했습니다. frontend/.env의 VITE_TMAP_JS_APP_KEY를 확인하세요.");
        clearInterval(timer);
      }
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ready]);

  return { ready, error };
}
