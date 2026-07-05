// Reibschale mit Pistill (Mörser & Stößel) — das Apotheken-Symbol als
// Chat-Knopf. Dezent-elegantes Strich-Icon im lucide-Stil (24x24, stroke 2).
// Der Pistill ist als eigene Gruppe ausgeführt, damit er beim Hover sanft
// "mörsern" kann (CSS-Klasse .pestle).

export function MortarPestleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Pistill: schräg von rechts oben in die Schale */}
      <g className="pestle">
        <path d="M19.5 3.5 13 10" />
        <path d="M18 2.2c.9-.5 2 .1 2.3 1s-.2 1.9-1.1 2.2" />
      </g>
      {/* Reibschale */}
      <path d="M4 11h13" />
      <path d="M5 11c0 3.6 2.5 6 5.5 6s5.5-2.4 5.5-6" />
      {/* Fuß */}
      <path d="M8.5 20h4" />
      <path d="M10.5 17v3" />
    </svg>
  );
}
