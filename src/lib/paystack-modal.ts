import PaystackPop from "@paystack/inline-js";

export type PaystackModalResult =
  | { status: "success"; reference: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export function resumePaystackModal(accessCode: string): Promise<PaystackModalResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PaystackModalResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      new PaystackPop().resumeTransaction(accessCode, {
        onSuccess: ({ reference }) => finish({ status: "success", reference }),
        onCancel: () => finish({ status: "cancelled" }),
        onError: ({ message }) => finish({ status: "error", message }),
      });
    } catch (error) {
      finish({
        status: "error",
        message: error instanceof Error ? error.message : "Paystack checkout could not open.",
      });
    }
  });
}
