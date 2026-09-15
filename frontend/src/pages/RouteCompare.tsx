import { useEffect, useMemo, useState } from "react";
import { useOrders } from "../state/OrdersContext";
import { api, type OptimizeApiResult } from "../api/client";
import TmapView, { type MapMarker, type MapPolyline } from "../components/TmapView";
import { exportRouteToExcel, type ExportRow } from "../utils/excel";
import type { RouteStop } from "../types";

const OPTION_COLORS = ["#2563eb", "#16a34a", "#ea580c"];

function tmapAppLink(name: string, lat: number, lng: number) {
  const n = encodeURIComponent(name);
  // Android/iOS 파라미터를 함께 넣어 한 링크로 대응 (알 수 없는 파라미터는 무시됨)
  return `tmap://route?goalname=${n}&goalx=${lng}&goaly=${lat}&rGoName=${n}&rGoX=${lng}&rGoY=${lat}`;
}

function fmtDistance(m?: number) {
  if (m === undefined) return "-";
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}
function fmtTime(sec?: number) {
  if (sec === undefined) return "-";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}
function fmtFare(won?: number) {
  if (won === undefined) return null;
  return won > 0 ? `${won.toLocaleString("ko-KR")}원` : "무료(통행료 없음)";
}
function fmtClock(base: Date) {
  return base.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function RouteCompare() {
  const { orders, assignees } = useOrders();

  // 출발지: 기본값은 농장이지만, 경로 계산 직전 여기서 다른 곳으로 바꿔도 된다.
  const [startName, setStartName] = useState("농장");
  const [startAddress, setStartAddress] = useState("");
  const [startCoord, setStartCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);
  const [startGeocoding, setStartGeocoding] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startConfirmed = startCoord !== null && confirmedAddress === startAddress;

  const [assignee, setAssignee] = useState(assignees[0] || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OptimizeApiResult[] | null>(null);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10); // 10분 단위 반올림
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  const confirmStartAddress = async (address: string) => {
    if (!address.trim()) {
      setStartError("출발지 주소를 입력해주세요.");
      return;
    }
    setStartGeocoding(true);
    setStartError(null);
    try {
      const res = await api.geocode([address]);
      const r = res.results[0];
      if (r?.ok && r.lat !== undefined && r.lng !== undefined) {
        setStartCoord({ lat: r.lat, lng: r.lng });
        setConfirmedAddress(address);
      } else {
        setStartCoord(null);
        setConfirmedAddress(null);
        setStartError(r?.message || "출발지 주소를 확인하지 못했습니다.");
      }
    } catch (err: any) {
      setStartCoord(null);
      setConfirmedAddress(null);
      setStartError(err.message || "출발지 주소 확인 중 오류가 발생했습니다.");
    } finally {
      setStartGeocoding(false);
    }
  };

  // 농장 기본 주소를 불러와 처음 한 번은 자동으로 채워넣고 확인까지 해준다.
  // (이후 사용자가 주소를 바꾸면 "출발지 확인" 버튼을 다시 눌러야 한다)
  useEffect(() => {
    api.getConfig().then((cfg) => {
      setStartName(cfg.farmName);
      setStartAddress(cfg.farmAddress);
      if (cfg.farmAddress) confirmStartAddress(cfg.farmAddress);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!assignee && assignees.length > 0) setAssignee(assignees[0]);
  }, [assignees, assignee]);

  const waypoints: RouteStop[] = useMemo(
    () =>
      orders
        .filter((o) => o.assignee === assignee && o.geocodeStatus === "ok" && o.lat !== undefined && o.lng !== undefined)
        .map((o) => ({
          id: o.id,
          name: o.name,
          address: o.address,
          phone: o.phone,
          note: o.note,
          productInfo: o.productInfo,
          amount: o.amount,
          paymentStatus: o.paymentStatus,
          lat: o.lat!,
          lng: o.lng!,
        })),
    [orders, assignee]
  );

  const stopById = useMemo(() => new Map(waypoints.map((w) => [w.id, w])), [waypoints]);

  const runOptimize = async () => {
    if (!startConfirmed || !startCoord) {
      setError("출발지 주소를 먼저 확인해주세요 (\"출발지 확인\" 버튼).");
      return;
    }
    if (waypoints.length === 0) {
      setError("선택한 담당자에게 배정된(지오코딩 완료) 배송지가 없습니다.");
      return;
    }
    // 경유지 개수 상한은 백엔드(TMAP_ROUTE_OPT_SIZE)가 최종 판단한다 — 여기서는 중복 체크하지 않는다.
    setError(null);
    setLoading(true);
    setResults(null);
    setChosenIdx(null);
    try {
      const res = await api.optimize(
        { name: startName || "출발지", lat: startCoord.lat, lng: startCoord.lng },
        waypoints.map((w) => ({ id: w.id, lat: w.lat, lng: w.lng }))
      );
      setResults(res.results);
    } catch (err: any) {
      setError(err.message || "경로 계산에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const chosen = chosenIdx !== null ? results?.[chosenIdx] : null;

  const orderedStops: RouteStop[] = useMemo(() => {
    if (!chosen?.visitOrder) return [];
    return chosen.visitOrder.map((id) => stopById.get(id)).filter(Boolean) as RouteStop[];
  }, [chosen, stopById]);

  // 총 소요시간을 정류지 수만큼 균등 배분한 '예상' 도착시각 (근사치)
  const etas = useMemo(() => {
    if (!chosen?.totalTimeSec || orderedStops.length === 0) return [];
    const [h, m] = startTime.split(":").map(Number);
    const base = new Date();
    base.setHours(h, m, 0, 0);
    const perStop = chosen.totalTimeSec / orderedStops.length;
    return orderedStops.map((_, i) => {
      const t = new Date(base.getTime() + perStop * (i + 1) * 1000);
      return fmtClock(t);
    });
  }, [chosen, orderedStops, startTime]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = orderedStops.map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      title: `${i + 1}. ${s.name}`,
      label: String(i + 1),
      color: "blue",
    }));
    if (startCoord) list.unshift({ id: "START", lat: startCoord.lat, lng: startCoord.lng, title: startName, color: "orange" });
    return list;
  }, [orderedStops, startCoord, startName]);

  const mapPolylines: MapPolyline[] = useMemo(() => {
    if (!chosen?.path) return [];
    return [{ id: "route", path: chosen.path, color: chosenIdx !== null ? OPTION_COLORS[chosenIdx] : "#2563eb" }];
  }, [chosen, chosenIdx]);

  const hasExtraInfo = orderedStops.some((s) => s.productInfo || s.amount || s.paymentStatus);

  const downloadExcel = () => {
    if (!chosen) return;
    const rows: ExportRow[] = orderedStops.map((s, i) => ({
      순번: i + 1,
      고객명: s.name,
      주소: s.address,
      연락처: s.phone,
      품목: s.productInfo,
      금액: s.amount,
      결제상태: s.paymentStatus,
      요청사항: s.note,
      예상도착시간: etas[i] || "",
    }));
    exportRouteToExcel(rows, `${assignee}_배송순서_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="page">
      <h2>3. 경로 최적화 &amp; 비교</h2>

      <div className="route-controls start-address-controls">
        <label>
          출발지 이름
          <input
            value={startName}
            onChange={(e) => setStartName(e.target.value)}
            placeholder="예: 농장, 우리집"
          />
        </label>
        <label style={{ flex: 1, minWidth: 220 }}>
          출발지 주소
          <input
            style={{ width: "100%" }}
            value={startAddress}
            onChange={(e) => setStartAddress(e.target.value)}
            placeholder="예: 경기도 용인시 처인구 백암면 백원로525번길 300"
          />
        </label>
        <button onClick={() => confirmStartAddress(startAddress)} disabled={startGeocoding}>
          {startGeocoding ? "확인 중..." : "출발지 확인"}
        </button>
        {startConfirmed ? (
          <span className="hint">✅ 확인됨</span>
        ) : (
          <span className="hint">⚠️ 주소를 확인해주세요</span>
        )}
      </div>
      {startError && <p className="error-text">{startError}</p>}

      <div className="route-controls">
        <label>
          담당자
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          출발 시각
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <button className="primary" onClick={runOptimize} disabled={loading}>
          {loading ? "계산 중..." : `최적 루트 계산 (${waypoints.length}곳)`}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {results && (
        <div className="option-cards">
          {results.map((r, idx) => (
            <div key={r.searchOption} className={`option-card ${chosenIdx === idx ? "chosen" : ""}`}>
              <h3 style={{ color: OPTION_COLORS[idx] }}>
                안 {idx + 1}: {r.label}
              </h3>
              {r.ok ? (
                <>
                  <p>총 거리: {fmtDistance(r.totalDistanceM)}</p>
                  <p>총 소요시간: {fmtTime(r.totalTimeSec)}</p>
                  {fmtFare(r.totalFareWon) && <p>총 통행료: {fmtFare(r.totalFareWon)}</p>}
                  <ol className="stop-list">
                    {(r.visitOrder || []).map((id) => {
                      const s = stopById.get(id);
                      return <li key={id}>{s ? s.name : id}</li>;
                    })}
                  </ol>
                  <button onClick={() => setChosenIdx(idx)}>{chosenIdx === idx ? "✓ 선택됨" : "이 안 선택"}</button>
                </>
              ) : (
                <p className="error-text">계산 실패: {r.message}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {chosen?.ok && (
        <>
          <h3>선택한 경로 지도</h3>
          <TmapView
            center={startCoord || { lat: 36.35, lng: 127.38 }}
            zoom={11}
            markers={mapMarkers}
            polylines={mapPolylines}
          />

          <h3>배송 순서표</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>순번</th>
                  <th>고객명</th>
                  <th>주소</th>
                  <th>연락처</th>
                  {hasExtraInfo && <th>품목</th>}
                  {hasExtraInfo && <th>금액/결제</th>}
                  <th>요청사항</th>
                  <th>예상 도착</th>
                  <th>내비게이션</th>
                </tr>
              </thead>
              <tbody>
                {orderedStops.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td>{s.name}</td>
                    <td>{s.address}</td>
                    <td>{s.phone}</td>
                    {hasExtraInfo && <td>{s.productInfo}</td>}
                    {hasExtraInfo && <td>{[s.amount, s.paymentStatus].filter(Boolean).join(" · ")}</td>}
                    <td>{s.note}</td>
                    <td>{etas[i]}</td>
                    <td>
                      <a href={tmapAppLink(s.name, s.lat, s.lng)}>TMap으로 열기</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            예상 도착시간은 총 소요시간을 구간별로 균등 배분한 근사치입니다. 실제 교통상황에 따라 달라질 수 있습니다.
          </p>
          <button className="primary" onClick={downloadExcel}>
            📥 엑셀로 다운로드
          </button>
        </>
      )}
    </div>
  );
}
