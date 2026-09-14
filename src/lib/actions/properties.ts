"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/constants";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { fieldErrorsFrom, formNumber, formOptional, formString, type ActionResult } from "@/lib/validation";

const propertySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  reference: z.string().trim().max(100).nullable(),
  status: z.enum(PROPERTY_STATUSES.map((s) => s.key) as [string, ...string[]]),
  propertyType: z.enum(PROPERTY_TYPES.map((t) => t.key) as [string, ...string[]]),
  listingType: z.enum(LISTING_TYPES.map((t) => t.key) as [string, ...string[]]),
  price: z.number().min(0).nullable(),
  address: z.string().trim().max(300).nullable(),
  suburb: z.string().trim().max(120).nullable(),
  city: z.string().trim().max(120).nullable(),
  province: z.string().trim().max(120).nullable(),
  postalCode: z.string().trim().max(20).nullable(),
  bedrooms: z.number().int().min(0).max(100).nullable(),
  bathrooms: z.number().min(0).max(100).nullable(),
  parking: z.number().int().min(0).max(100).nullable(),
  floorSize: z.number().int().min(0).nullable(),
  erfSize: z.number().int().min(0).nullable(),
  description: z.string().trim().max(20000).nullable(),
  features: z.string().trim().max(5000).nullable(),
  listingUrl: z.union([z.literal(""), z.string().trim().url("Enter a full URL, starting with https://")]).nullable(),
  notes: z.string().trim().max(10000).nullable(),
});

export async function savePropertyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const id = formOptional(formData, "id");
  const parsed = propertySchema.safeParse({
    title: formString(formData, "title"),
    reference: formOptional(formData, "reference"),
    status: formString(formData, "status") || "available",
    propertyType: formString(formData, "propertyType") || "house",
    listingType: formString(formData, "listingType") || "sale",
    price: formNumber(formData, "price"),
    address: formOptional(formData, "address"),
    suburb: formOptional(formData, "suburb"),
    city: formOptional(formData, "city"),
    province: formOptional(formData, "province"),
    postalCode: formOptional(formData, "postalCode"),
    bedrooms: formNumber(formData, "bedrooms"),
    bathrooms: formNumber(formData, "bathrooms"),
    parking: formNumber(formData, "parking"),
    floorSize: formNumber(formData, "floorSize"),
    erfSize: formNumber(formData, "erfSize"),
    description: formOptional(formData, "description"),
    features: formOptional(formData, "features"),
    listingUrl: formOptional(formData, "listingUrl"),
    notes: formOptional(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const values = { ...parsed.data, listingUrl: parsed.data.listingUrl || null, price: parsed.data.price === null ? null : Math.round(parsed.data.price), updatedAt: new Date() };

  if (id) {
    const [updated] = await db.update(properties).set(values).where(eq(properties.id, id)).returning({ id: properties.id });
    if (!updated) return { ok: false, error: "Property not found" };
    revalidatePath("/properties");
    revalidatePath(`/properties/${id}`);
    redirect(`/properties/${id}`);
  }

  const [created] = await db.insert(properties).values(values).returning({ id: properties.id });
  revalidatePath("/properties");
  redirect(`/properties/${created.id}`);
}

export async function deletePropertyAction(id: string): Promise<void> {
  await requireSession();
  await db.delete(properties).where(eq(properties.id, id));
  revalidatePath("/properties");
  revalidatePath("/clients");
  redirect("/properties");
}
