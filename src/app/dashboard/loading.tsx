import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <DashboardSkeleton />
    </div>
  )
}
