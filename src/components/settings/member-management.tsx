'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { HouseholdInvite } from '@/types/database'

interface Member {
  id: string
  role: 'owner' | 'member'
  created_at: string
  user_id: string
}

interface MemberManagementProps {
  members: Member[]
  invites: HouseholdInvite[]
  currentUserId: string
  currentUserEmail: string
  householdId: string
  isOwner: boolean
}

export function MemberManagement({
  members,
  invites,
  currentUserId,
  currentUserEmail,
  householdId,
  isOwner,
}: MemberManagementProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member' as 'owner' | 'member',
  })

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()

    // Check if email is already a member
    const { data: existingMember } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', householdId)
      .eq('user_id', (
        await supabase.from('auth.users').select('id').eq('email', inviteForm.email).single()
      ).data?.id || '')
      .single()

    if (existingMember) {
      toast.error('This user is already a member')
      setLoading(false)
      return
    }

    // Check for existing pending invite
    const { data: existingInvite } = await supabase
      .from('household_invites')
      .select('id')
      .eq('household_id', householdId)
      .eq('email', inviteForm.email.toLowerCase())
      .is('accepted_at', null)
      .single()

    if (existingInvite) {
      toast.error('An invite is already pending for this email')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('household_invites').insert({
      household_id: householdId,
      email: inviteForm.email.toLowerCase(),
      role: inviteForm.role,
      invited_by: currentUserId,
    })

    if (error) {
      toast.error('Failed to send invite')
    } else {
      toast.success(`Invite sent to ${inviteForm.email}`)
      setDialogOpen(false)
      setInviteForm({ email: '', role: 'member' })
      router.refresh()
    }

    setLoading(false)
  }

  async function handleCancelInvite(inviteId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('household_invites')
      .delete()
      .eq('id', inviteId)

    if (error) {
      toast.error('Failed to cancel invite')
    } else {
      toast.success('Invite cancelled')
      router.refresh()
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Are you sure you want to remove this member?')) return

    const supabase = createClient()
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('id', memberId)

    if (error) {
      toast.error('Failed to remove member')
    } else {
      toast.success('Member removed')
      router.refresh()
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Household Members</CardTitle>
            <CardDescription>
              {members.length} member{members.length !== 1 ? 's' : ''}
              {invites.length > 0 && ` • ${invites.length} pending invite${invites.length !== 1 ? 's' : ''}`}
            </CardDescription>
          </div>
          {isOwner && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600">
                  + Invite
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite Member</DialogTitle>
                  <DialogDescription>
                    Send an invite to join your household
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      placeholder="person@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={inviteForm.role}
                      onValueChange={(value: 'owner' | 'member') =>
                        setInviteForm({ ...inviteForm, role: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member - Can view and edit inventory</SelectItem>
                        <SelectItem value="owner">Owner - Full access including settings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-amber-500 hover:bg-amber-600" disabled={loading}>
                      {loading ? 'Sending...' : 'Send Invite'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Members */}
        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <span className="text-amber-700 font-medium">
                    {member.user_id === currentUserId ? 'You' : '?'}
                  </span>
                </div>
                <div>
                  <p className="font-medium">
                    {member.user_id === currentUserId ? currentUserEmail : 'Household Member'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Joined {new Date(member.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                  {member.role}
                </Badge>
                {isOwner && member.user_id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => handleRemoveMember(member.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <div className="pt-4 border-t space-y-3">
            <p className="text-sm font-medium text-gray-500">Pending Invites</p>
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-amber-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center">
                    <span className="text-amber-700">?</span>
                  </div>
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-gray-500">
                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{invite.role}</Badge>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => handleCancelInvite(invite.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
