import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AcceptInviteButton } from '@/components/invite/accept-invite-button'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params
  const supabase = await createClient()

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  // Get invite details
  const { data: invite } = await supabase
    .from('household_invites')
    .select(`
      id,
      email,
      role,
      expires_at,
      accepted_at,
      households (
        id,
        name
      )
    `)
    .eq('token', token)
    .single()

  if (!invite) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">Invalid Invite</CardTitle>
            <CardDescription className="text-center">
              This invite link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button variant="outline">Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isExpired = new Date(invite.expires_at) < new Date()
  const isAccepted = invite.accepted_at !== null
  const household = invite.households as unknown as { id: string; name: string }

  if (isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">Invite Expired</CardTitle>
            <CardDescription className="text-center">
              This invite has expired. Please ask the household owner to send a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button variant="outline">Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isAccepted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">Already Accepted</CardTitle>
            <CardDescription className="text-center">
              This invite has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/dashboard">
              <Button className="bg-amber-500 hover:bg-amber-600">Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // If not logged in, show login prompt
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="text-4xl mb-4">🍌</div>
            <CardTitle>You&apos;re Invited!</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join <strong>{household.name}</strong> as a{' '}
              <strong>{invite.role}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-gray-600 text-sm">
              Sign in or create an account with <strong>{invite.email}</strong> to accept this invite.
            </p>
            <div className="flex flex-col gap-2">
              <Link href={`/login?redirect=/invite/${token}`}>
                <Button className="w-full bg-amber-500 hover:bg-amber-600">
                  Sign In
                </Button>
              </Link>
              <Link href={`/signup?redirect=/invite/${token}&email=${encodeURIComponent(invite.email)}`}>
                <Button variant="outline" className="w-full">
                  Create Account
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if email matches
  const emailMatches = user.email?.toLowerCase() === invite.email.toLowerCase()

  if (!emailMatches) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center">Wrong Account</CardTitle>
            <CardDescription className="text-center">
              This invite was sent to <strong>{invite.email}</strong>, but you&apos;re signed in as{' '}
              <strong>{user.email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-gray-600 text-sm">
              Please sign in with the correct email address to accept this invite.
            </p>
            <form action="/api/auth/signout" method="POST" className="text-center">
              <Button type="submit" variant="outline">
                Sign Out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User is logged in with correct email - show accept button
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="text-4xl mb-4">🍌</div>
          <CardTitle>Join {household.name}?</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join this household as a <strong>{invite.role}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AcceptInviteButton token={token} />
          <Link href="/dashboard" className="block">
            <Button variant="ghost" className="w-full">
              Cancel
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
