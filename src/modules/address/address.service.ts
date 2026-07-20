import { Address } from "@prisma/client";
import prisma from "../../lib/prisma";
import ApiError from "../../utils/ApiError";
import { CreateAddressInput, UpdateAddressInput } from "./address.validation";

/**
 * Every read and write is scoped by userId, never by id alone.
 *
 * Looking an address up by id only would let any logged-in customer read or
 * delete somebody else's by guessing an id. 404 rather than 403 on a miss, so
 * the endpoint cannot be used to probe which ids exist.
 */
const findOwned = async (userId: string, id: string): Promise<Address> => {
  const address = await prisma.address.findFirst({
    where: { id, userId },
  });

  if (!address) {
    throw new ApiError(404, "Address not found");
  }

  return address;
};

export const listAddresses = (userId: string): Promise<Address[]> =>
  prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

export const getAddress = (userId: string, id: string): Promise<Address> =>
  findOwned(userId, id);

export const createAddress = async (
  userId: string,
  input: CreateAddressInput,
): Promise<Address> => {
  const { isDefault, ...fields } = input;

  const existingCount = await prisma.address.count({ where: { userId } });

  // The first address is always the default -- a customer with addresses but
  // none selected would break checkout's pre-fill.
  const shouldBeDefault = isDefault || existingCount === 0;

  return prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      // Required: the partial unique index Address_one_default_per_user rejects
      // a second default row outright, so the old one must be cleared first.
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: { ...fields, userId, isDefault: shouldBeDefault },
    });
  });
};

export const updateAddress = async (
  userId: string,
  id: string,
  input: UpdateAddressInput,
): Promise<Address> => {
  await findOwned(userId, id);

  return prisma.address.update({
    where: { id },
    data: input,
  });
};

export const setDefaultAddress = async (
  userId: string,
  id: string,
): Promise<Address> => {
  await findOwned(userId, id);

  return prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    return tx.address.update({
      where: { id },
      data: { isDefault: true },
    });
  });
};

export const deleteAddress = async (
  userId: string,
  id: string,
): Promise<void> => {
  const address = await findOwned(userId, id);

  // Safe for order history: Order.addressId is onDelete: SetNull and each order
  // carries its own ship* snapshot, so past invoices are unaffected.
  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });

    // Deleting the default would leave the customer with addresses but none
    // selected. Promote the most recent survivor.
    if (address.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (next) {
        await tx.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });
};
