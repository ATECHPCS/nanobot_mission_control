// src/app/office/tv/page.tsx
import { notFound } from 'next/navigation'
import { isKioskEnabled } from '@/lib/kiosk-auth'
import { OfficePanel } from '@/components/panels/office-panel'

// Kiosk page is rendered on the server, but the panel is a client component.
// Auth is enforced in proxy.ts before this code runs.

export const dynamic = 'force-dynamic'

export default function OfficeTV() {
  if (!isKioskEnabled()) notFound()
  return (
    <main className="min-h-screen bg-[#06080d] text-foreground overflow-hidden">
      <OfficePanel kiosk />
      {/* Periodic full reload as a memory-leak guard for always-on displays */}
      <script
        dangerouslySetInnerHTML={{
          __html: 'setTimeout(() => window.location.reload(), 6 * 60 * 60 * 1000);',
        }}
      />
    </main>
  )
}
