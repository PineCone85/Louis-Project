"use client";

import Link from "next/link";
import { useActionState } from "react";
import { savePropertyAction } from "@/lib/actions/properties";
import { LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/constants";
import type { Property } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/validation";
import { SubmitButton } from "@/components/ui/form-controls";
import { Field, cx } from "@/components/ui/primitives";

export function PropertyForm({ id, initial, cancelHref, currency }: { id?: string; initial?: Partial<Property>; cancelHref: string; currency: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(savePropertyAction, { ok: true });
  const errors = (!state.ok && state.fieldErrors) || {};
  const input = (name: string) => cx("input", errors[name] && "input-error");

  return (
    <form action={action} className="space-y-6">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {!state.ok && state.error ? <p className="form-error">{state.error}</p> : null}

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Listing</h2>
        </div>
        <div className="panel-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Title" htmlFor="title" error={errors.title} className="md:col-span-2" hint="For example: 3 bedroom family home in Constantia">
            <input id="title" name="title" defaultValue={initial?.title ?? ""} required className={input("title")} autoFocus={!id} />
          </Field>
          <Field label="Reference" htmlFor="reference" hint="Your listing or mandate number">
            <input id="reference" name="reference" defaultValue={initial?.reference ?? ""} className="input" />
          </Field>
          <Field label={`Price (${currency})`} htmlFor="price" error={errors.price}>
            <input id="price" name="price" inputMode="numeric" defaultValue={initial?.price ?? ""} className={input("price")} />
          </Field>
          <Field label="Listing type" htmlFor="listingType">
            <select id="listingType" name="listingType" defaultValue={initial?.listingType ?? "sale"} className="select">
              {LISTING_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={initial?.status ?? "available"} className="select">
              {PROPERTY_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Property type" htmlFor="propertyType">
            <select id="propertyType" name="propertyType" defaultValue={initial?.propertyType ?? "house"} className="select">
              {PROPERTY_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Listing URL" htmlFor="listingUrl" error={errors.listingUrl} hint="Link to the listing on your website or a portal">
            <input id="listingUrl" name="listingUrl" type="url" defaultValue={initial?.listingUrl ?? ""} className={input("listingUrl")} placeholder="https://" />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Location</h2>
        </div>
        <div className="panel-body grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Street address" htmlFor="address" className="md:col-span-2">
            <input id="address" name="address" defaultValue={initial?.address ?? ""} className="input" />
          </Field>
          <Field label="Suburb" htmlFor="suburb">
            <input id="suburb" name="suburb" defaultValue={initial?.suburb ?? ""} className="input" />
          </Field>
          <Field label="City" htmlFor="city">
            <input id="city" name="city" defaultValue={initial?.city ?? ""} className="input" />
          </Field>
          <Field label="Province" htmlFor="province">
            <input id="province" name="province" defaultValue={initial?.province ?? ""} className="input" />
          </Field>
          <Field label="Postal code" htmlFor="postalCode">
            <input id="postalCode" name="postalCode" defaultValue={initial?.postalCode ?? ""} className="input" />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Specifications</h2>
        </div>
        <div className="panel-body grid grid-cols-2 gap-4 md:grid-cols-5">
          <Field label="Bedrooms" htmlFor="bedrooms" error={errors.bedrooms}>
            <input id="bedrooms" name="bedrooms" inputMode="numeric" defaultValue={initial?.bedrooms ?? ""} className={input("bedrooms")} />
          </Field>
          <Field label="Bathrooms" htmlFor="bathrooms" error={errors.bathrooms}>
            <input id="bathrooms" name="bathrooms" inputMode="decimal" defaultValue={initial?.bathrooms ?? ""} className={input("bathrooms")} />
          </Field>
          <Field label="Parking" htmlFor="parking" error={errors.parking}>
            <input id="parking" name="parking" inputMode="numeric" defaultValue={initial?.parking ?? ""} className={input("parking")} />
          </Field>
          <Field label="Floor size (m²)" htmlFor="floorSize" error={errors.floorSize}>
            <input id="floorSize" name="floorSize" inputMode="numeric" defaultValue={initial?.floorSize ?? ""} className={input("floorSize")} />
          </Field>
          <Field label="Erf size (m²)" htmlFor="erfSize" error={errors.erfSize}>
            <input id="erfSize" name="erfSize" inputMode="numeric" defaultValue={initial?.erfSize ?? ""} className={input("erfSize")} />
          </Field>
          <Field label="Features" htmlFor="features" className="col-span-2 md:col-span-5" hint="One per line or comma separated: pool, fibre, borehole, security estate">
            <textarea id="features" name="features" defaultValue={initial?.features ?? ""} className="textarea" rows={2} />
          </Field>
          <Field label="Description" htmlFor="description" className="col-span-2 md:col-span-5">
            <textarea id="description" name="description" defaultValue={initial?.description ?? ""} className="textarea" rows={5} />
          </Field>
          <Field label="Private notes" htmlFor="notes" className="col-span-2 md:col-span-5" hint="Seller motivations, access arrangements, anything not for clients.">
            <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} className="textarea" rows={3} />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton>{id ? "Save changes" : "Add property"}</SubmitButton>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
