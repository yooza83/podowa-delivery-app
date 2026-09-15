import * as XLSX from "xlsx";
import type { ColumnMapping, DeliveryOrder } from "../types";

export interface RawSheet {
  /** 완전히 빈 행은 제거된 시트의 모든 행(헤더 포함, 헤더가 몇 번째 행인지는 아직 모름) */
  rows: string[][];
}

/** 업로드한 .xlsx/.csv를 읽어 첫 시트의 모든 행을 그대로 반환한다(헤더 위치는 아직 판단하지 않음). */
export async function parseSpreadsheetRaw(file: File): Promise<RawSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const rows = raw
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []))
    .filter((r) => r.some((c) => c !== ""));

  return { rows };
}

const HEADER_KEYWORDS = [
  "고객명", "성명", "이름", "받는분", "받는사람", "수취인",
  "배송지주소", "도로명주소", "주소",
  "연락처", "전화번호", "휴대폰", "전화", "핸드폰",
  "배송요청일", "요청일", "예정일", "희망일자", "희망일", "배송일", "주문일",
  "요청사항", "메모", "비고", "특이사항",
  "품목", "상품명", "제품명", "구역", "권역", "금액", "결제",
];

/**
 * 엑셀 맨 위에 제목/요약 줄이 있는 실제 농장 주문서 같은 파일도 다룰 수 있도록,
 * 진짜 컬럼명이 들어있는 행이 몇 번째인지 자동으로 추정한다(못 맞히면 0행).
 * 사용자가 화면에서 직접 확인/수정할 수 있으니 완벽하지 않아도 된다.
 */
export function guessHeaderRowIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => c.trim() !== "");
    if (nonEmpty.length < 2) continue;
    const matchCount = nonEmpty.filter((c) =>
      HEADER_KEYWORDS.some((k) => c.replace(/\s/g, "").includes(k))
    ).length;
    if (matchCount >= 2) return i;
  }
  // 키워드로 못 찾았으면: 0행이 제목처럼 보이면(칸이 거의 안 채워졌거나 줄바꿈 포함) 1행을 시도
  const first = rows[0];
  if (first) {
    const nonEmpty0 = first.filter((c) => c.trim() !== "");
    const looksLikeTitle = nonEmpty0.length <= 1 || first.some((c) => c.includes("\n"));
    if (looksLikeTitle && rows.length > 1) return 1;
  }
  return 0;
}

/**
 * 실제 주문서 파일에는 헤더가 중간에 또 나오거나(구간이 여러 개인 경우) 합계/요약 줄이
 * 섞여 있을 수 있다. 이런 행은 기본적으로 '제외' 상태로 미리 체크해서 사용자가 실수로
 * 주문으로 잘못 넣지 않도록 돕는다(최종 판단은 사용자가 미리보기에서 직접 함).
 */
export function isLikelyJunkRow(row: string[], headerRow: string[]): boolean {
  const nonEmpty = row.filter((c) => c.trim() !== "");
  if (nonEmpty.length === 0) return true;
  // 헤더 행이 데이터 구간 중간에 또 나온 경우(반복 헤더)
  if (row.length && row.length === headerRow.length && row.every((c, i) => c.trim() === (headerRow[i] || "").trim())) {
    return true;
  }
  // 첫 칸만 채워지고 나머지는 거의 비어있는 줄(합계/요약처럼 보임)
  if (nonEmpty.length <= 2) {
    const first = row[0] || "";
    if (first.length > 20) return true;
    if (/^(합계|소계|총계|합산|총\s?\d+건)/.test(first.trim())) return true;
  }
  return false;
}

/** "홍길동 010-1234-5678" 처럼 이름+전화번호가 한 칸에 같이 있는 경우 분리한다. */
const PHONE_RE = /(01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})/;
export function extractPhone(text: string): { name: string; phone: string } {
  const m = text.match(PHONE_RE);
  if (!m || m.index === undefined) return { name: text.trim(), phone: "" };
  const phone = m[1].replace(/[.\s]/g, "-").replace(/-{2,}/g, "-");
  const rest = text.slice(0, m.index) + text.slice(m.index + m[1].length);
  const name = rest.replace(/[()/,·\-]+/g, " ").replace(/\s+/g, " ").trim();
  return { name, phone };
}

/** 흔한 컬럼명을 보고 각 필드의 인덱스를 추정 (실제 농장 주문서 컬럼명 포함) */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => h.replace(/\s/g, ""));
  const find = (keywords: string[]) => {
    for (const kw of keywords) {
      const idx = norm.findIndex((h) => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  return {
    name: find(["받는분", "받는사람", "고객명", "성명", "이름", "수취인"]),
    address: find(["배송지주소", "도로명주소", "주소"]),
    phone: find(["연락처", "전화번호", "휴대폰", "전화", "핸드폰"]),
    requestDate: find(["예정일", "배송요청일", "희망일자", "희망일", "요청일", "배송일"]),
    note: find(["메모", "요청사항", "비고", "특이사항"]),
    productInfo: find(["품목", "상품명", "제품명"]),
    zone: find(["구역", "권역"]),
    amount: find(["금액"]),
    paymentStatus: find(["결제"]),
  };
}

let seq = 0;
function nextId() {
  seq += 1;
  return `ord_${Date.now().toString(36)}_${seq}`;
}

/**
 * @param splitPhoneFromName '고객명'으로 지정한 칸에 전화번호가 같이 섞여 있으면
 *   (그리고 '연락처' 칸을 따로 지정하지 않았으면) 자동으로 분리한다. 기본 true.
 */
export function rowsToOrders(
  rows: string[][],
  mapping: ColumnMapping,
  splitPhoneFromName = true
): DeliveryOrder[] {
  const pick = (row: string[], idx: number) => (idx >= 0 && idx < row.length ? row[idx] : "");
  return rows
    .map((row) => {
      let name = pick(row, mapping.name);
      let phone = pick(row, mapping.phone);
      if (splitPhoneFromName && !phone && name) {
        const extracted = extractPhone(name);
        if (extracted.phone) {
          name = extracted.name;
          phone = extracted.phone;
        }
      }
      return {
        id: nextId(),
        name,
        address: pick(row, mapping.address),
        phone,
        requestDate: pick(row, mapping.requestDate),
        note: pick(row, mapping.note),
        productInfo: pick(row, mapping.productInfo),
        zone: pick(row, mapping.zone),
        amount: pick(row, mapping.amount),
        paymentStatus: pick(row, mapping.paymentStatus),
        geocodeStatus: "pending" as const,
        sido: "",
        sigungu: "",
        eupmyeondong: "",
        assignee: "",
      };
    })
    .filter((o) => o.address); // 주소 없는 행은 제외
}

export interface ExportRow {
  순번: number;
  고객명: string;
  주소: string;
  연락처: string;
  품목: string;
  금액: string;
  결제상태: string;
  요청사항: string;
  예상도착시간: string;
}

export function exportRouteToExcel(rows: ExportRow[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "배송순서");
  XLSX.writeFile(wb, filename);
}
