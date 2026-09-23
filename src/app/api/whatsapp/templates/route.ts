import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { countTemplateParameters, listApprovedTemplates, WhatsAppApiError } from "@/lib/whatsapp/client";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!env.whatsapp.configured || !env.whatsapp.businessAccountId) {
    return NextResponse.json({ templates: [], error: "WhatsApp Business Account is not configured." });
  }
  try {
    const templates = await listApprovedTemplates();
    return NextResponse.json({
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        language: template.language,
        category: template.category,
        components: template.components,
        parameters: countTemplateParameters(template),
      })),
    });
  } catch (error) {
    const message = error instanceof WhatsAppApiError ? error.message : "Unable to load templates";
    return NextResponse.json({ templates: [], error: message }, { status: 502 });
  }
}
