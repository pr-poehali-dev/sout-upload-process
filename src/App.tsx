import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";
import Index from "./pages/Index";

const AUTH_URL = "https://functions.poehali.dev/80c3c284-fc4d-4c76-892a-f2886eaed21a";
const queryClient = new QueryClient();

interface User { id: number; email: string; full_name: string; role: string; }

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<"app" | "admin">("app");

  useEffect(() => {
    const stored = localStorage.getItem("avesta_session");
    const storedUser = localStorage.getItem("avesta_user");
    if (!stored) { setChecking(false); return; }
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      setSessionId(stored);
      setChecking(false);
      return;
    }
    fetch(AUTH_URL, { headers: { "X-Session-Id": stored } })
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setUser(data);
          setSessionId(stored);
          localStorage.setItem("avesta_user", JSON.stringify(data));
        } else {
          localStorage.removeItem("avesta_session");
          localStorage.removeItem("avesta_user");
        }
      })
      .catch(() => {
        localStorage.removeItem("avesta_session");
        localStorage.removeItem("avesta_user");
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (u: User, sid: string) => {
    setUser(u); setSessionId(sid);
  };

  const handleLogout = () => {
    if (sessionId) {
      fetch(`${AUTH_URL}/logout`, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Id": sessionId } }).catch(() => {});
    }
    localStorage.removeItem("avesta_session");
    localStorage.removeItem("avesta_user");
    setUser(null); setSessionId(""); setView("app");
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy-deep)" }}>
        <div style={{ color: "var(--text-dim)", fontSize: 14 }}>Инициализация АВЕСТА...</div>
      </div>
    );
  }

  if (!user) return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Login onLogin={handleLogin} />
        <Toaster /><Sonner />
      </TooltipProvider>
    </QueryClientProvider>
  );

  if (view === "admin" && user.role === "admin") return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AdminPanel sessionId={sessionId} currentUser={user} onBack={() => setView("app")} onLogout={handleLogout} />
        <Toaster /><Sonner />
      </TooltipProvider>
    </QueryClientProvider>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Index
          user={user}
          sessionId={sessionId}
          onLogout={handleLogout}
          onAdmin={user.role === "admin" ? () => setView("admin") : undefined}
        />
        <Toaster /><Sonner />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
