'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)

  const stopScanning = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset()
      readerRef.current = null
    }
    setIsScanning(false)
  }, [])

  useEffect(() => {
    let mounted = true

    const startScanning = async () => {
      if (!videoRef.current) return

      try {
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        // Get available video devices
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')

        if (videoDevices.length === 0) {
          setError('No camera found')
          return
        }

        // Prefer back camera on mobile
        const backCamera = videoDevices.find(device =>
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('rear')
        )
        const deviceId = backCamera?.deviceId || videoDevices[0].deviceId

        setIsScanning(true)

        await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result, err) => {
            if (!mounted) return

            if (result) {
              const barcode = result.getText()
              stopScanning()
              onScan(barcode)
            }

            if (err && !(err instanceof NotFoundException)) {
              console.error('Scan error:', err)
            }
          }
        )
      } catch (err) {
        if (!mounted) return
        console.error('Camera error:', err)
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            setError('Camera access denied. Please allow camera access to scan barcodes.')
          } else if (err.name === 'NotFoundError') {
            setError('No camera found on this device.')
          } else {
            setError(`Camera error: ${err.message}`)
          }
        } else {
          setError('Failed to start camera')
        }
      }
    }

    startScanning()

    return () => {
      mounted = false
      stopScanning()
    }
  }, [onScan, stopScanning])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Scan Barcode</h3>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>

            {error ? (
              <div className="text-center py-8">
                <p className="text-red-700 mb-4" role="alert">{error}</p>
                <Button variant="outline" onClick={onClose}>
                  Go Back
                </Button>
              </div>
            ) : (
              <>
                <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {isScanning && (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Scanning indicator */}
                      <div className="absolute inset-[20%] border-2 border-amber-500 rounded-lg">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-500 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-500 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-500 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-500 rounded-br-lg" />
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 text-center">
                  Point your camera at a barcode
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
