import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

interface InviteEmailRequest {
  email: string
  householdName: string
  inviterName: string
  token: string
  role: 'owner' | 'member'
}

export async function POST(request: NextRequest) {
  try {
    const body: InviteEmailRequest = await request.json()
    const { email, householdName, inviterName, token, role } = body

    if (!email || !householdName || !token) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if Resend is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured - skipping email send')
      return NextResponse.json({
        success: true,
        warning: 'Email service not configured',
      })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://bunchofbananas.vercel.app'}/invite/${token}`

    const { data, error } = await resend.emails.send({
      from: 'BunchOfBananas <noreply@resend.dev>',
      to: email,
      subject: `You've been invited to join ${householdName} on BunchOfBananas`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <span style="font-size: 48px;">🍌</span>
            <h1 style="color: #f59e0b; margin: 10px 0;">BunchOfBananas</h1>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 10px 0; color: #333;">You're Invited!</h2>
            <p style="margin: 0;">
              <strong>${inviterName || 'Someone'}</strong> has invited you to join the
              <strong>${householdName}</strong> household as a <strong>${role}</strong>.
            </p>
          </div>

          <p>With BunchOfBananas, you can:</p>
          <ul style="margin: 15px 0;">
            <li>Track household inventory across fridges, freezers, and pantries</li>
            <li>See what's expiring soon and avoid food waste</li>
            <li>Manage shopping lists together</li>
            <li>Track prices and find deals</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}"
               style="display: inline-block; background: #f59e0b; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Accept Invitation
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br>
            <a href="${inviteUrl}" style="color: #f59e0b;">${inviteUrl}</a>
          </p>

          <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </body>
        </html>
      `,
    })

    if (error) {
      console.error('Failed to send invite email:', error)
      return NextResponse.json(
        { error: 'Failed to send email', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, messageId: data?.id })
  } catch (error) {
    console.error('Invite email error:', error)
    return NextResponse.json(
      { error: 'Failed to send invite email' },
      { status: 500 }
    )
  }
}
