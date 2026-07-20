import { z } from "zod";

const idParam = z.object({ id: z.string().min(1) });

// Division / district / upazila are free text: there is no reference table for
// Bangladesh administrative areas in the schema yet.
const addressFields = {
  receiverName: z.string().trim().min(2, "Receiver name is too short").max(100),
  phone: z
    .string()
    .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number"),
  label: z.string().trim().max(50).optional(),
  division: z.string().trim().min(1, "Division is required").max(50),
  district: z.string().trim().min(1, "District is required").max(50),
  upazila: z.string().trim().min(1, "Upazila is required").max(50),
  area: z.string().trim().max(100).optional(),
  address: z.string().trim().min(3, "Address is too short").max(255),
  postalCode: z.string().trim().max(10).optional(),
};

export const createAddressSchema = z.object({
  body: z.object({
    ...addressFields,
    isDefault: z.boolean().default(false),
  }),
});

export const updateAddressSchema = z.object({
  params: idParam,
  body: z.object({
    receiverName: addressFields.receiverName.optional(),
    phone: addressFields.phone.optional(),
    label: addressFields.label,
    division: addressFields.division.optional(),
    district: addressFields.district.optional(),
    upazila: addressFields.upazila.optional(),
    area: addressFields.area,
    address: addressFields.address.optional(),
    postalCode: addressFields.postalCode,
    // Not settable here -- use PATCH /addresses/:id/default, which clears the
    // previous default in the same transaction.
  }),
});

export const addressIdSchema = z.object({ params: idParam });

export type CreateAddressInput = z.infer<typeof createAddressSchema>["body"];
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>["body"];
