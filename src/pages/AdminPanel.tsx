import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const ADMIN_URL = "https://functions.poehali.dev/2aa77a7f-e362-4571-90dd-33ce54ee2b76";

interface User { id: number; email: string; full_name: string; role: string; is_active: boolean; created_at: string; last_login_at: string | null; }
interface Stats { users_count: number; batches_count: number; cards_count: number; danger_count: number; safe_count: number; files_count: number; active_sessions: number; }
interface CurrentUser { id: number; email: string; full_name: string; role: string; }

interface Props {
  sessionId: string;
  currentUser: CurrentUser;
  onBack: () => void;
  onLogout: () => void;
}

type AdminTab = "stats" | "users" | "database" | "settings";

function ConfirmModal({ title, message, danger, onConfirm, onCancel }: {
  title: string; message: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="glass-card p-6 max-w-sm w-full mx-4 animate-scale-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: danger ? "rgba(192,57,43,0.15)" : "rgba(200,149,42,0.15)" }}>
            <Icon name={danger ? "AlertTriangle" : "Info"} size={20} fallback="Alert"
              style={{ color: danger ? "#E74C3C" : "var(--gold)" }} />
          </div>
          <h3 className="font-heading font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded text-sm font-medium"
            style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>
            Отмена
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded text-sm font-medium"
            style={{ background: danger ? "#C0392B" : "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "#fff" }}>
            {danger ? "Удалить" : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel({ sessionId, currentUser, onBack, onLogout }: Props) {
  const [tab, setTab] = useState<AdminTab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState<"ok" | "err">("ok");
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null);

  // New user form
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [formError, setFormError] = useState("");

  // Edit user
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editActive, setEditActive] = useState(true);
  const [editPass, setEditPass] = useState("");

  const headers = { "Content-Type": "application/json", "X-Session-Id": sessionId };

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(""), 3500);
  };

  const apiFetch = useCallback(async (path: string, method = "GET", body?: object) => {
    const opts: RequestInit = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${ADMIN_URL}/${path}`, opts);
    return res.json();
  }, [sessionId]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch("stats");
    setStats(data);
    setLoading(false);
  }, [apiFetch]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch("users");
    setUsers(data.users || []);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => {
    if (tab === "stats") loadStats();
    if (tab === "users") loadUsers();
  }, [tab, loadStats, loadUsers]);

  const createUser = async () => {
    setFormError("");
    if (!newEmail || !newPass || !newName) { setFormError("Все поля обязательны"); return; }
    const data = await apiFetch("users", "POST", { email: newEmail, password: newPass, full_name: newName, role: newRole });
    if (data.error) { setFormError(data.error); return; }
    showToast("Пользователь создан");
    setNewEmail(""); setNewName(""); setNewPass(""); setNewRole("user");
    loadUsers();
  };

  const saveEditUser = async () => {
    if (!editId) return;
    const body: Record<string, unknown> = { id: editId, full_name: editName, role: editRole, is_active: editActive };
    if (editPass) body.password = editPass;
    const data = await apiFetch("users", "PUT", body);
    if (data.error) { showToast(data.error, "err"); return; }
    showToast("Данные обновлены");
    setEditId(null); setEditPass("");
    loadUsers();
  };

  const clearData = async (type: "results" | "history" | "all") => {
    const data = await apiFetch(`clear/${type}`, "POST");
    if (data.error) { showToast(data.error, "err"); return; }
    const msgs: Record<string, string> = {
      results: `Результаты очищены (удалено карт: ${data.deleted_cards})`,
      history: `История очищена (удалено пакетов: ${data.deleted_batches})`,
      all: data.message || "База данных СОУТ полностью очищена",
    };
    showToast(msgs[type]);
    loadStats();
  };

  const fmtDate = (s: string | null) => {
    if (!s) return "—";
    try { return new Date(s).toLocaleString("ru-RU"); } catch { return s; }
  };

  const TABS: { id: AdminTab; label: string; icon: string }[] = [
    { id: "stats",    label: "Сводка",        icon: "BarChart3" },
    { id: "users",    label: "Пользователи",  icon: "Users" },
    { id: "database", label: "База данных",   icon: "Database" },
    { id: "settings", label: "Настройки",     icon: "Settings" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--navy-deep)" }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium animate-fade-in"
          style={{
            background: toastType === "ok" ? "rgba(26,122,74,0.2)" : "rgba(192,57,43,0.2)",
            border: `1px solid ${toastType === "ok" ? "rgba(46,204,113,0.4)" : "rgba(192,57,43,0.4)"}`,
            color: toastType === "ok" ? "#2ECC71" : "#E74C3C",
          }}>
          <Icon name={toastType === "ok" ? "CheckCircle" : "XCircle"} size={15} fallback="Check" />
          {toast}
        </div>
      )}
      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} danger
          onConfirm={() => { confirm.action(); setConfirm(null); }}
          onCancel={() => setConfirm(null)} />
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(42,64,96,0.5)", background: "rgba(10,22,40,0.8)" }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm"
            style={{ color: "var(--text-secondary)" }}>
            <Icon name="ArrowLeft" size={16} fallback="Arrow" />
            К системе
          </button>
          <div style={{ width: 1, height: 20, background: "rgba(42,64,96,0.6)" }} />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}>А</div>
            <span className="font-heading font-semibold text-sm" style={{ color: "var(--gold-light)" }}>АВЕСТА</span>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(192,57,43,0.15)", color: "#E74C3C", border: "1px solid rgba(192,57,43,0.3)" }}>
              ADMIN
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{currentUser.full_name}</span>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
            style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>
            <Icon name="LogOut" size={13} fallback="Logout" />
            Выйти
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex flex-col flex-shrink-0"
          style={{ width: 200, borderRight: "1px solid rgba(42,64,96,0.5)", background: "rgba(10,22,40,0.4)", paddingTop: 16 }}>
          <p className="px-4 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-dim)" }}>
            Администрирование
          </p>
          {TABS.map(t => (
            <div key={t.id} className={`nav-item mx-2 ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={16} fallback="Circle" />
              <span>{t.label}</span>
            </div>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">

          {/* ===== STATS ===== */}
          {tab === "stats" && (
            <div className="animate-fade-in">
              <h2 className="font-heading font-semibold text-lg mb-6" style={{ color: "var(--text-primary)" }}>Сводная статистика системы</h2>
              {loading ? (
                <div className="flex items-center gap-2 py-8" style={{ color: "var(--text-dim)" }}>
                  <Icon name="Loader" size={18} fallback="Loader" />Загрузка...
                </div>
              ) : stats ? (
                <>
                  <div className="grid grid-cols-4 gap-4 mb-6 stagger">
                    {[
                      { label: "Пользователей",    value: stats.users_count,    icon: "Users",         color: "var(--gold)" },
                      { label: "Пакетов СОУТ",      value: stats.batches_count,  icon: "FolderOpen",    color: "var(--text-secondary)" },
                      { label: "Карт обработано",   value: stats.cards_count,    icon: "FileText",      color: "var(--gold)" },
                      { label: "Активных сессий",   value: stats.active_sessions,icon: "Activity",      color: "#2ECC71" },
                    ].map(s => (
                      <div key={s.label} className="glass-card p-4 animate-fade-in">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-xs" style={{ color: "var(--text-dim)" }}>{s.label}</p>
                          <Icon name={s.icon} size={15} fallback="Info" style={{ color: s.color }} />
                        </div>
                        <p className="font-heading font-bold text-2xl" style={{ color: s.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "С вредными условиями", value: stats.danger_count, color: "#E74C3C", bg: "rgba(192,57,43,0.1)" },
                      { label: "Допустимые условия",   value: stats.safe_count,   color: "#2ECC71", bg: "rgba(26,122,74,0.1)" },
                      { label: "Файлов в хранилище",   value: stats.files_count,  color: "var(--text-secondary)", bg: "rgba(42,64,96,0.3)" },
                    ].map(s => (
                      <div key={s.label} className="glass-card p-4" style={{ background: s.bg }}>
                        <p className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>{s.label}</p>
                        <p className="font-heading font-bold text-xl" style={{ color: s.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* ===== USERS ===== */}
          {tab === "users" && (
            <div className="animate-fade-in">
              <h2 className="font-heading font-semibold text-lg mb-6" style={{ color: "var(--text-primary)" }}>Управление пользователями</h2>

              {/* Create user */}
              <div className="glass-card p-5 mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>Добавить пользователя</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { label: "Имя и фамилия", val: newName, set: setNewName, ph: "Иванов Иван Иванович" },
                    { label: "Email",          val: newEmail,set: setNewEmail,ph: "user@example.com", type: "email" },
                    { label: "Пароль",         val: newPass, set: setNewPass, ph: "Минимум 6 символов", type: "password" },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{f.label}</label>
                      <input type={f.type || "text"} className="w-full px-3 py-2 rounded text-sm outline-none"
                        style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                        placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Роль</label>
                    <select className="w-full px-3 py-2 rounded text-sm outline-none"
                      style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                      value={newRole} onChange={e => setNewRole(e.target.value)}>
                      <option value="user">Пользователь</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </div>
                </div>
                {formError && <p className="text-xs mb-3" style={{ color: "#E74C3C" }}>{formError}</p>}
                <button onClick={createUser} className="flex items-center gap-2 px-5 py-2 rounded text-sm font-semibold"
                  style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}>
                  <Icon name="UserPlus" size={15} fallback="Plus" />
                  Создать пользователя
                </button>
              </div>

              {/* Edit modal */}
              {editId !== null && (
                <div className="fixed inset-0 flex items-center justify-center z-40" style={{ background: "rgba(0,0,0,0.6)" }}>
                  <div className="glass-card p-6 w-full max-w-md mx-4 animate-scale-in">
                    <h3 className="font-heading font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Редактировать пользователя</h3>
                    <div className="space-y-3 mb-4">
                      {[
                        { label: "Имя и фамилия", val: editName, set: setEditName, ph: "" },
                        { label: "Новый пароль (оставьте пустым — без изменений)", val: editPass, set: setEditPass, ph: "Новый пароль", type: "password" },
                      ].map(f => (
                        <div key={f.label}>
                          <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{f.label}</label>
                          <input type={f.type || "text"} className="w-full px-3 py-2 rounded text-sm outline-none"
                            style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                            placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)} />
                        </div>
                      ))}
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Роль</label>
                          <select className="w-full px-3 py-2 rounded text-sm outline-none"
                            style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                            value={editRole} onChange={e => setEditRole(e.target.value)}>
                            <option value="user">Пользователь</option>
                            <option value="admin">Администратор</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Статус</label>
                          <select className="w-full px-3 py-2 rounded text-sm outline-none"
                            style={{ background: "rgba(42,64,96,0.4)", border: "1px solid rgba(42,64,96,0.6)", color: "var(--text-primary)" }}
                            value={editActive ? "1" : "0"} onChange={e => setEditActive(e.target.value === "1")}>
                            <option value="1">Активен</option>
                            <option value="0">Заблокирован</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setEditId(null); setEditPass(""); }} className="flex-1 py-2 rounded text-sm"
                        style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>Отмена</button>
                      <button onClick={saveEditUser} className="flex-1 py-2 rounded text-sm font-semibold"
                        style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}>Сохранить</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Users table */}
              <div className="glass-card overflow-hidden">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Пользователь</th>
                      <th style={{ textAlign: "left" }}>Email</th>
                      <th style={{ textAlign: "left" }}>Роль</th>
                      <th style={{ textAlign: "left" }}>Статус</th>
                      <th style={{ textAlign: "left" }}>Последний вход</th>
                      <th style={{ textAlign: "left" }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>Загрузка...</td></tr>
                    ) : users.map(u => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{u.full_name || "—"}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{u.email}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs ${u.role === "admin" ? "badge-danger" : "badge-pending"}`}>
                            {u.role === "admin" ? "Администратор" : "Пользователь"}
                          </span>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs ${u.is_active ? "badge-safe" : ""}`}
                            style={!u.is_active ? { background: "rgba(42,64,96,0.3)", color: "var(--text-dim)", border: "1px solid rgba(42,64,96,0.5)" } : {}}>
                            {u.is_active ? "Активен" : "Заблокирован"}
                          </span>
                        </td>
                        <td style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{fmtDate(u.last_login_at)}</td>
                        <td>
                          <button className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                            style={{ background: "rgba(200,149,42,0.1)", color: "var(--gold)" }}
                            onClick={() => {
                              setEditId(u.id);
                              setEditName(u.full_name);
                              setEditRole(u.role);
                              setEditActive(u.is_active);
                              setEditPass("");
                            }}>
                            <Icon name="Pencil" size={12} fallback="Edit" />
                            Изменить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== DATABASE ===== */}
          {tab === "database" && (
            <div className="animate-fade-in max-w-2xl">
              <h2 className="font-heading font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>Управление базой данных</h2>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                Выборочная или полная очистка данных СОУТ. Действие необратимо.
              </p>

              <div className="space-y-4">
                {[
                  {
                    icon: "FileX",
                    title: "Очистить результаты обработки",
                    desc: "Удаляет все карты СОУТ и выявленные факторы из базы данных. Пакеты и история загрузок сохраняются.",
                    color: "#E67E22",
                    action: "results",
                    label: "Очистить результаты",
                  },
                  {
                    icon: "FolderX",
                    title: "Очистить историю пакетов",
                    desc: "Удаляет все записи о загруженных пакетах и файлах. Карты СОУТ при этом также будут удалены.",
                    color: "#E74C3C",
                    action: "history",
                    label: "Очистить историю",
                  },
                  {
                    icon: "Trash2",
                    title: "Полная очистка базы данных СОУТ",
                    desc: "Полное удаление всех данных: карты, факторы, пакеты, файлы. Пользователи и настройки сохраняются.",
                    color: "#C0392B",
                    action: "all",
                    label: "Очистить всё",
                  },
                ].map(item => (
                  <div key={item.action} className="glass-card p-5 flex items-center gap-4"
                    style={{ border: "1px solid rgba(192,57,43,0.2)" }}>
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${item.color}22` }}>
                      <Icon name={item.icon} size={22} fallback="Trash" style={{ color: item.color }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{item.desc}</p>
                    </div>
                    <button
                      className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium flex-shrink-0"
                      style={{ background: `${item.color}22`, color: item.color, border: `1px solid ${item.color}44` }}
                      onClick={() => setConfirm({
                        title: item.title,
                        message: `Вы уверены? Это действие необратимо. ${item.desc}`,
                        action: () => clearData(item.action as "results" | "history" | "all"),
                      })}>
                      <Icon name="Trash2" size={14} fallback="Trash" />
                      {item.label}
                    </button>
                  </div>
                ))}
              </div>

              <div className="glass-card p-5 mt-6"
                style={{ border: "1px solid rgba(200,149,42,0.2)", background: "rgba(200,149,42,0.04)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="Shield" size={16} fallback="Shield" style={{ color: "var(--gold)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--gold)" }}>Что НЕ удаляется</p>
                </div>
                <ul className="space-y-1">
                  {["Аккаунты пользователей", "Настройки системы", "Активные сессии"].map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <Icon name="Check" size={11} fallback="Check" style={{ color: "#2ECC71" }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ===== SETTINGS ===== */}
          {tab === "settings" && (
            <div className="animate-fade-in max-w-xl">
              <h2 className="font-heading font-semibold text-lg mb-6" style={{ color: "var(--text-primary)" }}>Настройки системы</h2>
              <div className="space-y-4">
                {[
                  { section: "Система", items: [
                    { label: "Название системы",         value: "АВЕСТА" },
                    { label: "Версия",                   value: "1.0.0" },
                    { label: "Нормативная база",         value: "426-ФЗ, Приказ Минтруда № 33н" },
                    { label: "Поддерживаемые форматы",   value: "PDF, XLSX, XLS, DOC, DOCX, ZIP" },
                  ]},
                  { section: "Безопасность", items: [
                    { label: "Срок действия сессии",     value: "30 дней" },
                    { label: "Хэширование паролей",      value: "SHA-256 + Salt" },
                    { label: "Доступ к данным",          value: "Только авторизованные" },
                    { label: "Администратор системы",    value: "nshrkonstantin@gmail.com" },
                  ]},
                  { section: "Хранилище", items: [
                    { label: "База данных",              value: "PostgreSQL" },
                    { label: "Файловое хранилище",       value: "S3 (bucket.poehali.dev)" },
                    { label: "Резервное копирование",    value: "Ежедневно" },
                    { label: "Срок хранения данных",     value: "3 года" },
                  ]},
                ].map(group => (
                  <div key={group.section} className="glass-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>{group.section}</p>
                    {group.items.map(item => (
                      <div key={item.label} className="flex items-center justify-between py-2.5"
                        style={{ borderBottom: "1px solid rgba(42,64,96,0.3)" }}>
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                        <span className="text-xs font-medium px-2 py-1 rounded"
                          style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-primary)" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
