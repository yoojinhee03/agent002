export const VARIABLE_COLORS: Record<string, { color: string; bg: string }> = {
  company_name: { color: "#a855f7", bg: "#a855f720" },     // purple
  tone: { color: "#14b8a6", bg: "#14b8a620" },              // teal
  is_vip: { color: "#f59e0b", bg: "#f59e0b20" },            // amber
  customer_name: { color: "#3b82f6", bg: "#3b82f620" },     // blue
  language: { color: "#ec4899", bg: "#ec489920" },           // pink
  max_length: { color: "#22c55e", bg: "#22c55e20" },        // green
  faq_items: { color: "#f97316", bg: "#f9731620" },          // orange
  product_category: { color: "#8b5cf6", bg: "#8b5cf620" },  // violet
}

export const DEFAULT_VARIABLE_COLORS = [
  { color: "#3b82f6", bg: "#3b82f620" },  // blue
  { color: "#a855f7", bg: "#a855f720" },  // purple
  { color: "#14b8a6", bg: "#14b8a620" },  // teal
  { color: "#f59e0b", bg: "#f59e0b20" },  // amber
  { color: "#ec4899", bg: "#ec489920" },  // pink
  { color: "#22c55e", bg: "#22c55e20" },  // green
  { color: "#f97316", bg: "#f9731620" },  // orange
  { color: "#8b5cf6", bg: "#8b5cf620" },  // violet
]


export const DEFAULT_HYPERPARAMETERS = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: [] as string[],
}

export const NAV_ITEMS = [
  { label: "Prompts", href: "/prompts", icon: "FileText" },
  { label: "Editor", href: "/editor", icon: "PenTool" },
  { label: "Compare", href: "/compare", icon: "GitCompare" },
  { label: "History", href: "/history", icon: "Clock" },
  { label: "Settings", href: "/settings", icon: "Settings" },
] as const
