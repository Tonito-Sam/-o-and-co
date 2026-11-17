declare module "@paystack/inline-js" {
  type TransactionResult = {
    id: number;
    reference: string;
    message: string;
  };

  type InlineError = {
    message: string;
  };

  type ResumeCallbacks = {
    onSuccess: (transaction: TransactionResult) => void;
    onCancel: () => void;
    onError: (error: InlineError) => void;
  };

  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks: ResumeCallbacks): unknown;
  }
}
