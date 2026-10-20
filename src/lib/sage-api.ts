import { type Invoice, type InvoiceMethod, type InvoiceItem } from "@/lib/mock";

export type SageRuntimeMode = "live" | "sandbox" | "demo";

export interface SageConfig {
  apiUrl: string;
  apiKey: string;
  companyId: string;
  username: string;
  password: string;
}

export interface SageCustomerPayload {
  Name: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  CustomerTypeId?: number;
  Branch?: string;
}

export interface SageCustomer {
  ID: string;
  Name: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  CustomerTypeId?: number;
  Created?: string;
  Modified?: string;
  Branch?: string;
}

export interface SageInvoiceLine {
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Tax?: number;
  TaxId?: string;
}

export interface SageInvoicePayload {
  CustomerId: string;
  CustomerName?: string;
  Date: string;
  DueDate: string;
  Status: "DRAFT" | "OPEN" | "OVERDUE" | "PAID" | "DELETED";
  Lines: SageInvoiceLine[];
  Total: number;
  TotalTax?: number;
  Comments?: string;
  PaymentMethod?: string;
  PaymentReference?: string;
  Branch?: string;
}

export interface SageInvoice {
  ID?: string;
  CustomerId: string;
  CustomerName?: string;
  Date: string;
  DueDate: string;
  Status: "DRAFT" | "OPEN" | "OVERDUE" | "PAID" | "DELETED";
  Lines: SageInvoiceLine[];
  Total: number;
  TotalTax?: number;
  Comments?: string;
  PaymentMethod?: string;
  PaymentReference?: string;
  Created?: string;
  Modified?: string;
  Branch?: string;
}

export interface SageApiResponse<T> {
  Results?: T[];
  TotalCount?: number;
  Message?: string;
}

export class SageApiError extends Error {
  public statusCode: number;
  public retryable: boolean;

  constructor(message: string, statusCode: number, retryable = false) {
    super(message);
    this.name = "SageApiError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export class SageRateLimitError extends SageApiError {
  public blockDuration: number;

  constructor(message: string, blockDuration = 3600) {
    super(message, 429, true);
    this.name = "SageRateLimitError";
    this.blockDuration = blockDuration;
  }
}

export class SageApiClient {
  private baseUrl: string;
  private apiKey: string;
  private companyId: string;
  private username: string;
  private password: string;
  private requestQueue: Array<() => Promise<unknown>> = [];
  private isProcessingQueue = false;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 1000;
  private readonly runtimeMode: SageRuntimeMode;

  constructor(config: SageConfig, runtimeMode: SageRuntimeMode = "live") {
    this.baseUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.companyId = config.companyId;
    this.username = config.username;
    this.password = config.password;
    this.runtimeMode = runtimeMode;
  }

  private getAuthHeader(): string {
    const credentials = `${this.username}:${this.password}`;
    return `Basic ${globalThis.btoa(credentials)}`;
  }

  private async rateLimitWait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  private async enqueueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.isProcessingQueue) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const requestFn = this.requestQueue.shift();
      if (!requestFn) continue;

