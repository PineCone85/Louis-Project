import Link from "next/link";
import { isPast } from "date-fns";
import { Plus, Search } from "lucide-react";
import { listClients } from "@/lib/queries/clients";
import { getSettings } from "@/lib/queries/settings";
import { STAGES } from "@/lib/pipeline";
import { formatCurrency, formatSmartDate, fullName, formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { LinkRow } from "@/components/ui/link-row";
import { Avatar, EmptyState, PageBody, PageHeader, StageChip, cx } from "@/components/ui/primitives";

export const metadata = { title: "Clients" };

type Search = { q?: string; stage?: string; attention?: string; followups?: string; sort?: string; archived?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const settings = await getSettings();
  const sort = (["recent", "name", "stage", "created"].includes(params.sort ?? "") ? params.sort : "recent") as "recent" | "name" | "stage" | "created";
  const clients = await listClients({
    search: params.q,
    stage: params.stage,
    attention: params.attention === "1",
    followUps: params.followups === "1",
    includeArchived: params.archived === "1",
    sort,
  });
  const filtered = params.archived === "1" ? clients.filter((c) => c.archivedAt) : clients;

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${filtered.length} client${filtered.length === 1 ? "" : "s"}${params.q ? ` matching "${params.q}"` : ""}`}
        actions={
          <Link href="/clients/new" className="btn btn-primary">
            <Plus size={14} /> Add client
          </Link>
        }
      />
      <PageBody>
        <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
            <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search name, email, phone or area" className="input pl-8" />
          </div>
          <select name="stage" defaultValue={params.stage ?? ""} className="select w-44">
            <option value="">All stages</option>
            {STAGES.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={sort} className="select w-40">
            <option value="recent">Recent contact</option>
            <option value="name">Name</option>
            <option value="stage">Stage</option>
            <option value="created">Newest</option>
          </select>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-paper px-3 text-[13px]">
            <input type="checkbox" name="attention" value="1" defaultChecked={params.attention === "1"} className="checkbox" />
            Unread only
          </label>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-paper px-3 text-[13px]">
            <input type="checkbox" name="followups" value="1" defaultChecked={params.followups === "1"} className="checkbox" />
            Follow-ups due
          </label>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-paper px-3 text-[13px]">
            <input type="checkbox" name="archived" value="1" defaultChecked={params.archived === "1"} className="checkbox" />
            Archived
          </label>
          <button type="submit" className="btn btn-secondary">
            Apply
          </button>
          {params.q || params.stage || params.attention || params.followups || params.archived ? (
            <Link href="/clients" className="btn btn-ghost">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="panel overflow-x-auto">
          {filtered.length === 0 ? (
            <EmptyState
              title={params.q || params.stage || params.attention || params.followups ? "No clients match these filters" : "No clients yet"}
              description="Add your buyers and sellers to track their pipeline stage, properties and conversations in one place."
              action={
                <Link href="/clients/new" className="btn btn-primary">
                  <Plus size={14} /> Add your first client
                </Link>
              }
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Stage</th>
                  <th>Contact</th>
                  <th>Budget</th>
                  <th className="text-right">Properties</th>
                  <th>Last contact</th>
                  <th>Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const overdue = client.nextFollowUpAt ? isPast(client.nextFollowUpAt) : false;
                  return (
                    <LinkRow key={client.id} href={`/clients/${client.id}`}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={fullName(client)} size="sm" />
                          <div className="min-w-0">
                            <Link href={`/clients/${client.id}`} className="block truncate font-medium text-ink hover:underline">
                              {fullName(client)}
                            </Link>
                            <div className="text-[12px] text-ink-muted capitalize">{client.clientType}{client.archivedAt ? " · archived" : ""}</div>
                          </div>
                          {client.unreadCount > 0 ? <span className="badge-count ml-1">{client.unreadCount}</span> : null}
                        </div>
                      </td>
                      <td>
                        <StageChip stage={client.stage} />
                      </td>
                      <td>
                        <div className="text-[13px] text-ink">{client.email ?? <span className="text-ink-faint">No email</span>}</div>
                        <div className="text-[12px] text-ink-muted">{client.phone ? formatPhone(client.phone) : "No phone"}</div>
                      </td>
                      <td className="whitespace-nowrap text-ink-muted">
                        {client.budgetMin || client.budgetMax
                          ? `${client.budgetMin ? formatCurrency(client.budgetMin, settings.currency) : "Up to"}${client.budgetMax ? ` – ${formatCurrency(client.budgetMax, settings.currency)}` : "+"}`
                          : "—"}
                      </td>
                      <td className="text-right tabular-nums text-ink-muted">{client.propertyCount}</td>
                      <td className="whitespace-nowrap text-ink-muted">{client.lastContactAt ? formatSmartDate(client.lastContactAt, settings.timezone) : "—"}</td>
                      <td className={cx("whitespace-nowrap", overdue ? "font-medium text-danger" : "text-ink-muted")}>
                        {client.nextFollowUpAt ? formatDate(client.nextFollowUpAt, settings.timezone) : "—"}
                      </td>
                    </LinkRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </PageBody>
    </>
  );
}
