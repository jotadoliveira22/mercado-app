import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, BrowserCodeReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { X, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// Polyfill type for the native BarcodeDetector API
interface NativeBarcodeDetector {
  detect(image: HTMLVideoElement | HTMLCanvasElement): Promise<Array<{ rawValue: string }>>;
}
declare const BarcodeDetector: {
  new(opts: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats?(): Promise<string[]>;
};

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');

  const finish = (code: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onScan(code);
  };

  useEffect(() => {
    const hasNative = typeof BarcodeDetector !== 'undefined';

    if (hasNative) {
      // --- Native BarcodeDetector (Chrome Android 83+) ---
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
        .then(stream => {
          streamRef.current = stream;
          const video = videoRef.current!;
          video.srcObject = stream;
          video.play();
          setStatus('scanning');

          const tick = async () => {
            if (doneRef.current) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              try {
                const results = await detector.detect(video);
                if (results.length > 0) {
                  stream.getTracks().forEach(t => t.stop());
                  finish(results[0].rawValue);
                  return;
                }
              } catch { /* continue */ }
            }
            animFrameRef.current = requestAnimationFrame(tick);
          };
          animFrameRef.current = requestAnimationFrame(tick);
        })
        .catch(e => {
          setStatus('error');
          setErrorMsg(e instanceof Error ? e.message : 'No se pudo acceder a la cámara');
        });
    } else {
      // --- @zxing fallback with EAN hints ---
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);

      BrowserCodeReader.listVideoInputDevices()
        .then(async devices => {
          const rear = devices.find(d => /back|rear|environment/i.test(d.label));
          const deviceId = rear?.deviceId ?? devices[devices.length - 1]?.deviceId;

          setStatus('scanning');
          const controls = await reader.decodeFromVideoDevice(
            deviceId,
            videoRef.current!,
            (result, _err, ctrl) => {
              if (result && !doneRef.current) {
                doneRef.current = true;
                ctrl.stop();
                onScan(result.getText());
              }
            }
          );
          controlsRef.current = controls;
        })
        .catch(e => {
          setStatus('error');
          setErrorMsg(e instanceof Error ? e.message : 'No se pudo acceder a la cámara');
        });
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      controlsRef.current?.stop();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Escanear Código de Barras</h2>
          <button onClick={onClose} className="text-white hover:text-green-200">
            <X size={24} />
          </button>
        </div>
        <div className="p-4">
          {status === 'starting' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={32} className="animate-spin text-green-600" />
              <p className="text-sm text-gray-500">Iniciando cámara...</p>
            </div>
          )}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-red-500 font-medium">Error de cámara</p>
              <p className="text-xs text-gray-400">{errorMsg}</p>
              <button onClick={onClose} className="mt-2 bg-green-700 text-white rounded-xl px-4 py-2 text-sm">
                Cerrar
              </button>
            </div>
          )}
          <video
            ref={videoRef}
            className={`w-full rounded-xl ${status !== 'scanning' ? 'hidden' : ''}`}
            style={{ maxHeight: '300px', objectFit: 'cover' }}
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          {status === 'scanning' && (
            <p className="text-center text-sm text-gray-500 mt-3">
              Apunta la cámara al código de barras del producto
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
