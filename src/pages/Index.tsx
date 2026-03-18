import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import * as XLSX from "xlsx";

interface IndexProps {
  user: { id: number; email: string; full_name: string; role: string };
  sessionId: string;
  onLogout: () => void;
  onAdmin?: () => void;
}

const API = {
  upload:  "https://functions.poehali.dev/dc630666-fe78-49d2-b6db-278145860efa",
  process: "https://functions.poehali.dev/3413521a-f911-42ef-8699-ea97fc14c796",
  results: "https://functions.poehali.dev/509dcfe4-0c62-4104-974a-7f493bee43bd",
  export:  "https://functions.poehali.dev/77a67f0a-c7b2-44db-8701-230a41e4c983",
};

type Section = "upload" | "processing" | "results" | "history" | "export" | "reference" | "analytics" | "settings";

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: "upload",     label: "Загрузка",    icon: "Upload" },
  { id: "processing", label: "Обработка",   icon: "Cpu" },
  { id: "results",    label: "Результаты",  icon: "LayoutList" },
  { id: "history",    label: "История",     icon: "Clock" },
  { id: "export",     label: "Экспорт",     icon: "Download" },
  { id: "reference",  label: "Справочник",  icon: "BookOpen" },
  { id: "analytics",  label: "Аналитика",   icon: "BarChart3" },
  { id: "settings",   label: "Настройки",   icon: "Settings" },
];

const FACTOR_CODES: Record<string, string> = {
  "3.1": "Химический фактор",
  "3.2": "Биологический фактор",
  "3.3": "Физический фактор (шум, вибрация, излучение)",
  "3.4": "Тяжесть трудового процесса",
  "3.5": "Напряжённость трудового процесса",
  "4.0": "Опасный класс условий труда",
};

interface SoutCard {
  id: number;
  batch_id: number;
  organization: string;
  department: string;
  worker_name: string;
  position: string;
  sout_date: string;
  is_dangerous: boolean;
  factors: { code: string; name: string; description: string }[];
}

interface Batch {
  id: number;
  name: string;
  status: string;
  total_files: number;
  processed_files: number;
  created_at: string;
  danger_count: number;
  safe_count: number;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Index({ user, onLogout, onAdmin }: IndexProps) {
  const [section, setSection]         = useState<Section>("upload");
  const [files, setFiles]             = useState<File[]>([]);
  const [isDragging, setIsDragging]   = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [processing, setProcessing]   = useState(false);
  const [progress, setProgress]       = useState(0);
  const [progressStep, setProgressStep] = useState(0);
  const [batchId, setBatchId]         = useState<number | null>(null);
  const [cards, setCards]             = useState<SoutCard[]>([]);
  const [batches, setBatches]         = useState<Batch[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [resultTab, setResultTab]     = useState<"danger" | "safe">("danger");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    try {
      const res = await fetch(API.upload);
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoadingHistory(false);
  }, []);

  const loadResults = useCallback(async (bid?: number) => {
    setLoadingResults(true);
    try {
      const url = bid ? `${API.results}?batch_id=${bid}` : API.results;
      const res = await fetch(url);
      const data = await res.json();
      setCards(data.cards || []);
    } catch { /* ignore */ }
    setLoadingResults(false);
  }, []);

  useEffect(() => {
    if (section === "history") loadHistory();
    if (section === "results") loadResults(activeBatchId ?? undefined);
    if (section === "analytics") loadResults();
  }, [section, loadHistory, loadResults, activeBatchId]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const startUploadAndProcess = async () => {
    if (!files.length) return;
    setUploadError("");
    setUploading(true);
    setSection("processing");
    setProgress(5);
    setProgressStep(0);

    try {
      // 1. Конвертируем файлы в base64
      const filesPayload = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          data_b64: await toBase64(f),
          size: f.size,
        }))
      );
      setProgress(20);
      setProgressStep(1);

      // 2. Загружаем в S3 + БД
      const batchName = files.length === 1
        ? files[0].name
        : `Пакет ${new Date().toLocaleDateString("ru-RU")} (${files.length} файлов)`;

      const uploadRes = await fetch(API.upload, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesPayload, batch_name: batchName }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Ошибка загрузки");

