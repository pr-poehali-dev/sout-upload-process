import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { QRCodeSVG } from "qrcode.react";
import QrScanner from "@/components/QrScanner";

const AUTH_URL = "https://functions.poehali.dev/80c3c284-fc4d-4c76-892a-f2886eaed21a";

interface Props {
  onLogin: (user: { id: number; email: string; full_name: string; role: string }, sessionId: string) => void;
}

// Все запросы через POST с action в теле — cloud functions не поддерживают субпути
function authPost(action: string, payload: Record<string, unknown>) {
  return fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
}

export default function Login({ onLogin }: Props) {
  const [screenTab, setScreenTab] = useState<"login" | "register">("login");
  const [loginTab, setLoginTab]   = useState<"password" | "qr">("password");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [fullName, setFullName]   = useState("");
  const [regEmail, setRegEmail]   = useState("");
  const [regPass, setRegPass]     = useState("");
  const [regPass2, setRegPass2]   = useState("");
  const [showRegPass, setShowRegPass] = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  // Первый вход — установить пароль
  const [needSetPwd, setNeedSetPwd] = useState(false);
  const [setPwdEmail, setSetPwdEmail] = useState("");
  const [newPwd, setNewPwd]       = useState("");
  const [newPwd2, setNewPwd2]     = useState("");

  // Анимация пульса на кнопке QR
  const [qrPulse, setQrPulse] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setQrPulse(p => !p), 2000);
    return () => clearInterval(t);
  }, []);

  const doLogin = async () => {
    if (!email || !password) { setError("Введите email и пароль"); return; }
    setError(""); setLoading(true);
    try {
      const res = await authPost("login", { email: email.trim().toLowerCase(), password });
      const data = await res.json();
      if (data.need_set_password) {
        setSetPwdEmail(email.trim().toLowerCase());
        setNeedSetPwd(true);
        setLoading(false); return;
      }
      if (!res.ok) { setError(data.error || "Неверный email или пароль"); setLoading(false); return; }
      localStorage.setItem("avesta_session", data.session_id);
      localStorage.setItem("avesta_user", JSON.stringify(data.user));
      onLogin(data.user, data.session_id);
    } catch { setError("Ошибка подключения к серверу. Попробуйте снова."); }
    setLoading(false);
  };

  const doRegister = async () => {
    if (!fullName) { setError("Введите имя и фамилию"); return; }
    if (!regEmail) { setError("Введите email"); return; }
    if (regPass.length < 6) { setError("Пароль — минимум 6 символов"); return; }
    if (regPass !== regPass2) { setError("Пароли не совпадают"); return; }
    setError(""); setLoading(true);
    try {
      const res = await authPost("register", {
        email: regEmail.trim().toLowerCase(),
        password: regPass,
        full_name: fullName.trim(),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка регистрации"); setLoading(false); return; }
      localStorage.setItem("avesta_session", data.session_id);
      localStorage.setItem("avesta_user", JSON.stringify(data.user));
      onLogin(data.user, data.session_id);
    } catch { setError("Ошибка подключения к серверу. Попробуйте снова."); }
    setLoading(false);
  };

  const doQrLogin = async (token: string) => {
    setShowScanner(false);
    setQrLoading(true); setError("");
    try {
      const res = await authPost("qr-login", { qr_token: token });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "QR-код не распознан или недействителен"); setQrLoading(false); return; }
      localStorage.setItem("avesta_session", data.session_id);
      localStorage.setItem("avesta_user", JSON.stringify(data.user));
      onLogin(data.user, data.session_id);
    } catch { setError("Ошибка сети при проверке QR-кода"); }
    setQrLoading(false);
  };

  const doSetPassword = async () => {
    if (newPwd.length < 6) { setError("Минимум 6 символов"); return; }
    if (newPwd !== newPwd2) { setError("Пароли не совпадают"); return; }
    setError(""); setLoading(true);
    try {
      const res = await authPost("set-password", { email: setPwdEmail, password: newPwd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); setLoading(false); return; }
      localStorage.setItem("avesta_session", data.session_id);
      localStorage.setItem("avesta_user", JSON.stringify(data.user));
      onLogin(data.user, data.session_id);
    } catch { setError("Ошибка подключения."); }
    setLoading(false);
  };

  const inputStyle = {
    background: "rgba(42,64,96,0.4)",
    border: "1px solid rgba(42,64,96,0.6)",
    color: "var(--text-primary)",
  };
  const focusStyle = { borderColor: "var(--gold)" };
  const blurStyle  = { borderColor: "rgba(42,64,96,0.6)" };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--navy-deep)" }}>
      {/* QR Scanner overlay */}
      {showScanner && <QrScanner onScan={doQrLogin} onClose={() => setShowScanner(false)} />}

      {/* bg grid */}
      <div style={{
        position: "fixed", inset: 0, opacity: 0.03, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, var(--gold) 0px, var(--gold) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, var(--gold) 0px, var(--gold) 1px, transparent 1px, transparent 60px)",
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

        {/* ── Первый вход ── */}
        {needSetPwd ? (
          <div className="glass-card p-8">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(200,149,42,0.15)", border: "2px solid rgba(200,149,42,0.4)" }}>
                <Icon name="KeyRound" size={22} fallback="Key" style={{ color: "var(--gold)" }} />
              </div>
              <h2 className="font-heading font-semibold text-base" style={{ color: "var(--gold-light)" }}>Первый вход</h2>
              <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                Установите пароль для <span style={{ color: "var(--text-primary)" }}>{setPwdEmail}</span>
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-sm mb-4"
                style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", color: "#E74C3C" }}>
                <Icon name="AlertCircle" size={14} fallback="Alert" />{error}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Новый пароль</label>
                <input className="w-full px-3 py-2.5 rounded text-sm outline-none" style={inputStyle}
                  type="password" placeholder="Минимум 6 символов"
                  value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  onFocus={e => Object.assign(e.target.style, focusStyle)}
                  onBlur={e => Object.assign(e.target.style, blurStyle)} />
              </div>
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Повторите пароль</label>
                <input className="w-full px-3 py-2.5 rounded text-sm outline-none" style={inputStyle}
                  type="password" placeholder="Повторите пароль"
                  value={newPwd2} onChange={e => setNewPwd2(e.target.value)}
                  onFocus={e => Object.assign(e.target.style, focusStyle)}
                  onBlur={e => Object.assign(e.target.style, blurStyle)}
                  onKeyDown={e => e.key === "Enter" && doSetPassword()} />
              </div>
              <button onClick={doSetPassword} disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-sm"
                style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Сохранение..." : "Установить пароль и войти"}
              </button>
            </div>
          </div>
        ) : (
          <div className="glass-card p-8">
            {/* ── Вкладки Вход / Регистрация ── */}
            <div className="flex rounded-lg mb-6" style={{ background: "rgba(42,64,96,0.3)" }}>
              {(["login", "register"] as const).map(m => (
                <button key={m} onClick={() => { setScreenTab(m); setError(""); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: screenTab === m ? "rgba(200,149,42,0.15)" : "transparent",
                    color: screenTab === m ? "var(--gold-light)" : "var(--text-secondary)",
                    border: screenTab === m ? "1px solid rgba(200,149,42,0.3)" : "1px solid transparent",
                  }}>
                  {m === "login" ? "Войти" : "Регистрация"}
                </button>
              ))}
            </div>

            {/* ── ВХОД ── */}
            {screenTab === "login" && (
              <>
                {/* Пароль / QR вкладки */}
                <div className="flex rounded-lg mb-5" style={{ background: "rgba(42,64,96,0.2)", padding: "3px" }}>
                  <button onClick={() => { setLoginTab("password"); setError(""); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: loginTab === "password" ? "rgba(42,64,96,0.7)" : "transparent",
                      color: loginTab === "password" ? "var(--text-primary)" : "var(--text-dim)",
                    }}>
                    <Icon name="KeyRound" size={13} fallback="Key" />
                    По паролю
                  </button>
                  <button onClick={() => { setLoginTab("qr"); setError(""); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: loginTab === "qr" ? "rgba(200,149,42,0.15)" : "transparent",
                      color: loginTab === "qr" ? "var(--gold-light)" : "var(--text-dim)",
                      border: loginTab === "qr" ? "1px solid rgba(200,149,42,0.25)" : "1px solid transparent",
                    }}>
                    <Icon name="QrCode" size={13} fallback="Qr" />
                    По QR-коду
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded text-sm mb-4"
                    style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", color: "#E74C3C" }}>
                    <Icon name="AlertCircle" size={14} fallback="Alert" />{error}
                  </div>
                )}

                {/* Форма входа по паролю */}
                {loginTab === "password" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Email</label>
                      <div className="relative">
                        <Icon name="Mail" size={15} fallback="Mail"
                          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                        <input className="w-full pl-9 pr-3 py-2.5 rounded text-sm outline-none transition-all" style={inputStyle}
                          placeholder="your@email.com" type="email"
                          value={email} onChange={e => setEmail(e.target.value)}
                          onFocus={e => Object.assign(e.target.style, focusStyle)}
                          onBlur={e => Object.assign(e.target.style, blurStyle)}
                          onKeyDown={e => e.key === "Enter" && doLogin()} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Пароль</label>
                      <div className="relative">
                        <Icon name="Lock" size={15} fallback="Lock"
                          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                        <input className="w-full pl-9 pr-10 py-2.5 rounded text-sm outline-none transition-all" style={inputStyle}
                          placeholder="Ваш пароль" type={showPass ? "text" : "password"}
                          value={password} onChange={e => setPassword(e.target.value)}
                          onFocus={e => Object.assign(e.target.style, focusStyle)}
                          onBlur={e => Object.assign(e.target.style, blurStyle)}
                          onKeyDown={e => e.key === "Enter" && doLogin()} />
                        <button onClick={() => setShowPass(!showPass)}
                          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}>
                          <Icon name={showPass ? "EyeOff" : "Eye"} size={15} fallback="Eye" />
                        </button>
                      </div>
                    </div>
                    <button onClick={doLogin} disabled={loading}
                      className="w-full py-3 rounded-lg font-semibold text-sm mt-2 transition-all"
                      style={{
                        background: loading ? "rgba(42,64,96,0.5)" : "linear-gradient(90deg, var(--gold), var(--gold-light))",
                        color: loading ? "var(--text-dim)" : "var(--navy-deep)",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}>
                      {loading ? "Проверка..." : "Войти в систему"}
                    </button>
                  </div>
                )}

                {/* QR-вход */}
                {loginTab === "qr" && (
                  <div className="text-center">
                    {qrLoading ? (
                      <div className="py-8">
                        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                          style={{ background: "rgba(200,149,42,0.1)", border: "2px solid rgba(200,149,42,0.3)" }}>
                          <Icon name="Loader" size={34} fallback="Loader" style={{ color: "var(--gold)" }} />
                        </div>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Проверка QR-кода...</p>
                      </div>
                    ) : (
                      <>
                        {/* Анимированная QR-иконка */}
                        <div className="relative inline-flex items-center justify-center mb-5 mt-2">
                          <div className="w-28 h-28 rounded-2xl flex items-center justify-center"
                            style={{
                              background: "rgba(200,149,42,0.06)",
                              border: `2px dashed rgba(200,149,42,${qrPulse ? "0.6" : "0.25"})`,
                              transition: "border-color 1s ease",
                            }}>
                            <QRCodeSVG value="avesta-demo" size={80} level="L"
                              fgColor="rgba(200,149,42,0.4)" bgColor="transparent" />
                          </div>
                          {/* Угловые маркеры */}
                          {[["top-0 left-0","border-t-2 border-l-2 rounded-tl-lg"],
                            ["top-0 right-0","border-t-2 border-r-2 rounded-tr-lg"],
                            ["bottom-0 left-0","border-b-2 border-l-2 rounded-bl-lg"],
                            ["bottom-0 right-0","border-b-2 border-r-2 rounded-br-lg"]].map(([pos, cls]) => (
                            <div key={pos} className={`absolute ${pos} w-5 h-5 ${cls}`}
                              style={{ borderColor: "var(--gold)" }} />
                          ))}
                        </div>

                        <p className="font-medium text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                          Войти по QR-коду
                        </p>
                        <p className="text-xs mb-6" style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>
                          Используйте QR-карточку, выданную<br />администратором системы
                        </p>

                        <button onClick={() => setShowScanner(true)}
                          className="w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-3 transition-all"
                          style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}>
                          <Icon name="Camera" size={18} fallback="Camera" />
                          Открыть камеру и сканировать
                        </button>

                        <p className="text-xs mt-4" style={{ color: "var(--text-dim)" }}>
                          Камера запустится автоматически и считает QR
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── РЕГИСТРАЦИЯ ── */}
            {screenTab === "register" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>ФИО</label>
                  <div className="relative">
                    <Icon name="User" size={15} fallback="User"
                      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                    <input className="w-full pl-9 pr-3 py-2.5 rounded text-sm outline-none" style={inputStyle}
                      placeholder="Иванов Иван Иванович"
                      value={fullName} onChange={e => setFullName(e.target.value)}
                      onFocus={e => Object.assign(e.target.style, focusStyle)}
                      onBlur={e => Object.assign(e.target.style, blurStyle)} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Email</label>
                  <div className="relative">
                    <Icon name="Mail" size={15} fallback="Mail"
                      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                    <input className="w-full pl-9 pr-3 py-2.5 rounded text-sm outline-none" style={inputStyle}
                      placeholder="your@email.com" type="email"
                      value={regEmail} onChange={e => setRegEmail(e.target.value)}
                      onFocus={e => Object.assign(e.target.style, focusStyle)}
                      onBlur={e => Object.assign(e.target.style, blurStyle)} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Пароль</label>
                  <div className="relative">
                    <Icon name="Lock" size={15} fallback="Lock"
                      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                    <input className="w-full pl-9 pr-10 py-2.5 rounded text-sm outline-none" style={inputStyle}
                      placeholder="Минимум 6 символов" type={showRegPass ? "text" : "password"}
                      value={regPass} onChange={e => setRegPass(e.target.value)}
                      onFocus={e => Object.assign(e.target.style, focusStyle)}
                      onBlur={e => Object.assign(e.target.style, blurStyle)} />
                    <button onClick={() => setShowRegPass(!showRegPass)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}>
                      <Icon name={showRegPass ? "EyeOff" : "Eye"} size={15} fallback="Eye" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Повторите пароль</label>
                  <div className="relative">
                    <Icon name="Lock" size={15} fallback="Lock"
                      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
                    <input className="w-full pl-9 pr-3 py-2.5 rounded text-sm outline-none" style={inputStyle}
                      placeholder="Повторите пароль" type="password"
                      value={regPass2} onChange={e => setRegPass2(e.target.value)}
                      onFocus={e => Object.assign(e.target.style, focusStyle)}
                      onBlur={e => Object.assign(e.target.style, blurStyle)}
                      onKeyDown={e => e.key === "Enter" && doRegister()} />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded text-sm"
                    style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", color: "#E74C3C" }}>
                    <Icon name="AlertCircle" size={14} fallback="Alert" />{error}
                  </div>
                )}

                <button onClick={doRegister} disabled={loading}
                  className="w-full py-3 rounded-lg font-semibold text-sm transition-all"
                  style={{
                    background: loading ? "rgba(42,64,96,0.5)" : "linear-gradient(90deg, var(--gold), var(--gold-light))",
                    color: loading ? "var(--text-dim)" : "var(--navy-deep)",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}>
                  {loading ? "Создание аккаунта..." : "Создать аккаунт"}
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-dim)" }}>
          АВЕСТА v1.0 · 426-ФЗ «О специальной оценке условий труда»
        </p>
      </div>
    </div>
  );
}
