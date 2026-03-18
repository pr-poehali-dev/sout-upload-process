import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import * as XLSX from "xlsx";
import { QRCodeSVG } from "qrcode.react";
import QrScanner from "@/components/QrScanner";

// ─── API URLs ────────────────────────────────────────────────────────────────
const API = {
  auth:    "https://functions.poehali.dev/80c3c284-fc4d-4c76-892a-f2886eaed21a",
  admin:   "https://functions.poehali.dev/2aa77a7f-e362-4571-90dd-33ce54ee2b76",
  upload:  "https://functions.poehali.dev/dc630666-fe78-49d2-b6db-278145860efa",
  process: "https://functions.poehali.dev/3413521a-f911-42ef-8699-ea97fc14c796",
  results: "https://functions.poehali.dev/509dcfe4-0c62-4104-974a-7f493bee43bd",
  export:  "https://functions.poehali.dev/77a67f0a-c7b2-44db-8701-230a41e4c983",
};

// ─── Types ───────────────────────────────────────────────────────────────────
type Section = "upload"|"processing"|"results"|"history"|"export"|"reference"|"analytics"|"settings"|"admin";

interface User { id: number; email: string; full_name: string; role: "admin"|"user" }
interface SoutCard {
  id: number; batch_id: number; organization: string; department: string;
  worker_name: string; position: string; sout_date: string; is_dangerous: boolean;
  factors: { code: string; name: string; description: string }[];
}
interface Batch {
  id: number; name: string; status: string; total_files: number;
  processed_files: number; created_at: string; danger_count: number; safe_count: number;
}
interface AdminUser {
  id: number; email: string; full_name: string; role: string;
  is_active: boolean; created_at: string; last_login_at: string|null;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: Section; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: "upload",     label: "Загрузка",    icon: "Upload" },
  { id: "processing", label: "Обработка",   icon: "Cpu" },
  { id: "results",    label: "Результаты",  icon: "LayoutList" },
  { id: "history",    label: "История",     icon: "Clock" },
  { id: "export",     label: "Экспорт",     icon: "Download" },
  { id: "reference",  label: "Справочник",  icon: "BookOpen" },
  { id: "analytics",  label: "Аналитика",   icon: "BarChart3" },
  { id: "settings",   label: "Настройки",   icon: "Settings" },
  { id: "admin",      label: "Администратор", icon: "ShieldAlert", adminOnly: true },
];

const FACTOR_CODES: Record<string, string> = {
  "3.1": "Химический фактор",
  "3.2": "Биологический фактор",
  "3.3": "Физический фактор (шум, вибрация, излучение)",
  "3.4": "Тяжесть трудового процесса",
  "3.5": "Напряжённость трудового процесса",
  "4.0": "Опасный класс условий труда",
};

