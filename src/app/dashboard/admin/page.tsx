import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Admin emails - add your email here
const ADMIN_EMAILS = ['katzman.steven@gmail.com']

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check if user is admin
  if (!ADMIN_EMAILS.includes(user.email || '')) {
    redirect('/dashboard')
  }

  // Get all households with member counts
  const { data: households } = await supabase
    .from('households')
    .select(`
      id,
      name,
      is_public,
      created_at,
      household_members (
        id,
        role,
        user_id
      )
    `)
    .order('created_at', { ascending: false })

  // Get all users via admin function
  const { data: allMembers } = await supabase
    .from('household_members')
    .select(`
      id,
      role,
      user_id,
      created_at,
      households (
        id,
        name
      )
    `)
    .order('created_at', { ascending: false })

  // Get all invites
  const { data: allInvites } = await supabase
    .from('household_invites')
    .select(`
      id,
      email,
      role,
      expires_at,
      accepted_at,
      created_at,
      households (
        id,
        name
      )
    `)
    .order('created_at', { ascending: false })

  // Get user emails via RPC
  const userEmails: Record<string, string> = {}

  // For each unique user_id, try to get their email from a household they belong to
  const uniqueUserIds = [...new Set(allMembers?.map(m => m.user_id) || [])]

  // Get emails from each household
  const processedHouseholds = new Set<string>()
  for (const member of allMembers || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const householdData = member.households as any
    const household = householdData as { id: string; name: string } | null
    if (household?.id && !processedHouseholds.has(household.id)) {
      processedHouseholds.add(household.id)
      const { data: memberData } = await supabase.rpc('get_household_members_with_emails', {
        p_household_id: household.id,
      })
      if (memberData) {
        for (const m of memberData) {
          userEmails[m.user_id] = m.email
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">Manage all households and users</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{households?.length || 0}</div>
            <p className="text-sm text-gray-500">Households</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{uniqueUserIds.length}</div>
            <p className="text-sm text-gray-500">Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {allInvites?.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date()).length || 0}
            </div>
            <p className="text-sm text-gray-500">Pending Invites</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {households?.filter(h => h.is_public).length || 0}
            </div>
            <p className="text-sm text-gray-500">Public Households</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="households">
        <TabsList>
          <TabsTrigger value="households">Households</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="households" className="space-y-4 mt-4">
          {households?.map((household) => (
            <Card key={household.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{household.name}</CardTitle>
                  <div className="flex gap-2">
                    {household.is_public && <Badge variant="secondary">Public</Badge>}
                    <Badge>{household.household_members?.length || 0} members</Badge>
                  </div>
                </div>
                <CardDescription>
                  Created {new Date(household.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {household.household_members?.map((member: { id: string; user_id: string; role: string }) => (
                    <div key={member.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                      <span>{userEmails[member.user_id] || member.user_id}</span>
                      <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="users" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>{uniqueUserIds.length} registered users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {uniqueUserIds.map((userId) => {
                  const userMemberships = allMembers?.filter(m => m.user_id === userId) || []
                  return (
                    <div key={userId} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{userEmails[userId] || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 font-mono">{userId}</p>
                        </div>
                        <Badge>{userMemberships.length} household(s)</Badge>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">
                        {userMemberships.map((m) => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const hh = m.households as any
                          return (
                            <span key={m.id} className="mr-2">
                              {hh?.name} ({m.role})
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Invites</CardTitle>
              <CardDescription>{allInvites?.length || 0} total invites</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {allInvites?.map((invite) => {
                  const isExpired = new Date(invite.expires_at) < new Date()
                  const isAccepted = !!invite.accepted_at
                  return (
                    <div
                      key={invite.id}
                      className={`p-3 rounded-lg ${
                        isAccepted ? 'bg-green-50' : isExpired ? 'bg-red-50' : 'bg-amber-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-sm text-gray-500">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(invite.households as any)?.name} • {invite.role}
                          </p>
                        </div>
                        <Badge variant={isAccepted ? 'default' : isExpired ? 'destructive' : 'secondary'}>
                          {isAccepted ? 'Accepted' : isExpired ? 'Expired' : 'Pending'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Created {new Date(invite.created_at).toLocaleDateString()}
                        {isAccepted && ` • Accepted ${new Date(invite.accepted_at!).toLocaleDateString()}`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
