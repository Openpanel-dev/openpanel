export function OnboardingHeading({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="col mb-10 gap-3">
      <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
      <p className="max-w-prose text-base text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
