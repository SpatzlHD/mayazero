import { createFileRoute } from '@tanstack/react-router'
import { buildPageSeoHead } from '#/lib/seo'

export const Route = createFileRoute('/about')({
  head: () =>
    buildPageSeoHead({
      title: 'About',
      description:
        'Learn how MayaZero frames Maya Protocol portfolio, swap, liquidity, and wallet workflows.',
    }),
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="protocol-panel p-6 sm:p-8">
        <p className="island-kicker mb-2">Interface notes</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          The protocol flow should lead, the wallet should assist.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          The home route is now framed as a Maya Protocol workstation: swap composition first,
          streaming and LP actions as dedicated modules, wallet context on the side, and a
          clear inspection lane for quotes and prepared payloads.
        </p>
      </section>
    </main>
  )
}
