import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { X, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus('scanning');

        // Try native BarcodeDetector first (Chrome Android)
        if ('BarcodeDetector' in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
          });
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext('2d')!;

          const tick = async () => {
            if (doneRef.current || cancelled) return;
            if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              try {
                const results = await detector.detect(canvas);
                if (results.length > 0 && !doneRef.current) {
                  doneRef.current = true;
                  stream.getTracks().forEach(t => t.stop());
                  onScan(results[0].rawValue);
                  return;
                }
              } catch { /* continue */ }
            }
            rafRef.current = requestAnimationFrame(() => { setTimeout(tick, 100); });
          };
          tick();
        } else {
          // Fallback: @zxing/browser
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hints = new Map<DecodeHintType, any>([
            [DecodeHintType.POSSIBLE_FORMATS, [
              BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
              BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
              BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
            ]],
            [DecodeHintType.TRY_HARDER, true],
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          // Use canvas polling with @zxing image decode
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext('2d')!;
          const tick = async () => {
            if (doneRef.current || cancelled) return;
            if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              try {
                const result = reader.decodeFromCanvas(canvas);
                if (result && !doneRef.current) {
                  doneRef.current = true;
                  stream.getTracks().forEach(t => t.stop());
                  onScan(result.getText());
                  return;
                }
              } catch { /* not found this frame */ }
            }
            setTimeout(tick, 150);
          };
          tick();
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(e instanceof Error ? e.message : 'No se pudo acceder a la cámara');
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Escanear Código de Barras</h2>
          <button onClick={onClose} className="text-white hover:text-green-200">
            <X size={24} />
          </button>
        </div>
        <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
          {status === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 size={36} className="animate-spin text-white" />
              <p className="text-white text-sm">Iniciando cámara...</p>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <p className="text-red-400 font-medium text-sm">Error al acceder a la cámara</p>
              <p className="text-gray-400 text-xs">{errorMsg}</p>
            </div>
          )}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          {/* Targeting overlay */}
          {status === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-64 h-32">
                {/* corners */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-md" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-md" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-md" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-md" />
                {/* scan line */}
                <div className="absolute inset-x-2 top-1/2 h-0.5 bg-green-400 opacity-80 animate-pulse" />
              </div>
            </div>
          )}
        </div>
        {status === 'scanning' && (
          <p className="text-center text-sm text-gray-500 py-3 px-4">
            Centra el código dentro del recuadro
          </p>
        )}
        {status === 'error' && (
          <button onClick={onClose} className="w-full py-3 bg-green-700 text-white font-semibold text-sm">
            Cerrar
          </button>
        )}
      </div>
    </div>
  );
}
