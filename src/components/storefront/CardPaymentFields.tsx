"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  CardNumber,
  ExpirationDate,
  SecurityCode,
  createCardToken,
  getInstallments,
  getPaymentMethods,
} from "@mercadopago/sdk-react";
import {
  capInstallments,
  type InstallmentOption,
} from "@/lib/card-installments";

/** Exactly the shape `createOrder` accepts as `card`. No raw card data. */
export interface CardTokenResult {
  token: string;
  paymentMethodId: string;
  paymentTypeId: "credit_card" | "debit_card";
  installments: number;
}

export interface CardPaymentFieldsHandle {
  /** Creates a fresh single-use token. Throws an Error with a user-facing message. */
  tokenize: (identificationNumber: string) => Promise<CardTokenResult>;
}

interface CardPaymentFieldsProps {
  amountCents: number;
  ref?: Ref<CardPaymentFieldsHandle>;
}

interface DetectedCard {
  paymentMethodId: string;
  paymentTypeId: CardTokenResult["paymentTypeId"];
}

const TOKEN_ERROR =
  "Não foi possível validar os dados do cartão. Confira número, validade e código de segurança.";
const LOOKUP_ERROR =
  "Não foi possível consultar o cartão agora. Tente novamente.";

const labelClass =
  "block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1";
const inputClass =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100";
const fieldBoxClass =
  "h-10 overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700 px-3";
const fieldStyle = { fontSize: "14px", height: "38px" };

export function CardPaymentFields({
  amountCents,
  ref,
}: CardPaymentFieldsProps) {
  const [cardholderName, setCardholderName] = useState("");
  const [card, setCard] = useState<DetectedCard | null>(null);
  const [options, setOptions] = useState<InstallmentOption[]>([]);
  const [installments, setInstallments] = useState(1);
  const [cardError, setCardError] = useState<string | null>(null);
  const binRequest = useRef(0);

  const resetCard = (message: string | null) => {
    setCard(null);
    setOptions([]);
    setInstallments(1);
    setCardError(message);
  };

  // Fires when the first digits of the card number change. Late answers for an
  // older BIN are discarded so they cannot overwrite the current card.
  const handleBinChange = async ({ bin }: { bin?: string }) => {
    const requestId = ++binRequest.current;
    const isStale = () => requestId !== binRequest.current;

    if (!bin) {
      resetCard(null);
      return;
    }

    try {
      const paymentMethods = await getPaymentMethods({ bin });
      if (isStale()) return;

      const method = paymentMethods?.results?.[0];
      if (!method) {
        resetCard("Não reconhecemos este cartão. Confira o número.");
        return;
      }
      const type = method.payment_type_id;
      if (type !== "credit_card" && type !== "debit_card") {
        resetCard("Aceitamos apenas cartões de crédito ou débito.");
        return;
      }

      // Debit is always a single payment, so installments are only fetched for credit.
      let nextOptions: InstallmentOption[] = [];
      if (type === "credit_card") {
        const installmentGroups = await getInstallments({
          amount: (amountCents / 100).toFixed(2),
          bin,
          locale: "pt-BR",
        });
        if (isStale()) return;
        nextOptions = capInstallments(installmentGroups?.[0]?.payer_costs);
        if (nextOptions.length === 0) {
          throw new Error("No installment options returned.");
        }
      }

      setCard({ paymentMethodId: method.id, paymentTypeId: type });
      setOptions(nextOptions);
      setInstallments(nextOptions[0]?.installments ?? 1);
      setCardError(null);
    } catch (error) {
      if (isStale()) return;
      console.warn("[CARD_LOOKUP_ERROR]", error);
      resetCard(LOOKUP_ERROR);
    }
  };

  // CardNumber must receive the same callback on every render. A new function
  // each time makes the SDK rebuild the field, which wipes the typed number.
  const latestBinHandler = useRef(handleBinChange);
  useEffect(() => {
    latestBinHandler.current = handleBinChange;
  });
  const onBinChange = useCallback(
    (arg: { bin?: string }) => latestBinHandler.current(arg),
    [],
  );

  const tokenize = async (
    identificationNumber: string,
  ): Promise<CardTokenResult> => {
    if (!card) {
      throw new Error(cardError ?? "Informe um número de cartão válido.");
    }
    const holder = cardholderName.trim();
    if (holder.length < 3) {
      throw new Error("Informe o nome impresso no cartão.");
    }

    const created = await createCardToken({
      cardholderName: holder,
      identificationType: "CPF",
      identificationNumber,
    }).catch(() => null);
    if (!created?.id) throw new Error(TOKEN_ERROR);

    return {
      token: created.id,
      paymentMethodId: card.paymentMethodId,
      paymentTypeId: card.paymentTypeId,
      installments: card.paymentTypeId === "debit_card" ? 1 : installments,
    };
  };

  useImperativeHandle(ref, () => ({ tokenize }));

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div>
        <label htmlFor="card-holder" className={labelClass}>
          Nome impresso no cartão
        </label>
        <input
          id="card-holder"
          type="text"
          autoComplete="cc-name"
          placeholder="Ex: GABRIEL S SANTOS"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <span className={labelClass}>Número do cartão</span>
        <div className={fieldBoxClass}>
          <CardNumber
            placeholder="0000 0000 0000 0000"
            style={fieldStyle}
            onBinChange={onBinChange}
          />
        </div>
        {cardError && (
          <p
            role="alert"
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {cardError}
          </p>
        )}
        {card && (
          <p className="mt-1 text-xs text-zinc-500">
            {card.paymentTypeId === "debit_card"
              ? "Cartão de débito (pagamento à vista)"
              : "Cartão de crédito"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className={labelClass}>Validade</span>
          <div className={fieldBoxClass}>
            <ExpirationDate
              placeholder="MM/AA"
              mode="short"
              style={fieldStyle}
            />
          </div>
        </div>
        <div>
          <span className={labelClass}>Código de segurança</span>
          <div className={fieldBoxClass}>
            <SecurityCode placeholder="CVV" style={fieldStyle} />
          </div>
        </div>
      </div>

      {card?.paymentTypeId === "credit_card" && (
        <div>
          <label htmlFor="card-installments" className={labelClass}>
            Parcelas
          </label>
          <select
            id="card-installments"
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            className={inputClass}
          >
            {options.map((option) => (
              <option key={option.installments} value={option.installments}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Os dados do cartão são digitados em campos seguros do Mercado Pago e
        nunca passam pelo nosso servidor.
      </p>
    </div>
  );
}
