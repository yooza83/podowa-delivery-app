import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrders } from "../state/OrdersContext";
import { parseSpreadsheet, guessColumnMapping, rowsToOrders, type ParsedSheet } from "../utils/excel";
import { applyAddressHierarchy } from "../utils/addressParser";
import type { ColumnMapping } from "../types";

const FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "name", label: "고객명", required: true },
  { key: "address", label: "주소", required: true },
  { key: "phone", label: "연락처", required: false },
  { key: "requestDate", label: "배송요청일", required: false },
  { key: "note", label: "요청사항", required: false },
];

export default function Upload() {
  const navigate = useNavigate();
  const { setOrders } = useOrders();

  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    name: -1,
    address: -1,
    phone: -1,
    requestDate: -1,
    note: -1,
  });
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.headers.length === 0) {
        setError("파일에서 데이터를 찾지 못했습니다. 첫 행이 컬럼명(헤더)인지 확인해주세요.");
        return;
      }
      setSheet(parsed);
      setFileName(file.name);
      const guessed = guessColumnMapping(parsed.headers);
      setMapping(guessed);
    } catch (err: any) {
      setError("파일을 읽는 중 문제가 발생했습니다: " + (err.message || err));
    }
  };

  const canConfirm = sheet && mapping.name >= 0 && mapping.address >= 0;

  const confirm = () => {
    if (!sheet || !canConfirm) return;
    const orders = rowsToOrders(sheet.rows, mapping).map(applyAddressHierarchy);
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
        택배 주문 엑셀(.xlsx) 또는 CSV 파일을 올려주세요. 첫 번째 행은 컬럼명(고객명, 주소 등)이어야 합니다.
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

      {sheet && (
        <>
          <h3>2. 컬럼 매핑</h3>
          <p className="hint">어느 열이 어떤 정보인지 확인/수정해주세요. (고객명, 주소는 필수)</p>
          <div className="mapping-grid">
            {FIELDS.map((f) => (
              <div key={f.key} className="mapping-row">
                <span>
                  {f.label}
                  {f.required && <span className="required">*</span>}
                </span>
                <select
                  value={mapping[f.key]}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))
                  }
                >
                  <option value={-1}>(사용 안 함)</option>
                  {sheet.headers.map((h, idx) => (
                    <option key={idx} value={idx}>
                      {h || `(빈 헤더 ${idx + 1}열)`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <h3>미리보기 (상위 5건)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {FIELDS.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {FIELDS.map((f) => (
                      <td key={f.key}>{mapping[f.key] >= 0 ? row[mapping[f.key]] : ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">총 {sheet.rows.length}건 인식됨</p>

          <button className="primary" disabled={!canConfirm} onClick={confirm}>
            다음: 지도에서 확인하기 →
          </button>
        </>
      )}
    </div>
  );
}
