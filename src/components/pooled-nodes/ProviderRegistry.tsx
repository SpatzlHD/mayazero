import { AssetIcon, shortenAddress } from "#/components/ProtocolPrimitives";
import { formatBaseUnits } from "#/lib/cacao-pool";
import { summarizeProviderPoolEntry } from "#/lib/pooled-nodes-bond";
import type { PooledNode } from "#/lib/pooled-nodes";
import {
  PanelHeader,
  PrimaryPanel,
  RoleBadge,
  addressInitials,
} from "./shared";

function assetIdFromPoolKey(asset: string): string {
  //remove contact id
  const assetId = asset.split("-")[0];
  const [chain, symbol] = assetId.split(".");

  if (!symbol) return asset.toLowerCase();
  if (symbol.toUpperCase() === "CACAO") return "cacao";

  return symbol.toLowerCase();
}

export function ProviderRegistry(props: {
  node: PooledNode;
  connectedAddress: string;
}) {
  return (
    <PrimaryPanel>
      <PanelHeader
        kicker="Bond Providers"
        title="Provider Registry"
        description="Bond allocations are LP pool units or CACAO pool units. CACAO pool bond counts at half LP weight."
      />
      <div className="grid gap-3">
        {props.node.providers.map((provider) => {
          const isYou =
            provider.bondAddress.trim().toLowerCase() ===
            props.connectedAddress.trim().toLowerCase();
          const isOperatorRow = provider.isOperator;

          return (
            <div
              key={provider.bondAddress}
              className={`rounded-2xl border p-4 transition-colors ${
                isYou
                  ? "border-[var(--maya-teal)]/40 bg-[var(--maya-teal)]/5 shadow-[0_4px_16px_rgba(79,209,197,0.06)]"
                  : "border-[var(--line)]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-strong)] text-xs font-bold text-[var(--sea-ink-soft)]">
                  {addressInitials(provider.bondAddress)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className="font-mono text-sm"
                      title={provider.bondAddress}
                    >
                      {shortenAddress(provider.bondAddress)}
                    </p>
                    {isYou ? <RoleBadge label="You" tone="operator" /> : null}
                    {isOperatorRow ? <RoleBadge label="Operator" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
                    Reward {formatBaseUnits(provider.reward, 10) || "0"} CACAO •{" "}
                    {provider.bonded ? "Bonded" : "Not bonded"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {Object.entries(provider.pools).length ? (
                  Object.entries(provider.pools).map(([asset, amount]) => {
                    const summary = summarizeProviderPoolEntry(asset, amount);
                    return (
                      <span
                        key={`${provider.bondAddress}-${asset}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-base)] px-2.5 py-1.5"
                      >
                        <AssetIcon
                          assetId={assetIdFromPoolKey(asset)}
                          className="h-5 w-5"
                        />
                        <span>
                          {summary.label}: {summary.formattedAmount} •{" "}
                          {summary.bondWeightNote}
                        </span>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[var(--sea-ink-soft)]">
                    No bonded LP or CACAO pool allocation reported.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PrimaryPanel>
  );
}
