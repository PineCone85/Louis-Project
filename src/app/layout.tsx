import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Estate Agent Hub',
  description: 'Email automation & contact management for real estate agents',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
