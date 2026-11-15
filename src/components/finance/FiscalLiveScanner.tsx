import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatOneDReader, BrowserQRCodeReader } from "@zxing/browser";
import { ScanLine, CameraOff, Lightbulb, LightbulbOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routeFiscalAccess } from "@/lib/fiscal/fiscal-routing";

export type FiscalScanMode = "qr_code" | "code_128";

type ScanControls = {
  stop(): void | Promise<void>;
  switchTorch?: (enabled: boolean) => Promise<void>;
};

type Props = {
  mode: FiscalScanMode;
  onDetected: (value: string) => void;
};

/**
 * Scanner contínuo, usando a câmera traseira e decoder ZXing local.
 * Não captura fotografias e não envia frames para um servidor.
 * A câmera é liberada ao detectar a chave ou ao fechar o diálogo.
 */
export function FiscalLiveScanner({ mode, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [status, setStatus] = useState("Iniciando câmera…");
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const controlsRef = useRef<ScanControls | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    setError(null);
    setStatus("Solicitando acesso à câmera traseira…");
    setTorch(false);
    setTorchSupported(false);

    const release = () => {
      const controls = controlsRef.current;
      controlsRef.current = null;
      if (controls) void controls.stop();
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach(track => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      }
    };

    async function begin() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("A câmera do navegador exige HTTPS e permissão de acesso. Abra o Axion pelo Chrome ou Samsung Internet atualizado.");
        return;
      }
      const preview = videoRef.current;
      if (!preview) return;
      try {
        const reader = mode === "qr_code"
          ? new BrowserQRCodeReader()
          : new BrowserMultiFormatOneDReader();

        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          preview,
          (result, _error, currentControls) => {
            if (cancelled || resolved || !result) return;
            const raw = result.getText().trim();
            if (!routeFiscalAccess(raw)) {
              setStatus(/^\d{13}$/.test(raw)
                ? "EAN-13 identificado. É o código de um produto, não da nota; procure o QR Code fiscal."
                : "Código detectado, mas não contém uma chave fiscal válida de 44 dígitos. Aponte para o QR Code da nota.");
              return;
            }
            resolved = true;
            cancelled = true;
            void currentControls.stop();
            release();
            onDetectedRef.current(raw);
          },
        );

        if (cancelled) {
          void controls.stop();
          return;
        }
        controlsRef.current = controls;
        setTorchSupported(typeof controls.switchTorch === "function");
        setStatus(mode === "qr_code"
          ? "Aponte para o QR Code da NFC-e. A leitura é automática."
          : "Aponte para o código de barras da chave fiscal de 44 dígitos.");
      } catch (reason) {
        if (cancelled) return;
        const name = reason instanceof DOMException ? reason.name : "";
        const message = name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Permissão da câmera negada. Autorize o acesso nas configurações deste site."
          : name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "Nenhuma câmera disponível foi encontrada."
          : name === "NotReadableError" || name === "TrackStartError"
          ? "A câmera está ocupada por outro aplicativo. Feche o outro aplicativo e tente novamente."
          : "Não foi possível iniciar o leitor. Confira o acesso HTTPS e as permissões da câmera.";
        setError(message);
        release();
      }
    }

    void begin();
    return () => {
      cancelled = true;
      release();
    };
  }, [mode]);

  const toggleTorch = async () => {
    const controls = controlsRef.current;
    if (!controls?.switchTorch) return;
    try {
      await controls.switchTorch(!torch);
      setTorch(current => !current);
    } catch {
      setStatus("A lanterna não está disponível nesta câmera.");
    }
  };

  return <div className="space-y-3">
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} autoPlay muted playsInline className="aspect-[3/4] max-h-[65vh] w-full object-cover sm:aspect-video" aria-label="Visualização contínua da câmera para leitura fiscal"/>
      {!error && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-48 w-48 rounded-2xl border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.22)] sm:h-56 sm:w-56">
          <ScanLine className="m-2 h-6 w-6 text-emerald-400"/>
        </div>
      </div>}
      {error && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
        <CameraOff className="h-10 w-10"/>
        <p className="text-sm">{error}</p>
      </div>}
    </div>
    <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">{status}</p>
    {torchSupported && !error && <div className="flex justify-center">
      <Button type="button" variant="outline" size="sm" onClick={()=>void toggleTorch()}>
        {torch ? <LightbulbOff className="mr-2 h-4 w-4"/> : <Lightbulb className="mr-2 h-4 w-4"/>}
        {torch ? "Desligar lanterna" : "Ligar lanterna"}
      </Button>
    </div>}
    <p className="text-xs text-muted-foreground">Leitura em tempo real: não salva nem envia fotos. Centralize o QR Code, aproxime lentamente e mantenha a câmera firme.</p>
  </div>;
}
