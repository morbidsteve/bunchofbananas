'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ReceiptScannerProps {
  onCapture: (imageData: string) => void
  onCancel: () => void
}

export function ReceiptScanner({ onCapture, onCancel }: ReceiptScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [mode, setMode] = useState<'select' | 'camera' | 'preview'>('select')

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return

    try {
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

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: backCamera?.deviceId ? { exact: backCamera.deviceId } : undefined,
          facingMode: backCamera ? undefined : 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setIsCameraActive(true)
      setMode('camera')
    } catch (err) {
      console.error('Camera error:', err)
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access.')
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.')
        } else {
          setError(`Camera error: ${err.message}`)
        }
      } else {
        setError('Failed to start camera')
      }
    }
  }, [])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg', 0.9)

    stopCamera()
    setPreviewImage(imageData)
    setMode('preview')
  }, [stopCamera])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Maximum size is 10MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const imageData = event.target?.result as string
      setPreviewImage(imageData)
      setMode('preview')
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsDataURL(file)
  }, [])

  const confirmImage = useCallback(() => {
    if (previewImage) {
      onCapture(previewImage)
    }
  }, [previewImage, onCapture])

  const retake = useCallback(() => {
    setPreviewImage(null)
    setMode('select')
    setError(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Scan Receipt</h3>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setError(null); setMode('select'); }}
                  className="mt-2"
                >
                  Try Again
                </Button>
              </div>
            )}

            {/* Mode Selection */}
            {mode === 'select' && !error && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 text-center">
                  Take a photo of your receipt or upload an existing image
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-24 flex-col gap-2"
                    onClick={startCamera}
                  >
                    <span className="text-2xl">📷</span>
                    <span>Take Photo</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-24 flex-col gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="text-2xl">📁</span>
                    <span>Upload Image</span>
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            )}

            {/* Camera View */}
            {mode === 'camera' && (
              <div className="space-y-4">
                <div className="relative aspect-[3/4] bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {isCameraActive && (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Receipt outline guide */}
                      <div className="absolute inset-[5%] border-2 border-dashed border-white/50 rounded-lg" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { stopCamera(); setMode('select'); }} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={capturePhoto}
                    className="flex-1 bg-amber-500 hover:bg-amber-600"
                    disabled={!isCameraActive}
                  >
                    Capture
                  </Button>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Position the receipt within the frame and tap Capture
                </p>
              </div>
            )}

            {/* Preview */}
            {mode === 'preview' && previewImage && (
              <div className="space-y-4">
                <div className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={previewImage}
                    alt="Receipt preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={retake} className="flex-1">
                    Retake
                  </Button>
                  <Button
                    onClick={confirmImage}
                    className="flex-1 bg-amber-500 hover:bg-amber-600"
                  >
                    Use This Image
                  </Button>
                </div>
              </div>
            )}

            {/* Hidden canvas for photo capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
