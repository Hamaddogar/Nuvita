type RecommendationChipProps = {
  label: string;
};

export function RecommendationChip({ label }: RecommendationChipProps) {
  return (
    <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}
