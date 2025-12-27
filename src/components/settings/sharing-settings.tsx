'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface SharingSettingsProps {
  householdId: string
  isPublic: boolean
  shareToken: string
}

export function SharingSettings({ householdId, isPublic, shareToken }: SharingSettingsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [publicEnabled, setPublicEnabled] = useState(isPublic)

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/view/${shareToken}`
    : `/view/${shareToken}`

  async function togglePublicAccess() {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('households')
      .update({ is_public: !publicEnabled })
      .eq('id', householdId)

    if (error) {
      toast.error('Failed to update sharing settings')
    } else {
      setPublicEnabled(!publicEnabled)
      toast.success(publicEnabled ? 'Public access disabled' : 'Public access enabled')
      router.refresh()
    }

    setLoading(false)
  }

  async function regenerateToken() {
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('households')
      .update({ share_token: crypto.randomUUID() })
      .eq('id', householdId)

    if (error) {
      toast.error('Failed to regenerate link')
    } else {
      toast.success('New share link generated')
      router.refresh()
    }

    setLoading(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    toast.success('Link copied to clipboard')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Sharing</CardTitle>
        <CardDescription>
          Allow anyone with the link to view your inventory (read-only)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Public View Access</p>
            <p className="text-sm text-gray-500">
              {publicEnabled
                ? 'Anyone with the link can view your inventory'
                : 'Only household members can view inventory'}
            </p>
          </div>
          <Button
            variant={publicEnabled ? 'destructive' : 'default'}
            onClick={togglePublicAccess}
            disabled={loading}
          >
            {publicEnabled ? 'Disable' : 'Enable'}
          </Button>
        </div>

        {publicEnabled && (
          <div className="space-y-3 pt-4 border-t">
            <label className="text-sm font-medium text-gray-500">Share Link</label>
            <div className="flex gap-2">
              <Input value={publicUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" onClick={copyLink}>
                Copy
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={regenerateToken}
              disabled={loading}
              className="text-gray-500"
            >
              Generate new link (invalidates old one)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
