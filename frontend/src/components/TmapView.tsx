import { useEffect, useRef } from "react";
import { useTmapSdk } from "../hooks/useTmapSdk";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  color?: "red" | "blue" | "green" | "gray" | "orange";
  label?: string; // 마커 위에 표시할 순번 등
}

export interface MapPolyline {
  id: string;
  path: [number, number][]; // [lng, lat]
  color: string;
}

interface Props {
  center: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

const COLOR_HEX: Record<string, string> = {
  red: "#e11d48",
  blue: "#2563eb",
  green: "#16a34a",
  gray: "#6b7280",
  orange: "#ea580c",
};

/** 단순 원형 핀 아이콘을 색상별 SVG data URI로 생성 (별도 이미지 호스팅 불필요) */
function pinIcon(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="9" fill="${hex}" stroke="white" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** TMap JS SDK를 감싼 지도 컴포넌트. 마커/폴리라인은 props가 바뀔 때마다 새로 그린다. */
export default function TmapView({
  center,
  zoom = 12,
  height = "420px",
  markers = [],
  polylines = [],
  onMarkerClick,
  onMapClick,
}: Props) {
  const { ready, error } = useTmapSdk();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  // 지도 최초 1회 생성
  useEffect(() => {
    if (!ready || !divRef.current || mapRef.current) return;
    const { Tmapv2 } = window as any;
    mapRef.current = new Tmapv2.Map(divRef.current, {
      center: new Tmapv2.LatLng(center.lat, center.lng),
      width: "100%",
      height,
      zoom,
    });
    if (onMapClick) {
      mapRef.current.addListener("Click", (evt: any) => {
        const latLng = evt.latLng ?? evt;
        const lat = typeof latLng.lat === "function" ? latLng.lat() : latLng._lat;
        const lng = typeof latLng.lng === "function" ? latLng.lng() : latLng._lng;
        if (typeof lat === "number" && typeof lng === "number") onMapClick(lat, lng);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 중심 이동
  useEffect(() => {
    if (!mapRef.current || !window.Tmapv2) return;
    mapRef.current.setCenter(new (window as any).Tmapv2.LatLng(center.lat, center.lng));
  }, [center.lat, center.lng]);

  // 마커/폴리라인 다시 그리기
  useEffect(() => {
    if (!mapRef.current || !window.Tmapv2) return;
    const { Tmapv2 } = window as any;

    for (const ov of overlaysRef.current) {
      try {
        ov.setMap(null);
      } catch {
        /* ignore */
      }
    }
    overlaysRef.current = [];

    for (const m of markers) {
      const marker = new Tmapv2.Marker({
        position: new Tmapv2.LatLng(m.lat, m.lng),
        map: mapRef.current,
        title: m.title || "",
        label: m.label,
        icon: pinIcon(COLOR_HEX[m.color || "blue"]),
        iconSize: new Tmapv2.Size(26, 26),
      });
      if (onMarkerClick) {
        marker.addListener("Click", () => onMarkerClick(m.id));
      }
      overlaysRef.current.push(marker);
    }

    for (const pl of polylines) {
      if (pl.path.length < 2) continue;
      const path = pl.path.map(([lng, lat]) => new Tmapv2.LatLng(lat, lng));
      const line = new Tmapv2.Polyline({
        path,
        strokeColor: pl.color,
        strokeWeight: 5,
        strokeOpacity: 0.8,
        map: mapRef.current,
      });
      overlaysRef.current.push(line);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, polylines, ready]);

  if (error) {
    return (
      <div className="tmap-placeholder" style={{ height }}>
        지도를 불러오지 못했습니다: {error}
      </div>
    );
  }
  return <div ref={divRef} style={{ width: "100%", height }} />;
}

export { COLOR_HEX };
