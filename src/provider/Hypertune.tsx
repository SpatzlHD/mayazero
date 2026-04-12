import { useActiveWalletSession } from "#/wallet";
import { useEffect, useState } from "react";
import { HypertuneProvider } from "../generated/hypertune.react";

export default function AppHypertuneProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const activeSession = useActiveWalletSession();
  const [mayaAddress, setMayaAddress] = useState<string>("null");

  useEffect(() => {
    if (activeSession) {
      if (activeSession.addresses.MayaChain) {
        setMayaAddress(activeSession.addresses.MayaChain);
      } else {
        setMayaAddress("null");
      }
    }
  }, [activeSession]);

  return (
    <HypertuneProvider
      createSourceOptions={{
        token: import.meta.env.VITE_HYPERTUNE_TOKEN!,
      }}
      rootArgs={{
        context: {
          environment:
            process.env.NODE_ENV === "development"
              ? "development"
              : "production",
          user: {
            mayaAddress: mayaAddress,
          },
        },
      }}
    >
      {children}
    </HypertuneProvider>
  );
}
