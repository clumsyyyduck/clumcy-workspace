import { cn } from '@/lib/ui/cn'

type Props = {
  /** 0 to 1. */
  value: number
  size?: number
  stroke?: number
  class?: string
  label?: string
}

export function ProgressRing(props: Props) {
  const size = () => props.size ?? 20
  const stroke = () => props.stroke ?? 2.5
  const radius = () => (size() - stroke()) / 2
  const circumference = () => 2 * Math.PI * radius()
  const clamped = () => Math.min(1, Math.max(0, props.value))

  return (
    <svg
      width={size()}
      height={size()}
      viewBox={`0 0 ${size()} ${size()}`}
      class={cn('shrink-0 -rotate-90', props.class)}
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : 'true'}
    >
      <circle
        cx={size() / 2}
        cy={size() / 2}
        r={radius()}
        fill='none'
        stroke='currentColor'
        stroke-opacity='0.15'
        stroke-width={stroke()}
      />
      <circle
        cx={size() / 2}
        cy={size() / 2}
        r={radius()}
        fill='none'
        stroke='currentColor'
        stroke-width={stroke()}
        stroke-linecap='round'
        stroke-dasharray={`${circumference()}`}
        stroke-dashoffset={`${circumference() * (1 - clamped())}`}
        style={{ transition: 'stroke-dashoffset 300ms ease' }}
      />
    </svg>
  )
}
