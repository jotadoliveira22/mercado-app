import { useEffect, useRef } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { X } from 'lucide-react'

interface Props {
  onScan: (codigo: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true

    const scanner = new Html5QrcodeScanner(
      'barcode-reader',
      { fps: 10, qrbox: { width: 280, height: 180 } },
      false,
    )

    scanner.render(
      (codigo) => {
        scanner.clear().catch(() => {})
        onScan(codigo)
      },
      () => {},
    )

    return () => {
      scanner.clear().catch(() => {})
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-green-700">
          <span className="text-white font-semibold">Escanear código de barras</span>
          <button onClick={onClose} className="text-white hover:text-green-200">
            <X size={22} />
          </button>
        </div>
        <div className="p-4">
          <div id="barcode-reader" />
          <p className="text-center text-sm text-gray-500 mt-2">
            Apunta la cámara al código de barras del producto
          </p>
        </div>
      </div>
    </div>
  )
}
