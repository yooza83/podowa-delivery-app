import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { api } from "./api/client";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import MapView from "./pages/MapView";
import RouteCompare from "./pages/RouteCompare";
import "./App.css";

function Stepper() {
  const { pathname } = useLocation();
  const steps = [
    { path: "/upload", label: "① 업로드" },
    { path: "/map", label: "② 지도/배정" },
    { path: "/route", label: "③ 경로비교" },
  ];
  return (
    <nav className="stepper">
      {steps.map((s) => (
        <Link key={s.path} to={s.path} className={pathname === s.path ? "active" : ""}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setAuthed(r.authed))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="loading-screen">불러오는 중...</div>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>🍇 포도와농장 배송앱</h1>
        <Stepper />
        <button
          className="logout-btn"
          onClick={async () => {
            await api.logout();
            setAuthed(false);
          }}
        >
          로그아웃
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/route" element={<RouteCompare />} />
          <Route path="*" element={<Navigate to="/upload" replace />} />
        </Routes>
      </main>
    </div>
  );
}
