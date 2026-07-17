"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Check, Plus, Search, Trash2 } from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  Card,
  Cell,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Metric,
  Overlay,
  Row,
  SkeletonTable,
  Table,
  Tabs,
} from "@/components/ui";

/**
 * Living style guide.
 *
 * Every primitive in every state, on one page. If a state is missing here, it is missing in the
 * product - which is how the current UI ended up with buttons that have no loading state and
 * tables that jump when data arrives.
 */
export function StyleGuideClient() {
  const [tab, setTab] = useState<"all" | "coco" | "fofo">("all");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <header>
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Operyx design system</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Every primitive, every state. Modules migrate onto this; nothing here uses a literal colour.</p>
    </header>

    <Card title="Colour" description="Semantic tokens. Components never reference the palette directly, which is what makes dark mode a switch rather than a rewrite.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Accent", "var(--accent)", "var(--text-on-accent)"],
          ["Success", "var(--success)", "#fff"],
          ["Warning", "var(--warning)", "#fff"],
          ["Danger", "var(--danger)", "#fff"],
          ["Page", "var(--surface-page)", "var(--text-primary)"],
          ["Card", "var(--surface-card)", "var(--text-primary)"],
          ["Sunken", "var(--surface-sunken)", "var(--text-primary)"],
          ["Border", "var(--border-strong)", "var(--text-primary)"],
        ].map(([name, background, color]) => <div key={name} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3" style={{ background, color }}>
          <p className="text-xs font-semibold">{name}</p>
        </div>)}
      </div>
    </Card>

    <Card title="Buttons" description="One accent-filled button per view. Every variant handles rest, hover, active, focus, disabled, and loading.">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Plus size={15} />}>New sale</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger" icon={<Trash2 size={15} />}>Delete</Button>
        <Button variant="primary" loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1600); }}>Click to load</Button>
        <Button variant="primary" disabled>Disabled</Button>
        <IconButton label="Search" variant="secondary"><Search size={16} /></IconButton>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
    </Card>

    <Card title="Status" description="Colour carries meaning here, never decoration.">
      <div className="flex flex-wrap gap-2">
        <Badge>Draft</Badge>
        <Badge tone="accent">In service</Badge>
        <Badge tone="success" icon={<Check size={11} />}>Paid</Badge>
        <Badge tone="warning">Not checked in</Badge>
        <Badge tone="danger">Overdue</Badge>
        <Badge tone="info">Walk-in</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric label="Revenue" value="₹48,320" hint="Today" />
        <Metric label="Unpaid" value="₹1,400" tone="warning" hint="2 invoices" />
        <Metric label="Refunded" value="₹600" tone="danger" />
        <Metric label="Collected" value="₹46,920" tone="success" />
      </div>
    </Card>

    <Card title="Banners">
      <div className="space-y-2">
        <Banner tone="warning" icon={<AlertTriangle size={15} />} title="No GSTIN for Telangana">Branches there cannot issue GST invoices until one is added.</Banner>
        <Banner tone="danger" icon={<AlertTriangle size={15} />} title="Coupon fully used" onDismiss={() => undefined}>Someone redeemed the last use while this sale was open.</Banner>
        <Banner tone="success" icon={<Check size={15} />}>Invoice GST-KOR-26-00042 recorded.</Banner>
      </div>
    </Card>

    <Card title="Forms">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" hint="As it appears on the invoice"><Input placeholder="Meera Sharma" /></Field>
        <Field label="GSTIN" error="This GSTIN belongs to Maharashtra, not Karnataka."><Input defaultValue="27AABCU9603R1ZX" invalid /></Field>
        <Field label="Disabled"><Input placeholder="Not editable" disabled /></Field>
        <Field label="Tabs"><Tabs tabs={[{ id: "all", label: "All", count: 9 }, { id: "coco", label: "COCO", count: 5 }, { id: "fofo", label: "FOFO", count: 4 }]} value={tab} onChange={setTab} /></Field>
      </div>
    </Card>

    <Card title="Table" padded={false}>
      <Table headers={["Invoice", "Customer", "Status", "Total"]}>
        <Row onClick={() => undefined}>
          <Cell>GST-KOR-26-00042</Cell>
          <Cell muted>Meera Sharma</Cell>
          <Cell><Badge tone="success">Paid</Badge></Cell>
          <Cell align="right">₹2,832</Cell>
        </Row>
        <Row onClick={() => undefined}>
          <Cell>GST-KOR-26-00041</Cell>
          <Cell muted>Divya Nair</Cell>
          <Cell><Badge tone="warning">Partial</Badge></Cell>
          <Cell align="right">₹1,400</Cell>
        </Row>
      </Table>
    </Card>

    <Card title="Loading" description="A skeleton, not a spinner: it tells you a table is coming and how big, so the layout does not jump when data lands.">
      <SkeletonTable rows={3} columns={4} />
    </Card>

    <Card title="Empty state" description="An invitation, not an apology.">
      <EmptyState
        icon={<CalendarDays size={18} />}
        title="No bookings today"
        description="When a customer books online or by phone, they appear here."
        action={<Button variant="primary" icon={<Plus size={15} />}>New appointment</Button>}
      />
    </Card>

    <Card title="Overlays" description="One component. Centred dialog on desktop, bottom sheet on mobile.">
      <div className="flex gap-2">
        <Button onClick={() => setOverlayOpen(true)}>Open dialog</Button>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>Destructive confirm</Button>
      </div>
    </Card>

    {overlayOpen && <Overlay
      title="Move appointment"
      description="Availability is rechecked before saving."
      onClose={() => setOverlayOpen(false)}
      footer={<>
        <Button variant="ghost" onClick={() => setOverlayOpen(false)}>Cancel</Button>
        <Button variant="primary" onClick={() => setOverlayOpen(false)}>Move appointment</Button>
      </>}
    >
      <div className="space-y-3">
        <Field label="Customer"><Input defaultValue="Divya Nair" readOnly /></Field>
        <Field label="New time"><Input defaultValue="12:40" /></Field>
      </div>
    </Overlay>}

    {confirmOpen && <ConfirmDialog
      title="Archive Hair care products?"
      consequence="12 products already use this category. They keep it and stay unchanged - it just cannot be picked for anything new."
      confirmLabel="Archive"
      onConfirm={() => setConfirmOpen(false)}
      onCancel={() => setConfirmOpen(false)}
    />}
  </div>;
}
