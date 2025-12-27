'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface AcceptInviteButtonProps {
  token: string
}

export function AcceptInviteButton({ token }: AcceptInviteButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleAccept() {
    setLoading(true)

    const supabase = createClient()

    const { data, error } = await supabase.rpc('accept_household_invite', {
      invite_token: token,
    })

    if (error) {
      toast.error('Failed to accept invite')
      setLoading(false)
      return
    }

    const result = data as { success: boolean; error?: string; household_id?: string }

    if (!result.success) {
      toast.error(result.error || 'Failed to accept invite')
      setLoading(false)
      return
    }

    toast.success('Welcome to the household!')
    router.push('/dashboard')
  }

  return (
    <Button
      onClick={handleAccept}
      disabled={loading}
      className="w-full bg-amber-500 hover:bg-amber-600"
    >
      {loading ? 'Joining...' : 'Accept Invite'}
    </Button>
  )
}
