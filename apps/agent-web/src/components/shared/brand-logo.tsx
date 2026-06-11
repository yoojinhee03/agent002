import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
  title?: string
  ink?: string
  cream?: string
  blood?: string
}

const BLADES = [
  'M 137.46 7.28 C 134.67 48.60, 138.04 87.64, 115.96 98.88 C 149.51 106.96, 170.47 52.47, 186.60 50.00 A 100 100 0 0 0 137.46 7.28 Z',
  'M 199.03 86.08 C 161.85 104.32, 129.73 126.77, 108.95 113.26 C 118.73 146.36, 176.40 137.26, 186.60 150.00 A 100 100 0 0 0 199.03 86.08 Z',
  'M 161.57 178.80 C 127.18 155.73, 91.68 139.13, 92.99 114.38 C 69.22 139.40, 105.93 184.79, 100.00 200.00 A 100 100 0 0 0 161.57 178.80 Z',
  'M 62.54 192.72 C 65.33 151.40, 61.96 112.36, 84.04 101.12 C 50.49 93.04, 29.53 147.53, 13.40 150.00 A 100 100 0 0 0 62.54 192.72 Z',
  'M 0.97 113.92 C 38.15 95.68, 70.27 73.23, 91.05 86.74 C 81.27 53.64, 23.60 62.74, 13.40 50.00 A 100 100 0 0 0 0.97 113.92 Z',
  'M 38.43 21.20 C 72.82 44.27, 108.32 60.87, 107.01 85.62 C 130.78 60.60, 94.07 15.21, 100.00 0.00 A 100 100 0 0 0 38.43 21.20 Z',
]

export function BrandLogo({
  className,
  title = 'AGENT002',
  ink = '#0A0A0A',
  cream = '#F4F0E8',
  blood = '#C8102E',
}: BrandLogoProps) {
  const vignetteEdge = '#E5E2DA'
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={cn('h-full w-full', className)}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id="agent002-iris-clip">
          <circle cx="100" cy="100" r="100" />
        </clipPath>
        <radialGradient id="agent002-vignette" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor={cream} stopOpacity="1" />
          <stop offset="100%" stopColor={vignetteEdge} stopOpacity="1" />
        </radialGradient>
      </defs>

      <g clipPath="url(#agent002-iris-clip)">
        <rect width="200" height="200" fill="url(#agent002-vignette)" />
        {BLADES.map((d, i) => (
          <path key={i} d={d} fill={ink} />
        ))}
        <circle cx="100" cy="100" r="36" fill={cream} />
        <circle cx="100" cy="100" r="36" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.5" />
        <circle cx="100" cy="100" r="99" fill="none" stroke={ink} strokeWidth="2" />

        <svg x="66" y="66" width="68" height="68" viewBox="0 0 64 64">
          <circle cx="32" cy="4" r="1.6" fill={ink} />
          <rect x="31" y="5" width="2" height="6" fill={ink} />
          <path
            d="M32 11 L52 18 L54 32 L52 46 L32 53 L12 46 L10 32 L12 18 Z"
            fill={ink}
          />
          <rect x="11" y="29" width="3" height="6" fill={cream} opacity="0.55" />
          <rect x="50" y="29" width="3" height="6" fill={cream} opacity="0.55" />
          <rect x="15" y="28" width="34" height="6" fill={blood} rx="0.8" />
          <rect x="27" y="29.5" width="10" height="2.5" fill={cream} opacity="0.45" />
          <rect x="30" y="30.5" width="4" height="1.2" fill={cream} opacity="0.9" />
          <rect x="20" y="44" width="24" height="1.2" fill={cream} opacity="0.18" />
          <rect x="27" y="53" width="10" height="4" fill={ink} />
          <rect x="25" y="56" width="14" height="2" fill={ink} />
        </svg>
      </g>
    </svg>
  )
}
