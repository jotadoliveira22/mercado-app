import { useEffect, useRef, useState } from 'react';
import Quagga from '@ericblade/quagga2';
import { X, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let started = false;

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: containerRef.current!,
          constraints: {
            width: { min: 640 },
            height: { min: 480 },
            facingMode: 'environment',
            aspectRatio: { min: 1, max: 2 },
          },
        },
        locator: { patchSize: 'medium', halfSample: true },
        numOfWorkers: navigator.hardwareConcurrency > 2 ? 2 : 1,
        frequency: 10,
        decoder: {
          readers: [
            'ean_reader',
            'ean_8_reader',
            'upc_reader',
            'upc_e_reader',
            'code_128_reader',
            'code_39_reader',
          ],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : String(err));
          return;
        }
        started = true;
        Quagga.start();
        setStatus('scanning');
      }
    );

    Quagga.onDetected((result) => {
      const code = result?.codeResult?.code;
      if (!code || doneRef.current) return;
      // Require confidence — only accept if decodedCodes have low error
      const errors = result.codeResult.decodedCodes
        .filter(c => c.error !== undefined)
        .map(c => c.error as number);
      const avgErr = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 1;
      if (avgErr > 0.25) return;
      doneRef.current = true;
      Quagga.stop();
      onScan(code);
    });

    return () => {
      if (started) Quagga.stop();
      Quagga.offDetected();
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
              <p className="text-sm text-red-500 font-medium">Error al iniciar cámara</p>
              <p className="text-xs text-gray-400">{errorMsg}</p>
              <button onClick={onClose} className="mt-2 bg-green-700 text-white rounded-xl px-4 py-2 text-sm">
                Cerrar
              </button>
            </div>
          )}
          {/* Quagga renders video+canvas here */}
          <div
            ref={containerRef}
            className={`w-full rounded-xl overflow-hidden relative ${status !== 'scanning' ? 'hidden' : ''}`}
            style={{ height: '260px' }}
          />
          {status === 'scanning' && (
            <p className="text-center text-sm text-gray-500 mt-3">
              Centra el código de barras en la cámara
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
