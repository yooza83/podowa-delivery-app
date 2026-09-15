import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrders } from "../state/OrdersContext";
import { api } from "../api/client";
import { buildRegionTree, regionLeafKey, collectLeafKeys } from "../utils/addressParser";
import RegionFilterTree from "../components/RegionFilterTree";
import TmapView, { type MapMarker } from "../components/TmapView";

const DEFAULT_CENTER = { lat: 36.35, lng: 127.38 }; // 대략 대한민국 중앙

export default function MapView() {
  const navigate = useNavigate();
  const { orders, updateOrder, updateOrders, assignees } = useOrders();

  const [farmName, setFarmName] = useState("농장");
  const [farmAddress, setFarmAddress] = useState("");
  const [farmCoord, setFarmCoord] = useState<{ lat: number; lng: number } | null>(null);

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState<{ done: number; total: number } | null>(null);

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState<string | null>(null); // 수동 핀 찍기 대상 order id
  const [assigneeInput, setAssigneeInput] = useState("");

  // 설정(농장 이름/주소) 로드
  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        setFarmName(cfg.farmName);
        setFarmAddress(cfg.farmAddress);
      })
      .catch(() => {
        /* 로그인 만료 등은 App에서 처리 */
      });
  }, []);

  // 농장 주소 지오코딩 (1회)
  useEffect(() => {
    if (!farmAddress || farmCoord) return;
    api
      .geocode([farmAddress])
      .then((res) => {
        const r = res.results[0];
        if (r?.ok && r.lat && r.lng) setFarmCoord({ lat: r.lat, lng: r.lng });
      })
      .catch(() => {});
  }, [farmAddress, farmCoord]);

  // 주문 지오코딩 (아직 pending인 것들, 배치 처리)
  useEffect(() => {
    const pending = orders.filter((o) => o.geocodeStatus === "pending");
    if (pending.length === 0) return;

    let cancelled = false;
    const BATCH = 30;
    (async () => {
      setGeocoding(true);
      setGeocodeProgress({ done: 0, total: pending.length });
      for (let i = 0; i < pending.length; i += BATCH) {
        if (cancelled) return;
        const batch = pending.slice(i, i + BATCH);
        try {
          const res = await api.geocode(batch.map((o) => o.address));
          const patches: Record<string, any> = {};
          batch.forEach((o, idx) => {
            const r = res.results[idx];
            if (r?.ok && r.lat !== undefined && r.lng !== undefined) {
              patches[o.id] = { geocodeStatus: "ok", lat: r.lat, lng: r.lng, geocodeMessage: undefined };
            } else {
              patches[o.id] = { geocodeStatus: "failed", geocodeMessage: r?.message || "변환 실패" };
            }
          });
          updateOrders(patches);
        } catch (err: any) {
          const patches: Record<string, any> = {};
          batch.forEach((o) => {
            patches[o.id] = { geocodeStatus: "failed", geocodeMessage: err.message || "지오코딩 오류" };
          });
          updateOrders(patches);
        }
        if (!cancelled) setGeocodeProgress({ done: Math.min(i + BATCH, pending.length), total: pending.length });
      }
      if (!cancelled) setGeocoding(false);
    })();

    return () => {
      cancelled = true;
    };
    // orders 배열 자체가 아니라 '개수'가 바뀔 때만 재실행되도록 length만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  const regionTree = useMemo(() => buildRegionTree(orders), [orders]);

  // 지역 트리가 (재)생성되면 기본값은 '전체 선택'
  useEffect(() => {
    const allLeaves = regionTree.flatMap(collectLeafKeys);
    setSelected(new Set(allLeaves));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  const visibleOrders = useMemo(() => {
    if (!selected) return orders;
    return orders.filter((o) => selected.has(regionLeafKey(o)));
  }, [orders, selected]);

  const geocodedCount = orders.filter((o) => o.geocodeStatus === "ok").length;
  const failedOrders = orders.filter((o) => o.geocodeStatus === "failed");

  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = visibleOrders
      .filter((o) => o.lat !== undefined && o.lng !== undefined)
      .map((o) => ({
        id: o.id,
        lat: o.lat!,
        lng: o.lng!,
        title: `${o.name} - ${o.address}`,
        color: o.geocodeStatus === "failed" ? "red" : o.assignee ? "green" : "blue",
      }));
    if (farmCoord) {
      list.push({ id: "FARM", lat: farmCoord.lat, lng: farmCoord.lng, title: farmName, color: "orange" });
    }
    return list;
  }, [visibleOrders, farmCoord, farmName]);

  const center = farmCoord || markers[0] || DEFAULT_CENTER;

  const activeOrder = orders.find((o) => o.id === activeOrderId) || null;

  const bulkAssign = () => {
    if (!assigneeInput.trim()) return;
    const patches: Record<string, any> = {};
    for (const o of visibleOrders) patches[o.id] = { assignee: assigneeInput.trim() };
    updateOrders(patches);
  };

  const retryOne = async (id: string, address: string) => {
    updateOrder(id, { geocodeStatus: "pending" });
    try {
      const res = await api.geocode([address]);
      const r = res.results[0];
      if (r?.ok && r.lat !== undefined && r.lng !== undefined) {
        updateOrder(id, { geocodeStatus: "ok", lat: r.lat, lng: r.lng, geocodeMessage: undefined });
      } else {
        updateOrder(id, { geocodeStatus: "failed", geocodeMessage: r?.message || "변환 실패" });
      }
    } catch (err: any) {
      updateOrder(id, { geocodeStatus: "failed", geocodeMessage: err.message });
    }
  };

  return (
    <div className="page map-page">
      <h2>2. 지도 확인 &amp; 지역 배정</h2>
      <p className="hint">
        지오코딩 완료: {geocodedCount}/{orders.length}건
        {geocoding && geocodeProgress && ` (처리 중 ${geocodeProgress.done}/${geocodeProgress.total})`}
        {failedOrders.length > 0 && ` · 실패 ${failedOrders.length}건`}
      </p>

      <div className="map-layout">
        <aside className="map-sidebar">
          <h3>지역 필터</h3>
          {selected && regionTree.length > 0 ? (
            <RegionFilterTree nodes={regionTree} selected={selected} onChange={setSelected} />
          ) : (
            <p className="hint">지오코딩이 끝나면 지역이 표시됩니다.</p>
          )}

          <h3>담당자 배정</h3>
          <p className="hint">
            왼쪽 지역 필터로 담당 구역만 체크한 뒤, 이름을 입력하고 배정하세요. (현재 지도에 표시된 {visibleOrders.length}건에 적용됩니다)
          </p>
          <div className="assign-row">
            <input
              placeholder="담당자 이름 (예: 아빠)"
              value={assigneeInput}
              onChange={(e) => setAssigneeInput(e.target.value)}
              list="assignee-suggestions"
            />
            <datalist id="assignee-suggestions">
              {assignees.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <button onClick={bulkAssign} disabled={!assigneeInput.trim() || visibleOrders.length === 0}>
              배정
            </button>
          </div>

          {assignees.length > 0 && (
            <p className="hint">
              현재 배정된 담당자: {assignees.map((a) => `${a}(${orders.filter((o) => o.assignee === a).length}건)`).join(", ")}
            </p>
          )}
        </aside>

        <div className="map-main">
          <TmapView
            center={center}
            markers={markers}
            onMarkerClick={(id) => id !== "FARM" && setActiveOrderId(id)}
            onMapClick={
              pinMode
                ? (lat, lng) => {
                    updateOrder(pinMode, { geocodeStatus: "ok", lat, lng, geocodeMessage: "수동 지정" });
                    setPinMode(null);
                  }
                : undefined
            }
          />
          {pinMode && <p className="hint pin-hint">📍 지도를 클릭해 해당 배송지 위치를 지정하세요.</p>}

          {activeOrder && (
            <div className="order-detail-card">
              <button className="close-btn" onClick={() => setActiveOrderId(null)}>
                ✕
              </button>
              <strong>{activeOrder.name}</strong>
              <p>{activeOrder.address}</p>
              {activeOrder.phone && <p>연락처: {activeOrder.phone}</p>}
              {activeOrder.note && <p>요청사항: {activeOrder.note}</p>}
              <div className="assign-row">
                <input
                  placeholder="담당자"
                  value={activeOrder.assignee}
                  onChange={(e) => updateOrder(activeOrder.id, { assignee: e.target.value })}
                  list="assignee-suggestions"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {failedOrders.length > 0 && (
        <div className="failed-panel">
          <h3>⚠️ 지오코딩 실패 목록 ({failedOrders.length}건)</h3>
          <p className="hint">주소를 고쳐서 다시 시도하거나, 지도에서 직접 위치를 찍어주세요.</p>
          <table>
            <thead>
              <tr>
                <th>고객명</th>
                <th>주소</th>
                <th>사유</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {failedOrders.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>
                    <input
                      value={o.address}
                      onChange={(e) => updateOrder(o.id, { address: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td>{o.geocodeMessage}</td>
                  <td className="row-actions">
                    <button onClick={() => retryOne(o.id, o.address)}>다시 시도</button>
                    <button onClick={() => setPinMode(o.id)}>지도에서 찍기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        className="primary"
        disabled={assignees.length === 0}
        onClick={() => navigate("/route")}
      >
        다음: 경로 최적화 →
      </button>
      {assignees.length === 0 && <p className="hint">경로 최적화를 하려면 최소 1명 이상 담당자를 배정해야 합니다.</p>}
    </div>
  );
}
