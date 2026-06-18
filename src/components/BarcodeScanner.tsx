import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, BrowserCodeReader } from '@zxing/browser';
import { X, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      try {
        const devices = await BrowserCodeReader.listVideoInputDevices();
        const rear = devices.find(d =>
          /back|rear|environment/i.test(d.label)
        );
        const deviceId = rear?.deviceId ?? devices[devices.length - 1]?.deviceId ?? undefined;

        setStatus('scanning');

        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err, ctrl) => {
            if (result && !doneRef.current) {
              doneRef.current = true;
              ctrl.stop();
              onScan(result.getText());
            }
            void err; // decode errors are expected while scanning
          }
        );
        controlsRef.current = controls;
      } catch (e) {
        setStatus('error');
        setErrorMsg(e instanceof Error ? e.message : 'No se pudo acceder a la cámara');
      }
    };

    start();

    return () => {
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
          />
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
