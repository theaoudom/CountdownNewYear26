import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Welcome 2026 - New Year Countdown',
  description: 'Countdown to New Year 2026 with fireworks celebration',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


