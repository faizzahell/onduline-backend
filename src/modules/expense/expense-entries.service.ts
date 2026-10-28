import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { ExpenseMasterService } from '../expense-master/expense-master.service';
import { EmployeesService } from '../expense-master/employees.service';
import type {
  CreateExpenseEntryDto,
  ReviseEntryAmountDto,
} from './dto/expense-entry.dto';
import {
  type CategoryBehaviour,
  calculateEntryAmount,
  countInclusiveDays,
  needsPerTransactionApproval,
} from './expense-entry-calculator';
import {
  assertClaimRevisable,
  assertEntryEditableByClaimant,
  type ClaimStatus,
} from './expense-claim-status';

/**
 * Expenses above this amount must include a payment proof, following the note
 * on the expense form: payments above IDR 100K have to come with a payment
 * proof.
 */
export const PAYMENT_PROOF_THRESHOLD = 100_000;

const entryInclude = {
  category: {
    select: { id: true, code: true, name: true, glAccountNo: true },
  },
  marketingCode: { select: { id: true, code: true, name: true } },
  attachments: true,
  entertainment: true,
  mealAllowance: true,
  revisions: { orderBy: { revisedAt: 'desc' } },
  claim: { select: { id: true, claimNumber: true, status: true } },
  ocrJob: {
    select: { id: true, status: true, provider: true, model: true },
  },
} as const;

