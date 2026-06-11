import type { LucideIcon } from "lucide-react"

interface SummaryCardProps {
  label: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  color: string
  bgColor: string
}

export function SummaryCard({ label, value, subtitle, icon: Icon, color, bgColor }: SummaryCardProps) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        <div className={`rounded-lg p-2 ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  )
}
