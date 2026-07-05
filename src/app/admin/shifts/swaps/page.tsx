import { listSwaps, listSwapEmployees } from "./swap-request-actions";
import { SwapsClient } from "./swaps-client";

export default async function SwapsPage() {
  const [swaps, employees] = await Promise.all([listSwaps(), listSwapEmployees()]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Schichttausch</h1>
        <p className="text-sm text-muted-foreground">
          Dienste zum Tausch anbieten – die angefragte Person oder die Leitung bestätigt. Erst nach Zustimmung wird getauscht (mit AZG-Prüfung).
        </p>
      </div>
      <SwapsClient swaps={swaps} employees={employees} />
    </div>
  );
}
