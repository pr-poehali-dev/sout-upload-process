import { useState } from "react";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/80c3c284-fc4d-4c76-892a-f2886eaed21a";

interface Props {
  onLogin: (user: { id: number; email: string; full_name: string; role: string }, sessionId: string) => void;
}

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async () => {
    setError("");
    if (!email || !password) { setError("Введите email и пароль"); return; }
    if (mode === "register" && !fullName) { setError("Введите ваше имя"); return; }
    setLoading(true);
    try {
      const action = mode === "login" ? "login" : "register";
      const body: Record<string, string> = { email, password };
      if (mode === "register") body.full_name = fullName;
      const res = await fetch(`${AUTH_URL}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); setLoading(false); return; }
      localStorage.setItem("avesta_session", data.session_id);
      localStorage.setItem("avesta_user", JSON.stringify(data.user));
      onLogin(data.user, data.session_id);
    } catch {
      setError("Ошибка подключения к серверу");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--navy-deep)" }}>
      {/* bg pattern */}
      <div style={{
        position: "fixed", inset: 0, opacity: 0.03,
        backgroundImage: "repeating-linear-gradient(0deg, var(--gold) 0px, var(--gold) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, var(--gold) 0px, var(--gold) 1px, transparent 1px, transparent 60px)",
        pointerEvents: "none"
      }} />

      <div className="w-full max-w-md animate-fade-in" style={{ padding: "0 16px" }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)" }}>
            <span className="font-heading font-black text-2xl" style={{ color: "var(--navy-deep)" }}>А</span>
          </div>
          <h1 className="font-heading font-bold text-2xl tracking-widest mb-1" style={{ color: "var(--gold-light)" }}>АВЕСТА</h1>
          <p className="text-xs tracking-widest uppercase" style={{ color: "var(--text-dim)" }}>
            Автоматизированный анализ карт СОУТ
          </p>
        </div>

        <div className="glass-card p-8">
          {/* Tabs */}
          <div className="flex rounded-lg mb-6" style={{ background: "rgba(42,64,96,0.3)" }}>
            {(["login", "register"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: mode === m ? "rgba(200,149,42,0.15)" : "transparent",
                  color: mode === m ? "var(--gold-light)" : "var(--text-secondary)",
                  border: mode === m ? "1px solid rgba(200,149,42,0.3)" : "1px solid transparent",
                }}>
                {m === "login" ? "Войти" : "Регистрация"}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Имя и фамилия</label>
                <input
                  className="w-full px-3 py-2.5 rounded text-sm outline-none transition-all"
                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                  placeholder="Иванов Иван Иванович"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = "var(--gold)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(42,64,96,0.6)")}
                />
              </div>
            )}

            <div>
              <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Email</label>
              <div className="relative">
                <Icon name="Mail" size={15} fallback="Mail"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                <input
                  className="w-full pl-9 pr-3 py-2.5 rounded text-sm outline-none transition-all"
                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                  placeholder="your@email.com"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = "var(--gold)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(42,64,96,0.6)")}
                  onKeyDown={e => e.key === "Enter" && submit()}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Пароль</label>
              <div className="relative">
                <Icon name="Lock" size={15} fallback="Lock"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                <input
                  className="w-full pl-9 pr-10 py-2.5 rounded text-sm outline-none transition-all"
                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                  placeholder={mode === "login" ? "Ваш пароль" : "Минимум 6 символов"}
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = "var(--gold)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(42,64,96,0.6)")}
                  onKeyDown={e => e.key === "Enter" && submit()}
                />
                <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}>
                  <Icon name={showPass ? "EyeOff" : "Eye"} size={15} fallback="Eye" />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-sm"
                style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", color: "#E74C3C" }}>
                <Icon name="AlertCircle" size={14} fallback="Alert" />
                {error}
              </div>
            )}

            <button onClick={submit} disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm mt-2 transition-all"
              style={{
                background: loading ? "rgba(42,64,96,0.5)" : "linear-gradient(90deg, var(--gold), var(--gold-light))",
                color: loading ? "var(--text-dim)" : "var(--navy-deep)",
                cursor: loading ? "not-allowed" : "pointer",
              }}>
              {loading ? "Проверка..." : mode === "login" ? "Войти в систему" : "Создать аккаунт"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-dim)" }}>
          АВЕСТА v1.0 · 426-ФЗ «О специальной оценке условий труда»
        </p>
      </div>
    </div>
  );
}
