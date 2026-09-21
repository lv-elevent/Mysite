import type { ComponentType, SVGProps } from 'react'

// 联系方式图标（电话 / 邮箱 / GitHub）。
//
// 与 SocialIcons.tsx、HotspotIcons.tsx 同一套约定：内联单色 SVG、currentColor。
// 前两个走线描（与全站发丝线风格一致），GitHub 用官方标志的填充路径 ——
// 这个符号一旦线描化就认不出来了，保持实心更易识别。

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M6.4 3.6h2.5l1.6 4-2.1 1.5a12.6 12.6 0 0 0 6.5 6.5l1.5-2.1 4 1.6v2.5a2.1 2.1 0 0 1-2.3 2.1A17.9 17.9 0 0 1 4.3 5.9 2.1 2.1 0 0 1 6.4 3.6Z"
        {...STROKE}
      />
    </svg>
  )
}

function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3" y="5.2" width="18" height="13.6" rx="2.6" {...STROKE} />
      <path d="M3.8 7.6 12 13.1l8.2-5.5" {...STROKE} />
    </svg>
  )
}

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10Z" />
    </svg>
  )
}

export const CONTACT_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  phone: PhoneIcon,
  email: MailIcon,
  github: GithubIcon,
}
