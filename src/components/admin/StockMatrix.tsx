"use client";

import {
  DEFAULT_STOCK_ROW_VALUES,
  describeCombination,
  stockRowKey,
  type SellableCombination,
  type StockRowValues,
} from "@/lib/stock-matrix";

interface StockMatrixProps {
  combinations: SellableCombination[];
  values: Record<string, StockRowValues>;
  disabled?: boolean;
  onChange: (key: string, changes: Partial<StockRowValues>) => void;
}

export function StockMatrix({
  combinations,
  values,
  disabled = false,
  onChange,
}: StockMatrixProps) {
  const showVariant = combinations.some((c) => c.variantName !== null);
  const showSize = combinations.some((c) => c.sizeLabel !== null);

  return (
    <div className="space-y-3 border-t border-zinc-100 pt-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-900">
          Estoque por combinação
        </h3>
        <p className="text-xs text-zinc-500">
          Defina a quantidade de cada combinação. O reservado é calculado pelo
          sistema; desmarque &quot;Disponível para venda&quot; para retirar uma
          combinação sem perder a contagem.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-zinc-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-600">
            <tr>
              {showVariant && (
                <th className="px-3 py-2 font-medium">Variante</th>
              )}
              {showSize && <th className="px-3 py-2 font-medium">Tamanho</th>}
              {!showVariant && !showSize && (
                <th className="px-3 py-2 font-medium">Item</th>
              )}
              <th className="px-3 py-2 font-medium">Quantidade</th>
              <th className="px-3 py-2 font-medium">Reservado</th>
              <th className="px-3 py-2 font-medium">Disponível para venda</th>
            </tr>
          </thead>
          <tbody>
            {combinations.map((combination) => {
              const key = stockRowKey(combination);
              const label = describeCombination(combination);
              const row = values[key] ?? DEFAULT_STOCK_ROW_VALUES;
              return (
                <tr
                  key={key}
                  className="border-t border-zinc-100"
                >
                  {showVariant && (
                    <td className="px-3 py-2">{combination.variantName}</td>
                  )}
                  {showSize && (
                    <td className="px-3 py-2">{combination.sizeLabel}</td>
                  )}
                  {!showVariant && !showSize && (
                    <td className="px-3 py-2">Produto</td>
                  )}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`Quantidade de ${label}`}
                      value={row.onHand}
                      onChange={(e) =>
                        onChange(key, {
                          onHand: Math.max(
                            0,
                            parseInt(e.target.value, 10) || 0,
                          ),
                        })
                      }
                      disabled={disabled}
                      className="h-8 w-24 rounded-md border border-zinc-200 bg-white px-2 text-sm focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{row.reserved}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Disponível para venda: ${label}`}
                      checked={row.isAvailable}
                      onChange={(e) =>
                        onChange(key, { isAvailable: e.target.checked })
                      }
                      disabled={disabled}
                      className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
