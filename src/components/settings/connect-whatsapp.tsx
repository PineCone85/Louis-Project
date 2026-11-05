"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, Building2 } from "lucide-react";
import { completeWhatsAppSignupAction } from "@/lib/actions/whatsapp";
import { cx } from "@/components/ui/primitives";

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
type SdkState = "loading" | "ready" | "failed";

const SDK_ID = "facebook-jssdk";
/** How long to wait for the popup's session info once the code has arrived, before letting the server look the ids up. */
const SESSION_INFO_GRACE_MS = 4000;

let sdkPromise: Promise<FacebookSdk> | null = null;

function loadSdk(appId: string, version: string): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    document.getElementById(SDK_ID)?.remove();
    const script = document.createElement("script");
    script.id = SDK_ID;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdkPromise = null;
      script.remove();
      reject(new Error("Facebook could not be loaded. Check your connection and that no ad blocker or privacy extension is blocking connect.facebook.net."));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

function isFacebookOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

/**
 * Starts Meta's Embedded Signup in a popup. The popup posts the ids of the chosen WhatsApp Business
 * Account and number to this window, and FB.login returns a code; both are sent to the server,
 * which exchanges the code for the business token and finishes the connection. If the ids never
 * arrive (an extension swallowed the message, for example) the server reads them from the token.
 *
 * The Facebook SDK is loaded as soon as the page opens so that FB.login runs directly inside the
 * click: browsers block popups opened after an asynchronous wait.
 */
