import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { METHOD_LABELS, dateFmt, money } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/ui-bits";

export default function Payments() {
  const [methodFilter, setMethodFilter] = useState("all");
  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: () => apiGet<Payment[]>("/payments"),
  });

  const filtered = (payments ?? []).filter((p) => methodFilter === "all" || p.method === methodFilter);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Every payment recorded against invoices, including partial payments."
      />
      <DataTable
        columns={[
          { key: "number", header: "Payment", render: (p) => <span className="font-mono text-xs">{p.number}</span>, searchValue: (p) => p.number },
          { key: "customer_name", header: "Customer", searchValue: (p) => p.customer_name ?? "" },
          { key: "invoice_number", header: "Invoice", render: (p) => <span className="font-mono text-xs">{p.invoice_number}</span>, searchValue: (p) => p.invoice_number ?? "" },
          { key: "method", header: "Method", render: (p) => METHOD_LABELS[p.method] ?? p.method },
          { key: "paid_at", header: "Paid on", render: (p) => dateFmt(p.paid_at) },
          { key: "amount_cents", header: "Amount", align: "right", render: (p) => money(p.amount_cents) },
        ]}
        rows={filtered}
        loading={isLoading}
        rowTestId={(p) => `payment-row-${p.id}`}
        searchPlaceholder="Search payments…"
        toolbar={
          <Select value={methodFilter} onValueChange={(v: string) => setMethodFilter(v)}>
            <SelectTrigger size="sm" className="w-40" data-testid="payment-method-filter">
              <SelectValue>{methodFilter === "all" ? "All methods" : METHOD_LABELS[methodFilter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        emptyTitle="No payments yet"
        emptyMessage="Record payments from an invoice to see them here."
      />
    </div>
  );
}
