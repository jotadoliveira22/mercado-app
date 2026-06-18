import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: 250 },
      false
    );
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        onScan(decodedText);
        scanner.clear().catch(() => {});
      },
      () => {
        // ignore scan failures
      }
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Escanear Código de Barras</h2>
          <button onClick={onClose} className="text-white hover:text-green-200">
            <X size={24} />
          </button>
        </div>
        <div className="p-4">
          <div id="reader" className="w-full" />
          <p className="text-center text-sm text-gray-500 mt-2">
            Apunta la cámara al código de barras del producto
          </p>
        </div>
      </div>
    </div>
  );
}
