import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SharingSettings } from '@/components/settings/sharing-settings'
import { MemberManagement } from '@/components/settings/member-management'

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's household with full details
  const { data: membership } = await supabase
    .from('household_members')
    .select(`
      household_id,
      role,
      households (
        id,
        name,
        is_public,
        share_token,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/dashboard')

  // Get all household members
  const { data: members } = await supabase
    .from('household_members')
    .select(`
      id,
      role,
      created_at,
      user_id
    `)
    .eq('household_id', membership.household_id)

  // Get pending invites
  const { data: invites } = await supabase
    .from('household_invites')
    .select('*')
    .eq('household_id', membership.household_id)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())

  const household = membership.households as unknown as {
    id: string
    name: string
    is_public: boolean
    share_token: string
    created_at: string
  }

  const isOwner = membership.role === 'owner'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and household</p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-lg">{user.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">User ID</label>
            <p className="text-sm text-gray-600 font-mono">{user.id}</p>
          </div>
        </CardContent>
      </Card>

      {/* Household */}
      <Card>
        <CardHeader>
          <CardTitle>Household</CardTitle>
          <CardDescription>Manage your household settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Household Name</label>
            <p className="text-lg">{household.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Your Role</label>
            <p>
              <Badge variant={membership.role === 'owner' ? 'default' : 'secondary'}>
                {membership.role}
              </Badge>
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Created</label>
            <p className="text-gray-600">
              {new Date(household.created_at).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sharing Settings - Only for owners */}
      {isOwner && (
        <SharingSettings
          householdId={household.id}
          isPublic={household.is_public}
          shareToken={household.share_token}
        />
      )}

      {/* Members */}
      <MemberManagement
        members={members || []}
        invites={invites || []}
        currentUserId={user.id}
        currentUserEmail={user.email || ''}
        householdId={membership.household_id}
        isOwner={isOwner}
      />
    </div>
  )
}
