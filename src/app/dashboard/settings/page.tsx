import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's household with members
  const { data: membership } = await supabase
    .from('household_members')
    .select(`
      household_id,
      role,
      households (
        id,
        name,
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

  const household = membership.households as unknown as { id: string; name: string; created_at: string }

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

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Household Members</CardTitle>
          <CardDescription>
            {members?.length || 0} member{(members?.length || 0) !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members?.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <span className="text-amber-700 font-medium">
                      {member.user_id === user.id ? 'You' : '?'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">
                      {member.user_id === user.id ? user.email : 'Member'}
                    </p>
                    <p className="text-sm text-gray-500">
                      Joined {new Date(member.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                  {member.role}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Member invitation feature coming soon!
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