      const newBatchId: number = uploadData.batch_id;
      setBatchId(newBatchId);
      setProgress(40);
      setProgressStep(2);
      setUploading(false);
      setProcessing(true);

      // 3. Запускаем обработку
      const processRes = await fetch(API.process, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: newBatchId }),
      });
      if (!processRes.ok) {
        const pd = await processRes.json();
        throw new Error(pd.error || "Ошибка обработки");
      }
      setProgress(55);
      setProgressStep(3);

      // 4. Поллинг статуса
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API.process}?batch_id=${newBatchId}`);
          const statusData = await statusRes.json();
          const serverProgress = statusData.progress ?? 0;
          const mapped = 55 + Math.round(serverProgress * 0.45);
          setProgress(Math.min(mapped, 99));

          if (statusData.status === "done" || serverProgress >= 100) {
            clearInterval(pollRef.current!);
            setProgress(100);
            setProgressStep(4);
            setProcessing(false);
            setActiveBatchId(newBatchId);
            // Загружаем результаты
            await loadResults(newBatchId);
            setTimeout(() => setSection("results"), 800);
          }
        } catch { /* ignore */ }
      }, 1500);

    } catch (err: unknown) {
      setUploading(false);
      setProcessing(false);
      setUploadError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setSection("upload");
    }
  };

  // Экспорт: скачиваем xlsx с backend или генерируем из текущих данных
  const handleExport = async (direction: "all" | "danger" | "safe") => {
    setExportLoading(true);
    try {
      const bid = activeBatchId;
      const params = new URLSearchParams({ direction });
      if (bid) params.set("batch_id", String(bid));
      const res = await fetch(`${API.export}?${params.toString()}`);

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = new Date().toLocaleDateString("ru-RU").replace(/\./g, "-");
        const names: Record<string, string> = {
          all:    `АВЕСТА_Реестр_СОУТ_${date}.xlsx`,
          danger: `АВЕСТА_Направление1_Опасные_${date}.xlsx`,
          safe:   `АВЕСТА_Направление2_Допустимые_${date}.xlsx`,
        };
        a.download = names[direction];
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Fallback: генерируем из текущих данных через xlsx
        exportLocalXlsx(direction);
      }
    } catch {
      exportLocalXlsx(direction);
    }
    setExportLoading(false);
  };

  const exportLocalXlsx = (direction: "all" | "danger" | "safe") => {
    const wb = XLSX.utils.book_new();
    if (direction === "all" || direction === "danger") {
      const rows = dangerCards.map(r => ({
        "Организация": r.organization,
        "Подразделение": r.department,
        "ФИО работника": r.worker_name,
        "Должность": r.position,
        "Опасные факторы": r.factors.map(f => `${f.code} ${f.name}`).join("; "),
        "Расшифровка": r.factors.map(f => `[${f.code}] ${f.name}: ${f.description}`).join(" | "),
        "Дата СОУТ": r.sout_date,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Направление №1 — Опасные");
    }
    if (direction === "all" || direction === "safe") {
      const rows = safeCards.map(r => ({
        "Организация": r.organization,
        "Подразделение": r.department,
        "ФИО работника": r.worker_name,
        "Должность": r.position,
        "Дата СОУТ": r.sout_date,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Направление №2 — Допустимые");
    }
    const date = new Date().toLocaleDateString("ru-RU").replace(/\./g, "-");
    XLSX.writeFile(wb, `АВЕСТА_СОУТ_${date}.xlsx`);
  };

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "FileText";
    if (ext === "xlsx" || ext === "xls") return "FileSpreadsheet";
    if (ext === "zip" || ext === "rar") return "FolderArchive";
    return "File";
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return b + " Б";
    if (b < 1048576) return (b / 1024).toFixed(1) + " КБ";
    return (b / 1048576).toFixed(1) + " МБ";
  };

  const fmtDate = (s: string) => {
    try { return new Date(s).toLocaleString("ru-RU"); } catch { return s; }
  };

  const STEPS = [
    "Конвертация и подготовка файлов",
    "Загрузка в защищённое хранилище",
    "Запуск обработки и распознавания",
    "Идентификация вредных факторов",
    "Формирование реестра по двум направлениям",
  ];

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
          {NAV_ITEMS.map(item => (
            <div key={item.id} className={`nav-item ${section === item.id ? "active" : ""}`}
              onClick={() => setSection(item.id)} title={!sidebarOpen ? item.label : undefined}>
              <Icon name={item.icon} size={17} fallback="Circle" />
              {sidebarOpen && <span>{item.label}</span>}
            </div>
          ))}
        </nav>
        <div className="p-3" style={{ borderTop: "1px solid rgba(42,64,96,0.5)" }}>
          <button className="nav-item w-full justify-center" onClick={() => setSidebarOpen(!sidebarOpen)}>
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
              {NAV_ITEMS.find(n => n.id === section)?.label}
            </h1>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Специальная оценка условий труда · 426-ФЗ</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
              style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>
              <Icon name="Database" size={13} fallback="Database" />
              <span>БД: активна</span>
            </div>
            {activeBatchId && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                style={{ background: "rgba(200,149,42,0.15)", color: "var(--gold)" }}>
                <Icon name="CheckCircle" size={13} fallback="Check" />
                <span>Пакет #{activeBatchId}</span>
              </div>
            )}
            {onAdmin && (
              <button onClick={onAdmin} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
                style={{ background: "rgba(192,57,43,0.15)", color: "#E74C3C", border: "1px solid rgba(192,57,43,0.3)" }}>
                <Icon name="ShieldAlert" size={13} fallback="Shield" />
                Админ
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
                style={{ background: "var(--gold)", color: "var(--navy-deep)" }}>
                {user.full_name?.[0]?.toUpperCase() || "U"}
              </div>
              <button onClick={onLogout} className="text-xs px-2 py-1.5 rounded"
                style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}>
                <Icon name="LogOut" size={13} fallback="Logout" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ===== UPLOAD ===== */}
          {section === "upload" && (
            <div className="max-w-3xl mx-auto animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-xl mb-1" style={{ color: "var(--text-primary)" }}>Загрузка карт СОУТ</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Поддерживаются форматы PDF, XLSX, XLS, DOC, DOCX, ZIP, RAR. Пакетная загрузка до 500 МБ.
                </p>
              </div>

              {uploadError && (
                <div className="mb-4 p-4 rounded-lg flex items-center gap-3"
                  style={{ background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.3)" }}>
                  <Icon name="AlertCircle" size={16} fallback="Alert" style={{ color: "#E74C3C" }} />
                  <p className="text-sm" style={{ color: "#E74C3C" }}>{uploadError}</p>
                  <button className="ml-auto" onClick={() => setUploadError("")}>
                    <Icon name="X" size={14} fallback="X" style={{ color: "#E74C3C" }} />
                  </button>
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
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>PDF, XLSX, DOC, ZIP — одиночные файлы и архивы с пакетом карт</p>
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
                  { icon: "FileCheck",   label: "Форматы",          value: "PDF, XLSX, DOC, ZIP" },
                  { icon: "ShieldCheck", label: "Валидация",         value: "Автоматическая" },
                  { icon: "Layers",      label: "Пакетная загрузка", value: "До 500 МБ" },
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

              <button
                className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200"
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

          {/* ===== PROCESSING ===== */}
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
                  {processing || uploading
                    ? "Извлечение данных, классификация факторов, сохранение в базу данных"
                    : "Все карты обработаны и сохранены в БД"}
                </p>
                <div className="mb-6">
                  <div className="flex justify-between text-xs mb-2" style={{ color: "var(--text-dim)" }}>
                    <span>Прогресс обработки</span>
                    <span>{Math.round(progress)}%</span>
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
                          : <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--steel)" }} />
                        }
                      </div>
                      <span className="text-sm" style={{ color: progressStep > idx ? "var(--text-primary)" : "var(--text-dim)" }}>
                        {label}
                      </span>
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

          {/* ===== RESULTS ===== */}
          {section === "results" && (
            <div className="animate-fade-in">
              <div className="grid grid-cols-4 gap-4 mb-6 stagger">
                {[
                  { label: "Всего обработано",      value: cards.length,       icon: "Users",         color: "var(--gold)" },
                  { label: "С опасными факторами",   value: dangerCards.length, icon: "AlertTriangle", color: "#E74C3C" },
                  { label: "Без опасных факторов",   value: safeCards.length,   icon: "ShieldCheck",   color: "#2ECC71" },
                  { label: "Пакет",                  value: activeBatchId ? `#${activeBatchId}` : "—", icon: "FolderOpen", color: "var(--text-secondary)" },
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
                  <button className="px-4 py-2 rounded text-sm font-medium transition-all"
                    style={{
                      background: resultTab === "danger" ? "rgba(192,57,43,0.2)" : "transparent",
                      color: resultTab === "danger" ? "#E74C3C" : "var(--text-secondary)",
                      border: resultTab === "danger" ? "1px solid rgba(192,57,43,0.3)" : "1px solid transparent",
                    }}
                    onClick={() => setResultTab("danger")}>
                    <span className="flex items-center gap-2">
                      <Icon name="AlertTriangle" size={14} fallback="Alert" />
                      Направление №1 — Опасные ({dangerCards.length})
                    </span>
                  </button>
                  <button className="px-4 py-2 rounded text-sm font-medium transition-all"
                    style={{
                      background: resultTab === "safe" ? "rgba(26,122,74,0.2)" : "transparent",
                      color: resultTab === "safe" ? "#2ECC71" : "var(--text-secondary)",
                      border: resultTab === "safe" ? "1px solid rgba(26,122,74,0.3)" : "1px solid transparent",
                    }}
                    onClick={() => setResultTab("safe")}>
                    <span className="flex items-center gap-2">
                      <Icon name="ShieldCheck" size={14} fallback="Shield" />
                      Направление №2 — Допустимые ({safeCards.length})
                    </span>
                  </button>
                </div>

                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded"
                  style={{ background: "rgba(42,64,96,0.3)", border: "1px solid rgba(42,64,96,0.5)" }}>
                  <Icon name="Search" size={14} fallback="Search" style={{ color: "var(--text-dim)" }} />
                  <input className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: "var(--text-primary)" }}
                    placeholder="Поиск по ФИО, организации, подразделению..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)} />
                </div>

                <button className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
                  style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                  onClick={() => handleExport("all")} disabled={exportLoading}>
                  <Icon name="Download" size={15} fallback="Download" />
                  {exportLoading ? "Формирую..." : "Экспорт Excel"}
                </button>
              </div>

              {loadingResults ? (
                <div className="flex items-center justify-center py-16" style={{ color: "var(--text-dim)" }}>
                  <Icon name="Loader" size={22} fallback="Loader" style={{ marginRight: 8 }} />
                  Загрузка данных...
                </div>
              ) : (
                <div className="glass-card overflow-hidden">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Организация / Подразделение</th>
                        <th style={{ textAlign: "left" }}>ФИО работника</th>
                        <th style={{ textAlign: "left" }}>Должность (профессия)</th>
                        {resultTab === "danger" && <th style={{ textAlign: "left" }}>Опасные факторы</th>}
                        <th style={{ textAlign: "left" }}>Дата СОУТ</th>
                        <th style={{ textAlign: "left" }}>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(resultTab === "danger" ? filteredDanger : filteredSafe).length === 0 ? (
                        <tr>
                          <td colSpan={resultTab === "danger" ? 6 : 5} style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                            {cards.length === 0
                              ? "Загрузите и обработайте карты СОУТ для отображения результатов"
                              : "Нет записей по выбранному фильтру"}
                          </td>
                        </tr>
                      ) : (resultTab === "danger" ? filteredDanger : filteredSafe).map(row => (
                        <>
                          <tr key={row.id} style={{ cursor: "pointer" }}
                            onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>
                            <td>
                              <div className="font-medium" style={{ color: "var(--text-primary)", fontSize: "0.8rem" }}>{row.organization}</div>
                              <div style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{row.department}</div>
                            </td>
                            <td style={{ fontWeight: 500 }}>{row.worker_name}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{row.position}</td>
                            {resultTab === "danger" && (
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {row.factors.map(f => (
                                    <span key={f.code} className="badge-danger px-2 py-0.5 rounded text-xs">
                                      {f.code} · {f.name}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            )}
                            <td style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{row.sout_date}</td>
                            <td>
                              {row.is_dangerous
                                ? <span className="badge-danger px-2 py-1 rounded text-xs">Вредные условия</span>
                                : <span className="badge-safe px-2 py-1 rounded text-xs">Допустимые условия</span>
                              }
                            </td>
                          </tr>
                          {expandedRow === row.id && resultTab === "danger" && row.factors.length > 0 && (
                            <tr key={`${row.id}-exp`}>
                              <td colSpan={6} style={{ background: "rgba(42,64,96,0.12)", padding: 0 }}>
                                <div className="px-6 py-4">
                                  <p className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: "var(--gold)" }}>
                                    Расшифровка выявленных вредных факторов
                                  </p>
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

          {/* ===== HISTORY ===== */}
          {section === "history" && (
            <div className="animate-fade-in">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>История обработок</h2>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Все обработанные пакеты карт СОУТ из базы данных</p>
                </div>
                <button className="flex items-center gap-2 px-3 py-2 rounded text-sm"
                  style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}
                  onClick={loadHistory}>
                  <Icon name="RefreshCw" size={14} fallback="Refresh" />
                  Обновить
                </button>
              </div>
              <div className="glass-card overflow-hidden">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Наименование пакета</th>
                      <th style={{ textAlign: "left" }}>Дата обработки</th>
                      <th style={{ textAlign: "left" }}>Файлов</th>
                      <th style={{ textAlign: "left" }}>С факторами</th>
                      <th style={{ textAlign: "left" }}>Без факторов</th>
                      <th style={{ textAlign: "left" }}>Статус</th>
                      <th style={{ textAlign: "left" }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingHistory ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>Загрузка...</td></tr>
                    ) : batches.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>
                        История пуста — загрузите первый пакет карт СОУТ
                      </td></tr>
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
                              onClick={() => { setActiveBatchId(batch.id); setSection("results"); }}>
                              Просмотр
                            </button>
                            <button className="text-xs px-2 py-1 rounded"
                              style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}
                              onClick={() => { setActiveBatchId(batch.id); handleExport("all"); }}>
                              Excel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== EXPORT ===== */}
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
                  { icon: "FileSpreadsheet", title: "Полный реестр СОУТ",               desc: "Оба направления на отдельных листах Excel с полной детализацией", badge: "Рекомендуется", badgeColor: "var(--gold)", dir: "all" as const },
                  { icon: "AlertTriangle",   title: "Направление №1 — Опасные факторы", desc: "Только вредные/опасные условия. Полная расшифровка каждого фактора по классам",  badge: `${dangerCards.length} записей`, badgeColor: "#E74C3C", dir: "danger" as const },
                  { icon: "ShieldCheck",     title: "Направление №2 — Допустимые",      desc: "Работники с допустимыми условиями труда без вредных факторов",                badge: `${safeCards.length} записей`,  badgeColor: "#2ECC71", dir: "safe" as const },
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
                      <Icon name="Download" size={14} fallback="Download" />
                      {exportLoading ? "..." : "Скачать"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>Параметры выгрузки</p>
                <div className="grid grid-cols-2 gap-x-8">
                  {[
                    { label: "Формат файла",            value: "XLSX (Excel 2016+)" },
                    { label: "Кодировка",               value: "UTF-8" },
                    { label: "Разделитель листов",       value: "По направлениям" },
                    { label: "Сохранение в БД",          value: "Автоматически" },
                  ].map(p => (
                    <div key={p.label} className="flex justify-between py-2.5"
                      style={{ borderBottom: "1px solid rgba(42,64,96,0.3)" }}>
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>{p.label}</span>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== REFERENCE ===== */}
          {section === "reference" && (
            <div className="animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>Справочник факторов СОУТ</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Классификатор вредных и опасных факторов по Приказу Минтруда № 33н</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(FACTOR_CODES).map(([code, name]) => (
                  <div key={code} className="glass-card p-4 flex gap-4 items-start">
                    <div className="w-12 h-8 rounded flex items-center justify-center flex-shrink-0 font-mono font-bold text-xs"
                      style={{ background: "rgba(192,57,43,0.15)", color: "#E74C3C", border: "1px solid rgba(192,57,43,0.3)" }}>
                      {code}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>Вредный/опасный производственный фактор · Класс {code[0]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== ANALYTICS ===== */}
          {section === "analytics" && (
            <div className="animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>Аналитика СОУТ</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Сводная статистика по всем обработанным картам из базы данных</p>
              </div>
              {loadingResults ? (
                <div className="flex items-center justify-center py-16" style={{ color: "var(--text-dim)" }}>
                  <Icon name="Loader" size={22} fallback="Loader" style={{ marginRight: 8 }} />Загрузка...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className="glass-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>
                      Распределение по классам условий труда
                    </p>
                    <div className="space-y-4">
                      {[
                        { label: "Вредные условия (класс 3)", value: dangerCards.length, color: "#E74C3C" },
                        { label: "Допустимые условия (класс 2)", value: safeCards.length, color: "#2ECC71" },
                      ].map(bar => (
                        <div key={bar.label}>
                          <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
                            <span>{bar.label}</span>
                            <span>{bar.value} из {cards.length} ({cards.length ? Math.round(bar.value / cards.length * 100) : 0}%)</span>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: cards.length ? `${(bar.value / cards.length) * 100}%` : "0%", background: bar.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {cards.length === 0 && (
                      <p className="text-center text-xs mt-6" style={{ color: "var(--text-dim)" }}>
                        Загрузите карты СОУТ для отображения статистики
                      </p>
                    )}
                  </div>

                  <div className="glass-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>
                      Топ выявленных вредных факторов
                    </p>
                    {(() => {
                      const factorCount: Record<string, { name: string; count: number }> = {};
                      dangerCards.forEach(c => c.factors.forEach(f => {
                        if (!factorCount[f.code]) factorCount[f.code] = { name: f.name, count: 0 };
                        factorCount[f.code].count++;
                      }));
                      const sorted = Object.entries(factorCount).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
                      const maxCount = sorted[0]?.[1].count || 1;
                      return sorted.length === 0 ? (
                        <p className="text-center text-xs mt-6" style={{ color: "var(--text-dim)" }}>Нет данных</p>
                      ) : sorted.map(([code, info], idx) => (
                        <div key={code} className="flex items-center gap-3 mb-3">
                          <span className="text-xs font-bold w-5 text-center" style={{ color: "var(--text-dim)" }}>{idx + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                              <span>{code} · {info.name}</span><span>{info.count}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                              <div className="h-full rounded-full" style={{ width: `${(info.count / maxCount) * 100}%`, background: "var(--gold)" }} />
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="glass-card p-5 col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>
                      Сводка по организациям
                    </p>
                    {(() => {
                      const orgs: Record<string, { total: number; danger: number }> = {};
                      cards.forEach(c => {
                        if (!orgs[c.organization]) orgs[c.organization] = { total: 0, danger: 0 };
                        orgs[c.organization].total++;
                        if (c.is_dangerous) orgs[c.organization].danger++;
                      });
                      const sorted = Object.entries(orgs).sort((a, b) => b[1].total - a[1].total);
                      return sorted.length === 0 ? (
                        <p className="text-center text-xs py-6" style={{ color: "var(--text-dim)" }}>Загрузите карты СОУТ для отображения</p>
                      ) : (
                        <table className="data-table w-full">
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
                        </table>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== SETTINGS ===== */}
          {section === "settings" && (
            <div className="max-w-xl animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>Настройки системы</h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Параметры обработки, хранения и экспорта данных</p>
              </div>
              <div className="space-y-4">
                {[
                  { section: "Обработка", items: [
                    { label: "Автоматическое сохранение в БД",      value: "Включено" },
                    { label: "Язык распознавания документов",        value: "Русский" },
                    { label: "Уровень детализации факторов",         value: "Полный" },
                  ]},
                  { section: "Экспорт", items: [
                    { label: "Формат по умолчанию",                  value: "XLSX" },
                    { label: "Включать расшифровку факторов",        value: "Да" },
                    { label: "Сводный лист",                         value: "Включён" },
                  ]},
                  { section: "База данных", items: [
                    { label: "Срок хранения данных",                 value: "3 года" },
                    { label: "Резервное копирование",                value: "Ежедневно" },
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
            </div>
          )}

        </div>

        <div className="px-6 py-2 flex items-center justify-between text-xs flex-shrink-0"
          style={{ borderTop: "1px solid rgba(42,64,96,0.4)", color: "var(--text-dim)" }}>
          <span>АВЕСТА v1.0 — Автоматизированная Верификация и Экспертный Статус Труда и Анализа</span>
          <span>Федеральный закон 426-ФЗ «О специальной оценке условий труда»</span>
        </div>
      </main>
    </div>
  );
}