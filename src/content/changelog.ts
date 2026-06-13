export type ChangelogLink = {
  href: string
  label: string
}

export type ChangelogEntry = {
  id: string
  date: string
  title: string
  items: string[]
  links?: ChangelogLink[]
}

export const changelogEntries: ChangelogEntry[] = [
  {
    id: '2026-05-25-bond-management-live',
    date: 'May 25, 2026',
    title: 'Bond management is live',
    items: [
      'Pooled-node bond management is now available for operators and bond providers.',
      'Bond and unbond LP pool units or CACAO pool units directly from your wallet, with quick-fill Max, 75%, 50%, and 25% shortcuts.',
      'The workspace includes provider registry, bond activity, portfolio summary, and operator controls for add/update/remove provider flows.',
    ],
    links: [{ href: '/pooled-nodes', label: 'Open Bond Management' }],
  },
  {
    id: '2026-04-12-fast-vault-import',
    date: 'April 12, 2026',
    title: 'Fast Vault import expanded',
    items: [
      'Added Fast Vault import from either a pasted seedphrase or an uploaded xchain keystore.',
      'Keystore imports now decrypt locally in the browser before creating the Vultisig vault.',
      'Imported wallets automatically scan MayaZero-supported chains before the normal email verification step.',
    ],
    links: [{ href: '/vault-setup', label: 'Import Wallet' }],
  },
  {
    id: '2026-04-11-maya-masks-gallery',
    date: 'April 11, 2026',
    title: 'Maya Masks gallery shipped',
    items: [
      'Added a dedicated Maya Masks page so you can see every Maya Mask held by your connected Ethereum wallet in one place.',
      'The new gallery highlights your total holdings and gives each mask its own visual card with its name and token number.',
      'Maya Masks is now available directly from the main navigation for faster access.',
    ],
    links: [{ href: '/maya-masks', label: 'Open Maya Masks' }],
  },
  {
    id: '2026-04-11-changelog-added',
    date: 'April 11, 2026',
    title: 'Changelog added',
    items: [
      'Added a dedicated changelog page for site updates.',
      'Linked the changelog from the footer so it stays easy to find.',
      'Kept the system fully static with one local data file to maintain.',
    ],
  },
  {
    id: '2026-04-08-portfolio-refresh',
    date: 'April 8, 2026',
    title: 'Portfolio workspace refresh',
    items: [
      'Refined the portfolio layout into a clearer Maya Protocol workspace.',
      'Split major protocol actions into dedicated routes for faster navigation.',
    ],
    links: [{ href: '/swap', label: 'Open Swap Terminal' }],
  },
]
