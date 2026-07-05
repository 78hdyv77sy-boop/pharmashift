import { getFairnessScores } from "./actions";
import { FairnessClient } from "./fairness-client";

export default async function FairnessPage() {
  const initial = await getFairnessScores("90d");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fairness</h1>
        <p className="text-sm text-muted-foreground">
          Belastung durch unbeliebte Dienste – gewichtet (Nacht 5×, Feiertag 3×, Wochenende 2×, Abend 1×), normalisiert 0–100 je Rolle. Ein niedriger Score heißt „wenig belastet".
        </p>
      </div>
      <FairnessClient initial={initial} />
    </div>
  );
}
