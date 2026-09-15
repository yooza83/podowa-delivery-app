export type GeocodeStatus = "pending" | "ok" | "failed";

/**
 * 배송 주문 1건.
 * 이 객체(특히 name/phone)는 브라우저 메모리에만 존재하며 백엔드로 전송되지 않는다.
 * 백엔드로는 geocode 시 address 문자열만, optimize 시 id+lat+lng만 보낸다.
 */
export interface DeliveryOrder {
  id: string;
  name: string;
  address: string;
  phone: string;
  requestDate: string;
  note: string;

  // 실제 농장 주문서(품목/금액/결제상태 등)를 그대로 다루기 위한 선택 필드.
  // 없는 파일(샘플 등)에서는 전부 빈 문자열.
  productInfo: string;
  zone: string;
  amount: string;
  paymentStatus: string;

  lat?: number;
  lng?: number;
  geocodeStatus: GeocodeStatus;
  geocodeMessage?: string;

  sido: string;
  sigungu: string;
  eupmyeondong: string;

  assignee: string; // 배정된 담당자 이름 (미배정이면 "")
}

/** -1 = 이 필드는 사용 안 함(해당 컬럼 없음) */
export interface ColumnMapping {
  name: number;
  address: number;
  phone: number;
  requestDate: number;
  note: number;
  productInfo: number;
  zone: number;
  amount: number;
  paymentStatus: number;
}

export interface RouteStop {
  id: string; // DeliveryOrder id ("START" 제외)
  name: string;
  address: string;
  phone: string;
  note: string;
  productInfo: string;
  amount: string;
  paymentStatus: string;
  lat: number;
  lng: number;
}

export interface RouteOptionResult {
  searchOption: number;
  label: string;
  ok: boolean;
  message?: string;
  totalDistanceM?: number;
  totalTimeSec?: number;
  totalFareWon?: number;
  visitOrder?: string[];
  path?: [number, number][];
}
