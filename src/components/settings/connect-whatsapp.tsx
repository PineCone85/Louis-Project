"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { completeWhatsAppSignupAction } from "@/lib/actions/whatsapp";

type FacebookLoginResponse = { authResponse?: { code?: string } | null; status?: string };
type FacebookSdk = {
  init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

type SessionInfo = { phoneNumberId: string | null; wabaId: string | null };
type Mode = "cloud" | "coexistence";

const SDK_ID = "facebook-jssdk";

function loadSdk(appId: string, version: string): Promise<FacebookSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    if (document.getElementById(SDK_ID)) return;
    const script = document.createElement("script");
    script.id = SDK_ID;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("Facebook could not be loaded. Check that no browser extension is blocking it."));
    document.body.appendChild(script);
  });
}

/**
 * Starts Meta's Embedded Signup in a popup. The popup posts the ids of the chosen WhatsApp Business
 * Account and number to this window, and FB.login returns a code; both are sent to the server,
 * which exchanges the code for the business token and finishes the connection.
 */
export function ConnectWhatsApp({ appId, configId, apiVersion }: { appId: string; configId: string; apiVersion: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef<SessionInfo | null>(null);
  const code = useRef<string | null>(null);
  const mode = useRef<Mode>("cloud");
  const finishing = useRef(false);

  const finish = useCallback(async () => {
    if (finishing.current || !code.current || !session.current) return;
    finishing.current = true;
    const { phoneNumberId, wabaId } = session.current;
    if (!phoneNumberId || !wabaId) {
      setError("No phone number was added during signup. Run it again and add or choose a number at the last step.");
      setBusy(null);
      finishing.current = false;
      return;
    }
    const result = await completeWhatsAppSignupAction({ code: code.current, phoneNumberId, wabaId, coexistence: mode.current === "coexistence" });
    finishing.current = false;
    session.current = null;
    code.current = null;
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "Unable to connect the WhatsApp number.");
      return;
    }
    setNotice(result.data?.warning ?? "WhatsApp number connected. New messages to it will appear in the inbox.");
    router.refresh();
  }, [router]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let host: string;
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      let data: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string; current_step?: string; error_message?: string } };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "CANCEL") {
        setBusy(null);
        setError(data.data?.current_step ? `Signup was closed at the "${data.data.current_step}" step.` : "Signup was cancelled.");
        return;
      }
      if (data.event === "ERROR") {
        setBusy(null);
        setError(data.data?.error_message ?? "Meta reported an error during signup.");
        return;
      }
      if (data.event?.startsWith("FINISH")) {
        session.current = { phoneNumberId: data.data?.phone_number_id ?? null, wabaId: data.data?.waba_id ?? null };
        void finish();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finish]);

  const start = async (selected: Mode) => {
    setError(null);
    setNotice(null);
    setBusy(selected);
    mode.current = selected;
    session.current = null;
    code.current = null;
    let sdk: FacebookSdk;
    try {
      sdk = await loadSdk(appId, apiVersion);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "Facebook could not be loaded.");
      return;
    }
    sdk.login(
      (response) => {
        const value = response.authResponse?.code;
        if (!value) {
          setBusy(null);
          if (!session.current) setError("Signup was not completed.");
          return;
        }
        code.current = value;
        void finish();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: selected === "coexistence" ? "whatsapp_business_app_onboarding" : "",
          sessionInfoVersion: "3",
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void start("cloud")}>
          {busy === "cloud" ? "Connecting…" : "Connect a WhatsApp number"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void start("coexistence")}>
          {busy === "coexistence" ? "Connecting…" : "Use my WhatsApp Business app number"}
        </button>
      </div>
      <p className="text-[12px] text-ink-faint">
        <strong className="font-medium text-ink-muted">Connect a WhatsApp number</strong> moves a number onto the WhatsApp Business Platform: the CRM sends and receives for it, and it can no longer be
        used in the WhatsApp app on a phone. <strong className="font-medium text-ink-muted">Use my WhatsApp Business app number</strong> keeps the number working in the WhatsApp Business app on your phone
        as well; messages you send from the phone also appear in the CRM.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}
    </div>
  );
}
