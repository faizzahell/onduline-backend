import { GoogleGenAI, Type } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = 0.1;

/** A category the provider is allowed to choose from. */
export interface CategoryChoice {
  code: string;
  name: string;
}

/** Values read from a receipt. `null` means the provider could not tell. */
export interface ExtractedReceipt {
  merchantName: string | null;
  transactionDate: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  currency: string | null;
  description: string | null;
  /** Category code chosen from the list supplied in the prompt. */
  categoryCode: string | null;
}

/**
 * Reads expense receipts with Google Gemini.
 *
 * The category list is injected into the prompt from the company's own
 * category master, so adding or renaming a category immediately affects
 * extraction without touching this file.
 */
@Injectable()
export class ExpenseOcrProvider {
  private readonly logger = new Logger(ExpenseOcrProvider.name);
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
    categories: CategoryChoice[],
  ): Promise<ExtractedReceipt> {
    const fileBuffer = await readFile(absolutePath);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        { inlineData: { mimeType, data: fileBuffer.toString('base64') } },
        this.buildPrompt(categories),
      ],
      config: {
        temperature: this.temperature,
        responseMimeType: 'application/json',
        responseSchema: this.buildSchema(categories),
      },
    });

    const text = response.text;

    if (!text) {
      throw new Error('The extraction provider returned an empty response');
    }

    try {
      return JSON.parse(text) as ExtractedReceipt;
    } catch {
      this.logger.error(
        `Provider response was not valid JSON: ${text.slice(0, 300)}`,
      );

      throw new Error('The extraction provider returned invalid JSON');
    }
  }

  private buildPrompt(categories: CategoryChoice[]): string {
    const options = categories
      .map((category) => `- ${category.code}: ${category.name}`)
      .join('\n');

    return `You are a receipt data extraction system for employee expense claims.

Extract the requested fields from the provided receipt image or PDF.

Rules:
- Never invent information. Use null when a field cannot be determined.
- Return monetary values as plain numbers, without currency symbols or separators.
- transactionDate must use the ISO format YYYY-MM-DD.
- merchantName is the shop, restaurant, or service provider name.
- totalAmount is the final amount paid by the customer.
- taxAmount is the tax portion only when it is printed separately.
- description is a short summary of what was purchased, at most 100 characters.
- categoryCode must be exactly one of the codes listed below, or null when none fits.

Available categories:
${options}

Return only JSON matching the requested schema.`;
  }

  private buildSchema(categories: CategoryChoice[]) {
    const nullableString = { type: Type.STRING, nullable: true } as const;
    const nullableNumber = { type: Type.NUMBER, nullable: true } as const;

    return {
      type: Type.OBJECT,
      properties: {
        merchantName: nullableString,
        transactionDate: nullableString,
        totalAmount: nullableNumber,
        taxAmount: nullableNumber,
        currency: nullableString,
        description: nullableString,
        categoryCode: {
          type: Type.STRING,
          nullable: true,
          // Constraining the enum keeps the model from inventing codes that
          // do not exist in the company's category master.
          enum: categories.map((category) => category.code),
        },
      },
      required: ['merchantName', 'totalAmount', 'categoryCode'],
    };
  }
}
