import { useState, type FormEvent } from "react";
import { api } from "../api/client";

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login(password);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>🍇 포도와농장 배송앱</h1>
        <p className="hint">가족과 공유한 비밀번호를 입력하세요.</p>
        <input
          type="password"
          autoFocus
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading || !password}>
          {loading ? "확인 중..." : "들어가기"}
        </button>
      </form>
    </div>
  );
}
