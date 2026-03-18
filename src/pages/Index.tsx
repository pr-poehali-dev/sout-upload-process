import { useState } from "react";
import Icon from "@/components/ui/icon";
import * as XLSX from "xlsx";

type Section =
  | "upload"
  | "processing"
  | "results"
  | "history"
  | "export"
  | "reference"
  | "analytics"
  | "settings";

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: "upload", label: "Загрузка", icon: "Upload" },
  { id: "processing", label: "Обработка", icon: "Cpu" },
  { id: "results", label: "Результаты", icon: "LayoutList" },
  { id: "history", label: "История", icon: "Clock" },
  { id: "export", label: "Экспорт", icon: "Download" },
  { id: "reference", label: "Справочник", icon: "BookOpen" },
  { id: "analytics", label: "Аналитика", icon: "BarChart3" },
  { id: "settings", label: "Настройки", icon: "Settings" },
];

const MOCK_RESULTS = [
  {
    id: 1,
    org: "ООО «Промстрой»",
    dept: "Цех металлоконструкций",
    name: "Иванов Пётр Сергеевич",
    position: "Сварщик",
    date: "14.11.2024",
    dangerous: true,
    factors: [
      { code: "3.1", name: "Химический", desc: "Воздействие сварочных аэрозолей превышает ПДК" },
      { code: "3.4", name: "Тяжесть труда", desc: "Физические нагрузки, превышающие допустимые нормы" },
    ],
  },
  {
    id: 2,
    org: "ООО «Промстрой»",
    dept: "Административный отдел",
    name: "Сидорова Елена Ивановна",
    position: "Бухгалтер",
    date: "14.11.2024",
    dangerous: false,
    factors: [],
  },
  {
    id: 3,
    org: "ФГУП «Транспортник»",
    dept: "Отдел эксплуатации",
    name: "Кузнецов Алексей Дмитриевич",
    position: "Машинист крана",
    date: "22.03.2024",
    dangerous: true,
    factors: [
      { code: "3.2", name: "Биологический", desc: "Контакт с патогенными микроорганизмами" },
      { code: "3.5", name: "Напряжённость", desc: "Интенсивность интеллектуальной нагрузки" },
      { code: "3.3", name: "Физический", desc: "Шум превышает допустимый уровень 80 дБА" },
    ],
  },
  {
    id: 4,
    org: "ФГУП «Транспортник»",
    dept: "Бухгалтерия",
    name: "Петрова Мария Андреевна",
    position: "Экономист",
    date: "22.03.2024",
    dangerous: false,
    factors: [],
  },
  {
    id: 5,
    org: "ГБУ «Медцентр №7»",
    dept: "Реанимация и интенсивная терапия",
    name: "Смирнов Дмитрий Олегович",
    position: "Врач-анестезиолог",
    date: "05.06.2024",
    dangerous: true,
    factors: [
      { code: "3.2", name: "Биологический", desc: "Работа с пациентами с инфекционными заболеваниями" },
      { code: "3.1", name: "Химический", desc: "Воздействие анестетических газов" },
    ],
  },
];

const HISTORY_ITEMS = [
  { id: 1, name: "СОУТ_ООО_Промстрой_2024.pdf", date: "18.03.2026 09:42", files: 3, status: "done", danger: 2, safe: 1 },
  { id: 2, name: "СОУТ_ФГУП_Транспортник.xlsx", date: "15.03.2026 14:18", files: 1, status: "done", danger: 1, safe: 1 },
  { id: 3, name: "Пакет_карт_ГБУ_Медцентр.zip", date: "10.03.2026 11:05", files: 5, status: "done", danger: 3, safe: 2 },
];

const FACTOR_CODES: Record<string, string> = {
  "3.1": "Химический фактор",
  "3.2": "Биологический фактор",
  "3.3": "Физический фактор (шум, вибрация, излучение)",
  "3.4": "Тяжесть трудового процесса",
  "3.5": "Напряжённость трудового процесса",
  "4.0": "Опасный класс условий труда",
};

