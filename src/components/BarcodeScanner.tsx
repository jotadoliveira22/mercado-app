import { useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { X, Camera, Loader2, ImagePlus } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// Native BarcodeDetector type
interface NativeDetector {
  detect(src: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}
declare const BarcodeDetector: {
  new(opts?: { formats?: string[] }): NativeDetector;
};

async function decodeImage(file: File): Promise<string | null> {
  // 1. Try native BarcodeDetector (Chrome Android 83+)
  if (typeof BarcodeDetector !== 'undefined') {
    try {
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });
      const bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      if (results.length > 0) return results[0].rawValue;
    } catch { /* fallback */ }
  }

  // 2. @zxing fallback
  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const url = URL.createObjectURL(file);
    try {
      const result = await reader.decodeFromImageUrl(url);
      return result.getText();
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch { /* not found */ }

  return null;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'decoding' | 'notfound'>('idle');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('decoding');
    const code = await decodeImage(file);
    if (code) {
      onScan(code);
    } else {
      setStatus('notfound');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-green-700 px-4 py-3 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Escanear Código de Barras</h2>
          <button onClick={onClose} className="text-white hover:text-green-200">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          {status === 'idle' && (
            <>
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
                <Camera size={40} className="text-green-600" />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Toma una foto del código de barras con la cámara de tu teléfono
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full bg-green-700 text-white rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-green-600 active:bg-green-800 transition-colors"
              >
                <Camera size={18} />
                Abrir cámara
              </button>
              <button
                onClick={() => {
                  if (inputRef.current) {
                    inputRef.current.removeAttribute('capture');
                    inputRef.current.click();
                  }
                }}
                className="w-full border border-gray-300 text-gray-600 rounded-xl py-2.5 text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <ImagePlus size={16} />
                Elegir imagen de galería
              </button>
            </>
          )}

          {status === 'decoding' && (
            <>
              <Loader2 size={40} className="animate-spin text-green-600" />
              <p className="text-sm text-gray-500">Leyendo código de barras...</p>
            </>
          )}

          {status === 'notfound' && (
            <>
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <X size={32} className="text-red-400" />
              </div>
              <p className="text-sm text-gray-700 font-medium text-center">No se detectó ningún código</p>
              <p className="text-xs text-gray-400 text-center">
                Intenta con mejor iluminación, enfoca bien el código y que ocupe la mayor parte de la foto
              </p>
              <button
                onClick={() => { setStatus('idle'); if (inputRef.current) inputRef.current.value = ''; }}
                className="w-full bg-green-700 text-white rounded-xl py-3 font-semibold text-sm hover:bg-green-600 transition-colors"
              >
                Intentar de nuevo
              </button>
            </>
          )}
        </div>

        {/* Hidden file input — capture="environment" opens rear camera directly */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
