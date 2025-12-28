'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface ActivityItem {
  id: string
  action_type: string
  action_description: string
  entity_type: string | null
  entity_name: string | null
  created_at: string
  user_id: string
}

interface ActivityFeedProps {
  householdId: string
  limit?: number
}

const actionIcons: Record<string, string> = {
  add: '➕',
  remove: '➖',
  update: '✏️',
  use: '📦',
  restock: '📥',
  create: '🆕',
  delete: '🗑️',
  share: '🔗',
  invite: '✉️',
}

const entityColors: Record<string, string> = {
  inventory: 'bg-blue-100 text-blue-800',
  item: 'bg-green-100 text-green-800',
  recipe: 'bg-purple-100 text-purple-800',
  storage_unit: 'bg-amber-100 text-amber-800',
  shelf: 'bg-orange-100 text-orange-800',
  household: 'bg-gray-100 text-gray-800',
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

  useEffect(() => {
    async function fetchActivities() {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        // Table might not exist yet - silently handle
        if (error.code === '42P01') {
          setActivities([])
        } else {
          setError('Failed to load activity')
        }
      } else {
        setActivities(data || [])
      }
      setLoading(false)
    }

    fetchActivities()

    // Set up real-time subscription
    const supabase = createClient()
    const channel = supabase
      .channel('activity-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_log',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          setActivities((prev) => [payload.new as ActivityItem, ...prev].slice(0, limit))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [householdId, limit])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📋</span> Recent Activity
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
            <span>📋</span> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📋</span> Recent Activity
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
          <span>📋</span> Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="text-xl flex-shrink-0">
                {actionIcons[activity.action_type] || '📝'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  {activity.action_description}
                  {activity.entity_name && (
                    <span className="font-medium"> &quot;{activity.entity_name}&quot;</span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {activity.entity_type && (
                    <Badge
                      variant="secondary"
                      className={`text-xs ${entityColors[activity.entity_type] || ''}`}
                    >
                      {activity.entity_type}
                    </Badge>
                  )}
                  <span className="text-xs text-gray-400">
                    {formatTimeAgo(activity.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
