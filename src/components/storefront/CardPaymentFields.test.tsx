// @vitest-environment jsdom
import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCardToken,
  getInstallments,
  getPaymentMethods,
} from "@mercadopago/sdk-react";
import {
  CardPaymentFields,
  type CardPaymentFieldsHandle,
} from "./CardPaymentFields";

type BinHandler = (arg: { bin?: string }) => void | Promise<void>;
const sdk = vi.hoisted(() => ({
  onBinChange: undefined as BinHandler | undefined,
}));

vi.mock("@mercadopago/sdk-react", () => ({
  CardNumber: (props: { onBinChange?: BinHandler }) => {
    sdk.onBinChange = props.onBinChange;
    return <div />;
  },
  ExpirationDate: () => <div />,
  SecurityCode: () => <div />,
  createCardToken: vi.fn(),
  getPaymentMethods: vi.fn(),
  getInstallments: vi.fn(),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const CPF = "52998224725";

async function enterBin(type: "credit_card" | "debit_card" = "credit_card") {
  vi.mocked(getPaymentMethods).mockResolvedValue({
    results: [{ id: "master", payment_type_id: type }],
  } as never);
  await act(async () => {
    await sdk.onBinChange?.({ bin: "50314332" });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInstallments).mockResolvedValue([
    {
      payer_costs: [1, 2, 3, 4, 5, 6].map((n) => ({
        installments: n,
        recommended_message: `${n}x`,
      })),
    },
  ] as never);
  vi.mocked(createCardToken).mockResolvedValue({ id: TOKEN } as never);
});

describe("CardPaymentFields", () => {
  it("offers at most three installments", async () => {
    render(<CardPaymentFields amountCents={5000} />);
    await enterBin();
    const select = await screen.findByLabelText("Parcelas");
    expect(select.querySelectorAll("option")).toHaveLength(3);
  });

  it("returns only the token and card metadata when tokenizing", async () => {
    const ref = createRef<CardPaymentFieldsHandle>();
    render(<CardPaymentFields amountCents={5000} ref={ref} />);
    fireEvent.change(screen.getByLabelText("Nome impresso no cartão"), {
      target: { value: "APRO" },
    });
    await enterBin();
    fireEvent.change(await screen.findByLabelText("Parcelas"), {
      target: { value: "2" },
    });

    const result = await ref.current!.tokenize(CPF);

    expect(result).toEqual({
      token: TOKEN,
      paymentMethodId: "master",
      paymentTypeId: "credit_card",
      installments: 2,
    });
    expect(createCardToken).toHaveBeenCalledWith({
      cardholderName: "APRO",
      identificationType: "CPF",
      identificationNumber: CPF,
    });
  });

  it("treats debit cards as a single payment", async () => {
    const ref = createRef<CardPaymentFieldsHandle>();
    render(<CardPaymentFields amountCents={5000} ref={ref} />);
    fireEvent.change(screen.getByLabelText("Nome impresso no cartão"), {
      target: { value: "APRO" },
    });
    await enterBin("debit_card");

    expect(screen.queryByLabelText("Parcelas")).toBeNull();
    expect(getInstallments).not.toHaveBeenCalled();
    await expect(ref.current!.tokenize(CPF)).resolves.toMatchObject({
      paymentTypeId: "debit_card",
      installments: 1,
    });
  });

  it("blocks tokenization for an unrecognized card", async () => {
    const ref = createRef<CardPaymentFieldsHandle>();
    render(<CardPaymentFields amountCents={5000} ref={ref} />);
    fireEvent.change(screen.getByLabelText("Nome impresso no cartão"), {
      target: { value: "APRO" },
    });
    vi.mocked(getPaymentMethods).mockResolvedValue({ results: [] } as never);
    await act(async () => {
      await sdk.onBinChange?.({ bin: "00000000" });
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    await expect(ref.current!.tokenize(CPF)).rejects.toThrow();
    expect(createCardToken).not.toHaveBeenCalled();
  });
});
