import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { readFile } from 'node:fs/promises';

import type {
  ExtractedInvoice,
  ExtractionResult,
} from '../dto/invoice-extraction.dto';
import type { InvoiceExtractionProvider } from './invoice-extraction.provider';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = 0.1;

const EXTRACTION_INSTRUCTIONS = `You are an invoice data extraction system.

Extract structured invoice information directly from the provided document.

Rules:
- Do not invent information.
- If a field cannot be determined, use null.
- Preserve the original invoice meaning.
- Convert monetary values to plain numbers (numeric floats/decimals).
- Do not include currency symbols in numeric fields.
- Extract every identifiable line item.
- quantity, unitPrice, lineTotal and taxAmount must be numeric when available.
- lineTotal is the total price for the line; taxAmount is the tax for the line.
- unit is the unit of measure (e.g. PCS, KG, BOX, UNIT) when available.
- Use ISO date format YYYY-MM-DD when a date can be determined reliably.
- Return only JSON matching the requested schema.`;

/**
 * Multimodal invoice extraction using Google Gemini: the file is sent directly
 * (PDF or image) without a separate OCR step.
 */
@Injectable()
export class GeminiExtractionProvider implements InvoiceExtractionProvider {
  private readonly logger = new Logger(GeminiExtractionProvider.name);
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(configService: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: configService.getOrThrow<string>('GEMINI_API_KEY'),
    });

    this.model = configService.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;

    this.temperature =
      configService.get<number>('GEMINI_TEMPERATURE') ?? DEFAULT_TEMPERATURE;
  }

  getProviderName(): string {
    return 'google-gemini';
  }

  getModelName(): string {
    return this.model;
  }

  async extractFromFile(
    absolutePath: string,
    mimeType: string,
  ): Promise<ExtractionResult> {
    const fileBuffer = await readFile(absolutePath);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        { inlineData: { mimeType, data: fileBuffer.toString('base64') } },
        EXTRACTION_INSTRUCTIONS,
      ],
      config: {
        temperature: this.temperature,
        responseMimeType: 'application/json',
        responseSchema: this.buildResponseSchema(),
      },
    });

    const text = response.text;

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    let invoice: ExtractedInvoice;

    try {
      invoice = JSON.parse(text) as ExtractedInvoice;
    } catch {
      this.logger.error(
        `The Gemini response is not valid JSON: ${text.slice(0, 500)}`,
      );

      throw new Error('Gemini returned invalid JSON');
    }

    return {
      invoice: { ...invoice, lineItems: invoice.lineItems ?? [] },
      // Gemini does not report a confidence score, so do not invent a number.
      confidence: null,
    };
  }

  private buildResponseSchema() {
    const nullableString = { type: Type.STRING, nullable: true } as const;
    const nullableNumber = { type: Type.NUMBER, nullable: true } as const;

    return {
      type: Type.OBJECT,
      properties: {
        invoiceNumber: nullableString,
        vendorName: nullableString,
        invoiceDate: nullableString,
        dueDate: nullableString,
        poNumber: nullableString,
        currency: nullableString,
        subtotal: nullableNumber,
        taxAmount: nullableNumber,
        totalAmount: nullableNumber,
        lineItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: nullableString,
              quantity: nullableNumber,
              unit: nullableString,
              unitPrice: nullableNumber,
              taxAmount: nullableNumber,
              lineTotal: nullableNumber,
            },
            required: ['description'],
          },
        },
      },
      required: [
        'invoiceNumber',
        'vendorName',
        'currency',
        'subtotal',
        'taxAmount',
        'totalAmount',
        'lineItems',
      ],
    };
  }
}