export default function Index() {
  const [section, setSection] = useState<Section>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(false);
  const [resultTab, setResultTab] = useState<"danger" | "safe">("danger");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const dangerResults = MOCK_RESULTS.filter((r) => r.dangerous);
  const safeResults = MOCK_RESULTS.filter((r) => !r.dangerous);

  const filteredDanger = dangerResults.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.org.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.dept.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredSafe = safeResults.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.org.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.dept.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const startProcessing = () => {
    setSection("processing");
    setProcessing(true);
    setProgress(0);
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 12 + 3;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(() => {
          setProcessing(false);
          setProcessed(true);
          setSection("results");
        }, 600);
      }
      setProgress(Math.min(p, 100));
    }, 300);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "FileText";
    if (ext === "xlsx" || ext === "xls") return "FileSpreadsheet";
    if (ext === "zip" || ext === "rar") return "FolderArchive";
    return "File";
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " КБ";
    return (bytes / 1048576).toFixed(1) + " МБ";
  };

  const exportToExcel = (type: "full" | "danger" | "safe") => {
    const wb = XLSX.utils.book_new();

    const dangerRows = dangerResults.map((r) => ({
      "Организация": r.org,
      "Подразделение": r.dept,
      "ФИО работника": r.name,
      "Должность (профессия)": r.position,
      "Опасные факторы": r.factors.map((f) => `${f.code} ${f.name}`).join("; "),
      "Расшифровка факторов": r.factors.map((f) => `[${f.code}] ${f.name}: ${f.desc}`).join(" | "),
      "Дата проведения СОУТ": r.date,
      "Класс условий труда": "3 — Вредные",
    }));

    const safeRows = safeResults.map((r) => ({
      "Организация": r.org,
      "Подразделение": r.dept,
      "ФИО работника": r.name,
      "Должность (профессия)": r.position,
      "Дата проведения СОУТ": r.date,
      "Класс условий труда": "2 — Допустимые",
    }));

    if (type === "full" || type === "danger") {
      const wsDanger = XLSX.utils.json_to_sheet(dangerRows);
      wsDanger["!cols"] = [30, 28, 28, 28, 35, 60, 18, 22].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, wsDanger, "Направление №1 — Опасные");
    }
    if (type === "full" || type === "safe") {
      const wsSafe = XLSX.utils.json_to_sheet(safeRows);
      wsSafe["!cols"] = [30, 28, 28, 28, 18, 22].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, wsSafe, "Направление №2 — Допустимые");
    }

    const date = new Date().toLocaleDateString("ru-RU").replace(/\./g, "-");
    const names: Record<string, string> = {
      full: `АВЕСТА_Реестр_СОУТ_${date}.xlsx`,
      danger: `АВЕСТА_Направление1_Опасные_${date}.xlsx`,
      safe: `АВЕСТА_Направление2_Допустимые_${date}.xlsx`,
    };
    XLSX.writeFile(wb, names[type]);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--navy-deep)" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col transition-all duration-300 flex-shrink-0"
        style={{
          width: sidebarOpen ? "240px" : "60px",
          background: "var(--navy-deep)",
          borderRight: "1px solid rgba(42,64,96,0.6)",
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-5"
          style={{ borderBottom: "1px solid rgba(42,64,96,0.5)" }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center rounded"
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)",
            }}
          >
            <span className="font-heading font-black text-xs" style={{ color: "var(--navy-deep)" }}>А</span>
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in">
              <div className="font-heading font-bold text-sm tracking-widest" style={{ color: "var(--gold-light)" }}>
                АВЕСТА
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>
                Анализ карт СОУТ
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`nav-item ${section === item.id ? "active" : ""}`}
              onClick={() => setSection(item.id)}
              title={!sidebarOpen ? item.label : undefined}
            >
              <Icon name={item.icon} size={17} fallback="Circle" />
              {sidebarOpen && <span>{item.label}</span>}
            </div>
          ))}
        </nav>

        <div className="p-3" style={{ borderTop: "1px solid rgba(42,64,96,0.5)" }}>
          <button
            className="nav-item w-full justify-center"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Icon name={sidebarOpen ? "PanelLeftClose" : "PanelLeftOpen"} size={17} fallback="Menu" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(42,64,96,0.5)", background: "rgba(10,22,40,0.6)" }}
        >
          <div>
            <h1 className="font-heading font-semibold text-base" style={{ color: "var(--text-primary)" }}>
              {NAV_ITEMS.find((n) => n.id === section)?.label}
            </h1>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Специальная оценка условий труда · 426-ФЗ
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
              style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}
            >
              <Icon name="Database" size={13} fallback="Database" />
              <span>БД: активна</span>
            </div>
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: "var(--gold)", color: "var(--navy-deep)" }}
            >
              А
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ===== UPLOAD ===== */}
          {section === "upload" && (
            <div className="max-w-3xl mx-auto animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-xl mb-1" style={{ color: "var(--text-primary)" }}>
                  Загрузка карт СОУТ
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Поддерживаются форматы PDF, XLSX, XLS, DOC, DOCX, ZIP, RAR. Пакетная загрузка до 500 МБ.
                </p>
              </div>

              <div
                className={`drop-zone rounded-lg p-12 text-center cursor-pointer mb-6 ${isDragging ? "active" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.doc,.docx,.zip,.rar"
                  onChange={handleFileInput}
                />
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: "rgba(200,149,42,0.1)", border: "1px solid rgba(200,149,42,0.25)" }}
                >
                  <Icon name="CloudUpload" size={26} fallback="Upload" style={{ color: "var(--gold)" }} />
                </div>
                <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Перетащите файлы или нажмите для выбора
                </p>
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                  PDF, XLSX, DOC, ZIP — одиночные файлы и архивы с пакетом карт
                </p>
              </div>

              {files.length > 0 && (
                <div className="glass-card overflow-hidden mb-6">
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: "1px solid rgba(42,64,96,0.5)" }}
                  >
                    <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                      Загружено файлов: {files.length}
                    </span>
                    <button
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: "var(--text-dim)", background: "rgba(42,64,96,0.3)" }}
                      onClick={() => setFiles([])}
                    >
                      Очистить всё
                    </button>
                  </div>
                  <div>
                    {files.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{ borderBottom: "1px solid rgba(42,64,96,0.2)" }}
                      >
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
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { icon: "FileCheck", label: "Форматы", value: "PDF, XLSX, DOC, ZIP" },
                  { icon: "ShieldCheck", label: "Валидация", value: "Автоматическая" },
                  { icon: "Layers", label: "Пакетная загрузка", value: "До 500 МБ" },
                ].map((item) => (
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
                  background: files.length > 0
                    ? "linear-gradient(90deg, var(--gold), var(--gold-light))"
                    : "rgba(42,64,96,0.5)",
                  color: files.length > 0 ? "var(--navy-deep)" : "var(--text-dim)",
                  cursor: files.length > 0 ? "pointer" : "not-allowed",
                }}
                disabled={files.length === 0}
                onClick={startProcessing}
              >
                Начать обработку карт СОУТ
              </button>

              {files.length === 0 && (
                <p className="text-center text-xs mt-3" style={{ color: "var(--text-dim)" }}>
                  Для демонстрации — загрузите любой файл и нажмите «Начать обработку»
                </p>
              )}
            </div>
          )}

          {/* ===== PROCESSING ===== */}
          {section === "processing" && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <div className="glass-card p-8 text-center">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{
                    background: "rgba(200,149,42,0.1)",
                    border: "2px solid rgba(200,149,42,0.3)",
                  }}
                >
                  <Icon name="Cpu" size={32} fallback="Cpu" style={{ color: "var(--gold)" }} />
                </div>
                <h2 className="font-heading font-semibold text-lg mb-2" style={{ color: "var(--text-primary)" }}>
                  {processing ? "Обработка карт СОУТ..." : "Обработка завершена"}
                </h2>
                <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
                  {processing
                    ? "Извлечение данных, классификация факторов, формирование реестра"
                    : "Все карты обработаны успешно — реестр сформирован"}
                </p>

                <div className="mb-6">
                  <div className="flex justify-between text-xs mb-2" style={{ color: "var(--text-dim)" }}>
                    <span>Прогресс обработки</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.5)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${progress}%`,
                        background: "linear-gradient(90deg, var(--gold), var(--gold-light))",
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3 text-left mb-6">
                  {[
                    { label: "Распознавание структуры документов", pct: 25 },
                    { label: "Извлечение реквизитов и данных работников", pct: 50 },
                    { label: "Идентификация вредных факторов по классификатору", pct: 75 },
                    { label: "Формирование реестра по двум направлениям", pct: 100 },
                  ].map((step) => (
                    <div key={step.label} className="flex items-center gap-3">
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{
                          background: progress >= step.pct ? "rgba(200,149,42,0.15)" : "rgba(42,64,96,0.4)",
                          border: `1px solid ${progress >= step.pct ? "var(--gold)" : "rgba(42,64,96,0.6)"}`,
                        }}
                      >
                        {progress >= step.pct
                          ? <Icon name="Check" size={11} fallback="Check" style={{ color: "var(--gold)" }} />
                          : <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--steel)" }} />
                        }
                      </div>
                      <span className="text-sm" style={{ color: progress >= step.pct ? "var(--text-primary)" : "var(--text-dim)" }}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>

                {!processing && processed && (
                  <button
                    className="w-full py-3 rounded-lg font-semibold text-sm"
                    style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                    onClick={() => setSection("results")}
                  >
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
                  { label: "Всего обработано", value: MOCK_RESULTS.length, icon: "Users", color: "var(--gold)" },
                  { label: "С опасными факторами", value: dangerResults.length, icon: "AlertTriangle", color: "#E74C3C" },
                  { label: "Без опасных факторов", value: safeResults.length, icon: "ShieldCheck", color: "#2ECC71" },
                  { label: "Дата обработки", value: "18.03.2026", icon: "Calendar", color: "var(--text-secondary)" },
                ].map((stat) => (
                  <div key={stat.label} className="glass-card p-4 animate-fade-in">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{stat.label}</p>
                      <Icon name={stat.icon} size={16} fallback="Info" style={{ color: stat.color }} />
                    </div>
                    <p className="font-heading font-bold text-2xl" style={{ color: stat.color }}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <div className="flex rounded-lg p-1 gap-1" style={{ background: "rgba(42,64,96,0.3)" }}>
                  <button
                    className="px-4 py-2 rounded text-sm font-medium transition-all"
                    style={{
                      background: resultTab === "danger" ? "rgba(192,57,43,0.2)" : "transparent",
                      color: resultTab === "danger" ? "#E74C3C" : "var(--text-secondary)",
                      border: resultTab === "danger" ? "1px solid rgba(192,57,43,0.3)" : "1px solid transparent",
                    }}
                    onClick={() => setResultTab("danger")}
                  >
                    <span className="flex items-center gap-2">
                      <Icon name="AlertTriangle" size={14} fallback="Alert" />
                      Направление №1 — Опасные факторы ({dangerResults.length})
                    </span>
                  </button>
                  <button
                    className="px-4 py-2 rounded text-sm font-medium transition-all"
                    style={{
                      background: resultTab === "safe" ? "rgba(26,122,74,0.2)" : "transparent",
                      color: resultTab === "safe" ? "#2ECC71" : "var(--text-secondary)",
                      border: resultTab === "safe" ? "1px solid rgba(26,122,74,0.3)" : "1px solid transparent",
                    }}
                    onClick={() => setResultTab("safe")}
                  >
                    <span className="flex items-center gap-2">
                      <Icon name="ShieldCheck" size={14} fallback="Shield" />
                      Направление №2 — Допустимые условия ({safeResults.length})
                    </span>
                  </button>
                </div>

                <div
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded"
                  style={{ background: "rgba(42,64,96,0.3)", border: "1px solid rgba(42,64,96,0.5)" }}
                >
                  <Icon name="Search" size={14} fallback="Search" style={{ color: "var(--text-dim)" }} />
                  <input
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: "var(--text-primary)" }}
                    placeholder="Поиск по ФИО, организации, подразделению..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <button
                  className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
                  style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                  onClick={() => exportToExcel("full")}
                >
                  <Icon name="Download" size={15} fallback="Download" />
                  Экспорт Excel
                </button>
              </div>

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
                    {(resultTab === "danger" ? filteredDanger : filteredSafe).map((row) => (
                      <>
                        <tr
                          key={row.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                        >
                          <td>
                            <div className="font-medium" style={{ color: "var(--text-primary)", fontSize: "0.8rem" }}>
                              {row.org}
                            </div>
                            <div style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{row.dept}</div>
                          </td>
                          <td style={{ fontWeight: 500 }}>{row.name}</td>
                          <td style={{ color: "var(--text-secondary)" }}>{row.position}</td>
                          {resultTab === "danger" && (
                            <td>
                              <div className="flex flex-wrap gap-1">
                                {row.factors.map((f) => (
                                  <span key={f.code} className="badge-danger px-2 py-0.5 rounded text-xs">
                                    {f.code} · {f.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                          )}
                          <td style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{row.date}</td>
                          <td>
                            {row.dangerous
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
                                  {row.factors.map((f) => (
                                    <div
                                      key={f.code}
                                      className="p-3 rounded"
                                      style={{
                                        background: "rgba(192,57,43,0.08)",
                                        border: "1px solid rgba(192,57,43,0.2)",
                                        borderLeft: "3px solid #E74C3C",
                                      }}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold" style={{ color: "#E74C3C" }}>Класс {f.code}</span>
                                        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{f.name}</span>
                                      </div>
                                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{f.desc}</p>
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
            </div>
          )}

          {/* ===== HISTORY ===== */}
          {section === "history" && (
            <div className="animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                  История обработок
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Все ранее обработанные пакеты карт СОУТ с результатами
                </p>
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
                    {HISTORY_ITEMS.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <Icon name="FileText" size={14} fallback="File" style={{ color: "var(--gold)" }} />
                            <span style={{ color: "var(--text-primary)", fontSize: "0.85rem" }}>{item.name}</span>
                          </div>
                        </td>
                        <td style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>{item.date}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{item.files}</td>
                        <td><span className="badge-danger px-2 py-0.5 rounded text-xs">{item.danger}</span></td>
                        <td><span className="badge-safe px-2 py-0.5 rounded text-xs">{item.safe}</span></td>
                        <td><span className="badge-pending px-2 py-0.5 rounded text-xs">Завершено</span></td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: "rgba(200,149,42,0.1)", color: "var(--gold)" }}
                              onClick={() => setSection("results")}
                            >
                              Просмотр
                            </button>
                            <button
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-secondary)" }}
                              onClick={() => exportToExcel("full")}
                            >
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
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                  Экспорт данных
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Выгрузка реестра работников с классификацией по условиям труда в формате Excel
                </p>
              </div>

              <div className="space-y-4 mb-6">
                {[
                  {
                    icon: "FileSpreadsheet",
                    title: "Полный реестр СОУТ",
                    desc: "Все работники — оба направления на отдельных листах Excel с полной детализацией",
                    badge: "Рекомендуется",
                    badgeColor: "var(--gold)",
                    exportType: "full" as const,
                  },
                  {
                    icon: "AlertTriangle",
                    title: "Направление №1 — Опасные факторы",
                    desc: "Только работники с вредными/опасными условиями. Полная расшифровка каждого фактора по классам",
                    badge: `${dangerResults.length} записей`,
                    badgeColor: "#E74C3C",
                    exportType: "danger" as const,
                  },
                  {
                    icon: "ShieldCheck",
                    title: "Направление №2 — Допустимые условия",
                    desc: "Работники с допустимыми условиями труда (класс 1 и 2), без выявленных вредных факторов",
                    badge: `${safeResults.length} записей`,
                    badgeColor: "#2ECC71",
                    exportType: "safe" as const,
                  },
                ].map((opt) => (
                  <div key={opt.title} className="glass-card p-5 flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(200,149,42,0.1)" }}
                    >
                      <Icon name={opt.icon} size={22} fallback="File" style={{ color: "var(--gold)" }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>{opt.title}</p>
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: `${opt.badgeColor}22`, color: opt.badgeColor, border: `1px solid ${opt.badgeColor}44` }}
                        >
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{opt.desc}</p>
                    </div>
                    <button
                      className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium flex-shrink-0"
                      style={{ background: "linear-gradient(90deg, var(--gold), var(--gold-light))", color: "var(--navy-deep)" }}
                      onClick={() => exportToExcel(opt.exportType)}
                    >
                      <Icon name="Download" size={14} fallback="Download" />
                      Скачать
                    </button>
                  </div>
                ))}
              </div>

              <div className="glass-card p-5">
                <p className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>Параметры выгрузки</p>
                <div className="grid grid-cols-2 gap-x-8">
                  {[
                    { label: "Формат файла", value: "XLSX (Excel 2016+)" },
                    { label: "Кодировка", value: "UTF-8" },
                    { label: "Разделитель листов", value: "По направлениям" },
                    { label: "Сохранение в БД", value: "Автоматически" },
                  ].map((p) => (
                    <div
                      key={p.label}
                      className="flex justify-between py-2.5"
                      style={{ borderBottom: "1px solid rgba(42,64,96,0.3)" }}
                    >
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
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                  Справочник факторов СОУТ
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Классификатор вредных и опасных производственных факторов по Приказу Минтруда № 33н
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(FACTOR_CODES).map(([code, name]) => (
                  <div key={code} className="glass-card p-4 flex gap-4 items-start">
                    <div
                      className="w-12 h-8 rounded flex items-center justify-center flex-shrink-0 font-mono font-bold text-xs"
                      style={{ background: "rgba(192,57,43,0.15)", color: "#E74C3C", border: "1px solid rgba(192,57,43,0.3)" }}
                    >
                      {code}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
                        Вредный/опасный производственный фактор · Класс {code[0]}
                      </p>
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
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                  Аналитика СОУТ
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Сводная статистика по всем обработанным картам СОУТ
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="glass-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>
                    Распределение по классам условий труда
                  </p>
                  <div className="space-y-4">
                    {[
                      { label: "Вредные условия (класс 3)", value: dangerResults.length, total: MOCK_RESULTS.length, color: "#E74C3C" },
                      { label: "Допустимые условия (класс 2)", value: safeResults.length, total: MOCK_RESULTS.length, color: "#2ECC71" },
                    ].map((bar) => (
                      <div key={bar.label}>
                        <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
                          <span>{bar.label}</span>
                          <span>{bar.value} из {bar.total} ({Math.round(bar.value / bar.total * 100)}%)</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${(bar.value / bar.total) * 100}%`, background: bar.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>
                    Топ выявленных вредных факторов
                  </p>
                  <div className="space-y-3">
                    {[
                      { name: "Биологический (3.2)", count: 2 },
                      { name: "Химический (3.1)", count: 2 },
                      { name: "Тяжесть труда (3.4)", count: 1 },
                      { name: "Напряжённость (3.5)", count: 1 },
                      { name: "Физический/шум (3.3)", count: 1 },
                    ].map((f, idx) => (
                      <div key={f.name} className="flex items-center gap-3">
                        <span className="text-xs font-bold w-5 text-center" style={{ color: "var(--text-dim)" }}>
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                            <span>{f.name}</span>
                            <span>{f.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(f.count / 3) * 100}%`, background: "var(--gold)" }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card p-5 col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-dim)" }}>
                    Сводка по организациям
                  </p>
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Организация</th>
                        <th style={{ textAlign: "left" }}>Работников</th>
                        <th style={{ textAlign: "left" }}>С вредными условиями</th>
                        <th style={{ textAlign: "left" }}>Доля вредных</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { org: "ООО «Промстрой»", total: 2, danger: 1 },
                        { org: "ФГУП «Транспортник»", total: 2, danger: 1 },
                        { org: "ГБУ «Медцентр №7»", total: 1, danger: 1 },
                      ].map((r) => (
                        <tr key={r.org}>
                          <td style={{ color: "var(--text-primary)" }}>{r.org}</td>
                          <td>{r.total}</td>
                          <td><span className="badge-danger px-2 py-0.5 rounded text-xs">{r.danger}</span></td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(42,64,96,0.4)" }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${(r.danger / r.total) * 100}%`, background: "#E74C3C" }}
                                />
                              </div>
                              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                                {Math.round((r.danger / r.total) * 100)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===== SETTINGS ===== */}
          {section === "settings" && (
            <div className="max-w-xl animate-fade-in">
              <div className="mb-6">
                <h2 className="font-heading font-semibold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                  Настройки системы
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Параметры обработки, хранения и экспорта данных
                </p>
              </div>
              <div className="space-y-4">
                {[
                  {
                    section: "Обработка",
                    items: [
                      { label: "Автоматическое сохранение в БД", value: "Включено" },
                      { label: "Язык распознавания документов", value: "Русский" },
                      { label: "Уровень детализации факторов", value: "Полный" },
                    ],
                  },
                  {
                    section: "Экспорт",
                    items: [
                      { label: "Формат по умолчанию", value: "XLSX" },
                      { label: "Шаблон Excel", value: "Корпоративный" },
                      { label: "Включать расшифровку факторов", value: "Да" },
                    ],
                  },
                  {
                    section: "База данных",
                    items: [
                      { label: "Срок хранения данных", value: "3 года" },
                      { label: "Резервное копирование", value: "Ежедневно" },
                    ],
                  },
                ].map((group) => (
                  <div key={group.section} className="glass-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--gold)" }}>
                      {group.section}
                    </p>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between py-2.5"
                          style={{ borderBottom: "1px solid rgba(42,64,96,0.3)" }}
                        >
                          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                          <span
                            className="text-xs font-medium px-3 py-1 rounded"
                            style={{ background: "rgba(42,64,96,0.4)", color: "var(--text-primary)" }}
                          >
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div
          className="px-6 py-2 flex items-center justify-between text-xs flex-shrink-0"
          style={{ borderTop: "1px solid rgba(42,64,96,0.4)", color: "var(--text-dim)" }}
        >
          <span>АВЕСТА v1.0 — Автоматизированная Верификация и Экспертный Статус Труда и Анализа</span>
          <span>Федеральный закон 426-ФЗ «О специальной оценке условий труда»</span>
        </div>
      </main>
    </div>
  );
}