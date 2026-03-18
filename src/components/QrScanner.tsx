import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";

interface QrScannerProps {
  onScan: (token: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onScan, onClose }: QrScannerProps) {
  const scannerRef = useRef<unknown>(null);
  const containerId = "avesta-qr-reader";
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let scanner: { stop: () => Promise<void> } | null = null;

    const start = async () => {
      try {
        const { Html5QrcodeScanner } = await import("html5-qrcode");
        scanner = new Html5QrcodeScanner(
          containerId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true,
          },
          false
        ) as unknown as { stop: () => Promise<void> };

        (scanner as unknown as { render: (success: (text: string) => void, error: () => void) => void }).render(
          (decodedText: string) => {
            // Извлекаем токен из URL или используем как есть
            let token = decodedText.trim();
            try {
              const url = new URL(decodedText);
              const t = url.searchParams.get("qr");
              if (t) token = t;
            } catch { /* не URL — используем как токен */ }
            onScan(token);
          },
          () => { /* игнорируем ошибки сканирования */ }
        );

        scannerRef.current = scanner;
        setStarted(true);
      } catch (e) {
        setError("Не удалось запустить камеру. Проверьте разрешения браузера.");
        console.error(e);
      }
    };

    start();

    return () => {
      if (scanner) {
        scanner.stop().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="relative w-full max-w-sm mx-4 rounded-xl overflow-hidden"
        style={{ background: "var(--navy-mid)", border: "1px solid rgba(200,149,42,0.3)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(42,64,96,0.5)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center"
              style={{ background: "rgba(200,149,42,0.15)" }}>
              <Icon name="QrCode" size={16} fallback="Scan" style={{ color: "var(--gold)" }} />
            </div>
            <div>
              <p className="font-heading font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                Сканирование QR-кода
              </p>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Наведите камеру на QR-код
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--text-dim)", background: "rgba(42,64,96,0.4)" }}>
            <Icon name="X" size={16} fallback="X" />
          </button>
        </div>

        {/* Scanner area */}
        <div className="p-4">
          {error ? (
            <div className="py-8 text-center">
              <Icon name="CameraOff" size={40} fallback="Camera" style={{ color: "var(--text-dim)", margin: "0 auto 12px" }} />
              <p className="text-sm mb-4" style={{ color: "#E74C3C" }}>{error}</p>
              <button onClick={onClose} className="px-4 py-2 rounded text-sm"
                style={{ background: "rgba(42,64,96,0.5)", color: "var(--text-secondary)" }}>
                Закрыть
              </button>
            </div>
          ) : (
            <>
              {/* Рамка-подсказка поверх сканера */}
              <div className="relative">
                <div id={containerId} style={{ borderRadius: 8, overflow: "hidden" }} />
                {!started && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg"
                    style={{ background: "rgba(10,22,40,0.8)" }}>
                    <div className="text-center">
                      <Icon name="Camera" size={32} fallback="Camera" style={{ color: "var(--gold)", margin: "0 auto 8px" }} />
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Запуск камеры...</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-center mt-3" style={{ color: "var(--text-dim)" }}>
                QR-код будет считан автоматически
              </p>
            </>
          )}
        </div>

        {/* QR corner decorations */}
        <style>{`
          #avesta-qr-reader { background: transparent !important; }
          #avesta-qr-reader video { border-radius: 8px; }
          #avesta-qr-reader__scan_region { background: transparent !important; }
          #avesta-qr-reader__dashboard { padding: 8px 0 0 !important; }
          #avesta-qr-reader__dashboard_section_swaplink { color: var(--gold) !important; }
        `}</style>
      </div>
    </div>
  );
}
