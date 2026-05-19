"use client";

import { Clock3, Search, Star, X } from "lucide-react";
import type { CatalogCollectionStatus, FoodQueryStatus } from "../food-catalog-state";
import type { FoodCatalogItem } from "../food-catalog-types";
import { FoodCatalogCard } from "./food-catalog-card";

type FoodSearchPanelProps = {
  query: string;
  searchStatus: FoodQueryStatus;
  searchError: string | null;
  searchResults: FoodCatalogItem[];
  favoriteFoods: FoodCatalogItem[];
  favoritesStatus: CatalogCollectionStatus;
  recentFoods: FoodCatalogItem[];
  recentsStatus: CatalogCollectionStatus;
  favoritePendingId: string | null;
  onQueryChange: (query: string) => void;
  onQuickAdd: (food: FoodCatalogItem) => void;
  onSaveFavorite: (food: FoodCatalogItem) => void;
  isFavorite: (food: FoodCatalogItem) => boolean;
};

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Star;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-24 animate-pulse rounded-2xl border bg-muted/40" />
      <div className="h-24 animate-pulse rounded-2xl border bg-muted/40" />
      <div className="h-24 animate-pulse rounded-2xl border bg-muted/40" />
    </div>
  );
}

export function FoodSearchPanel({
  query,
  searchStatus,
  searchError,
  searchResults,
  favoriteFoods,
  favoritesStatus,
  recentFoods,
  recentsStatus,
  favoritePendingId,
  onQueryChange,
  onQuickAdd,
  onSaveFavorite,
  isFavorite,
}: FoodSearchPanelProps) {
  const trimmedQuery = query.trim();
  const hasSearchQuery = trimmedQuery.length >= 2;

  const shouldShowSearchResults = hasSearchQuery && searchStatus !== "idle";

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Manual food search</h2>
        <p className="text-xs text-muted-foreground">
          Search USDA and your own food history. Tap quick add to jump straight into meal confirmation.
        </p>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search foods, brands, or products"
          className="w-full rounded-xl border bg-background py-2 pl-9 pr-10 text-sm"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>

      {shouldShowSearchResults ? (
        <section className="space-y-3">
          {searchStatus === "loading" ? <LoadingSkeleton /> : null}
          {searchStatus === "error" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
              {searchError || "Search failed. Please try again."}
            </div>
          ) : null}
          {searchStatus === "success" && searchResults.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-background p-4 text-center text-xs text-muted-foreground">
              No results found for <span className="font-medium text-foreground">{trimmedQuery}</span>. Try a broader term.
            </div>
          ) : null}

          {searchStatus === "success" && searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map((food) => (
                <FoodCatalogCard
                  key={food.id}
                  food={food}
                  onQuickAdd={onQuickAdd}
                  onSaveFavorite={onSaveFavorite}
                  favoritePending={favoritePendingId === food.id}
                  isFavorite={isFavorite(food)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {!hasSearchQuery ? (
        <section className="space-y-4">
          <section className="space-y-2">
            <SectionHeader
              icon={Star}
              title="Favorites"
              subtitle={favoritesStatus === "loading" ? "Loading..." : `${favoriteFoods.length} saved`}
            />
            {favoriteFoods.length > 0 ? (
              <div className="space-y-2">
                {favoriteFoods.slice(0, 4).map((food) => (
                  <FoodCatalogCard
                    key={food.id}
                    food={food}
                    onQuickAdd={onQuickAdd}
                    onSaveFavorite={onSaveFavorite}
                    favoritePending={favoritePendingId === food.id}
                    isFavorite
                    compact
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed bg-background p-3 text-xs text-muted-foreground">
                Save foods as favorites from search or barcode results for instant reuse.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <SectionHeader
              icon={Clock3}
              title="Recent foods"
              subtitle={recentsStatus === "loading" ? "Loading..." : `${recentFoods.length} recent`}
            />
            {recentFoods.length > 0 ? (
              <div className="space-y-2">
                {recentFoods.slice(0, 6).map((food) => (
                  <FoodCatalogCard
                    key={food.id}
                    food={food}
                    onQuickAdd={onQuickAdd}
                    onSaveFavorite={onSaveFavorite}
                    favoritePending={favoritePendingId === food.id}
                    isFavorite={isFavorite(food)}
                    compact
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed bg-background p-3 text-xs text-muted-foreground">
                Recently saved meal items will show up here for one-tap logging.
              </p>
            )}
          </section>
        </section>
      ) : null}
    </section>
  );
}
