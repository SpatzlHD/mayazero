import { createFileRoute } from '@tanstack/react-router'
import { changelogEntries, type ChangelogLink } from '#/content/changelog'
import { buildPageSeoHead } from '#/lib/seo'

export const Route = createFileRoute('/changelog')({
  head: () =>
    buildPageSeoHead({
      title: 'Changelog',
      description:
        'Follow product updates, interface improvements, and new additions shipped in MayaZero.',
    }),
  component: ChangelogPage,
})

export function ChangelogPageContent() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="glass-panel p-6 sm:p-8">
        <p className="kicker mb-3">Changelog</p>
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
          Product updates without the noise.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          MayaZero keeps release notes simple: a date, a title, and the changes
          that matter.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        {changelogEntries.map((entry) => (
          <article
            key={entry.id}
            className="glass-panel p-6 sm:p-7"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--maya-teal)]">
              Updated on {entry.date}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
              {entry.title}
            </h2>
            <ul className="mt-4 space-y-2 pl-5 text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
              {entry.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {entry.links?.length ? (
              <div className="mt-5 flex flex-wrap gap-3">
                {entry.links.map((link) => (
                  <ChangelogAnchor key={`${entry.id}:${link.href}`} link={link} />
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  )
}

function ChangelogAnchor({ link }: { link: ChangelogLink }) {
  const isExternal = /^https?:\/\//.test(link.href)

  return (
    <a
      href={link.href}
      {...(isExternal ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition-all hover:border-[var(--cacao-neon)]/40 hover:text-[var(--cacao-neon)]"
    >
      {link.label}
    </a>
  )
}

function ChangelogPage() {
  return <ChangelogPageContent />
}
