import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrders } from "../state/OrdersContext";
import {
  parseSpreadsheetRaw,
  guessHeaderRowIndex,
  guessColumnMapping,
  isLikelyJunkRow,
  rowsToOrders,
  extractPhone,
  type RawSheet,
} from "../utils/excel";
import { applyAddressHierarchy } from "../utils/addressParser";
import type { ColumnMapping } from "../types";

const FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "name", label: "고객명(받는사람)", required: true },
  { key: "address", label: "주소", required: true },
  { key: "phone", label: "연락처", required: false },
  { key: "requestDate", label: "배송요청일", required: false },
  { key: "note", label: "요청사항", required: false },
  { key: "productInfo", label: "품목", required: false },
  { key: "zone", label: "구역", required: false },
  { key: "amount", label: "금액", required: false },
  { key: "paymentStatus", label: "결제상태", required: false },
];

const EMPTY_MAPPING: ColumnMapping = {
  name: -1,
  address: -1,
  phone: -1,
  requestDate: -1,
  note: -1,
  productInfo: -1,
  zone: -1,
  amount: -1,
  paymentStatus: -1,
};

function rowPreview(row: string[], max = 6) {
  return row
    .slice(0, max)
    .map((c) => (c.length > 14 ? c.slice(0, 14) + "…" : c))
    .filter((c) => c !== "")
    .join("  ·  ");
}