const STEPS = [
  "Конвертация и подготовка файлов",
  "Загрузка в защищённое хранилище",
  "Запуск обработки и распознавания",
  "Идентификация вредных факторов",
  "Формирование реестра по двум направлениям",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "FileText";
  if (ext === "xlsx" || ext === "xls") return "FileSpreadsheet";
  if (ext === "zip" || ext === "rar") return "FolderArchive";
  return "File";
}
function formatBytes(b: number) {
  if (b < 1024) return b + " Б";
  if (b < 1048576) return (b / 1024).toFixed(1) + " КБ";
  return (b / 1048576).toFixed(1) + " МБ";
}
function fmtDate(s: string) {
  try { return new Date(s).toLocaleString("ru-RU"); } catch { return s; }
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (user: User, sid: string) => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [needSetPwd, setNeedSetPwd] = useState(false);
  const [newPwd, setNewPwd]     = useState("");
  const [newPwd2, setNewPwd2]   = useState("");
  const [loginMode, setLoginMode] = useState<"password"|"qr">("password");
  const [showScanner, setShowScanner] = useState(false);
  const [qrScanning, setQrScanning]   = useState(false);

  const doLogin = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API.auth}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (data.need_set_password) { setNeedSetPwd(true); setLoading(false); return; }
      if (!res.ok) { setError(data.error || "Ошибка входа"); setLoading(false); return; }
      localStorage.setItem("avesta_sid", data.session_id);
      onLogin(data.user, data.session_id);
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  };

  const doQrLogin = async (token: string) => {
    setShowScanner(false);
    setQrScanning(true);
    setError("");
    try {
      const res = await fetch(`${API.auth}/qr-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_token: token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "QR-код не распознан"); setQrScanning(false); return; }
      localStorage.setItem("avesta_sid", data.session_id);
      onLogin(data.user, data.session_id);
    } catch { setError("Ошибка сети"); }
    setQrScanning(false);
  };

  const doSetPassword = async () => {
    if (newPwd.length < 6) { setError("Минимум 6 символов"); return; }
    if (newPwd !== newPwd2) { setError("Пароли не совпадают"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API.auth}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); setLoading(false); return; }
      localStorage.setItem("avesta_sid", data.session_id);
      onLogin(data.user, data.session_id);
    } catch { setError("Ошибка сети"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--navy-deep)" }}>
      {showScanner && <QrScanner onScan={doQrLogin} onClose={() => setShowScanner(false)} />}

      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: "linear-gradient(rgba(200,149,42,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(200,149,42,0.3) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)" }}>
            <span className="font-heading font-black text-2xl" style={{ color: "var(--navy-deep)" }}>А</span>
          </div>
          <h1 className="font-heading font-bold text-3xl tracking-widest mb-1" style={{ color: "var(--gold-light)" }}>АВЕСТА</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Автоматизированная Верификация и Экспертный Статус Труда и Анализа
          </p>
        </div>

        <div className="glass-card p-8">
          {!needSetPwd ? (
            <>
              <h2 className="font-heading font-semibold text-lg mb-5 text-center" style={{ color: "var(--text-primary)" }}>
                Вход в систему
              </h2>

              {/* Mode toggle */}
              <div className="flex rounded-lg p-1 mb-5" style={{ background: "rgba(42,64,96,0.3)" }}>
                <button
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all"
                  style={{
                    background: loginMode === "password" ? "rgba(200,149,42,0.15)" : "transparent",
                    color: loginMode === "password" ? "var(--gold-light)" : "var(--text-secondary)",
                    border: loginMode === "password" ? "1px solid rgba(200,149,42,0.3)" : "1px solid transparent",
                  }}
                  onClick={() => setLoginMode("password")}>
                  <Icon name="KeyRound" size={14} fallback="Key" />
                  Пароль
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-all"
                  style={{
                    background: loginMode === "qr" ? "rgba(200,149,42,0.15)" : "transparent",
                    color: loginMode === "qr" ? "var(--gold-light)" : "var(--text-secondary)",
                    border: loginMode === "qr" ? "1px solid rgba(200,149,42,0.3)" : "1px solid transparent",
                  }}
                  onClick={() => setLoginMode("qr")}>
                  <Icon name="QrCode" size={14} fallback="Scan" />
                  QR-код
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded flex items-center gap-2 text-sm"
                  style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", color: "#E74C3C" }}>
                  <Icon name="AlertCircle" size={14} fallback="Alert" />{error}
                </div>
              )}

              {loginMode === "password" ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--text-dim)" }}>Email</label>
                    <input
                      className="w-full px-3 py-2.5 rounded text-sm outline-none"
                      style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                      type="email" placeholder="example@company.ru"
                      value={email} onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && doLogin()}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: "var(--text-dim)" }}>Пароль</label>
                    <input
                      className="w-full px-3 py-2.5 rounded text-sm outline-none"
                      style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                      type="password" placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && doLogin()}
                    />
                  </div>
                  <button
                    className="w-full py-3 rounded font-semibold text-sm mt-2"
                    style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)", opacity: loading ? 0.7 : 1 }}
                    onClick={doLogin} disabled={loading}>
                    {loading ? "Вход..." : "Войти в систему"}
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  {/* QR mode */}
                  <div className="py-4">
                    <div className="w-20 h-20 rounded-xl flex items-center justify-center mx-auto mb-4"
                      style={{ background: "rgba(200,149,42,0.08)", border: "2px dashed rgba(200,149,42,0.3)" }}>
                      {qrScanning
                        ? <Icon name="Loader" size={32} fallback="Loader" style={{ color: "var(--gold)" }} />
                        : <Icon name="QrCode" size={36} fallback="Scan" style={{ color: "var(--gold)" }} />
                      }
                    </div>
                    <p className="text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                      {qrScanning ? "Проверка QR-кода..." : "Войти по QR-коду"}
                    </p>
                    <p className="text-xs mb-6" style={{ color: "var(--text-dim)" }}>
                      {qrScanning
                        ? "Пожалуйста, подождите"
                        : "Используйте QR-код, выданный администратором"}
                    </p>

                    {!qrScanning && (
                      <button
                        className="w-full py-3 rounded font-semibold text-sm flex items-center justify-center gap-3"
                        style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                        onClick={() => setShowScanner(true)}>
                        <Icon name="Camera" size={18} fallback="Camera" />
                        Открыть камеру и сканировать
                      </button>
                    )}
                  </div>
                </div>
              )}

              <p className="text-xs text-center mt-4" style={{ color: "var(--text-dim)" }}>
                Доступ ограничен. Обратитесь к администратору для получения учётных данных.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-heading font-semibold text-lg mb-2 text-center" style={{ color: "var(--gold-light)" }}>
                Первый вход
              </h2>
              <p className="text-sm text-center mb-6" style={{ color: "var(--text-secondary)" }}>
                Установите пароль для аккаунта <strong style={{ color: "var(--text-primary)" }}>{email}</strong>
              </p>
              {error && (
                <div className="mb-4 p-3 rounded text-sm"
                  style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)", color: "#E74C3C" }}>
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: "var(--text-dim)" }}>Новый пароль</label>
                  <input className="w-full px-3 py-2.5 rounded text-sm outline-none"
                    style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                    type="password" placeholder="Минимум 6 символов"
                    value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: "var(--text-dim)" }}>Повторите пароль</label>
                  <input className="w-full px-3 py-2.5 rounded text-sm outline-none"
                    style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                    type="password" placeholder="Повторите пароль"
                    value={newPwd2} onChange={e => setNewPwd2(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doSetPassword()} />
                </div>
                <button className="w-full py-3 rounded font-semibold text-sm"
                  style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                  onClick={doSetPassword} disabled={loading}>
                  {loading ? "Сохранение..." : "Установить пароль и войти"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-dim)" }}>
          АВЕСТА v1.0 · Федеральный закон 426-ФЗ «О СОУТ»
        </p>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ sessionId, currentUser }: { sessionId: string; currentUser: User }) {
  const [tab, setTab]           = useState<"stats"|"users"|"clear"|"settings">("stats");
  const [stats, setStats]       = useState<Record<string, number>>({});
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState<{ text: string; type: "ok"|"err" } | null>(null);
  const [clearConfirm, setClearConfirm] = useState<""|"results"|"history"|"all">("");
  const [newUser, setNewUser]   = useState({ email: "", full_name: "", password: "", role: "user" });
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [qrModal, setQrModal]   = useState<{ userId: number; name: string; token: string } | null>(null);

  const h = { "Content-Type": "application/json", "X-Session-Id": sessionId };

  const showMsg = (text: string, type: "ok"|"err") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadStats = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${API.admin}/stats`, { headers: h });
    const d = await res.json();
    setStats(d);
    setLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${API.admin}/users`, { headers: h });
    const d = await res.json();
    setUsers(d.users || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "stats") loadStats();
    if (tab === "users") loadUsers();
  }, [tab, loadStats, loadUsers]);

  const createUser = async () => {
    if (!newUser.email || !newUser.full_name || !newUser.password) {
      showMsg("Заполните все поля", "err"); return;
    }
    const res = await fetch(`${API.admin}/users`, {
      method: "POST", headers: h, body: JSON.stringify(newUser),
    });
    const d = await res.json();
    if (!res.ok) { showMsg(d.error || "Ошибка", "err"); return; }
    showMsg("Пользователь создан", "ok");
    setNewUser({ email: "", full_name: "", password: "", role: "user" });
    loadUsers();
  };

  const updateUser = async (uid: number, fields: Record<string, unknown>) => {
    const res = await fetch(`${API.admin}/users`, {
      method: "PUT", headers: h, body: JSON.stringify({ id: uid, ...fields }),
    });
    const d = await res.json();
    if (!res.ok) { showMsg(d.error || "Ошибка", "err"); return; }
    showMsg("Сохранено", "ok");
    setEditUser(null);
    loadUsers();
  };

  const doClear = async (target: "results"|"history"|"all") => {
    const res = await fetch(`${API.admin}/clear/${target}`, { method: "POST", headers: h });
    const d = await res.json();
    if (!res.ok) { showMsg(d.error || "Ошибка", "err"); return; }
    showMsg(d.message || "Очищено успешно", "ok");
    setClearConfirm("");
    loadStats();
  };

  const TABS = [
    { id: "stats",    label: "Статистика",     icon: "BarChart2" },
    { id: "users",    label: "Пользователи",   icon: "Users" },
    { id: "clear",    label: "Очистка БД",      icon: "Trash2" },
    { id: "settings", label: "Настройки",       icon: "Sliders" },
  ] as const;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(200,149,42,0.15)", border: "1px solid rgba(200,149,42,0.3)" }}>
          <Icon name="ShieldAlert" size={20} fallback="Shield" style={{ color: "var(--gold)" }} />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-lg" style={{ color: "var(--text-primary)" }}>Панель администратора</h2>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>Полный доступ · {currentUser.email}</p>
        </div>
      </div>

      {/* Notification */}
      {msg && (
        <div className="mb-4 p-3 rounded flex items-center gap-2 text-sm animate-fade-in"
          style={{
            background: msg.type === "ok" ? "rgba(26,122,74,0.15)" : "rgba(192,57,43,0.15)",
            border: `1px solid ${msg.type === "ok" ? "rgba(26,122,74,0.3)" : "rgba(192,57,43,0.3)"}`,
            color: msg.type === "ok" ? "#2ECC71" : "#E74C3C",
          }}>
          <Icon name={msg.type === "ok" ? "CheckCircle" : "AlertCircle"} size={14} fallback="Info" />
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "rgba(42,64,96,0.3)", width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all"
            style={{
              background: tab === t.id ? "rgba(200,149,42,0.15)" : "transparent",
              color: tab === t.id ? "var(--gold-light)" : "var(--text-secondary)",
              border: tab === t.id ? "1px solid rgba(200,149,42,0.3)" : "1px solid transparent",
            }}>
            <Icon name={t.icon} size={14} fallback="Circle" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── STATS ── */}
      {tab === "stats" && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12" style={{ color: "var(--text-dim)" }}>Загрузка...</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Пользователей",       value: stats.users_count,    icon: "Users",         color: "var(--gold)" },
                  { label: "Пакетов СОУТ",         value: stats.batches_count,  icon: "FolderOpen",    color: "var(--text-secondary)" },
                  { label: "Карт обработано",      value: stats.cards_count,    icon: "FileText",      color: "var(--text-secondary)" },
                  { label: "С вредными условиями", value: stats.danger_count,   icon: "AlertTriangle", color: "#E74C3C" },
                  { label: "Допустимые условия",   value: stats.safe_count,     icon: "ShieldCheck",   color: "#2ECC71" },
                  { label: "Активных сессий",      value: stats.active_sessions,icon: "Activity",      color: "var(--gold)" },
                ].map(s => (
                  <div key={s.label} className="glass-card p-4">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{s.label}</p>
                      <Icon name={s.icon} size={15} fallback="Info" style={{ color: s.color }} />
                    </div>
                    <p className="font-heading font-bold text-2xl" style={{ color: s.color }}>{s.value ?? "—"}</p>
                  </div>
                ))}
              </div>
              <button onClick={loadStats} className="flex items-center gap-2 px-4 py-2 rounded text-sm"
                style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>
                <Icon name="RefreshCw" size={14} fallback="Refresh" />Обновить
              </button>
            </>
          )}
        </div>
      )}

      {/* ── USERS ── */}
      {tab === "users" && (
        <div className="space-y-6">
          {/* Create user form */}
          <div className="glass-card p-5">
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>
              Создать пользователя
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--text-dim)" }}>Email</label>
                <input className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                  type="email" placeholder="user@company.ru"
                  value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--text-dim)" }}>ФИО</label>
                <input className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                  placeholder="Иванов Иван Иванович"
                  value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--text-dim)" }}>Пароль</label>
                <input className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                  type="password" placeholder="Минимум 6 символов"
                  value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--text-dim)" }}>Роль</label>
                <select className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                  value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                  <option value="user">Пользователь</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
            </div>
            <button onClick={createUser}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
              style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}>
              <Icon name="UserPlus" size={14} fallback="Plus" />Создать пользователя
            </button>
          </div>

          {/* Users list */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(42,64,96,0.5)" }}>
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                Список пользователей ({users.length})
              </span>
              <button onClick={loadUsers} style={{ color: "var(--text-dim)" }}>
                <Icon name="RefreshCw" size={13} fallback="Refresh" />
              </button>
            </div>
            {loading ? (
              <div className="text-center py-8" style={{ color: "var(--text-dim)" }}>Загрузка...</div>
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>ФИО / Email</th>
                    <th style={{ textAlign: "left" }}>Роль</th>
                    <th style={{ textAlign: "left" }}>Статус</th>
                    <th style={{ textAlign: "left" }}>QR-доступ</th>
                    <th style={{ textAlign: "left" }}>Последний вход</th>
                    <th style={{ textAlign: "left" }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <>
                      <tr key={u.id}>
                        <td>
                          <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{u.full_name || "—"}</div>
                          <div className="text-xs" style={{ color: "var(--text-dim)" }}>{u.email}</div>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.role === "admin" ? "badge-pending" : ""}`}
                            style={u.role !== "admin" ? { color: "var(--text-secondary)", background: "rgba(42,64,96,0.4)", borderRadius: 4, padding: "2px 8px" } : {}}>
                            {u.role === "admin" ? "Администратор" : "Пользователь"}
                          </span>
                        </td>
                        <td>
                          <span className={u.is_active ? "badge-safe" : "badge-danger"} style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.7rem" }}>
                            {u.is_active ? "Активен" : "Заблокирован"}
                          </span>
                        </td>
                        <td>
                          {(u as AdminUser & { has_qr?: boolean }).has_qr ? (
                            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#2ECC71" }}>
                              <Icon name="QrCode" size={12} fallback="Qr" />
                              Активен
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--text-dim)" }}>—</span>
                          )}
                        </td>
                        <td style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>
                          {u.last_login_at ? fmtDate(u.last_login_at) : "Никогда"}
                        </td>
                        <td>
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => setEditUser(editUser?.id === u.id ? null : u)}
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: "rgba(200,149,42,0.1)", color: "var(--gold)" }}>
                              Изменить
                            </button>
                            <button
                              onClick={async () => {
                                const res = await fetch(`${API.auth}/qr-generate`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
                                  body: JSON.stringify({ user_id: u.id }),
                                });
                                const d = await res.json();
                                if (res.ok) {
                                  setQrModal({ userId: u.id, name: u.full_name || u.email, token: d.qr_token });
                                  loadUsers();
                                } else {
                                  showMsg(d.error || "Ошибка генерации QR", "err");
                                }
                              }}
                              className="text-xs px-2 py-1 rounded flex items-center gap-1"
                              style={{ background: (u as AdminUser & { has_qr?: boolean }).has_qr ? "rgba(42,64,96,0.5)" : "rgba(200,149,42,0.12)", color: (u as AdminUser & { has_qr?: boolean }).has_qr ? "var(--text-secondary)" : "var(--gold)" }}>
                              <Icon name="QrCode" size={11} fallback="Qr" />
                              {(u as AdminUser & { has_qr?: boolean }).has_qr ? "Обновить QR" : "Создать QR"}
                            </button>
                            {(u as AdminUser & { has_qr?: boolean }).has_qr && (
                              <button
                                onClick={async () => {
                                  await fetch(`${API.auth}/qr-revoke`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
                                    body: JSON.stringify({ user_id: u.id }),
                                  });
                                  showMsg("QR-код отозван", "ok");
                                  loadUsers();
                                }}
                                className="text-xs px-2 py-1 rounded"
                                style={{ background: "rgba(192,57,43,0.08)", color: "#E74C3C" }}>
                                Отозвать QR
                              </button>
                            )}
                            {u.id !== currentUser.id && (
                              <button
                                onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                                className="text-xs px-2 py-1 rounded"
                                style={{ background: u.is_active ? "rgba(192,57,43,0.1)" : "rgba(26,122,74,0.1)", color: u.is_active ? "#E74C3C" : "#2ECC71" }}>
                                {u.is_active ? "Заблокировать" : "Разблокировать"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {editUser?.id === u.id && (
                        <tr key={`${u.id}-edit`}>
                          <td colSpan={6} style={{ background: "rgba(42,64,96,0.12)", padding: 0 }}>
                            <div className="p-4 grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-xs mb-1 block" style={{ color: "var(--text-dim)" }}>ФИО</label>
                                <input className="w-full px-3 py-2 rounded text-sm outline-none"
                                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                                  value={editUser.full_name}
                                  onChange={e => setEditUser(p => p ? { ...p, full_name: e.target.value } : p)} />
                              </div>
                              <div>
                                <label className="text-xs mb-1 block" style={{ color: "var(--text-dim)" }}>Новый пароль</label>
                                <input className="w-full px-3 py-2 rounded text-sm outline-none"
                                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                                  type="password" placeholder="Оставьте пустым — без изменений"
                                  onChange={e => setEditUser(p => p ? { ...p, password: e.target.value } : p)} />
                              </div>
                              <div>
                                <label className="text-xs mb-1 block" style={{ color: "var(--text-dim)" }}>Роль</label>
                                <select className="w-full px-3 py-2 rounded text-sm outline-none"
                                  style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                                  value={editUser.role}
                                  onChange={e => setEditUser(p => p ? { ...p, role: e.target.value } : p)}>
                                  <option value="user">Пользователь</option>
                                  <option value="admin">Администратор</option>
                                </select>
                              </div>
                              <div className="col-span-3 flex gap-2">
                                <button onClick={() => updateUser(u.id, { full_name: editUser.full_name, role: editUser.role, ...((editUser as { password?: string }).password ? { password: (editUser as { password?: string }).password } : {}) })}
                                  className="px-4 py-2 rounded text-xs font-medium"
                                  style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}>
                                  Сохранить
                                </button>
                                <button onClick={() => setEditUser(null)}
                                  className="px-4 py-2 rounded text-xs"
                                  style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>
                                  Отмена
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── CLEAR DB ── */}
      {tab === "clear" && (
        <div className="space-y-4 max-w-2xl">
          <div className="glass-card p-5" style={{ borderColor: "rgba(192,57,43,0.3)" }}>
            <div className="flex items-center gap-3 mb-4">
              <Icon name="AlertTriangle" size={18} fallback="Alert" style={{ color: "#E74C3C" }} />
              <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Зона опасных операций</p>
            </div>
            <p className="text-xs mb-6" style={{ color: "var(--text-secondary)" }}>
              Операции по очистке необратимы. После выполнения данные не могут быть восстановлены.
              Пользователи и сессии не затрагиваются.
            </p>

            {[
              {
                id: "results" as const,
                icon: "FileX",
                title: "Очистить результаты",
                desc: "Удалить все карты СОУТ и выявленные факторы. История пакетов сохранится.",
                color: "#E8B84B",
              },
              {
                id: "history" as const,
                icon: "FolderX",
                title: "Очистить историю",
                desc: "Удалить историю пакетов и файлов загрузки. Карты СОУТ сохранятся.",
                color: "#E8B84B",
              },
              {
                id: "all" as const,
                icon: "Trash2",
                title: "Полная очистка базы данных СОУТ",
                desc: "Удалить ВСЕ данные: карты, факторы, историю, пакеты и файлы. Необратимо.",
                color: "#E74C3C",
              },
            ].map(item => (
              <div key={item.id} className="p-4 rounded-lg mb-3"
                style={{ background: "rgba(42,64,96,0.2)", border: `1px solid rgba(42,64,96,0.4)` }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Icon name={item.icon} size={18} fallback="Trash" style={{ color: item.color, marginTop: 1 }} />
                    <div>
                      <p className="font-medium text-sm mb-0.5" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{item.desc}</p>
                    </div>
                  </div>
                  {clearConfirm === item.id ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs" style={{ color: "#E74C3C" }}>Подтвердить?</span>
                      <button onClick={() => doClear(item.id)}
                        className="px-3 py-1.5 rounded text-xs font-bold"
                        style={{ background: "#C0392B", color: "#fff" }}>Да, удалить</button>
                      <button onClick={() => setClearConfirm("")}
                        className="px-3 py-1.5 rounded text-xs"
                        style={{ background: "rgba(42,64,96,0.5)", color: "var(--text-secondary)" }}>Отмена</button>
                    </div>
                  ) : (
                    <button onClick={() => setClearConfirm(item.id)}
                      className="px-4 py-2 rounded text-xs font-medium flex-shrink-0"
                      style={{ background: "rgba(192,57,43,0.15)", color: item.color, border: `1px solid rgba(192,57,43,0.3)` }}>
                      Очистить
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {tab === "settings" && (
        <div className="space-y-4 max-w-xl">
          {[
            { section: "Система", items: [
              { label: "Версия АВЕСТА",               value: "1.0.0" },
              { label: "Схема БД",                    value: "t_p19673764_sout_upload_process" },
              { label: "Администратор системы",        value: "nshrkonstantin@gmail.com" },
              { label: "Регламент хранения данных",   value: "3 года (426-ФЗ)" },
            ]},
            { section: "Обработка", items: [
              { label: "Автоматическая классификация факторов", value: "Включена" },
              { label: "Поддерживаемые форматы",      value: "PDF, XLSX, XLS, DOC, DOCX, ZIP" },
              { label: "Макс. размер пакета",         value: "500 МБ" },
              { label: "Язык распознавания",          value: "Русский" },
            ]},
            { section: "Безопасность", items: [
              { label: "Срок действия сессии",        value: "30 дней" },
              { label: "Хэширование паролей",         value: "SHA-256 + соль" },
              { label: "Хранение файлов",             value: "S3 (шифрование в покое)" },
            ]},
          ].map(group => (
            <div key={group.section} className="glass-card p-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>{group.section}</p>
              {group.items.map(item => (
                <div key={item.label} className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: "1px solid rgba(42,64,96,0.3)" }}>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                  <span className="text-xs font-medium px-3 py-1 rounded"
                    style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-primary)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── QR Modal ── */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="relative rounded-xl overflow-hidden w-full max-w-sm mx-4"
            style={{ background: "var(--navy-mid)", border: "1px solid rgba(200,149,42,0.4)" }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid rgba(42,64,96,0.5)" }}>
              <div>
                <p className="font-heading font-semibold text-sm" style={{ color: "var(--text-primary)" }}>QR-код доступа</p>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>{qrModal.name}</p>
              </div>
              <button onClick={() => setQrModal(null)}
                className="w-7 h-7 rounded flex items-center justify-center"
                style={{ background: "rgba(42,64,96,0.5)", color: "var(--text-dim)" }}>
                <Icon name="X" size={14} fallback="X" />
              </button>
            </div>
            <div className="p-6 text-center">
              {/* QR Code */}
              <div className="inline-block p-4 rounded-xl mb-4"
                style={{ background: "#fff" }}>
                <QRCodeSVG
                  value={qrModal.token}
                  size={200}
                  level="H"
                  includeMargin={false}
                  imageSettings={{
                    src: "",
                    x: undefined,
                    y: undefined,
                    height: 0,
                    width: 0,
                    excavate: false,
                  }}
                />
              </div>
              <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>{qrModal.name}</p>
              <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
                Этот QR-код — персональный ключ доступа. Не передавайте третьим лицам.
              </p>
              <div className="p-3 rounded-lg mb-4 font-mono text-xs break-all"
                style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-dim)", border: "1px solid rgba(42,64,96,0.6)" }}>
                {qrModal.token}
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 py-2.5 rounded text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                  onClick={() => {
                    // Скачать QR как PNG через canvas
                    const svg = document.querySelector(".avesta-qr-download svg") as SVGElement;
                    if (svg) {
                      const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `QR_АВЕСТА_${qrModal.name}.svg`; a.click();
                      URL.revokeObjectURL(url);
                    } else {
                      // fallback: скопировать токен
                      navigator.clipboard?.writeText(qrModal.token);
                      showMsg("Токен скопирован в буфер", "ok");
                    }
                  }}>
                  <Icon name="Download" size={14} fallback="Download" />
                  Скачать QR
                </button>
                <button
                  className="flex-1 py-2.5 rounded text-sm"
                  style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}
                  onClick={() => { navigator.clipboard?.writeText(qrModal.token); showMsg("Токен скопирован", "ok"); }}>
                  Копировать токен
                </button>
              </div>
              {/* Скрытый QR для скачивания */}
              <div className="avesta-qr-download hidden">
                <QRCodeSVG value={qrModal.token} size={400} level="H" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Index() {
  const [user, setUser]           = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [authLoading, setAuthLoading] = useState(true);

  const [section, setSection]         = useState<Section>("upload");
  const [files, setFiles]             = useState<File[]>([]);
  const [isDragging, setIsDragging]   = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [processing, setProcessing]   = useState(false);
  const [progress, setProgress]       = useState(0);
  const [progressStep, setProgressStep] = useState(0);
  const [, setBatchId]                = useState<number | null>(null);
  const [cards, setCards]             = useState<SoutCard[]>([]);
  const [batches, setBatches]         = useState<Batch[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [resultTab, setResultTab]     = useState<"danger"|"safe">("danger");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check saved session
  useEffect(() => {
    const sid = localStorage.getItem("avesta_sid");
    if (!sid) { setAuthLoading(false); return; }
    fetch(API.auth, { headers: { "X-Session-Id": sid } })
      .then(r => r.json())
      .then(d => {
        if (d.id) { setUser(d); setSessionId(sid); }
        setAuthLoading(false);
      })
      .catch(() => setAuthLoading(false));
  }, []);

  const handleLogin = (u: User, sid: string) => { setUser(u); setSessionId(sid); };

  const handleLogout = async () => {
    await fetch(`${API.auth}/logout`, { method: "POST", headers: { "X-Session-Id": sessionId } });
    localStorage.removeItem("avesta_sid");
    setUser(null); setSessionId("");
  };

  const authHeaders = { "Content-Type": "application/json", "X-Session-Id": sessionId };

  const dangerCards = cards.filter(c => c.is_dangerous);
  const safeCards   = cards.filter(c => !c.is_dangerous);
  const filteredDanger = dangerCards.filter(r =>
    r.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.organization.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.department.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredSafe = safeCards.filter(r =>
    r.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.organization.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const res = await fetch(API.upload, { headers: authHeaders });
    const data = await res.json();
    setBatches(Array.isArray(data) ? data : []);
    setLoadingHistory(false);
  }, [sessionId]);

  const loadResults = useCallback(async (bid?: number) => {
    setLoadingResults(true);
    const url = bid ? `${API.results}?batch_id=${bid}` : API.results;
    const res = await fetch(url, { headers: authHeaders });
    const data = await res.json();
    setCards(data.cards || []);
    setLoadingResults(false);
  }, [sessionId]);

  useEffect(() => {
    if (!user) return;
    if (section === "history") loadHistory();
    if (section === "results") loadResults(activeBatchId ?? undefined);
    if (section === "analytics") loadResults();
  }, [section, user, loadHistory, loadResults, activeBatchId]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };
  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const startUploadAndProcess = async () => {
    if (!files.length) return;
    setUploadError(""); setUploading(true); setSection("processing");
    setProgress(5); setProgressStep(0);
    try {
      const filesPayload = await Promise.all(
        files.map(async f => ({ name: f.name, data_b64: await toBase64(f), size: f.size }))
      );
      setProgress(20); setProgressStep(1);
      const batchName = files.length === 1 ? files[0].name : `Пакет ${new Date().toLocaleDateString("ru-RU")} (${files.length} файлов)`;
      const uploadRes = await fetch(API.upload, {
        method: "POST", headers: authHeaders, body: JSON.stringify({ files: filesPayload, batch_name: batchName }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Ошибка загрузки");
      const newBatchId: number = uploadData.batch_id;
      setBatchId(newBatchId); setProgress(40); setProgressStep(2);
      setUploading(false); setProcessing(true);
      const processRes = await fetch(API.process, {
        method: "POST", headers: authHeaders, body: JSON.stringify({ batch_id: newBatchId }),
      });
      if (!processRes.ok) { const pd = await processRes.json(); throw new Error(pd.error || "Ошибка обработки"); }
      setProgress(55); setProgressStep(3);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const statusRes = await fetch(`${API.process}?batch_id=${newBatchId}`);
        const statusData = await statusRes.json();
        const mapped = 55 + Math.round((statusData.progress ?? 0) * 0.45);
        setProgress(Math.min(mapped, 99));
        if (statusData.status === "done" || (statusData.progress ?? 0) >= 100) {
          clearInterval(pollRef.current!);
          setProgress(100); setProgressStep(5); setProcessing(false);
          setActiveBatchId(newBatchId);
          await loadResults(newBatchId);
          setTimeout(() => setSection("results"), 800);
        }
      }, 1500);
    } catch (err: unknown) {
      setUploading(false); setProcessing(false);
      setUploadError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setSection("upload");
    }
  };

  const handleExport = async (direction: "all"|"danger"|"safe") => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams({ direction });
      if (activeBatchId) params.set("batch_id", String(activeBatchId));
      const res = await fetch(`${API.export}?${params.toString()}`, { headers: authHeaders });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = new Date().toLocaleDateString("ru-RU").replace(/\./g, "-");
        a.download = `АВЕСТА_${{ all: "Реестр", danger: "Направление1_Опасные", safe: "Направление2_Допустимые" }[direction]}_СОУТ_${date}.xlsx`;
        a.click(); URL.revokeObjectURL(url);
      } else { exportLocalXlsx(direction); }
    } catch { exportLocalXlsx(direction); }
    setExportLoading(false);
  };

  const exportLocalXlsx = (direction: "all"|"danger"|"safe") => {
    const wb = XLSX.utils.book_new();
    if (direction === "all" || direction === "danger") {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dangerCards.map(r => ({
        "Организация": r.organization, "Подразделение": r.department, "ФИО": r.worker_name,
        "Должность": r.position, "Факторы": r.factors.map(f => `${f.code} ${f.name}`).join("; "),
        "Расшифровка": r.factors.map(f => `[${f.code}] ${f.name}: ${f.description}`).join(" | "),
        "Дата СОУТ": r.sout_date,
      }))), "Направление №1 — Опасные");
    }
    if (direction === "all" || direction === "safe") {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeCards.map(r => ({
        "Организация": r.organization, "Подразделение": r.department,
        "ФИО": r.worker_name, "Должность": r.position, "Дата СОУТ": r.sout_date,
      }))), "Направление №2 — Допустимые");
    }
    XLSX.writeFile(wb, `АВЕСТА_СОУТ_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`);
  };

  // ── Loading / Auth check ──
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--navy-deep)" }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-light))" }}>
            <span className="font-heading font-black text-lg" style={{ color: "var(--navy-deep)" }}>А</span>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const visibleNav = NAV_ITEMS.filter(n => !n.adminOnly || user.role === "admin");

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--navy-deep)" }}>
      {/* Sidebar */}
      <aside className="flex flex-col transition-all duration-300 flex-shrink-0"
        style={{ width: sidebarOpen ? "240px" : "60px", background: "var(--navy-deep)", borderRight: "1px solid rgba(42,64,96,0.6)" }}>
        <div className="flex items-center gap-3 px-4 py-5" style={{ borderBottom: "1px solid rgba(42,64,96,0.5)" }}>
          <div className="flex-shrink-0 flex items-center justify-center rounded"
            style={{ width: 32, height: 32, background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)" }}>
            <span className="font-heading font-black text-xs" style={{ color: "var(--navy-deep)" }}>А</span>
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in">
              <div className="font-heading font-bold text-sm tracking-widest" style={{ color: "var(--gold-light)" }}>АВЕСТА</div>
              <div style={{ color: "var(--text-dim)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>Анализ карт СОУТ</div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {visibleNav.map(item => (
            <div key={item.id}
              className={`nav-item ${section === item.id ? "active" : ""} ${item.adminOnly ? "mt-2" : ""}`}
              onClick={() => setSection(item.id)}
              title={!sidebarOpen ? item.label : undefined}
              style={item.adminOnly ? { borderTop: "1px solid rgba(42,64,96,0.4)", paddingTop: 12, marginTop: 8 } : {}}>
              <Icon name={item.icon} size={17} fallback="Circle"
                style={item.adminOnly && section !== item.id ? { color: "var(--gold)" } : {}} />
              {sidebarOpen && <span style={item.adminOnly ? { color: section === item.id ? undefined : "var(--gold)" } : {}}>{item.label}</span>}
            </div>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="px-3 pb-3" style={{ borderTop: "1px solid rgba(42,64,96,0.5)" }}>
          {sidebarOpen ? (
            <div className="pt-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
                  style={{ background: "var(--gold)", color: "var(--navy-deep)" }}>
                  {(user.full_name || user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{user.full_name || user.email}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-dim)", fontSize: "0.6rem" }}>{user.role === "admin" ? "Администратор" : "Пользователь"}</p>
                </div>
              </div>
              <button onClick={handleLogout}
                className="nav-item w-full text-xs"
                style={{ color: "var(--text-dim)", justifyContent: "flex-start" }}>
                <Icon name="LogOut" size={14} fallback="LogOut" />
                <span>Выйти</span>
              </button>
            </div>
          ) : (
            <div className="pt-3 flex flex-col gap-1">
              <button className="nav-item w-full justify-center" onClick={() => setSidebarOpen(true)}>
                <Icon name="LogOut" size={14} fallback="LogOut" />
              </button>
            </div>
          )}
          <button className="nav-item w-full justify-center mt-1" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Icon name={sidebarOpen ? "PanelLeftClose" : "PanelLeftOpen"} size={17} fallback="Menu" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(42,64,96,0.5)", background: "rgba(10,22,40,0.6)" }}>
          <div>
            <h1 className="font-heading font-semibold text-base" style={{ color: "var(--text-primary)" }}>
              {visibleNav.find(n => n.id === section)?.label}
            </h1>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Специальная оценка условий труда · 426-ФЗ</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
              style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>
              <Icon name="Database" size={13} fallback="Database" /><span>БД: активна</span>
            </div>
            {activeBatchId && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                style={{ background: "rgba(200,149,42,0.15)", color: "var(--gold)" }}>
                <Icon name="CheckCircle" size={13} fallback="Check" /><span>Пакет #{activeBatchId}</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs cursor-pointer"
              style={{ background: "rgba(42,64,96,0.3)", color: "var(--text-secondary)" }}
              onClick={handleLogout}>
              <Icon name="LogOut" size={13} fallback="LogOut" />
              <span>Выйти</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ADMIN */}
          {section === "admin" && user.role === "admin" && (
            <AdminPanel sessionId={sessionId} currentUser={user} />
          )}

          {/* UPLOAD */}
          {section === "upload" && (
            <div className="max-w-3xl mx-auto animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-xl mb-1" style={{ color: "var(--text-primary)" }}>Загрузка карт СОУТ</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Поддерживаются форматы PDF, XLSX, XLS, DOC, DOCX, ZIP, RAR. Пакетная загрузка до 500 МБ.</p>
              </div>
              {uploadError && (
                <div className="mb-4 p-4 rounded-lg flex items-center gap-3"
                  style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)" }}>
                  <Icon name="AlertCircle" size={16} fallback="Alert" style={{ color: "#E74C3C" }} />
                  <p className="text-sm flex-1" style={{ color: "#E74C3C" }}>{uploadError}</p>
                  <button onClick={() => setUploadError("")}><Icon name="X" size={14} fallback="X" style={{ color: "#E74C3C" }} /></button>
                </div>
              )}
              <div className={`drop-zone rounded-lg p-12 text-center cursor-pointer mb-6 ${isDragging ? "active" : ""}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}>
                <input id="file-input" type="file" multiple className="hidden"
                  accept=".pdf,.xlsx,.xls,.doc,.docx,.zip,.rar" onChange={handleFileInput} />
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: "rgba(200,149,42,0.1)", border: "1px solid rgba(200,149,42,0.25)" }}>
                  <Icon name="CloudUpload" size={26} fallback="Upload" style={{ color: "var(--gold)" }} />
                </div>
                <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>Перетащите файлы или нажмите для выбора</p>
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>PDF, XLSX, DOC, ZIP — одиночные файлы и архивы</p>
              </div>
              {files.length > 0 && (
                <div className="glass-card overflow-hidden mb-6">
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: "1px solid rgba(42,64,96,0.5)" }}>
                    <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Загружено: {files.length} файл(а)</span>
                    <button className="text-xs px-2 py-1 rounded"
                      style={{ color: "var(--text-dim)", background: "rgba(42,64,96,0.3)" }}
                      onClick={() => setFiles([])}>Очистить всё</button>
                  </div>
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: "1px solid rgba(42,64,96,0.2)" }}>
                      <Icon name={getFileIcon(file.name)} size={16} fallback="File" style={{ color: "var(--gold)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{file.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-dim)" }}>{formatBytes(file.size)}</p>
                      </div>
                      <button onClick={() => removeFile(idx)} style={{ color: "var(--text-dim)" }}>
                        <Icon name="X" size={14} fallback="X" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { icon: "FileCheck", label: "Форматы", value: "PDF, XLSX, DOC, ZIP" },
                  { icon: "ShieldCheck", label: "Валидация", value: "Автоматическая" },
                  { icon: "Layers", label: "Пакетная загрузка", value: "До 500 МБ" },
                ].map(item => (
                  <div key={item.label} className="glass-card p-4 flex items-start gap-3">
                    <Icon name={item.icon} size={18} fallback="Info" style={{ color: "var(--gold)", marginTop: 2 }} />
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: "var(--text-dim)" }}>{item.label}</p>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200"
                style={{
                  background: files.length > 0 ? "linear-gradient(90deg, var(--gold), var(--gold-light))" : "rgba(42,64,96,0.5)",
                  color: files.length > 0 ? "var(--navy-deep)" : "var(--text-dim)",
                  cursor: files.length > 0 ? "pointer" : "not-allowed",
                }}
                disabled={files.length === 0 || uploading}
                onClick={startUploadAndProcess}>
                {uploading ? "Загрузка..." : "Загрузить и обработать карты СОУТ"}
              </button>
            </div>
          )}

          {/* PROCESSING */}
          {section === "processing" && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <div className="glass-card p-8 text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ background: "rgba(200,149,42,0.1)", border: "2px solid rgba(200,149,42,0.3)" }}>
                  <Icon name="Cpu" size={32} fallback="Cpu" style={{ color: "var(--gold)" }} />
                </div>
                <h2 className="font-heading font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>
                  {processing || uploading ? "Обработка карт СОУТ..." : "Обработка завершена"}
                </h2>
                <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
                  {processing || uploading ? "Извлечение данных, классификация факторов, сохранение в базу данных" : "Все карты обработаны и сохранены в БД"}
                </p>
                <div className="mb-6">
                  <div className="flex justify-between text-xs mb-2" style={{ color: "var(--text-dim)" }}>
                    <span>Прогресс</span><span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.5)" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--gold), var(--gold-light))" }} />
                  </div>
                </div>
                <div className="space-y-3 text-left">
                  {STEPS.map((label, idx) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{
                          background: progressStep > idx ? "rgba(200,149,42,0.15)" : "rgba(42,64,96,0.4)",
                          border: `1px solid ${progressStep > idx ? "var(--gold)" : "rgba(42,64,96,0.6)"}`,
                        }}>
                        {progressStep > idx
                          ? <Icon name="Check" size={11} fallback="Check" style={{ color: "var(--gold)" }} />
                          : <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--steel)" }} />}
                      </div>
                      <span className="text-sm" style={{ color: progressStep > idx ? "var(--text-primary)" : "var(--text-dim)" }}>{label}</span>
                    </div>
                  ))}
                </div>
                {progress === 100 && (
                  <button className="mt-8 w-full py-3 rounded-lg font-semibold text-sm"
                    style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                    onClick={() => setSection("results")}>
                    Перейти к результатам
                  </button>
                )}
              </div>
            </div>
          )}

          {/* RESULTS */}
          {section === "results" && (
            <div className="animate-fade-in">
              <div className="grid grid-cols-4 gap-4 mb-6 stagger">
                {[
                  { label: "Всего обработано",    value: cards.length,       icon: "Users",         color: "var(--gold)" },
                  { label: "С опасными факторами", value: dangerCards.length, icon: "AlertTriangle", color: "#E74C3C" },
                  { label: "Без опасных факторов", value: safeCards.length,   icon: "ShieldCheck",   color: "#2ECC71" },
                  { label: "Пакет",               value: activeBatchId ? `#${activeBatchId}` : "—", icon: "FolderOpen", color: "var(--text-secondary)" },
                ].map(stat => (
                  <div key={stat.label} className="glass-card p-4 animate-fade-in">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{stat.label}</p>
                      <Icon name={stat.icon} size={16} fallback="Info" style={{ color: stat.color }} />
                    </div>
                    <p className="font-heading font-bold text-2xl" style={{ color: stat.color }}>{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <div className="flex rounded-lg p-1 gap-1" style={{ background: "rgba(42,64,96,0.3)" }}>
                  {(["danger", "safe"] as const).map(t => (
                    <button key={t} className="px-4 py-2 rounded text-sm font-medium transition-all"
                      style={{
                        background: resultTab === t ? (t === "danger" ? "rgba(192,57,43,0.2)" : "rgba(26,122,74,0.2)") : "transparent",
                        color: resultTab === t ? (t === "danger" ? "#E74C3C" : "#2ECC71") : "var(--text-secondary)",
                        border: resultTab === t ? `1px solid ${t === "danger" ? "rgba(192,57,43,0.3)" : "rgba(26,122,74,0.3)"}` : "1px solid transparent",
                      }}
                      onClick={() => setResultTab(t)}>
                      <span className="flex items-center gap-2">
                        <Icon name={t === "danger" ? "AlertTriangle" : "ShieldCheck"} size={14} fallback="Info" />
                        {t === "danger" ? `Направление №1 — Опасные (${dangerCards.length})` : `Направление №2 — Допустимые (${safeCards.length})`}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded"
                  style={{ background: "rgba(42,64,96,0.3)", border: "1px solid rgba(42,64,96,0.5)" }}>
                  <Icon name="Search" size={14} fallback="Search" style={{ color: "var(--text-dim)" }} />
                  <input className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text-primary)" }}
                    placeholder="Поиск по ФИО, организации..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
                  style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                  onClick={() => handleExport("all")} disabled={exportLoading}>
                  <Icon name="Download" size={15} fallback="Download" />{exportLoading ? "Формирую..." : "Экспорт Excel"}
                </button>
              </div>
              {loadingResults ? (
                <div className="flex items-center justify-center py-16" style={{ color: "var(--text-dim)" }}>
                  <Icon name="Loader" size={22} fallback="Loader" style={{ marginRight: 8 }} />Загрузка данных...
                </div>
              ) : (
                <div className="glass-card overflow-hidden">
                  <table className="data-table w-full">
                    <thead><tr>
                      <th style={{ textAlign: "left" }}>Организация / Подразделение</th>
                      <th style={{ textAlign: "left" }}>ФИО работника</th>
                      <th style={{ textAlign: "left" }}>Должность</th>
                      {resultTab === "danger" && <th style={{ textAlign: "left" }}>Опасные факторы</th>}
                      <th style={{ textAlign: "left" }}>Дата СОУТ</th>
                      <th style={{ textAlign: "left" }}>Статус</th>
                    </tr></thead>
                    <tbody>
                      {(resultTab === "danger" ? filteredDanger : filteredSafe).length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>
                          {cards.length === 0 ? "Загрузите и обработайте карты СОУТ" : "Нет записей по фильтру"}
                        </td></tr>
                      ) : (resultTab === "danger" ? filteredDanger : filteredSafe).map(row => (
                        <>
                          <tr key={row.id} style={{ cursor: "pointer" }} onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                            <td>
                              <div className="font-medium" style={{ color: "var(--text-primary)", fontSize: "0.8rem" }}>{row.organization}</div>
                              <div style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{row.department}</div>
                            </td>
                            <td style={{ fontWeight: 500 }}>{row.worker_name}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{row.position}</td>
                            {resultTab === "danger" && (
                              <td><div className="flex flex-wrap gap-1">
                                {row.factors.map(f => <span key={f.code} className="badge-danger px-2 py-0.5 rounded text-xs">{f.code} · {f.name}</span>)}
                              </div></td>
                            )}
                            <td style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{row.sout_date}</td>
                            <td>
                              {row.is_dangerous
                                ? <span className="badge-danger px-2 py-1 rounded text-xs">Вредные</span>
                                : <span className="badge-safe px-2 py-1 rounded text-xs">Допустимые</span>}
                            </td>
                          </tr>
                          {expandedRow === row.id && resultTab === "danger" && row.factors.length > 0 && (
                            <tr key={`${row.id}-exp`}>
                              <td colSpan={6} style={{ background: "rgba(42,64,96,0.12)", padding: 0 }}>
                                <div className="px-6 py-4">
                                  <p className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: "var(--gold)" }}>Расшифровка вредных факторов</p>
                                  <div className="grid grid-cols-2 gap-3">
                                    {row.factors.map(f => (
                                      <div key={f.code} className="p-3 rounded"
                                        style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.2)", borderLeft: "3px solid #E74C3C" }}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-bold" style={{ color: "#E74C3C" }}>Класс {f.code}</span>
                                          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{f.name}</span>
                                        </div>
                                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{f.description}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* HISTORY */}
          {section === "history" && (
            <div className="animate-fade-in">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>История обработок</h2>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Все обработанные пакеты карт СОУТ из базы данных</p>
                </div>
                <button className="flex items-center gap-2 px-3 py-2 rounded text-sm"
                  style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }} onClick={loadHistory}>
                  <Icon name="RefreshCw" size={14} fallback="Refresh" />Обновить
                </button>
              </div>
              <div className="glass-card overflow-hidden">
                <table className="data-table w-full">
                  <thead><tr>
                    <th style={{ textAlign: "left" }}>Наименование пакета</th>
                    <th style={{ textAlign: "left" }}>Дата обработки</th>
                    <th style={{ textAlign: "left" }}>Файлов</th>
                    <th style={{ textAlign: "left" }}>С факторами</th>
                    <th style={{ textAlign: "left" }}>Без факторов</th>
                    <th style={{ textAlign: "left" }}>Статус</th>
                    <th style={{ textAlign: "left" }}>Действия</th>
                  </tr></thead>
                  <tbody>
                    {loadingHistory ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>Загрузка...</td></tr>
                    ) : batches.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>История пуста</td></tr>
                    ) : batches.map(batch => (
                      <tr key={batch.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Icon name="FileText" size={14} fallback="File" style={{ color: "var(--gold)" }} />
                            <span style={{ color: "var(--text-primary)", fontSize: "0.85rem" }}>{batch.name}</span>
                          </div>
                        </td>
                        <td style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{fmtDate(batch.created_at)}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{batch.total_files}</td>
                        <td><span className="badge-danger px-2 py-0.5 rounded text-xs">{batch.danger_count ?? 0}</span></td>
                        <td><span className="badge-safe px-2 py-0.5 rounded text-xs">{batch.safe_count ?? 0}</span></td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs ${batch.status === "done" ? "badge-safe" : "badge-pending"}`}>
                            {batch.status === "done" ? "Завершено" : batch.status === "processing" ? "Обрабатывается" : "Ожидает"}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button className="text-xs px-2 py-1 rounded"
                              style={{ background: "rgba(200,149,42,0.1)", color: "var(--gold)" }}
                              onClick={() => { setActiveBatchId(batch.id); setSection("results"); }}>Просмотр</button>
                            <button className="text-xs px-2 py-1 rounded"
                              style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}
                              onClick={() => { setActiveBatchId(batch.id); handleExport("all"); }}>Excel</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EXPORT */}
          {section === "export" && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>Экспорт данных</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Выгрузка реестра работников в Excel. {activeBatchId ? `Активный пакет: #${activeBatchId}` : "Данные из всей базы"}
                </p>
              </div>
              <div className="space-y-4 mb-6">
                {[
                  { icon: "FileSpreadsheet", title: "Полный реестр СОУТ", desc: "Оба направления на отдельных листах с полной детализацией", badge: "Рекомендуется", badgeColor: "var(--gold)", dir: "all" as const },
                  { icon: "AlertTriangle", title: "Направление №1 — Опасные факторы", desc: "Только вредные условия. Полная расшифровка каждого фактора", badge: `${dangerCards.length} записей`, badgeColor: "#E74C3C", dir: "danger" as const },
                  { icon: "ShieldCheck", title: "Направление №2 — Допустимые условия", desc: "Работники без вредных факторов (класс 1 и 2)", badge: `${safeCards.length} записей`, badgeColor: "#2ECC71", dir: "safe" as const },
                ].map(opt => (
                  <div key={opt.title} className="glass-card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(200,149,42,0.1)" }}>
                      <Icon name={opt.icon} size={22} fallback="File" style={{ color: "var(--gold)" }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>{opt.title}</p>
                        <span className="text-xs px-2 py-0.5 rounded"
                          style={{ background: `${opt.badgeColor}22`, color: opt.badgeColor, border: `1px solid ${opt.badgeColor}44` }}>
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{opt.desc}</p>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium flex-shrink-0"
                      style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                      onClick={() => handleExport(opt.dir)} disabled={exportLoading}>
                      <Icon name="Download" size={14} fallback="Download" />{exportLoading ? "..." : "Скачать"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REFERENCE */}
          {section === "reference" && (
            <div className="animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>Справочник факторов СОУТ</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Классификатор по Приказу Минтруда № 33н</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(FACTOR_CODES).map(([code, name]) => (
                  <div key={code} className="glass-card p-4 flex gap-4 items-start">
                    <div className="w-12 h-8 rounded flex items-center justify-center flex-shrink-0 font-mono font-bold text-xs"
                      style={{ background: "rgba(192,57,43,0.15)", color: "#E74C3C", border: "1px solid rgba(192,57,43,0.3)" }}>{code}</div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>Вредный фактор · Класс {code[0]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ANALYTICS */}
          {section === "analytics" && (
            <div className="animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>Аналитика СОУТ</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Сводная статистика по всем обработанным картам</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="glass-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>Распределение по классам</p>
                  {[
                    { label: "Вредные условия (класс 3)", value: dangerCards.length, color: "#E74C3C" },
                    { label: "Допустимые условия (класс 2)", value: safeCards.length, color: "#2ECC71" },
                  ].map(bar => (
                    <div key={bar.label} className="mb-4">
                      <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
                        <span>{bar.label}</span>
                        <span>{bar.value} ({cards.length ? Math.round(bar.value / cards.length * 100) : 0}%)</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                        <div className="h-full rounded-full" style={{ width: cards.length ? `${(bar.value / cards.length) * 100}%` : "0%", background: bar.color }} />
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && <p className="text-center text-xs mt-4" style={{ color: "var(--text-dim)" }}>Загрузите карты СОУТ</p>}
                </div>
                <div className="glass-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>Топ вредных факторов</p>
                  {(() => {
                    const fc: Record<string, { name: string; count: number }> = {};
                    dangerCards.forEach(c => c.factors.forEach(f => { if (!fc[f.code]) fc[f.code] = { name: f.name, count: 0 }; fc[f.code].count++; }));
                    const sorted = Object.entries(fc).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
                    const max = sorted[0]?.[1].count || 1;
                    return sorted.length === 0 ? <p className="text-center text-xs" style={{ color: "var(--text-dim)" }}>Нет данных</p>
                      : sorted.map(([code, info], idx) => (
                        <div key={code} className="flex items-center gap-3 mb-3">
                          <span className="text-xs font-bold w-5" style={{ color: "var(--text-dim)" }}>{idx + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                              <span>{code} · {info.name}</span><span>{info.count}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                              <div className="h-full rounded-full" style={{ width: `${(info.count / max) * 100}%`, background: "var(--gold)" }} />
                            </div>
                          </div>
                        </div>
                      ));
                  })()}
                </div>
                <div className="glass-card p-5 col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>Сводка по организациям</p>
                  {(() => {
                    const orgs: Record<string, { total: number; danger: number }> = {};
                    cards.forEach(c => { if (!orgs[c.organization]) orgs[c.organization] = { total: 0, danger: 0 }; orgs[c.organization].total++; if (c.is_dangerous) orgs[c.organization].danger++; });
                    const sorted = Object.entries(orgs).sort((a, b) => b[1].total - a[1].total);
                    return sorted.length === 0 ? <p className="text-center text-xs py-6" style={{ color: "var(--text-dim)" }}>Загрузите карты СОУТ</p>
                      : <table className="data-table w-full">
                        <thead><tr>
                          <th style={{ textAlign: "left" }}>Организация</th>
                          <th style={{ textAlign: "left" }}>Работников</th>
                          <th style={{ textAlign: "left" }}>С вредными</th>
                          <th style={{ textAlign: "left" }}>Доля</th>
                        </tr></thead>
                        <tbody>
                          {sorted.map(([org, stat]) => (
                            <tr key={org}>
                              <td style={{ color: "var(--text-primary)" }}>{org}</td>
                              <td>{stat.total}</td>
                              <td><span className="badge-danger px-2 py-0.5 rounded text-xs">{stat.danger}</span></td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                                    <div className="h-full rounded-full" style={{ width: `${(stat.danger / stat.total) * 100}%`, background: "#E74C3C" }} />
                                  </div>
                                  <span className="text-xs" style={{ color: "var(--text-dim)" }}>{Math.round(stat.danger / stat.total * 100)}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>;
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {section === "settings" && (
            <div className="max-w-xl animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>Настройки</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Параметры вашего аккаунта и системы</p>
              </div>
              <div className="glass-card p-5 mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>Мой аккаунт</p>
                {[
                  { label: "Email", value: user.email },
                  { label: "ФИО", value: user.full_name || "—" },
                  { label: "Роль", value: user.role === "admin" ? "Администратор" : "Пользователь" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: "1px solid rgba(42,64,96,0.3)" }}>
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{item.value}</span>
                  </div>
                ))}
                <button className="mt-4 flex items-center gap-2 px-4 py-2 rounded text-sm"
                  style={{ background: "rgba(192,57,43,0.1)", color: "#E74C3C", border: "1px solid rgba(192,57,43,0.2)" }}
                  onClick={handleLogout}>
                  <Icon name="LogOut" size={14} fallback="LogOut" />Выйти из системы
                </button>
              </div>
              {[
                { section: "Обработка", items: [
                  { label: "Автоматическое сохранение в БД", value: "Включено" },
                  { label: "Язык распознавания", value: "Русский" },
                  { label: "Классификация факторов", value: "По Приказу № 33н" },
                ]},
                { section: "Экспорт", items: [
                  { label: "Формат по умолчанию", value: "XLSX" },
                  { label: "Расшифровка факторов", value: "Включена" },
                ]},
              ].map(group => (
                <div key={group.section} className="glass-card p-5 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>{group.section}</p>
                  {group.items.map(item => (
                    <div key={item.label} className="flex items-center justify-between py-2.5"
                      style={{ borderBottom: "1px solid rgba(42,64,96,0.3)" }}>
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                      <span className="text-xs font-medium px-3 py-1 rounded"
                        style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-primary)" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

        </div>

        <div className="px-6 py-2 flex items-center justify-between text-xs flex-shrink-0"
          style={{ borderTop: "1px solid rgba(42,64,96,0.4)", color: "var(--text-dim)" }}>
          <span>АВЕСТА v1.0 — {user.full_name || user.email} ({user.role === "admin" ? "Администратор" : "Пользователь"})</span>
          <span>Федеральный закон 426-ФЗ «О специальной оценке условий труда»</span>
        </div>
      </main>
    </div>
  );
}