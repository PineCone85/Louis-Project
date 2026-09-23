import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span className="font-serif text-[34px] leading-none tracking-tight text-ink">{APP_NAME}</span>
          <p className="mt-2 text-[13px] text-ink-muted">Sign in to your workspace.</p>
        </div>
        <div className="panel p-6">
          <LoginForm next={next ?? ""} />
        </div>
      </div>
    </div>
  );
}
