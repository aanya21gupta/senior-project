import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clinical Decision Support',
  description: 'BioMistral-7B · CREST-grounded clinical recommendations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-black min-h-screen">{children}</body>
    </html>
  )
}
