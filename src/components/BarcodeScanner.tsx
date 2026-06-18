import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode('reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        if (scannedRef.current) return;
        scannedRef.current = true;
        scanner.stop().catch(() => {}).finally(() => onScan(decodedText));
      },
      () => {},
    ).catch(() => {
      // Fallback: try any camera if rear not available
      scanner.start(
        { facingMode: 'user' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          scanner.stop().catch(() => {}).finally(() => onScan(decodedText));
        },
        () => {},
      ).catch(() => {});
    });

    return () => {
      scanner.stop().catch(() => {});
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
          <div id="reader" className="w-full rounded-xl overflow-hidden" />
          <p className="text-center text-sm text-gray-500 mt-3">
            Apunta la cámara al código de barras del producto
          </p>
        </div>
      </div>
    </div>
  );
}