export function ConnectWhatsApp({ appId, configId, apiVersion }: { appId: string; configId: string; apiVersion: string }) {
  const router = useRouter();
  const [sdkState, setSdkState] = useState<SdkState>("loading");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; warning: boolean } | null>(null);
  const [insecure, setInsecure] = useState(false);
  const session = useRef<SessionInfo | null>(null);
  const code = useRef<string | null>(null);
  const mode = useRef<Mode>("cloud");
  const finishing = useRef(false);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFacebook = useCallback(() => {
    setSdkState("loading");
    loadSdk(appId, apiVersion).then(
      () => setSdkState("ready"),
      (e: unknown) => {
        setSdkState("failed");
        setError(e instanceof Error ? e.message : "Facebook could not be loaded.");
      },
    );
  }, [appId, apiVersion]);

  useEffect(() => {
    const { protocol, hostname } = window.location;
    // Facebook Login only runs on HTTPS pages (localhost excepted).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInsecure(protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1");
    loadFacebook();
  }, [loadFacebook]);

  const reset = () => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = null;
    session.current = null;
    code.current = null;
    finishing.current = false;
    setBusy(null);
    setStep(null);
  };

  const finish = useCallback(async () => {
    if (finishing.current || !code.current) return;
    finishing.current = true;
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = null;
    setStep("Finishing the connection with Meta…");
    const result = await completeWhatsAppSignupAction({
      code: code.current,
      phoneNumberId: session.current?.phoneNumberId ?? null,
      wabaId: session.current?.wabaId ?? null,
      coexistence: mode.current === "coexistence",
    }).catch(() => ({ ok: false as const, error: "The CRM could not be reached. Check your connection and try again." }));
    session.current = null;
    code.current = null;
    finishing.current = false;
    setBusy(null);
    setStep(null);
    if (!result.ok) {
      setError(result.error ?? "Unable to connect the WhatsApp number.");
      return;
    }
    const data = "data" in result ? result.data : undefined;
    setNotice(
      data?.warning
        ? { text: data.warning, warning: true }
        : { text: `${data?.number ?? "Your WhatsApp number"} is connected. New messages to it will appear in the inbox.`, warning: false },
    );
    router.refresh();
  }, [router]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      let data: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string; current_step?: string; error_message?: string } };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "CANCEL") {
        if (graceTimer.current) clearTimeout(graceTimer.current);
        graceTimer.current = null;
        session.current = null;
        code.current = null;
        setBusy(null);
        setStep(null);
        setError(data.data?.current_step ? `Signup was closed at the "${data.data.current_step}" step. Nothing was connected.` : "Signup was cancelled. Nothing was connected.");
        return;
      }
      if (data.event === "ERROR") {
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

  useEffect(() => () => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
  }, []);

  const start = (selected: Mode) => {
    setError(null);
    setNotice(null);
    const sdk = window.FB;
    if (!sdk) {
      setError("Facebook is still loading. Try again in a moment.");
      loadFacebook();
      return;
    }
    reset();
    mode.current = selected;
    setBusy(selected);
    setStep("Complete the steps in the Facebook window…");
    sdk.login(
      (response) => {
        const value = response.authResponse?.code;
        if (!value) {
          if (graceTimer.current) clearTimeout(graceTimer.current);
          graceTimer.current = null;
          session.current = null;
          setBusy(null);
          setStep(null);
          setError((current) => current ?? "The Facebook window was closed before signup finished. Nothing was connected.");
          return;
        }
        code.current = value;
        if (session.current) {
          void finish();
          return;
        }
        // The popup's FINISH message usually arrives first; give it a moment, then let the server look the ids up.
        setStep("Finishing the connection with Meta…");
        graceTimer.current = setTimeout(() => void finish(), SESSION_INFO_GRACE_MS);
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

  const disabled = busy !== null || sdkState !== "ready";

  const options: Array<{ mode: Mode; title: string; body: string; icon: typeof Smartphone; cta: string; recommended?: boolean }> = [
    {
      mode: "coexistence",
      title: "Keep using the WhatsApp Business app",
      body: "Connect the number already in the WhatsApp Business app on your phone. Chats keep working in the app, and messages you send from the phone also appear in the CRM. (Regular WhatsApp numbers must switch to the free WhatsApp Business app first.)",
      icon: Smartphone,
      cta: "Connect my WhatsApp Business app",
      recommended: true,
    },
    {
      mode: "cloud",
      title: "Use a dedicated business number",
      body: "Move a number fully onto the WhatsApp Business Platform, or create a new one. The CRM sends and receives for it; it can no longer be used in a WhatsApp app on a phone.",
      icon: Building2,
      cta: "Connect a business number",
    },
  ];

  return (
    <div className="space-y-4">
      {insecure ? (
        <p className="form-warning">Facebook only allows WhatsApp signup from a secure (https://) address. Open the CRM through its https address to connect a number.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon;
          const active = busy === option.mode;
          return (
            <div
              key={option.mode}
              className={cx(
                "flex flex-col rounded-md border p-4 transition-colors",
                option.recommended ? "border-whatsapp/40 bg-whatsapp-soft/40" : "border-line bg-paper",
                active && "ring-2 ring-whatsapp/30",
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-sm", option.recommended ? "bg-whatsapp text-paper" : "bg-canvas text-ink-muted")}>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                    {option.title}
                    {option.recommended ? <span className="badge badge-whatsapp">Most agents</span> : null}
                  </h3>
                  <p className="mt-1 text-[13px] text-ink-muted">{option.body}</p>
                </div>
              </div>
              <button
                type="button"
                className={cx("btn mt-4 w-full", option.recommended ? "btn-whatsapp" : "btn-secondary")}
                disabled={disabled}
                onClick={() => start(option.mode)}
              >
                {active ? <Loader2 size={14} className="animate-spin" /> : null}
                {active ? "Connecting…" : sdkState === "loading" ? "Loading Facebook…" : option.cta}
              </button>
            </div>
          );
        })}
      </div>

      {step ? (
        <p className="flex items-center gap-2 text-[13px] text-ink-muted" role="status">
          <Loader2 size={14} className="animate-spin" /> {step}
        </p>
      ) : null}
      {error ? (
        <div className="form-error flex flex-wrap items-center justify-between gap-2" role="alert">
          <span>{error}</span>
          {sdkState === "failed" ? (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setError(null); loadFacebook(); }}>
              Retry loading Facebook
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p className={cx(notice.warning ? "form-warning" : "form-success", "flex items-start gap-2")} role="status">
          {notice.warning ? null : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
        </p>
      ) : null}

      <p className="text-[12px] text-ink-faint">
        A Facebook window opens where you sign in, choose your business and confirm the number with a code sent by SMS or call. Allow popups for this site if nothing opens.
      </p>
    </div>
  );
}
