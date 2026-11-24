"use client";

import {
  findCombination,
  isSizePurchasable,
  isVariantPurchasable,
  type ProductAvailability,
} from "@/lib/availability";
import type { CartItemComponent } from "@/types/cart";
import Image from "next/image";

export interface BundleComponentView {
  productId: string;
  name: string;
  image: string;
  /** Units of the component inside one unit of the bundle. */
  quantity: number;
  /** Empty when the component has no variants to choose from. */
  variants: { id: string; name: string }[];
  /** Empty when the component has no sizes to choose from. */
  sizes: { id: string; size: string }[];
  availability: ProductAvailability;
}

export interface ComponentSelection {
  variantId: string | null;
  sizeId: string | null;
}

export type BundleSelections = Record<string, ComponentSelection>;

const EMPTY_SELECTION: ComponentSelection = { variantId: null, sizeId: null };

/** True when every required option is chosen and the combination can be bought. */
export function isComponentSelectionComplete(
  component: BundleComponentView,
  selection: ComponentSelection = EMPTY_SELECTION,
): boolean {
  if (component.variants.length > 0 && !selection.variantId) return false;
  if (component.sizes.length > 0 && !selection.sizeId) return false;
  return (
    findCombination(
      component.availability,
      selection.variantId,
      selection.sizeId,
    )?.purchasable === true
  );
}

/** First component, in display order, whose choice is missing or not buyable. */
export function findIncompleteComponent(
  components: readonly BundleComponentView[],
  selections: BundleSelections,
): BundleComponentView | null {
  return (
    components.find(
      (component) =>
        !isComponentSelectionComplete(
          component,
          selections[component.productId],
        ),
    ) ?? null
  );
}

/** Cart entries for every component, including those without options. */
export function buildCartComponents(
  components: readonly BundleComponentView[],
  selections: BundleSelections,
): CartItemComponent[] {
  return components.map((component) => {
    const selection = selections[component.productId] ?? EMPTY_SELECTION;
    const variant = component.variants.find(
      (v) => v.id === selection.variantId,
    );
    const size = component.sizes.find((s) => s.id === selection.sizeId);
    return {
      componentProductId: component.productId,
      componentName: component.name,
      variantId: variant?.id,
      variantName: variant?.name,
      sizeId: size?.id,
      sizeLabel: size?.size,
    };
  });
}

function optionClass(isSelected: boolean, isAvailable: boolean) {
  const base =
    "relative h-9 min-w-9 cursor-pointer rounded-md border-2 px-3 text-xs font-extrabold uppercase transition-all";
  if (!isAvailable) {
    return `${base} cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 line-through dark:border-zinc-800 dark:bg-zinc-900`;
  }
  if (isSelected) {
    return `${base} border-orange-500 bg-orange-500 text-white shadow-sm`;
  }
  return `${base} border-zinc-300 bg-background text-foreground hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500`;
}

interface BundleSelectorProps {
  components: BundleComponentView[];
  selections: BundleSelections;
  onChange: (componentProductId: string, selection: ComponentSelection) => void;
}

export function BundleSelector({
  components,
  selections,
  onChange,
}: BundleSelectorProps) {
  return (
    <section
      aria-label="Composição do kit"
      className="space-y-4"
    >
      <h2 className="text-sm font-bold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
        Este kit inclui
      </h2>

      <ul className="space-y-4">
        {components.map((component) => {
          const selection = selections[component.productId] ?? EMPTY_SELECTION;
          const needsVariant = component.variants.length > 0;
          const needsSize = component.sizes.length > 0;
          const hint =
            needsVariant && !selection.variantId
              ? "Selecione a variação."
              : needsSize && !selection.sizeId
                ? "Selecione o tamanho."
                : null;

          return (
            <li key={component.productId}>
              <div
                role="group"
                aria-label={component.name}
                className="flex gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
                  <Image
                    src={component.image}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold">
                    <span>{component.name}</span>
                    {component.quantity > 1 && (
                      <span className="ml-1 text-zinc-500">
                        {`× ${component.quantity}`}
                      </span>
                    )}
                  </p>

                  {needsVariant && (
                    <div className="flex flex-wrap gap-2">
                      {component.variants.map((variant) => {
                        const isSelected = variant.id === selection.variantId;
                        const isAvailable = isVariantPurchasable(
                          component.availability,
                          variant.id,
                        );
                        return (
                          <button
                            key={variant.id}
                            type="button"
                            disabled={!isAvailable}
                            aria-pressed={isSelected}
                            onClick={() => {
                              // A size stays only when it can be bought with
                              // the new variant; otherwise the choice is reset.
                              const keepSize =
                                selection.sizeId !== null &&
                                isSizePurchasable(
                                  component.availability,
                                  variant.id,
                                  selection.sizeId,
                                );
                              onChange(component.productId, {
                                variantId: variant.id,
                                sizeId: keepSize ? selection.sizeId : null,
                              });
                            }}
                            className={optionClass(isSelected, isAvailable)}
                          >
                            {variant.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {needsSize && (
                    <div className="flex flex-wrap gap-2">
                      {component.sizes.map((size) => {
                        const isSelected = size.id === selection.sizeId;
                        // With variants, sizes unlock once a variant is chosen.
                        const isAvailable = isSizePurchasable(
                          component.availability,
                          selection.variantId,
                          size.id,
                        );
                        return (
                          <button
                            key={size.id}
                            type="button"
                            disabled={!isAvailable}
                            aria-pressed={isSelected}
                            onClick={() =>
                              onChange(component.productId, {
                                ...selection,
                                sizeId: size.id,
                              })
                            }
                            className={optionClass(isSelected, isAvailable)}
                          >
                            {size.size}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {hint && <p className="text-xs text-red-500">{hint}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
