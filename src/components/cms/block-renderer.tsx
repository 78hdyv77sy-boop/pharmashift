import Link from "next/link";

// Server-Komponente: rendert die gespeicherten Blöcke einer Seite.
// richtext-Inhalte sind beim Speichern bereits sanitized worden.

interface BlockData {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function Html({ html, className }: { html: unknown; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: str(html) }} />;
}

function HeroBlock({ d }: { d: Record<string, unknown> }) {
  const img = str(d.imageUrl);
  return (
    <section
      className="relative flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-24 text-center"
      style={img ? { backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {img && <div className="absolute inset-0 bg-black/40" />}
      <div className="relative z-10 space-y-4">
        <h1 className={`text-4xl font-semibold sm:text-5xl ${img ? "text-white" : ""}`}>{str(d.heading)}</h1>
        <Html html={d.subheadingHtml} className={`mx-auto max-w-2xl ${img ? "text-white/90" : "text-muted-foreground"}`} />
        {str(d.ctaLabel) && (
          <Link href={str(d.ctaHref) || "#"} className="inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
            {str(d.ctaLabel)}
          </Link>
        )}
      </div>
    </section>
  );
}

function ImageTextBlock({ d }: { d: Record<string, unknown> }) {
  const left = str(d.imagePosition) === "left";
  return (
    <section className={`mx-auto grid max-w-5xl items-center gap-8 px-6 py-12 md:grid-cols-2 ${left ? "" : "md:[&>*:first-child]:order-2"}`}>
      {str(d.imageUrl) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={str(d.imageUrl)} alt="" className="w-full rounded-lg object-cover" />
      ) : (
        <div className="aspect-video rounded-lg bg-muted" />
      )}
      <Html html={d.html} className="prose prose-sm max-w-none" />
    </section>
  );
}

export function BlockRenderer({ blocks }: { blocks: BlockData[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        const d = b.data ?? {};
        switch (b.type) {
          case "hero":
            return <HeroBlock key={b.id ?? i} d={d} />;
          case "richtext":
            return (
              <section key={b.id ?? i} className="mx-auto max-w-3xl px-6 py-8">
                <Html html={d.html} className="prose prose-sm max-w-none" />
              </section>
            );
          case "imageText":
            return <ImageTextBlock key={b.id ?? i} d={d} />;
          case "image":
            return (
              <figure key={b.id ?? i} className="mx-auto max-w-3xl px-6 py-8">
                {str(d.url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={str(d.url)} alt={str(d.alt)} className="w-full rounded-lg" />
                )}
                {str(d.captionHtml) && <Html html={d.captionHtml} className="prose prose-sm mt-2 text-center text-muted-foreground" />}
              </figure>
            );
          case "cta":
            return (
              <section key={b.id ?? i} className="mx-auto my-8 max-w-3xl rounded-xl border bg-muted/30 px-6 py-10 text-center">
                <Html html={d.html} className="prose prose-sm mx-auto max-w-none" />
                {str(d.buttonLabel) && (
                  <Link href={str(d.buttonHref) || "#"} className="mt-4 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                    {str(d.buttonLabel)}
                  </Link>
                )}
              </section>
            );
          case "faq": {
            const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
            return (
              <section key={b.id ?? i} className="mx-auto max-w-3xl space-y-3 px-6 py-8">
                {items.map((it, j) => (
                  <details key={j} className="rounded-lg border p-4">
                    <summary className="cursor-pointer font-medium">{str(it.question)}</summary>
                    <Html html={it.answerHtml} className="prose prose-sm mt-2 max-w-none" />
                  </details>
                ))}
              </section>
            );
          }
          case "gallery": {
            const images = Array.isArray(d.images) ? (d.images as Record<string, unknown>[]) : [];
            return (
              <section key={b.id ?? i} className="mx-auto grid max-w-5xl grid-cols-2 gap-3 px-6 py-8 sm:grid-cols-3">
                {images.map((im, j) =>
                  str(im.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={str(im.url)} alt={str(im.alt)} className="aspect-square w-full rounded-lg object-cover" />
                  ) : null,
                )}
              </section>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}
