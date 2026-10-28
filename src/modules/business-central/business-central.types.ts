/** DI token for {@link BusinessCentralClient}. */
export const BUSINESS_CENTRAL_CLIENT = Symbol('BUSINESS_CENTRAL_CLIENT');

export type GrnStatus =
  'FULLY_RECEIVED' | 'PARTIALLY_RECEIVED' | 'NOT_RECEIVED';

export interface OpenPurchaseOrderLine {
  lineNumber: number;
  itemNo: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  /** Quantity already received by the warehouse, the basis of the 3-way match. */
  receivedQuantity: number;
}

export interface OpenPurchaseOrder {
  poNumber: string;
  vendorNo: string;
  vendorName: string;
  orderDate: string;
  purchaserName: string;
  currency: string;
  totalAmount: number;
  status: string;
  grnStatus: GrnStatus;
  linesCount: number;
  lines: OpenPurchaseOrderLine[];
}

export interface SubmitPurchaseInvoicePayload {
  invoiceId: string;
  invoiceNumber: string | null;
  vendorName: string | null;
  poNumber: string | null;
  currency: string;
  totalAmount: number | null;
}

export interface SubmitPurchaseInvoiceResult {
  bcInvoiceNo: string;
}

/**
 * Interface to Business Central.
 *
 * There is no real implementation yet because the BC credentials are not
 * available, so only `MockBusinessCentralClient` is registered for now. Once
 * the BC endpoints are ready, add a new implementation and switch the provider
 * selection in `BusinessCentralModule`.
 */
export interface BusinessCentralClient {
  /** Implementation identifier, surfaced in logs and responses. */
  readonly name: string;

  findOpenPurchaseOrders(vendorName: string): Promise<OpenPurchaseOrder[]>;

  submitPurchaseInvoice(
    payload: SubmitPurchaseInvoicePayload,
  ): Promise<SubmitPurchaseInvoiceResult>;
}
