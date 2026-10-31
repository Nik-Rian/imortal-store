"use client";

import { useState, useTransition } from "react";
import { createDrop, purgeDrop } from "@/actions/drop.actions";
import { CloseDropButton } from "@/components/admin/CloseDropButton";

interface AdminDropItem {
  id: string;
  name: string;
  startsAt: Date | string;
  endsAt: Date | string;
  productCount: number;
  isClosed: boolean;
}

interface SemesterLifecycleSlotProps {
  drops: AdminDropItem[];
}

// Fixed time zone so server and client render the same date text.
const formatDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

const REQUIRED_PHRASE =
  "Estou ciente dos riscos e quero deletar o banco de dados";

export function SemesterLifecycleSlot({ drops }: SemesterLifecycleSlotProps) {
  const [isPending, startTransition] = useTransition();
  const [purgeTarget, setPurgeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [confirmStep, setConfirmStep] = useState<1 | 2 | 3>(1);
  const [typedText, setTypedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasOpenDrop = drops.some((drop) => !drop.isClosed);

  const handleCreateDrop = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createDrop();
        if (!result.success) {
          setError(result.error);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao iniciar novo semestre.",
        );
      }
    });
  };

  const handlePurgeDrop = () => {
    if (!purgeTarget) return;
    setError(null);
    startTransition(async () => {
      try {
        await purgeDrop(purgeTarget.id);
        resetModal();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao apagar semestre.",
        );
      }
    });
  };

  const resetModal = () => {
    setPurgeTarget(null);
    setConfirmStep(1);
    setTypedText("");
  };

  const isTextMatch = typedText.trim() === REQUIRED_PHRASE;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">
            Gerenciamento do Semestre
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {hasOpenDrop
              ? "Há um semestre aberto. Encerre as vendas dele para poder iniciar outro."
              : "Nenhum semestre aberto no momento. Inicie um novo semestre para abrir o catálogo."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateDrop}
          disabled={isPending || hasOpenDrop}
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-50 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          Iniciar Novo Semestre
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 p-2 rounded-md">{error}</p>
      )}

      {drops.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
          {drops.map((drop) => (
            <li
              key={drop.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900">
                    {drop.name}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      drop.isClosed
                        ? "bg-zinc-100 text-zinc-600"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {drop.isClosed ? "Encerrado" : "Em andamento"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {drop.productCount} produto(s) · {formatDate(drop.startsAt)} a{" "}
                  {formatDate(drop.endsAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CloseDropButton dropId={drop.id} isClosed={drop.isClosed} />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setPurgeTarget({ id: drop.id, name: drop.name });
                    setConfirmStep(1);
                    setTypedText("");
                    setError(null);
                  }}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Apagar Semestre
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {purgeTarget && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-bold text-red-900">
              ⚠️ Perigo: Exclusão Permanente de Dados
            </p>
            <p className="text-xs text-red-700">
              Esta ação irá apagar todos os produtos, variantes, itens e pedidos
              vinculados a este semestre.
            </p>
          </div>

          {/* Digitar frase de confirmação (Não copiável) */}
          {confirmStep === 1 && (
            <div className="space-y-3 border-t border-red-200 pt-3">
              <label className="block text-xs font-medium text-red-900">
                Para prosseguir, digite exatamente a frase abaixo:
              </label>

              <div
                className="select-none bg-red-100/80 border border-red-200 p-2.5 rounded-md text-xs font-mono font-bold text-red-900 tracking-tight"
                onCopy={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
              >
                {REQUIRED_PHRASE}
              </div>

              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                placeholder="Digite a frase acima..."
                className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetModal}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!isTextMatch}
                  onClick={() => setConfirmStep(2)}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Avançar
                </button>
              </div>
            </div>
          )}

          {/* Primeira Confirmação*/}
          {confirmStep === 2 && (
            <div className="space-y-3 border-t border-red-200 pt-3">
              <p className="text-sm font-bold text-red-900">
                Tem certeza mesmo?
              </p>
              <p className="text-xs text-red-700">
                Você está prestes a excluir todos os registros do semestre{" "}
                <strong>{purgeTarget.name}</strong>
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetModal}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Não, cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmStep(3)}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  Sim, tenho certeza (1/2)
                </button>
              </div>
            </div>
          )}

          {/* Segunda Confirmação*/}
          {confirmStep === 3 && (
            <div className="space-y-3 border-t border-red-200 pt-3">
              <p className="text-sm font-bold text-red-900">
                Última confirmação: Tem certeza absoluta?
              </p>
              <p className="text-xs text-red-700">
                Esta é a sua última chance. Ao clicar no botão abaixo, a deleção
                será executada no banco de dados imediatamente.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetModal}
                  disabled={isPending}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handlePurgeDrop}
                  disabled={isPending}
                  className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50 transition-colors"
                >
                  {isPending
                    ? "Deletando banco de dados..."
                    : "Sim, deletar definitivamente (2/2)"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
