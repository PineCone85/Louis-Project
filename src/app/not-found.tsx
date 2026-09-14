import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 h-px w-10 bg-sage-300" />
      <h1 className="font-serif text-[30px] leading-none text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-[13px] text-ink-muted">The record may have been deleted, or the address is incorrect.</p>
      <Link href="/" className="btn btn-secondary mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}