export default function Upload() {
  const navigate = useNavigate();
  const { setOrders } = useOrders();

  const [raw, setRaw] = useState<RawSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [splitPhone, setSplitPhone] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = raw ? raw.rows[headerRowIndex] || [] : [];
  const dataRows = raw ? raw.rows.slice(headerRowIndex + 1) : [];

  const applyHeaderRow = (rows: string[][], idx: number) => {
    setHeaderRowIndex(idx);
    const hdr = rows[idx] || [];
    setMapping(guessColumnMapping(hdr));
    const body = rows.slice(idx + 1);
    setIncluded(body.map((r) => !isLikelyJunkRow(r, hdr)));
  };

  const onFile = async (file: File) => {
    setError(null);
    try {
      const parsed = await parseSpreadsheetRaw(file);
      if (parsed.rows.length < 2) {
        setError("파일에서 데이터를 찾지 못했습니다. 표 형식의 엑셀/CSV 파일인지 확인해주세요.");
        return;
      }
      setRaw(parsed);
      setFileName(file.name);
      const guessedIdx = guessHeaderRowIndex(parsed.rows);
      applyHeaderRow(parsed.rows, guessedIdx);
    } catch (err: any) {
      setError("파일을 읽는 중 문제가 발생했습니다: " + (err.message || err));
    }
  };

  const excludedCount = included.filter((v) => !v).length;

  const canConfirm = raw && mapping.name >= 0 && mapping.address >= 0;

  // 미리보기에 쓸 값(전화번호 자동분리 결과 포함)
  const previewRows = useMemo(() => {
    const pick = (row: string[], idx: number) => (idx >= 0 && idx < row.length ? row[idx] : "");
    return dataRows.map((row) => {
      let name = pick(row, mapping.name);
      let phone = pick(row, mapping.phone);
      if (splitPhone && !phone && name) {
        const ext = extractPhone(name);
        if (ext.phone) {
          name = ext.name;
          phone = ext.phone;
        }
      }
      return {
        name,
        address: pick(row, mapping.address),
        phone,
        productInfo: pick(row, mapping.productInfo),
        amount: pick(row, mapping.amount),
        paymentStatus: pick(row, mapping.paymentStatus),
      };
    });
  }, [dataRows, mapping, splitPhone]);

  const confirm = () => {
    if (!raw || !canConfirm) return;
    const filteredRows = dataRows.filter((_, i) => included[i]);
    if (filteredRows.length === 0) {
      setError("포함된 행이 없습니다. 아래 목록에서 최소 1건 이상 체크해주세요.");
      return;
    }
    const orders = rowsToOrders(filteredRows, mapping, splitPhone).map(applyAddressHierarchy);
    if (orders.length === 0) {
      setError("주소가 채워진 행이 없습니다.");
      return;
    }
    setOrders(orders);
    navigate("/map");
  };

  return (
    <div className="page">
      <h2>1. 주문 엑셀 업로드</h2>
      <p className="hint">
        택배 주문 엑셀(.xlsx) 또는 CSV 파일을 올려주세요. 농장 자체 양식(품목·금액·결제상태 등
        포함)도 그대로 지원합니다 — 제목/합계 줄이 섞여 있어도 아래에서 골라내면 됩니다.
      </p>

      <label className="file-drop">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {fileName ? `📄 ${fileName}` : "여기를 눌러 파일 선택"}
      </label>

      {error && <p className="error-text">{error}</p>}

      {raw && (
        <>
          <h3>2. 컬럼명(제목) 줄 선택</h3>
          <p className="hint">
            엑셀 맨 위에 제목이나 요약 줄이 있는 파일도 있어서, 실제로 "고객명/주소" 같은
            컬럼명이 적힌 줄이 몇 번째인지 확인해주세요. (자동으로 짐작해서 미리 선택해뒀습니다)
          </p>
          <div className="header-row-picker">
            {raw.rows.slice(0, 10).map((row, i) => (
              <label key={i} className={`header-row-option ${i === headerRowIndex ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="headerRow"
                  checked={i === headerRowIndex}
                  onChange={() => applyHeaderRow(raw.rows, i)}
                />
                <span className="row-no">{i + 1}행</span>
                <span className="row-text">{rowPreview(row) || "(빈 줄)"}</span>
              </label>
            ))}
          </div>

          <h3>3. 컬럼 매핑</h3>
          <p className="hint">
            어느 열이 어떤 정보인지 확인/수정해주세요. (고객명, 주소는 필수 · 나머지는 없으면 "사용 안 함")
          </p>
          <div className="mapping-grid">
            {FIELDS.map((f) => (
              <div key={f.key} className="mapping-row">
                <span>
                  {f.label}
                  {f.required && <span className="required">*</span>}
                </span>
                <select
                  value={mapping[f.key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                >
                  <option value={-1}>(사용 안 함)</option>
                  {headers.map((h, idx) => (
                    <option key={idx} value={idx}>
                      {h || `(빈 헤더 ${idx + 1}열)`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <label className="split-phone-toggle">
            <input type="checkbox" checked={splitPhone} onChange={(e) => setSplitPhone(e.target.checked)} />
            "고객명" 칸에 전화번호가 같이 적혀 있으면 자동으로 분리해서 연락처로 넣기
            (연락처 칸을 따로 지정하지 않은 경우에만 적용)
          </label>

          <h3>4. 가져올 행 선택 ({dataRows.length}건 중 {dataRows.length - excludedCount}건 포함)</h3>
          {excludedCount > 0 && (
            <p className="hint">
              제목이 반복되거나 합계처럼 보이는 {excludedCount}건은 자동으로 제외해뒀습니다.
              아래에서 직접 확인하고 체크박스로 바꿀 수 있습니다.
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>고객명</th>
                  <th>주소</th>
                  <th>연락처</th>
                  <th>품목</th>
                  <th>금액</th>
                  <th>결제상태</th>
                </tr>
              </thead>
              <tbody>
                {dataRows.map((_, i) => (
                  <tr key={i} className={included[i] ? "" : "row-excluded"}>
                    <td>
                      <input
                        type="checkbox"
                        checked={included[i] ?? true}
                        onChange={(e) =>
                          setIncluded((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))
                        }
                      />
                    </td>
                    <td>{previewRows[i]?.name}</td>
                    <td>{previewRows[i]?.address}</td>
                    <td>{previewRows[i]?.phone}</td>
                    <td>{previewRows[i]?.productInfo}</td>
                    <td>{previewRows[i]?.amount}</td>
                    <td>{previewRows[i]?.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="primary" disabled={!canConfirm} onClick={confirm}>
            다음: 지도에서 확인하기 →
          </button>
        </>
      )}
    </div>
  );
}
