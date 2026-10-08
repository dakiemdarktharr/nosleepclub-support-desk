import { z } from "zod";
import {
  allFields,
  catalog,
  commonFields,
  fieldOptions,
  validIntent,
} from "./catalog";
import { requestKinds, serviceGroups } from "./contracts";
import { isEmployeeIdentityField, normalizeEmployeeId } from "./employee-identity";

export const supportInputSchema = z
  .object({
    requesterMode: z.literal("guest").optional(),
    mode: z.enum(["freeform", "structured"]).default("freeform"),
    serviceGroup: z.enum(serviceGroups).default("OTHER"),
    requestKind: z.enum(requestKinds).optional(),
    rawText: z.string().trim().max(6000).default(""),
    fields: z
      .record(z.string().trim().max(300))
      .default({})
      .transform((fields): Record<string, string> => {
        const normalized = { ...fields };
        if (normalized.employeeId)
          normalized.employeeId = normalizeEmployeeId(normalized.employeeId);
        return normalized;
      }),
    confirmed: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
    previewId: z.string().uuid().optional(),
    verifyRunId: z.string().uuid().optional(),
    verifyCaseId: z.string().min(1).max(150).optional(),
  })
  .strict()
  .transform((input) => ({
    ...input,
    // Guest access never borrows an employee identity supplied by the browser.
    fields: input.requesterMode === "guest"
      ? Object.fromEntries(Object.entries(input.fields).filter(([key]) => !isEmployeeIdentityField(key)))
      : input.fields,
  }))
  .superRefine((input, ctx) => {
    if (input.requesterMode === "guest" && (input.verifyRunId || input.verifyCaseId))
      ctx.addIssue({ code: "custom", path: ["requesterMode"], message: "Luồng khách không phải lượt Verify." });
    if (Boolean(input.verifyRunId) !== Boolean(input.verifyCaseId))
      ctx.addIssue({
        code: "custom",
        path: ["verifyRunId"],
        message: "Cần đủ mã lần chạy và mã case.",
      });
    if (
      !input.rawText &&
      !Object.entries(input.fields).some(
        ([field, value]) => !isEmployeeIdentityField(field) && Boolean(value),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["rawText"],
        message: "Nhập mô tả hoặc chọn nhu cầu cụ thể.",
      });
    for (const [key, value] of Object.entries(input.fields)) {
      if (!allFields.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["fields", key],
          message: "Field không được hỗ trợ.",
        });
      if (value && fieldOptions[key] && !fieldOptions[key].includes(value))
        ctx.addIssue({
          code: "custom",
          path: ["fields", key],
          message: "Giá trị không hợp lệ.",
        });
      if (
        input.mode === "structured" &&
        key !== "intentLabel" &&
        !commonFields.includes(key) &&
        !catalog[input.serviceGroup].fields.includes(key)
      )
        ctx.addIssue({
          code: "custom",
          path: ["fields", key],
          message: "Field không thuộc service group đã chọn.",
        });
    }
    if (
      input.fields.intentLabel &&
      !validIntent(input.serviceGroup, input.fields.intentLabel)
    )
      ctx.addIssue({
        code: "custom",
        path: ["fields", "intentLabel"],
        message: "Nhu cầu không thuộc nhóm đã chọn.",
      });
  });
