import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { changelogEntries } from '#/content/changelog'
import { ChangelogPageContent } from './changelog'

describe('changelog page content', () => {
  it('renders the seeded changelog entries and bullet items', () => {
    const html = renderToString(<ChangelogPageContent />)
    const [latestEntry] = changelogEntries

    expect(html).toContain('Product updates without the noise.')
    expect(html).toContain('Updated on')
    expect(html).toContain(latestEntry.date)
    expect(html).toContain(latestEntry.title)
    expect(html).toContain(latestEntry.items[0])
    expect(html).toContain(latestEntry.links?.[0].label ?? '')
    expect(html).toContain(latestEntry.links?.[0].href ?? '')
  })

  it('renders entries in newest-first order', () => {
    const html = renderToString(<ChangelogPageContent />)
    const latestEntryIndex = html.indexOf(changelogEntries[0].title)
    const olderEntryIndex = html.indexOf(changelogEntries[1].title)

    expect(latestEntryIndex).toBeGreaterThanOrEqual(0)
    expect(olderEntryIndex).toBeGreaterThanOrEqual(0)
    expect(latestEntryIndex).toBeLessThan(olderEntryIndex)
  })
})
