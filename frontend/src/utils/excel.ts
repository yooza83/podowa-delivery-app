import * as XLSX from "xlsx";
import type { DeliveryOrder } from "../types";

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

/** 업로드한 .xlsx/.csv를 읽어 첫 시트를 [헤더행, 데이터행...] 형태로 반환 */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const rows = raw
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []))
    .filter((r) => r.some((c) => c !== ""));

  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = rows;
  return { headers, rows: dataRows };
}

/** 흔한 컬럼명을 보고 name/address/phone/requestDate/note 인덱스를 추정 */
export function guessColumnMapping(headers: string[]) {
  const norm = headers.map((h) => h.replace(/\s/g, ""));
  const find = (keywords: string[]) => {
    for (const kw of keywords) {
      const idx = norm.findIndex((h) => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  return {
    name: find(["고객명", "성명", "이름", "받는분", "수취인"]),
    address: find(["배송지주소", "주소", "배송주소", "도로명주소"]),
    phone: find(["연락처", "전화번호", "휴대폰", "전화", "핸드폰"]),
    requestDate: find(["배송요청일", "요청일", "배송일", "희망일자", "희망일"]),
    note: find(["요청사항", "메모", "비고", "특이사항"]),
  };
}

let seq = 0;
function nextId() {
  seq += 1;
  return `ord_${Date.now().toString(36)}_${seq}`;
}

export function rowsToOrders(
  rows: string[][],
  mapping: { name: number; address: number; phone: number; requestDate: number; note: number }
): DeliveryOrder[] {
  const pick = (row: string[], idx: number) => (idx >= 0 && idx < row.length ? row[idx] : "");
  return rows
    .map((row) => ({
      id: nextId(),
      name: pick(row, mapping.name),
      address: pick(row, mapping.address),
      phone: pick(row, mapping.phone),
      requestDate: pick(row, mapping.requestDate),
      note: pick(row, mapping.note),
      geocodeStatus: "pending" as const,
      sido: "",
      sigungu: "",
      eupmyeondong: "",
      assignee: "",
    }))
    .filter((o) => o.address); // 주소 없는 행은 제외
}

export interface ExportRow {
  순번: number;
  고객명: string;
  주소: string;
  연락처: string;
  요청사항: string;
  예상도착시간: string;
}

export function exportRouteToExcel(rows: ExportRow[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "배송순서");
  XLSX.writeFile(wb, filename);
}
