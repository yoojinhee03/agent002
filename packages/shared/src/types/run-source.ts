export type RunSource = 'all' | 'studio' | 'client'

export const RUN_SOURCES: RunSource[] = ['all', 'studio', 'client']

export const RUN_SOURCE_LABEL: Record<RunSource, string> = {
  all: '전체',
  studio: 'Studio',
  client: 'Client',
}
