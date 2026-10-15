import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/phone";
import { getSettings } from "@/lib/queries/settings";
import { credentialsForContact, credentialsForNumber, listWhatsAppSenders } from "@/lib/whatsapp/accounts";
import { countTemplateParameters, listApprovedTemplates, WhatsAppApiError } from "@/lib/whatsapp/client";

/**
 * Approved templates of the number a message would go out from: the chosen number (?from=), else the
 * number the contact (?phone=) is messaged from, else the first connected number.
 */
export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const raw = request.nextUrl.searchParams.get("phone");
  const phone = raw ? normalizePhone(raw, (await getSettings()).defaultCountry) : null;
  const from = request.nextUrl.searchParams.get("from");
  const credentials = from ? await credentialsForNumber(from) : phone ? await credentialsForContact(phone) : (await listWhatsAppSenders())[0];
  if (!credentials || !credentials.wabaId) {
    return NextResponse.json({ templates: [], error: "No WhatsApp Business Account is connected." });
  }
  try {
    const templates = await listApprovedTemplates(credentials);
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