@Injectable()
export class ExpenseEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly employees: EmployeesService,
    private readonly master: ExpenseMasterService,
  ) {}

  /**
   * Entries belonging to the currently signed-in employee.
   *
   * The submit page uses `unclaimedOnly` to show what can still be claimed.
   */
  async listMine(
    companyId: string,
    userId: string,
    options: { unclaimedOnly?: boolean; from?: string; to?: string } = {},
  ) {
    const employee = await this.employees.findByUser(companyId, userId);

    return this.prisma.expenseEntry.findMany({
      where: {
        companyId,
        employeeId: employee.id,
        ...(options.unclaimedOnly ? { claimId: null } : {}),
        ...(options.from || options.to
          ? {
              expenseDate: {
                ...(options.from ? { gte: new Date(options.from) } : {}),
                ...(options.to ? { lte: new Date(options.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ expenseDate: 'desc' }, { enteredAt: 'desc' }],
      include: entryInclude,
    });
  }

  async findOne(companyId: string, id: string) {
    const entry = await this.prisma.expenseEntry.findFirst({
      where: { id, companyId },
      include: entryInclude,
    });

    if (!entry) {
      throw new NotFoundException('Expense entry not found');
    }

    return entry;
  }

  /**
   * Records a single entry together with its attachments in one transaction.
   *
   * Attachments are uploaded in the same request because the requirement
   * forbids storing a transaction without proof. Splitting this into two
   * requests would briefly leave an entry without proof in the database.
   */
  async create(
    companyId: string,
    userId: string,
    dto: CreateExpenseEntryDto,
    files: Express.Multer.File[],
  ) {
    const employee = await this.employees.findByUser(companyId, userId);
    const category = await this.loadCategory(companyId, dto.categoryId);

    // A draft is an incomplete line, typically straight from OCR. It is saved
    // without the category requirement and proof checks so the receipt lands
    // in Unclaimed immediately; the employee completes and verifies it later.
    const isDraft = dto.saveAsDraft === true;

    const expenseDate = new Date(dto.expenseDate);
    const computed = await this.computeAmount(
      category,
      dto,
      expenseDate,
      isDraft,
    );

    // A receipt already uploaded for extraction counts as the proof, so the
    // employee never has to upload the same file twice.
    const ocrJob = dto.ocrJobId
      ? await this.loadUsableOcrJob(companyId, userId, dto.ocrJobId)
      : null;

    if (!isDraft) {
      this.assertCategoryFields(category, dto);
      this.assertProofProvided(
        category,
        computed.amount,
        files,
        ocrJob !== null,
      );
    }

    if (dto.marketingCodeId) {
      await this.assertMarketingCode(companyId, dto.marketingCodeId);
    }

    if (!dto.allowDuplicate) {
      await this.assertNotDuplicate(
        companyId,
        employee.id,
        dto.categoryId,
        expenseDate,
        computed.amount,
      );
    }

    const stored = await this.storeAttachments(employee.id, files);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const entry = await tx.expenseEntry.create({
          data: {
            companyId,
            employeeId: employee.id,
            categoryId: dto.categoryId,
            expenseDate,
            quantity: computed.quantity,
            unitPrice: computed.unitPrice,
            amount: computed.amount,
            description: dto.description,
            destination: dto.destination ?? dto.mealDestination,
            remark: dto.remark,
            marketingCodeId: dto.marketingCodeId,
            source: ocrJob ? 'OCR' : 'MANUAL',
            status: isDraft ? 'DRAFT' : 'VERIFIED',
          },
        });

        if (stored.length > 0) {
          await tx.expenseAttachment.createMany({
            data: stored.map((file) => ({ entryId: entry.id, ...file })),
          });
        }

        if (ocrJob) {
          await tx.expenseAttachment.create({
            data: {
              entryId: entry.id,
              originalName: ocrJob.originalName,
              storageKey: ocrJob.storageKey,
              mimeType: ocrJob.mimeType,
              size: ocrJob.size,
            },
          });

          await tx.expenseOcrJob.update({
            where: { id: ocrJob.id },
            data: { expenseEntryId: entry.id },
          });
        }

        // The category-specific detail is only written when its required
        // fields are present. A draft may not have them yet; they are filled
        // in during review before the line can be verified.
        if (category.isEntertainment && dto.entertainmentMerchantName) {
          await tx.entertainmentDetail.create({
            data: {
              entryId: entry.id,
              merchantName: dto.entertainmentMerchantName,
              merchantAddress: dto.entertainmentMerchantAddress,
              kind: dto.entertainmentKind ?? 'LUNCH',
              relationName: dto.entertainmentRelationName ?? '',
              relationPosition: dto.entertainmentRelationPosition,
              relationPhone: dto.entertainmentRelationPhone,
              relationCompany: dto.entertainmentRelationCompany,
              relationBusinessType:
                dto.entertainmentRelationBusinessType ?? 'CUSTOMER',
              notes: dto.entertainmentNotes,
              approvalRequired: needsPerTransactionApproval(
                category,
                computed.amount,
              ),
            },
          });
        }

        if (
          category.isMealAllowance &&
          dto.mealStartDate &&
          dto.mealEndDate &&
          dto.mealDestination
        ) {
          await tx.mealAllowanceDetail.create({
            data: {
              entryId: entry.id,
              startDate: new Date(dto.mealStartDate),
              endDate: new Date(dto.mealEndDate),
              days: computed.quantity,
              destination: dto.mealDestination,
              oneWayDistanceKm: dto.mealOneWayDistanceKm,
            },
          });
        }

        return tx.expenseEntry.findUniqueOrThrow({
          where: { id: entry.id },
          include: entryInclude,
        });
      });
    } catch (error) {
      await Promise.all(
        stored.map((file) => this.storage.deleteFile(file.storageKey)),
      );

      throw error;
    }
  }

  /**
   * Edits an entry while it is still unclaimed (or its claim was sent back for
   * revision), mirroring the review-and-edit flow of an invoice.
   *
   * The category can change, so the amount is recomputed and the
   * category-specific detail (entertainment / meal allowance) is replaced to
   * match the new category.
   */
  async update(
    companyId: string,
    userId: string,
    entryId: string,
    dto: CreateExpenseEntryDto,
  ) {
    const existing = await this.assertOwnedAndEditable(
      companyId,
      userId,
      entryId,
    );

    const category = await this.loadCategory(companyId, dto.categoryId);
    const expenseDate = new Date(dto.expenseDate);

    // "Save changes" is deliberately lenient: the employee can save a partial
    // draft and keep working on it. Requirements are only enforced when the
    // line is verified. A verified line that is edited is re-validated here, so
    // it cannot be silently downgraded into an incomplete state.
    const isVerified = existing.status === 'VERIFIED';
    const computed = await this.computeAmount(
      category,
      dto,
      expenseDate,
      !isVerified,
    );

    if (isVerified) {
      this.assertCategoryFields(category, dto);
    }

    if (dto.marketingCodeId) {
      await this.assertMarketingCode(companyId, dto.marketingCodeId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.expenseEntry.update({
        where: { id: entryId },
        data: {
          categoryId: dto.categoryId,
          expenseDate,
          quantity: computed.quantity,
          unitPrice: computed.unitPrice,
          amount: computed.amount,
          description: dto.description,
          destination: dto.destination ?? dto.mealDestination,
          remark: dto.remark,
          marketingCodeId: dto.marketingCodeId ?? null,
        },
      });

      // The category-specific detail is rebuilt to match the (possibly new)
      // category, so a switch away from entertainment/meal leaves no stale row.
      // On a draft the detail is only written once its required fields exist.
      await tx.entertainmentDetail.deleteMany({ where: { entryId } });
      await tx.mealAllowanceDetail.deleteMany({ where: { entryId } });

      if (category.isEntertainment && dto.entertainmentMerchantName) {
        await tx.entertainmentDetail.create({
          data: {
            entryId,
            merchantName: dto.entertainmentMerchantName,
            merchantAddress: dto.entertainmentMerchantAddress,
            kind: dto.entertainmentKind ?? 'LUNCH',
            relationName: dto.entertainmentRelationName ?? '',
            relationPosition: dto.entertainmentRelationPosition,
            relationPhone: dto.entertainmentRelationPhone,
            relationCompany: dto.entertainmentRelationCompany,
            relationBusinessType:
              dto.entertainmentRelationBusinessType ?? 'CUSTOMER',
            notes: dto.entertainmentNotes,
            approvalRequired: needsPerTransactionApproval(
              category,
              computed.amount,
            ),
          },
        });
      }

      if (
        category.isMealAllowance &&
        dto.mealStartDate &&
        dto.mealEndDate &&
        dto.mealDestination
      ) {
        await tx.mealAllowanceDetail.create({
          data: {
            entryId,
            startDate: new Date(dto.mealStartDate),
            endDate: new Date(dto.mealEndDate),
            days: computed.quantity,
            destination: dto.mealDestination,
            oneWayDistanceKm: dto.mealOneWayDistanceKm,
          },
        });
      }
    });

    return this.findOne(companyId, entryId);
  }

  /**
   * Marks a reviewed entry as verified, which is the gate for claiming it.
   *
   * The entry is validated against every category requirement and the proof
   * rule exactly as a direct (non-draft) entry would be, so a line can only
   * become claimable once it is genuinely complete.
   */
  async verify(companyId: string, userId: string, entryId: string) {
    const entry = await this.assertOwnedAndEditable(companyId, userId, entryId);

    if (entry.status === 'VERIFIED') {
      return this.findOne(companyId, entryId);
    }

    const category = await this.loadCategory(companyId, entry.categoryId);

    const [detail, meal, attachmentCount] = await Promise.all([
      this.prisma.entertainmentDetail.findUnique({ where: { entryId } }),
      this.prisma.mealAllowanceDetail.findUnique({ where: { entryId } }),
      this.prisma.expenseAttachment.count({ where: { entryId } }),
    ]);

    // Rebuild a DTO-shaped view from what is stored so the same requirement
    // checks apply as on a direct entry.
    const asDto = {
      categoryId: entry.categoryId,
      expenseDate: entry.expenseDate.toISOString(),
      marketingCodeId: entry.marketingCodeId ?? undefined,
      destination: entry.destination ?? undefined,
      entertainmentMerchantName: detail?.merchantName,
      entertainmentRelationName: detail?.relationName,
      mealStartDate: meal?.startDate.toISOString(),
      mealEndDate: meal?.endDate.toISOString(),
      mealDestination: meal?.destination,
    } as CreateExpenseEntryDto;

    this.assertCategoryFields(category, asDto);

    if (category.isMealAllowance && (!meal?.startDate || !meal?.endDate)) {
      throw new BadRequestException(
        'Meal allowance requires the travel start date and end date before it can be verified',
      );
    }

    // The proof is whatever is already attached to the entry (an OCR receipt
    // or an uploaded photo), so an existing attachment satisfies the rule.
    this.assertProofProvided(
      category,
      Number(entry.amount),
      [],
      attachmentCount > 0,
    );

    await this.prisma.expenseEntry.update({
      where: { id: entryId },
      data: { status: 'VERIFIED' },
    });

    return this.findOne(companyId, entryId);
  }

  /** Sends a verified entry back to draft so it can be reworked. */
  async unverify(companyId: string, userId: string, entryId: string) {
    await this.assertOwnedAndEditable(companyId, userId, entryId);

    await this.prisma.expenseEntry.update({
      where: { id: entryId },
      data: { status: 'DRAFT' },
    });

    return this.findOne(companyId, entryId);
  }

  /** Adds extra attachments, backing the "add photo" button. */
  async addAttachments(
    companyId: string,
    userId: string,
    entryId: string,
    files: Express.Multer.File[],
  ) {
    if (files.length === 0) {
      throw new BadRequestException('No files were uploaded');
    }

    const entry = await this.assertOwnedAndEditable(companyId, userId, entryId);
    const stored = await this.storeAttachments(entry.employeeId, files);

    await this.prisma.expenseAttachment.createMany({
      data: stored.map((file) => ({ entryId, ...file })),
    });

    return this.findOne(companyId, entryId);
  }

  async removeAttachment(
    companyId: string,
    userId: string,
    entryId: string,
    attachmentId: string,
  ) {
    const entry = await this.assertOwnedAndEditable(companyId, userId, entryId);
    const category = await this.loadCategory(companyId, entry.categoryId);

    const attachments = await this.prisma.expenseAttachment.findMany({
      where: { entryId },
    });

    const target = attachments.find(
      (attachment) => attachment.id === attachmentId,
    );

    if (!target) {
      throw new NotFoundException('Attachment not found');
    }

    if (category.requiresProof && attachments.length === 1) {
      throw new ConflictException(
        'The last attachment cannot be deleted because this category requires proof',
      );
    }

    await this.prisma.expenseAttachment.delete({ where: { id: attachmentId } });
    await this.storage.deleteFile(target.storageKey);

    return this.findOne(companyId, entryId);
  }

  /** Attachment file, streamed through a guarded endpoint. */
  async getAttachmentForDownload(companyId: string, attachmentId: string) {
    const attachment = await this.prisma.expenseAttachment.findFirst({
      where: { id: attachmentId, entry: { companyId } },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    if (!(await this.storage.exists(attachment.storageKey))) {
      throw new NotFoundException('The file is no longer available in storage');
    }

    return {
      attachment,
      stream: this.storage.createReadStream(attachment.storageKey),
    };
  }

  async remove(companyId: string, userId: string, entryId: string) {
    const entry = await this.assertOwnedAndEditable(companyId, userId, entryId);

    const attachments = await this.prisma.expenseAttachment.findMany({
      where: { entryId: entry.id },
    });

    await this.prisma.expenseEntry.delete({ where: { id: entry.id } });

    for (const attachment of attachments) {
      await this.storage.deleteFile(attachment.storageKey);
    }

    return { message: 'Expense entry deleted' };
  }

  /**
   * Amount revision by a reviewer.
   *
   * The requirement stresses that a rejection is a revision rather than an
   * outright refusal, and that every revision must carry a remark plus a trail
   * of who made it.
   */
  async reviseAmount(
    companyId: string,
    userId: string,
    entryId: string,
    dto: ReviseEntryAmountDto,
  ) {
    const entry = await this.prisma.expenseEntry.findFirst({
      where: { id: entryId, companyId },
      include: { claim: { select: { id: true, status: true } } },
    });

    if (!entry) {
      throw new NotFoundException('Expense entry not found');
    }

    if (!entry.claim) {
      throw new ConflictException(
        'This entry does not belong to a claim yet, so there is nothing to revise',
      );
    }

    assertClaimRevisable(entry.claim.status as ClaimStatus);

    const previousAmount = Number(entry.approvedAmount ?? entry.amount);

    if (dto.approvedAmount > Number(entry.amount)) {
      throw new BadRequestException(
        'The approved amount cannot exceed the submitted amount',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.expenseEntry.update({
        where: { id: entryId },
        data: { approvedAmount: dto.approvedAmount },
      });

      await tx.expenseRevision.create({
        data: {
          entryId,
          previousAmount,
          newAmount: dto.approvedAmount,
          remark: dto.remark,
          revisedById: userId,
        },
      });

      const entries = await tx.expenseEntry.findMany({
        where: { claimId: entry.claim!.id },
        select: { amount: true, approvedAmount: true },
      });

      const approvedTotal = entries.reduce(
        (total, row) => total + Number(row.approvedAmount ?? row.amount),
        0,
      );

      await tx.expenseClaim.update({
        where: { id: entry.claim!.id },
        data: { approvedAmount: approvedTotal },
      });

      return tx.expenseEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: entryInclude,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async computeAmount(
    category: CategoryBehaviour,
    dto: CreateExpenseEntryDto,
    expenseDate: Date,
    lenient = false,
  ) {
    let mealDays: number | undefined;

    if (category.isMealAllowance) {
      if (!dto.mealStartDate || !dto.mealEndDate) {
        // A draft may still be missing its travel dates; it is kept as a
        // single-day amount until the employee fills them in and verifies.
        if (!lenient) {
          throw new BadRequestException(
            'Meal allowance requires the travel start date and end date',
          );
        }
      } else {
        mealDays = countInclusiveDays(
          new Date(dto.mealStartDate),
          new Date(dto.mealEndDate),
        );
      }
    }

    const rate =
      category.isFixedRate || category.isMealAllowance
        ? await this.master.findEffectiveRate(dto.categoryId, expenseDate)
        : null;

    return calculateEntryAmount(category, {
      quantity: dto.quantity,
      unitPrice: dto.unitPrice,
      effectiveRate: rate ? Number(rate.amount) : null,
      mealDays,
    });
  }

  private assertCategoryFields(
    category: CategoryBehaviour,
    dto: CreateExpenseEntryDto,
  ): void {
    if (category.requiresMarketingCode && !dto.marketingCodeId) {
      throw new BadRequestException(
        `Category "${category.name}" requires a marketing code`,
      );
    }

    if (
      category.requiresDestination &&
      !dto.destination &&
      !dto.mealDestination
    ) {
      throw new BadRequestException(
        `Category "${category.name}" requires a destination`,
      );
    }

    if (category.isEntertainment) {
      if (!dto.entertainmentMerchantName || !dto.entertainmentRelationName) {
        throw new BadRequestException(
          'Entertainment requires the merchant name and the business relation name for tax reporting',
        );
      }
    }

    if (category.isMealAllowance && !dto.mealDestination) {
      throw new BadRequestException(
        'Meal allowance requires the travel destination',
      );
    }
  }

  private assertProofProvided(
    category: CategoryBehaviour,
    amount: number,
    files: Express.Multer.File[],
    hasScanProof = false,
  ): void {
    if (files.length > 0 || hasScanProof) {
      return;
    }

    if (category.requiresProof) {
      throw new BadRequestException(
        `Category "${category.name}" requires a proof attachment; the transaction cannot be saved without proof`,
      );
    }

    if (amount > PAYMENT_PROOF_THRESHOLD) {
      throw new BadRequestException(
        `Expenses above IDR ${PAYMENT_PROOF_THRESHOLD.toLocaleString('id-ID')} must include a payment proof`,
      );
    }
  }

  /**
   * Rejects an entry that is identical to one that already exists.
   *
   * Genuine duplicate expenses can still be recorded by setting
   * `allowDuplicate`, so this check prevents mistyped input without blocking
   * real cases.
   */
  private async assertNotDuplicate(
    companyId: string,
    employeeId: string,
    categoryId: string,
    expenseDate: Date,
    amount: number,
  ): Promise<void> {
    const existing = await this.prisma.expenseEntry.findFirst({
      where: { companyId, employeeId, categoryId, expenseDate, amount },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'An entry with the same category, date, and amount already exists. Mark it as a duplicate expense if it really is a separate one.',
      );
    }
  }

  /**
   * An extraction job that may be consumed: owned by the current user,
   * finished, and not already attached to another entry.
   */
  private async loadUsableOcrJob(
    companyId: string,
    userId: string,
    ocrJobId: string,
  ) {
    const ocrJob = await this.prisma.expenseOcrJob.findFirst({
      where: { id: ocrJobId, companyId, uploadedByUserId: userId },
    });

    if (!ocrJob) {
      throw new NotFoundException('Extraction job not found');
    }

    if (ocrJob.expenseEntryId) {
      throw new ConflictException(
        'This extraction is already linked to another expense entry',
      );
    }

    if (ocrJob.status !== 'COMPLETED') {
      throw new ConflictException(
        `The extraction is ${ocrJob.status}. Wait until it finishes, or fill in the form manually.`,
      );
    }

    return ocrJob;
  }

  private async assertMarketingCode(companyId: string, id: string) {
    const code = await this.prisma.marketingCode.findFirst({
      where: { id, companyId, isActive: true },
      select: { id: true },
    });

    if (!code) {
      throw new NotFoundException('Marketing code not found');
    }
  }

  private async assertOwnedAndEditable(
    companyId: string,
    userId: string,
    entryId: string,
  ) {
    const employee = await this.employees.findByUser(companyId, userId);

    const entry = await this.prisma.expenseEntry.findFirst({
      where: { id: entryId, companyId },
      include: { claim: { select: { status: true } } },
    });

    if (!entry) {
      throw new NotFoundException('Expense entry not found');
    }

    if (entry.employeeId !== employee.id) {
      throw new ConflictException('This entry does not belong to you');
    }

    assertEntryEditableByClaimant(
      (entry.claim?.status as ClaimStatus | undefined) ?? null,
    );

    return entry;
  }

  private async loadCategory(
    companyId: string,
    categoryId: string,
  ): Promise<CategoryBehaviour & { id: string }> {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id: categoryId, companyId, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Expense category not found');
    }

    if (!category.availableForExpense) {
      throw new BadRequestException(
        `Category "${category.name}" is not available for expense claims`,
      );
    }

    return {
      id: category.id,
      name: category.name,
      isMealAllowance: category.isMealAllowance,
      isFixedRate: category.isFixedRate,
      isEntertainment: category.isEntertainment,
      requiresProof: category.requiresProof,
      requiresDestination: category.requiresDestination,
      requiresMarketingCode: category.requiresMarketingCode,
      perTransactionApprovalThreshold:
        category.perTransactionApprovalThreshold === null
          ? null
          : Number(category.perTransactionApprovalThreshold),
    };
  }

  private async storeAttachments(
    employeeId: string,
    files: Express.Multer.File[],
  ) {
    const stored: {
      originalName: string;
      storageKey: string;
      mimeType: string;
      size: number;
    }[] = [];

    for (const file of files) {
      const result = await this.storage.saveFile(`expense/${employeeId}`, file);

      stored.push({
        originalName: file.originalname,
        storageKey: result.storageKey,
        mimeType: file.mimetype,
        size: file.size,
      });
    }

    return stored;
  }
}
