'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface ActivityItem {
  id: string
  action: string
  quantity_change: number
  performed_at: string
  notes: string | null
  items: {
    name: string
    household_id: string
  }
}

interface ActivityFeedProps {
  householdId: string
  limit?: number
}

const actionIcons: Record<string, string> = {
  added: '➕',
  removed: '➖',
  used: '📦',
  expired: '⏰',
  moved: '🔄',
}

const actionLabels: Record<string, string> = {
  added: 'Added',
  removed: 'Removed',
  used: 'Used',
  expired: 'Expired',
  moved: 'Moved',
}

const actionColors: Record<string, string> = {
  added: 'bg-green-100 text-green-800',
  removed: 'bg-red-100 text-red-800',
  used: 'bg-blue-100 text-blue-800',
  expired: 'bg-orange-100 text-orange-800',
  moved: 'bg-purple-100 text-purple-800',
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  return date.toLocaleDateString()
}

export function ActivityFeed({ householdId, limit = 10 }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchActivities() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    // Query inventory_log and join with items to get item names
    // Filter by household through items table
    const { data, error: fetchError } = await supabase
      .from('inventory_log')
      .select(`
        id,
        action,
        quantity_change,
        performed_at,
        notes,
        items!inner (
          name,
          household_id
        )
      `)
      .eq('items.household_id', householdId)
      .order('performed_at', { ascending: false })
      .limit(limit)

    if (fetchError) {
      // Table might not exist yet - silently handle
      if (fetchError.code === '42P01') {
        setActivities([])
      } else {
        console.error('Failed to load activity:', fetchError)
        setError('Failed to load activity')
      }
    } else {
      // Transform the data to flatten the items relationship
      const transformed = (data || []).map((item) => ({
        ...item,
        items: item.items as unknown as { name: string; household_id: string },
      }))
      setActivities(transformed)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchActivities()

    // Set up real-time subscription for new activity
    const supabase = createClient()
    const channel = supabase
      .channel('inventory-log-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inventory_log',
        },
        () => {
          // Refetch to get the joined item data
          fetchActivities()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, limit])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span aria-hidden="true">📋</span> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-3/4 mb-1" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span aria-hidden="true">📋</span> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchActivities()}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span aria-hidden="true">📋</span> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-4">
            No recent activity. Start tracking your inventory to see updates here!
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span aria-hidden="true">📋</span> Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map((activity) => {
            const itemName = activity.items?.name ?? 'Unknown item'
            const absChange = Math.abs(Number(activity.quantity_change))
            const actionLabel = actionLabels[activity.action] || activity.action

            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="text-xl flex-shrink-0">
                  {actionIcons[activity.action] || '📝'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    {actionLabel} <span className="font-medium">{absChange}</span> {itemName}
                  </p>
                  {activity.notes && (
                    <p className="text-xs text-gray-500 truncate">{activity.notes}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="secondary"
                      className={`text-xs ${actionColors[activity.action] || ''}`}
                    >
                      {activity.action}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(activity.performed_at)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
