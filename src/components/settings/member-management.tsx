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
  email?: string
}

interface MemberManagementProps {
  members: Member[]
  invites: HouseholdInvite[]
  currentUserId: string
  currentUserEmail: string
  householdId: string
  householdName: string
  isOwner: boolean
  invitesEnabled?: boolean
}

export function MemberManagement({
  members,
  invites,
  currentUserId,
  currentUserEmail,
  householdId,
  householdName,
  isOwner,
  invitesEnabled = true,
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

    // Check for existing pending (non-expired) invite
    const { data: existingInvite } = await supabase
      .from('household_invites')
      .select('id')
      .eq('household_id', householdId)
      .eq('email', inviteForm.email.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingInvite) {
      toast.error('An invite is already pending for this email')
      setLoading(false)
      return
    }

    // Delete any expired invites for this email first
    await supabase
      .from('household_invites')
      .delete()
      .eq('household_id', householdId)
      .eq('email', inviteForm.email.toLowerCase())
      .is('accepted_at', null)
      .lt('expires_at', new Date().toISOString())

    const { data: newInvite, error } = await supabase
      .from('household_invites')
      .insert({
        household_id: householdId,
        email: inviteForm.email.toLowerCase(),
        role: inviteForm.role,
        invited_by: currentUserId,
      })
      .select('token')
      .single()

    if (error) {
      toast.error('Failed to send invite')
      setLoading(false)
      return
    }

    // Send invite email
    try {
      const emailResponse = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email.toLowerCase(),
          householdName,
          inviterName: currentUserEmail,
          token: newInvite.token,
          role: inviteForm.role,
        }),
      })

      if (!emailResponse.ok) {
        console.warn('Email sending failed, but invite was created')
      }
    } catch (emailError) {
      console.warn('Email sending failed:', emailError)
    }

    toast.success(`Invite sent to ${inviteForm.email}`)
    setDialogOpen(false)
    setInviteForm({ email: '', role: 'member' })
    router.refresh()

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

  async function handleResendInvite(invite: HouseholdInvite) {
    setLoading(true)
    const supabase = createClient()

    // Create a new invite (delete old one first)
    await supabase
      .from('household_invites')
      .delete()
      .eq('id', invite.id)

    const { data: newInvite, error } = await supabase
      .from('household_invites')
      .insert({
        household_id: householdId,
        email: invite.email,
        role: invite.role,
        invited_by: currentUserId,
      })
      .select('token')
      .single()

    if (error) {
      toast.error('Failed to resend invite')
      setLoading(false)
      return
    }

    // Send invite email
    try {
      const emailResponse = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invite.email,
          householdName,
          inviterName: currentUserEmail,
          token: newInvite.token,
          role: invite.role,
        }),
      })

      if (emailResponse.ok) {
        toast.success(`Invite resent to ${invite.email}`)
      } else {
        toast.success('Invite created (email may not have sent)')
      }
    } catch {
      toast.success('Invite created (email may not have sent)')
    }

    router.refresh()
    setLoading(false)
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

  async function handleChangeRole(memberId: string, newRole: 'owner' | 'member') {
    const supabase = createClient()
    const { error } = await supabase.rpc('update_member_role', {
      p_member_id: memberId,
      p_new_role: newRole,
    })

    if (error) {
      toast.error(error.message || 'Failed to change role')
    } else {
      toast.success(`Role updated to ${newRole}`)
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
          {isOwner && invitesEnabled && (
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
          {members.map((member) => {
            const memberEmail = member.email || (member.user_id === currentUserId ? currentUserEmail : null)
            const displayName = memberEmail || 'Household Member'
            const initials = memberEmail ? memberEmail.charAt(0).toUpperCase() : '?'

            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <span className="text-amber-700 font-medium">
                      {member.user_id === currentUserId ? 'You' : initials}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{displayName}</p>
                    <p className="text-sm text-gray-500">
                      Joined {new Date(member.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && member.user_id !== currentUserId ? (
                    <Select
                      value={member.role}
                      onValueChange={(value: 'owner' | 'member') => handleChangeRole(member.id, value)}
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                      {member.role}
                    </Badge>
                  )}
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
            )
          })}
        </div>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <div className="pt-4 border-t space-y-3">
            <p className="text-sm font-medium text-gray-500">Pending Invites</p>
            {invites.map((invite) => {
              const isExpired = new Date(invite.expires_at) < new Date()
              return (
                <div
                  key={invite.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    isExpired ? 'bg-red-50' : 'bg-amber-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isExpired ? 'bg-red-200' : 'bg-amber-200'
                    }`}>
                      <span className={isExpired ? 'text-red-700' : 'text-amber-700'}>?</span>
                    </div>
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className={`text-sm ${isExpired ? 'text-red-600' : 'text-gray-500'}`}>
                        {isExpired
                          ? `Expired ${new Date(invite.expires_at).toLocaleDateString()}`
                          : `Expires ${new Date(invite.expires_at).toLocaleDateString()}`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isExpired ? 'destructive' : 'outline'}>
                      {isExpired ? 'Expired' : invite.role}
                    </Badge>
                    {isOwner && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResendInvite(invite)}
                          disabled={loading}
                        >
                          {loading ? '...' : 'Resend'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleCancelInvite(invite.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