      try {
        await this.rateLimitWait();
        await requestFn();
      } catch (error) {
        console.error("Sage queue request failed:", error);
      }
    }

    this.isProcessingQueue = false;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<T> {
    const maxRetries = 3;

    if (this.runtimeMode === "sandbox") {
      return { ok: true, endpoint, mode: "sandbox" } as T;
    }

    const url = `${this.baseUrl}${endpoint}?apikey=${encodeURIComponent(this.apiKey)}&companyid=${encodeURIComponent(this.companyId)}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
      });

      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get("Retry-After") ?? "3600", 10);
        throw new SageRateLimitError("Rate limit exceeded. Please wait before retrying.", retryAfter);
      }

      if (!response.ok) {
        let errorMessage = `Sage API Error: ${response.status}`;
        let retryable = false;

        try {
          const errorBody = await response.text();
          errorMessage = `${errorMessage} - ${errorBody}`;
        } catch {
          // Ignore parsing failures.
        }

        retryable = [500, 502, 503, 504].includes(response.status);
        throw new SageApiError(errorMessage, response.status, retryable);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SageApiError && error.retryable && retryCount < maxRetries) {
        const waitTime = 1000 * 2 ** retryCount;
        console.info(`Retrying Sage request (${retryCount + 1}/${maxRetries}) in ${waitTime}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      if (error instanceof SageRateLimitError) {
        throw error;
      }

      throw error;
    }
  }

  async getCustomers(params?: { search?: string; top?: number; skip?: number }): Promise<SageCustomer[]> {
    let endpoint = "/Customer/Get";
    const queryParams: string[] = [];

    if (params?.top) queryParams.push(`$top=${params.top}`);
    if (params?.skip) queryParams.push(`$skip=${params.skip}`);
    if (params?.search) queryParams.push(`$filter=Name contains '${params.search}'`);
    if (queryParams.length > 0) endpoint += `?${queryParams.join("&")}`;

    const response = await this.request<SageApiResponse<SageCustomer>>(endpoint, { method: "GET" });
    return response.Results ?? [];
  }

  async getCustomerById(id: string): Promise<SageCustomer | null> {
    try {
      const response = await this.request<SageApiResponse<SageCustomer>>(`/Customer/Get/${id}`, { method: "GET" });
      return response.Results?.[0] ?? null;
    } catch (error) {
      if (error instanceof SageApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async getCustomerByName(name: string): Promise<SageCustomer | null> {
    const customers = await this.getCustomers({ search: name, top: 25 });
    return customers.find((customer) => customer.Name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  async createCustomer(customer: { name: string; email?: string; phone?: string; address?: string; branch?: string }): Promise<SageCustomer> {
    if (this.runtimeMode === "sandbox") {
      return {
        ID: `SANDBOX-CUST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        Name: customer.name,
        Email: customer.email,
        Phone: customer.phone,
        Address: customer.address,
        Branch: customer.branch,
        CustomerTypeId: 1,
        Created: new Date().toISOString(),
      };
    }

    const payload: SageCustomerPayload = {
      Name: customer.name,
      Email: customer.email ?? "",
      Phone: customer.phone ?? "",
      Address: customer.address ?? "",
      CustomerTypeId: 1,
      Branch: customer.branch,
    };

    const response = await this.request<SageApiResponse<SageCustomer>>("/Customer/Save", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return response.Results?.[0] ?? (response as unknown as SageCustomer);
  }

  async updateCustomer(id: string, customer: Partial<SageCustomer>): Promise<SageCustomer> {
    if (this.runtimeMode === "sandbox") {
      return {
        ID: id,
        Name: customer.Name ?? "Sandbox customer",
        Email: customer.Email,
        Phone: customer.Phone,
        Address: customer.Address,
        Branch: customer.Branch,
        CustomerTypeId: customer.CustomerTypeId ?? 1,
        Modified: new Date().toISOString(),
      };
    }

    const response = await this.request<SageApiResponse<SageCustomer>>(`/Customer/Save/${id}`, {
      method: "PUT",
      body: JSON.stringify(customer),
    });

    return response.Results?.[0] ?? (response as unknown as SageCustomer);
  }

  async syncCustomer(tenant: { id?: string; name: string; email?: string; phone?: string; address?: string; branch?: string }): Promise<SageCustomer> {
    if (this.runtimeMode === "sandbox") {
      return this.createCustomer({
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address,
        branch: tenant.branch,
      });
    }

    const existing = await this.getCustomerByName(tenant.name);

    if (existing) {
      return this.updateCustomer(existing.ID, {
        Name: tenant.name,
        Email: tenant.email ?? existing.Email,
        Phone: tenant.phone ?? existing.Phone,
        Address: tenant.address ?? existing.Address,
        Branch: tenant.branch ?? existing.Branch,
      });
    }

    return this.createCustomer({
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      address: tenant.address,
      branch: tenant.branch,
    });
  }

  async getInvoices(params?: { tenantName?: string; status?: string; fromDate?: string; toDate?: string; top?: number; skip?: number }): Promise<SageInvoice[]> {
    if (this.runtimeMode === "sandbox") {
      return [];
    }

    let endpoint = "/SalesInvoice/Get";
    const queryParams: string[] = [];

    if (params?.tenantName) queryParams.push(`$filter=CustomerName eq '${params.tenantName}'`);
    if (params?.status) queryParams.push(`$filter=Status eq '${params.status}'`);
    if (params?.fromDate) queryParams.push(`$filter=Date ge '${params.fromDate}'`);
    if (params?.toDate) queryParams.push(`$filter=Date le '${params.toDate}'`);
    if (params?.top) queryParams.push(`$top=${params.top}`);
    if (params?.skip) queryParams.push(`$skip=${params.skip}`);
    if (queryParams.length > 0) endpoint += `?${queryParams.join("&")}`;

    const response = await this.request<SageApiResponse<SageInvoice>>(endpoint, { method: "GET" });
    return response.Results ?? [];
  }

  async getInvoiceById(id: string): Promise<SageInvoice | null> {
    try {
      const response = await this.request<SageApiResponse<SageInvoice>>(`/SalesInvoice/Get/${id}`, { method: "GET" });
      return response.Results?.[0] ?? null;
    } catch (error) {
      if (error instanceof SageApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async createInvoice(invoice: {
    tenant: string;
    amount: number;
    due: string;
    items: InvoiceItem[];
    note?: string;
    branch?: string;
    date?: string;
  }): Promise<SageInvoice> {
    if (this.runtimeMode === "sandbox") {
      return {
        ID: `SANDBOX-INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        CustomerId: `SANDBOX-CUST-${invoice.tenant.replace(/\s+/g, "-").toUpperCase()}`,
        CustomerName: invoice.tenant,
        Date: invoice.date ?? new Date().toISOString().slice(0, 10),
        DueDate: invoice.due,
        Status: "OPEN",
        Lines: invoice.items.map((item) => ({
          Description: item.name,
          Quantity: item.qty,
          UnitPrice: item.price,
          Tax: 0,
          TaxId: undefined,
        })),
        Total: invoice.amount,
        Comments: invoice.note ?? "",
        Branch: invoice.branch ?? "",
      };
    }

    const customer = await this.syncCustomer({
      name: invoice.tenant,
      branch: invoice.branch,
    });

    const lines: SageInvoiceLine[] = invoice.items.map((item) => ({
      Description: item.name,
      Quantity: item.qty,
      UnitPrice: item.price,
      Tax: 0,
      TaxId: undefined,
    }));

    const payload: SageInvoicePayload = {
      CustomerId: customer.ID,
      CustomerName: invoice.tenant,
      Date: invoice.date ?? new Date().toISOString().slice(0, 10),
      DueDate: invoice.due,
      Status: "OPEN",
      Lines: lines,
      Total: invoice.amount,
      Comments: invoice.note ?? "",
      Branch: invoice.branch ?? "",
    };

    const response = await this.request<SageApiResponse<SageInvoice>>("/SalesInvoice/Save", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return response.Results?.[0] ?? (response as unknown as SageInvoice);
  }

  async updateInvoice(id: string, invoice: Partial<SageInvoice>): Promise<SageInvoice> {
    const response = await this.request<SageApiResponse<SageInvoice>>(`/SalesInvoice/Save/${id}`, {
      method: "PUT",
      body: JSON.stringify(invoice),
    });

    return response.Results?.[0] ?? (response as unknown as SageInvoice);
  }

  async recordPayment(invoiceId: string, paymentDetails: { amount: number; method: InvoiceMethod; reference?: string; date?: string }): Promise<void> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new SageApiError("Invoice not found in Sage", 404, false);
    }

    await this.updateInvoice(invoiceId, {
      ...invoice,
      Status: "PAID",
      PaymentMethod: paymentDetails.method,
      PaymentReference: paymentDetails.reference ?? invoiceId,
    });
  }

  async markInvoiceAsSent(invoiceId: string): Promise<void> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new SageApiError("Invoice not found in Sage", 404, false);
    }

    if (invoice.Status === "DRAFT") {
      await this.updateInvoice(invoiceId, {
        ...invoice,
        Status: "OPEN",
      });
    }
  }

  async getInvoiceStatus(invoiceId: string): Promise<string> {
    const invoice = await this.getInvoiceById(invoiceId);
    return invoice?.Status ?? "UNKNOWN";
  }

  async bulkCreateInvoices(invoices: Array<{ tenant: string; amount: number; due: string; items: InvoiceItem[]; note?: string; branch?: string }>): Promise<SageInvoice[]> {
    const results: SageInvoice[] = [];
    const errors: Array<{ invoice: unknown; error: Error }> = [];

    const batchSize = 10;
    for (let i = 0; i < invoices.length; i += batchSize) {
      const batch = invoices.slice(i, i + batchSize);

      for (const invoice of batch) {
        try {
          const result = await this.createInvoice(invoice);
          results.push(result);
        } catch (error) {
          errors.push({ invoice, error: error as Error });
          console.error(`Failed to sync invoice for ${invoice.tenant}:`, error);
        }
      }

      if (i + batchSize < invoices.length) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    if (errors.length > 0) {
      console.warn(`Created ${results.length} invoices; ${errors.length} failed.`);
    }

    return results;
  }

  async getCompanyInfo(): Promise<unknown> {
    return this.request("/Company/Get", { method: "GET" });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getCompanyInfo();
      return true;
    } catch {
      return false;
    }
  }
}

let sageApiClient: SageApiClient | null = null;

const getRuntimeSageConfig = (): SageConfig | null => {
  if (typeof window === "undefined") return null;

  const apiUrl = (import.meta.env.VITE_SAGE_API_URL as string | undefined) ?? (import.meta.env.NEXT_PUBLIC_SAGE_API_URL as string | undefined) ?? "https://accounting.sageone.co.za/api/2.00";
  const apiKey = (import.meta.env.VITE_SAGE_API_KEY as string | undefined) ?? (import.meta.env.NEXT_PUBLIC_SAGE_API_KEY as string | undefined) ?? "";
  const companyId = (import.meta.env.VITE_SAGE_COMPANY_ID as string | undefined) ?? (import.meta.env.NEXT_PUBLIC_SAGE_COMPANY_ID as string | undefined) ?? "";
  const username = (import.meta.env.VITE_SAGE_USERNAME as string | undefined) ?? (import.meta.env.NEXT_PUBLIC_SAGE_USERNAME as string | undefined) ?? "";
  const password = (import.meta.env.VITE_SAGE_PASSWORD as string | undefined) ?? (import.meta.env.NEXT_PUBLIC_SAGE_PASSWORD as string | undefined) ?? "";

  if (!apiKey || !companyId || !username || !password) return null;

  return { apiUrl, apiKey, companyId, username, password };
};

export function getSageRuntimeMode(): SageRuntimeMode {
  const mode = (import.meta.env.VITE_SAGE_MODE as string | undefined) ?? (import.meta.env.NEXT_PUBLIC_SAGE_MODE as string | undefined) ?? "demo";
  const normalized = mode.toLowerCase();

  if (normalized === "live" || normalized === "sandbox") {
    return normalized;
  }

  return "demo";
}

export function getSageApiClient(): SageApiClient | null {
  if (typeof window === "undefined") return null;

  const mode = getSageRuntimeMode();

  if (!sageApiClient) {
    const config = getRuntimeSageConfig();
    if (!config && mode === "demo") {
      console.warn("Sage API credentials not configured. Falling back to mock data.");
      return null;
    }

    if (!config && mode === "sandbox") {
      sageApiClient = new SageApiClient({
        apiUrl: "https://sandbox.accounting.sageone.co.za/api/2.00",
        apiKey: "sandbox",
        companyId: "sandbox",
        username: "sandbox",
        password: "sandbox",
      }, "sandbox");
      return sageApiClient;
    }

    if (!config) {
      console.warn("Sage API credentials not configured. Falling back to mock data.");
      return null;
    }

    sageApiClient = new SageApiClient(config, mode === "sandbox" ? "sandbox" : "live");
  }

  return sageApiClient;
}

export function isSageConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SAGE_API_KEY ||
      import.meta.env.VITE_SAGE_COMPANY_ID ||
      import.meta.env.VITE_SAGE_USERNAME ||
      import.meta.env.VITE_SAGE_PASSWORD ||
      import.meta.env.NEXT_PUBLIC_SAGE_API_KEY ||
      import.meta.env.NEXT_PUBLIC_SAGE_COMPANY_ID ||
      import.meta.env.NEXT_PUBLIC_SAGE_USERNAME ||
      import.meta.env.NEXT_PUBLIC_SAGE_PASSWORD,
  );
}

export function mapSageInvoiceToAppInvoice(sageInvoice: SageInvoice): Invoice {
  return {
    id: sageInvoice.ID ?? `INV-${Date.now()}`,
    tenant: sageInvoice.CustomerName ?? "Unknown tenant",
    amount: sageInvoice.Total ?? 0,
    status: (sageInvoice.Status.toLowerCase() === "overdue"
      ? "Overdue"
      : sageInvoice.Status.toLowerCase() === "paid"
        ? "Paid"
        : sageInvoice.Status.toLowerCase() === "draft"
          ? "Draft"
          : "Sent") as Invoice["status"],
    due: sageInvoice.DueDate ?? new Date().toISOString().slice(0, 10),
    method: "—",
    items: sageInvoice.Lines?.map((line) => ({ name: line.Description, qty: Number(line.Quantity) || 1, price: Number(line.UnitPrice) || 0 })) ?? [],
    issuedAt: sageInvoice.Date ?? new Date().toISOString(),
    branch: sageInvoice.Branch ?? "Bryanston",
    kind: "marketplace",
    note: sageInvoice.Comments ?? "",
  };
}
