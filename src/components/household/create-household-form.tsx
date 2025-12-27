'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface CreateHouseholdFormProps {
  userId: string
}

export function CreateHouseholdForm({ userId }: CreateHouseholdFormProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    // Create household and add user as owner atomically
    const { error: createError } = await supabase
      .rpc('create_household_with_owner', { household_name: name })

    if (createError) {
      setError(createError.message)
      setLoading(false)
      return
    }

    router.refresh()
  }

  return (
    <div className="max-w-md mx-auto mt-8">
      <Card>
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🏠</div>
          <CardTitle>Create Your Household</CardTitle>
          <CardDescription>
            Name your household to get started. You can invite family members later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Household Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Smith Home"
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600"
              disabled={loading || !name.trim()}
            >
              {loading ? 'Creating...' : 'Create Household'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
