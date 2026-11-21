import type { Sql } from "./driver.ts";

// Every table the admin uses. Each statement is safe to run again: tables and columns are only
// ever added, never dropped or rewritten, so the app can apply this on first use against any
// database (production, a Neon dev branch, local Postgres) without a separate migration step.

/* ── Visibility Session desk ─────────────────────────────────────────── */

const DESK = [
  `create table if not exists vs_applications (
    id text primary key,
    submitted timestamptz not null default now(),
    name text not null default '',
    role text not null default '',
    company text not null default '',
    site text not null default '',
    email text not null default '',
    whatsapp text not null default '',
    moment text not null default '',
    timing text not null default '',
    budget text not null default '',
    decider text not null default '',
    worth text not null default '',
    route text not null default 'fit',
    source text not null default '',
    lookup_score integer,
    consent boolean not null default false,
    status text not null default 'New',
    owner text not null default '',
    session_date date,
    session_time text not null default '',
    first_reply timestamptz,
    review_link text not null default '',
    outcome text not null default '',
    deal_value bigint,
    follow_up date,
    notes text not null default '',
    updated timestamptz not null default now()
  )`,
  `create index if not exists vs_applications_status on vs_applications (status)`,
  `create index if not exists vs_applications_session on vs_applications (session_date)`,
  `create table if not exists vs_checklist_leads (
    id bigserial primary key,
    at timestamptz not null default now(),
    name text not null default '',
    email text not null default '',
    moment text not null default '',
    source text not null default '',
    email1_sent boolean not null default false,
    email2_sent boolean not null default false,
    applied boolean not null default false,
    notes text not null default ''
  )`,
  `create table if not exists vs_sent_mail (
    id bigserial primary key,
    at timestamptz not null default now(),
    kind text not null default '',
    to_email text not null default '',
    subject text not null default '',
    status text not null default '',
    detail text not null default '',
    lead_id bigint references vs_checklist_leads(id) on delete set null
  )`,
  `create index if not exists vs_sent_mail_at on vs_sent_mail (at desc)`,
  `create table if not exists vs_settings (
    key text primary key,
    value text not null default '',
    updated timestamptz not null default now(),
    updated_by text not null default ''
  )`,
  `create table if not exists desk_users (
    id bigserial primary key,
    email text not null unique,
    name text not null,
    role text not null default 'team',
    password_hash text not null,
    created timestamptz not null default now()
  )`,
  `create table if not exists desk_sessions (
    token_hash text primary key,
    user_id bigint not null references desk_users(id) on delete cascade,
    expires timestamptz not null
  )`,
  `create table if not exists desk_audit (
    id bigserial primary key,
    at timestamptz not null default now(),
    actor text not null default '',
    actor_email text not null default '',
    action text not null,
    target text not null default '',
    summary text not null default '',
    changes jsonb
  )`,
  `create index if not exists desk_audit_at on desk_audit (at desc)`,
];

/* ── People: desk accounts become HQ people ──────────────────────────── */

// desk_users stays the one list of people who can sign in. HQ's people and roles documents
// become columns on it. `role` (admin or team) is the old desk access level, kept in step with
// `roles` so an older deploy still reads something sensible.
const PEOPLE = [
  `alter table desk_users add column if not exists roles text[] not null default '{}'`,
  `alter table desk_users add column if not exists active boolean not null default true`,
  `alter table desk_users add column if not exists hq_uid text`,
  `create unique index if not exists desk_users_hq_uid on desk_users (hq_uid) where hq_uid is not null`,
  `alter table desk_users add column if not exists title text not null default ''`,
  `alter table desk_users add column if not exists hours integer`,
  `alter table desk_users add column if not exists whatsapp text not null default ''`,
  `alter table desk_users add column if not exists notify_email text not null default ''`,
  `alter table desk_users add column if not exists notify_mode text not null default 'instant'`,
  `alter table desk_users add column if not exists pattern jsonb`,
  `alter table desk_users add column if not exists joined_at timestamptz`,
  `alter table desk_users add column if not exists extra jsonb not null default '{}'`,
  // existing desk admins become Owner; everyone else starts as Contributor until the owner picks
  `update desk_users set roles = case when role = 'admin' then array['Owner'] else array['Contributor'] end where roles = '{}'`,
  // so the HQ import can add the feed's one activity line without doubling it on a second run
  `alter table desk_audit add column if not exists source_ref text`,
  `create unique index if not exists desk_audit_source_ref on desk_audit (source_ref) where source_ref is not null`,
];

/* ── HQ ──────────────────────────────────────────────────────────────── */

// Ids are the HQ document ids (text), so the import from the claude.ai version can run again
// without duplicating anything. People are desk_users ids. Fields HQ stored that have no column
// yet land in `extra`, so nothing from the old app is lost before its area is rebuilt.
const by = (col: string) => `${col} bigint references desk_users(id) on delete set null`;
const stamps = `created_at timestamptz not null default now(), ${by("created_by")}, updated_at timestamptz not null default now()`;
const extra = `extra jsonb not null default '{}'`;

const HQ = [
  `create table if not exists hq_settings (
    key text primary key,
    value jsonb not null default '{}',
    updated_at timestamptz not null default now(),
    ${by("updated_by")}
  )`,

  `create table if not exists hq_tasks (
    id text primary key,
    title text not null,
    ${by("assignee_id")},
    due date,
    status text not null default 'todo',
    priority text not null default '',
    estimate integer,
    notes text not null default '',
    client_id text,
    tactic_id text,
    checklist jsonb not null default '[]',
    repeat text not null default '',
    done_at timestamptz,
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_tasks_assignee on hq_tasks (assignee_id, status)`,
  `create index if not exists hq_tasks_due on hq_tasks (due)`,

  `create table if not exists hq_standups (
    user_id bigint not null references desk_users(id) on delete cascade,
    day date not null,
    data jsonb not null default '{}',
    primary key (user_id, day)
  )`,

  `create table if not exists hq_clients (
    id text primary key,
    name text not null,
    status text not null default 'active',
    health text not null default '',
    service text not null default '',
    fee numeric(14,2),
    currency text not null default 'NGN',
    billing text not null default '',
    start_date date,
    end_date date,
    contact_name text not null default '',
    contact_role text not null default '',
    ${by("lead_id")},
    next_date date,
    next_deliverable text not null default '',
    links jsonb not null default '{}',
    notes text not null default '',
    ${stamps}, ${extra}
  )`,

  `create table if not exists hq_talents (
    id text primary key,
    name text not null,
    category text not null default '',
    status text not null default '',
    package text not null default '',
    ${by("manager_id")},
    co_manager text not null default '',
    commission numeric(6,2),
    pay_flow text not null default '',
    priorities text not null default '',
    terms text not null default '',
    ${stamps}, ${extra}
  )`,

  `create table if not exists hq_contacts (
    id text primary key,
    name text not null default '',
    company text not null default '',
    kind text not null default 'sales',
    stage text not null default 'new',
    ${by("owner_id")},
    role text not null default '',
    rel_type text not null default '',
    service text not null default '',
    value numeric(14,2),
    currency text not null default 'NGN',
    industry text not null default '',
    location text not null default '',
    website text not null default '',
    instagram text not null default '',
    source text not null default '',
    tags text[] not null default '{}',
    talent_ids text[] not null default '{}',
    next_action text not null default '',
    next_date date,
    notes text not null default '',
    touches jsonb not null default '[]',
    application_id text references vs_applications(id) on delete set null,
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_contacts_stage on hq_contacts (kind, stage)`,
  // Phase 3: contact details as columns (HQ kept them on the contact), and when a sale was won
  `alter table hq_contacts add column if not exists email text not null default ''`,
  `alter table hq_contacts add column if not exists phone text not null default ''`,
  `alter table hq_contacts add column if not exists whatsapp text not null default ''`,
  `alter table hq_contacts add column if not exists won_at timestamptz`,
  `alter table hq_contacts add column if not exists linkedin text not null default ''`,
  `alter table hq_contacts add column if not exists last_touch timestamptz`,
  `alter table hq_contacts add column if not exists client_id text`,
  `alter table hq_contacts add column if not exists batch text not null default ''`,
  // Phase 3: how a client pays, who's point guard, their contact details, and onboarding
  ...[
    "pay_mode text not null default 'invoice'",
    "pay_day integer",
    "point_id bigint references desk_users(id) on delete set null",
    "email text not null default ''",
    "phone text not null default ''",
    "onb jsonb",
  ].map((col) => `alter table hq_clients add column if not exists ${col}`),
  `create table if not exists hq_contracts (
    id text primary key,
    kind text not null default 'client',
    status text not null default 'active',
    client_id text,
    talent_id text,
    party text not null default '',
    title text not null default '',
    start_date date,
    end_date date,
    renewal text not null default 'manual',
    notice_days integer not null default 30,
    value numeric(14,2),
    period text not null default 'month',
    currency text not null default 'NGN',
    ${by("owner_id")},
    link text not null default '',
    notes text not null default '',
    history jsonb not null default '[]',
    ${stamps}, ${extra}
  )`,
  // the activity log doubles as each client's and contact's timeline (HQ's activity feed)
  `alter table desk_audit add column if not exists ref_type text`,
  `alter table desk_audit add column if not exists ref_id text`,
  `alter table desk_audit add column if not exists actor_id bigint`,
  `create index if not exists desk_audit_ref on desk_audit (ref_type, ref_id, at desc)`,
  `create index if not exists hq_contacts_next on hq_contacts (next_date)`,
  `create unique index if not exists hq_contacts_application on hq_contacts (application_id) where application_id is not null`,

  `create table if not exists hq_deals (
    id text primary key,
    title text not null default '',
    brand text not null default '',
    talent_id text references hq_talents(id) on delete set null,
    contact_id text references hq_contacts(id) on delete set null,
    ${by("owner_id")},
    stage text not null default '',
    fee numeric(14,2),
    currency text not null default 'NGN',
    commission_pct numeric(6,2),
    pay_flow text not null default '',
    due_date date,
    deliverables jsonb not null default '[]',
    notes text not null default '',
    ${stamps}, ${extra}
  )`,

  // HQ version 24: talent profiles (goals, socials, audience, rate cards) and the brand tracker.
  // Added as columns so databases created before v24 pick them up too.
  ...[
    "bio text not null default ''",
    "location text not null default ''",
    "email text not null default ''",
    "phone text not null default ''",
    "media_kit text not null default ''",
    "trial_ends date",
    "goals jsonb not null default '[]'",
    "interests text[] not null default '{}'",
    "industries text[] not null default '{}'",
    "avoid text[] not null default '{}'",
    "partners text[] not null default '{}'",
    "socials jsonb not null default '[]'",
    "audience jsonb",
    "rates jsonb not null default '[]'",
    "rate_notes text not null default ''",
    "rate_at timestamptz",
    "start_date date",
    "handles text not null default ''",
  ].map((col) => `alter table hq_talents add column if not exists ${col}`),
  ...[
    "health text not null default ''",
    "contact_person text not null default ''",
    "contact_role text not null default ''",
    "contact_channel text not null default ''",
    "proposed numeric(14,2)",
    "received numeric(14,2)",
    "next_step text not null default ''",
    "next_date date",
    "updates jsonb not null default '[]'",
    "usage text not null default ''",
  ].map((col) => `alter table hq_deals add column if not exists ${col}`),
  `create index if not exists hq_deals_talent on hq_deals (talent_id, stage)`,

  /* Publicity (Marketing): the shared media list, and pitches and placements */
  `create table if not exists hq_media (
    id text primary key,
    name text not null,
    type text not null default '',
    show text not null default '',
    host text not null default '',
    industries text[] not null default '{}',
    city text not null default '',
    region text not null default '',
    reach text not null default '',
    cost text not null default '',
    contact_name text not null default '',
    contact_role text not null default '',
    email text not null default '',
    phone text not null default '',
    link text not null default '',
    status text not null default 'new',
    next_date date,
    ${by("owner_id")},
    how_to_pitch text not null default '',
    notes text not null default '',
    ${stamps}, ${extra}
  )`,
  // for_key: client:<id>, talent:<id>, dss or jane
  `create table if not exists hq_pitches (
    id text primary key,
    for_key text not null default 'dss',
    outlet_id text references hq_media(id) on delete set null,
    angle text not null default '',
    status text not null default 'idea',
    pitched_on date,
    run_date date,
    link text not null default '',
    next_date date,
    ${by("owner_id")},
    updates jsonb not null default '[]',
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_pitches_outlet on hq_pitches (outlet_id)`,

  `create table if not exists hq_kpis (
    id text primary key,
    title text not null,
    ${by("owner_id")},
    direction text not null default 'up',
    period text not null default 'month',
    source text not null default '',
    target numeric(16,2),
    unit text not null default '',
    weight numeric(6,2),
    how text not null default '',
    ${stamps}, ${extra}
  )`,

  // Phase 2: tasks remember the procedure they follow, focus time and how often they were carried over
  `alter table hq_tasks add column if not exists sop_id text`,
  `alter table hq_tasks add column if not exists focus_mins integer`,
  `alter table hq_tasks add column if not exists carried integer not null default 0`,
  `alter table hq_kpis add column if not exists ${by("proposed_by")}`,
  `alter table desk_users add column if not exists kpi_self boolean not null default false`,
  // one logged number per KPI per period (HQ's kpilogs)
  `create table if not exists hq_kpi_logs (
    id text primary key,
    kpi_id text not null references hq_kpis(id) on delete cascade,
    period_key text not null,
    value numeric(16,2) not null,
    ${by("user_id")},
    at timestamptz not null default now(),
    ${extra},
    unique (kpi_id, period_key)
  )`,
  // KPIs staff propose for the owner's approval (HQ's kpiprops)
  `create table if not exists hq_kpi_proposals (
    id text primary key,
    user_id bigint not null references desk_users(id) on delete cascade,
    title text not null,
    unit text not null default 'number',
    target numeric(16,2) not null default 0,
    period text not null default 'month',
    direction text not null default 'up',
    source text not null default 'manual',
    how text not null default '',
    why text not null default '',
    status text not null default 'pending',
    final text not null default '',
    note text not null default '',
    kpi_id text references hq_kpis(id) on delete set null,
    ${by("reviewed_by")},
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    ${extra}
  )`,
  `create index if not exists hq_kpi_proposals_status on hq_kpi_proposals (status)`,

  `create table if not exists hq_sops (
    id text primary key,
    title text not null,
    area text not null default '',
    ${by("owner_id")},
    purpose text not null default '',
    steps jsonb not null default '[]',
    links jsonb not null default '[]',
    ${stamps}, ${extra}
  )`,

  // monthly snapshots: reports/{area}_{month} and fin/main/reports/finance_{month}
  `create table if not exists hq_reports (
    id text primary key,
    area text not null,
    month text not null,
    title text not null default '',
    slides jsonb not null default '[]',
    auto boolean not null default false,
    ${by("by_id")},
    created_at timestamptz not null default now(),
    ${extra}
  )`,
  `create index if not exists hq_reports_area on hq_reports (area, month)`,

  /* finance */
  `create table if not exists hq_fin_expenses (
    id text primary key,
    date date not null,
    amount numeric(14,2) not null,
    currency text not null default 'NGN',
    cat text not null,
    acct text not null default 'business',
    description text not null default '',
    vendor text not null default '',
    method text not null default '',
    client_id text,
    deal text not null default '',
    asset_id text,
    receipt text not null default '',
    recurring boolean not null default false,
    source text not null default '',
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_fin_expenses_date on hq_fin_expenses (date)`,
  `create table if not exists hq_fin_income (
    id text primary key,
    date date not null,
    amount numeric(14,2) not null,
    currency text not null default 'NGN',
    type text not null,
    acct text not null default 'business',
    description text not null default '',
    from_name text not null default '',
    client_id text,
    deal text not null default '',
    source text not null default '',
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_fin_income_date on hq_fin_income (date)`,
  `create table if not exists hq_fin_booked (
    month text primary key,
    locked boolean not null default false,
    source text not null default '',
    lines jsonb not null default '[]',
    seen text[] not null default '{}',
    updated_at timestamptz not null default now(),
    ${extra}
  )`,
  `create table if not exists hq_fin_budgets (
    month text primary key,
    revenue numeric(14,2),
    cats jsonb not null default '{}',
    note text not null default '',
    ${by("by_id")},
    updated_at timestamptz not null default now(),
    ${extra}
  )`,
  `create table if not exists hq_fin_assets (
    id text primary key,
    name text not null,
    cost numeric(14,2) not null,
    date date,
    first_month text not null default '',
    life_months integer,
    exp_ids text[] not null default '{}',
    notes text not null default '',
    ${extra}
  )`,

  // Phase 4: an income entry can say which retainer month it pays, so it isn't counted twice
  `alter table hq_fin_income add column if not exists period text not null default ''`,
  // invoices: draft, sent and void are stored; part paid, paid and overdue are worked out
  `create table if not exists hq_fin_invoices (
    id text primary key,
    no text not null,
    kind text not null default 'client',
    status text not null default 'draft',
    currency text not null default 'NGN',
    issue_date date,
    due_date date,
    items jsonb not null default '[]',
    vat boolean not null default false,
    vat_rate numeric(6,3),
    wht boolean not null default false,
    disc_type text not null default 'pct',
    disc_value numeric(14,2),
    disc_label text not null default '',
    notes text not null default '',
    bill_to jsonb not null default '{}',
    client_id text,
    period text not null default '',
    talent_id text,
    deal_id text,
    commission_pct numeric(6,3),
    talent_line text not null default '',
    pay_bank boolean not null default true,
    pay_paystack boolean not null default false,
    bank_id text not null default '',
    pay_link text not null default '',
    payments jsonb not null default '[]',
    sent_at timestamptz,
    ${stamps}, ${extra}
  )`,
  `create unique index if not exists hq_fin_invoices_no on hq_fin_invoices (no)`,
  `create index if not exists hq_fin_invoices_client on hq_fin_invoices (client_id)`,
  // a talent's share of a brand payment, made when a talent invoice is paid in full
  `create table if not exists hq_fin_payouts (
    id text primary key,
    invoice_id text,
    invoice_no text not null default '',
    talent_id text,
    deal_id text,
    currency text not null default 'NGN',
    gross numeric(14,2) not null default 0,
    commission_pct numeric(6,3),
    commission numeric(14,2) not null default 0,
    net numeric(14,2) not null default 0,
    status text not null default 'due',
    paid_at date,
    ref text not null default '',
    ${stamps}, ${extra}
  )`,
  `create unique index if not exists hq_fin_payouts_invoice on hq_fin_payouts (invoice_id)`,
  // where each talent is paid: finance only
  `create table if not exists hq_fin_talentbank (
    talent_id text primary key,
    bank text not null default '',
    name text not null default '',
    number text not null default '',
    updated_at timestamptz not null default now(),
    ${extra}
  )`,

  /* marketing */
  `create table if not exists hq_mkt_news (
    id text primary key,
    date date,
    title text not null,
    url text not null default '',
    source text not null default '',
    summary text not null default '',
    so_what text not null default '',
    tag text not null default '',
    added_by text not null default '',
    ${extra}
  )`,

  /* Marketing dashboard: accounts, monthly and daily numbers (typed in or from the data feed), posts, website, ads */
  `create table if not exists hq_mkt_accounts (
    id text primary key,
    platform text not null,
    handle text not null default '',
    url text not null default '',
    goal numeric,
    ${by("owner_id")},
    ${stamps}, ${extra}
  )`,
  `create table if not exists hq_mkt_stats (
    account_id text not null,
    month text not null,
    followers numeric, reach numeric, impressions numeric, engagements numeric, posts numeric, profile_visits numeric, link_clicks numeric, leads numeric,
    source text not null default '',
    at timestamptz not null default now(),
    ${by("by_id")},
    ${extra},
    primary key (account_id, month)
  )`,
  `create table if not exists hq_mkt_daily (
    account_id text not null,
    date date not null,
    followers numeric, reach numeric, impressions numeric, engagements numeric, posts numeric, profile_visits numeric, link_clicks numeric, leads numeric,
    source text not null default '',
    at timestamptz not null default now(),
    ${extra},
    primary key (account_id, date)
  )`,
  `create table if not exists hq_mkt_posts (
    id text primary key,
    title text not null default '',
    platform text not null default 'instagram',
    format text not null default '',
    date date,
    time text not null default '',
    status text not null default 'idea',
    pillar text not null default '',
    ${by("owner_id")},
    link text not null default '',
    caption text not null default '',
    reach numeric, engagements numeric, saves numeric, leads numeric, views numeric, likes numeric, comments numeric, shares numeric,
    external_id text,
    source text not null default '',
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_mkt_posts_date on hq_mkt_posts (date)`,
  `create table if not exists hq_mkt_web (
    month text primary key,
    data jsonb not null default '{}',
    source text not null default '',
    synced_at timestamptz not null default now()
  )`,
  `create table if not exists hq_mkt_sync (
    platform text primary key,
    status text not null default '',
    last_success_at timestamptz,
    message text not null default '',
    rows integer,
    at timestamptz not null default now()
  )`,
  `create table if not exists hq_mkt_ads (
    id text primary key,
    name text not null,
    platform text not null default 'instagram',
    objective text not null default '',
    status text not null default 'planned',
    currency text not null default 'NGN',
    start_date date,
    end_date date,
    budget numeric, spend numeric, impressions numeric, clicks numeric, leads numeric, conversions numeric, revenue numeric,
    notes text not null default '',
    client_id text,
    logged_spend numeric,
    ${stamps}, ${extra}
  )`,

  /* messages: channels only for now; private DMs were left out on purpose */
  `create table if not exists hq_chat_channels (
    id text primary key,
    name text not null,
    description text not null default '',
    emoji text not null default '',
    color text not null default '',
    announce boolean not null default false,
    sort integer not null default 0,
    pins text[] not null default '{}',
    last jsonb,
    ${stamps}, ${extra}
  )`,
  `create table if not exists hq_chat_messages (
    channel_id text not null references hq_chat_channels(id) on delete cascade,
    id text not null,
    ${by("by_id")},
    at timestamptz not null default now(),
    text text not null default '',
    files jsonb not null default '[]',
    mentions bigint[] not null default '{}',
    reactions jsonb not null default '{}',
    reply text,
    edited timestamptz,
    ${extra},
    primary key (channel_id, id)
  )`,
  `create index if not exists hq_chat_messages_channel on hq_chat_messages (channel_id, at)`,
  // Messages (Phase 5c): archived channels, deleted messages, "Got it" on announcements, @everyone,
  // when a message last changed (so the page can poll for edits and reactions), and each person's read state
  `alter table hq_chat_channels add column if not exists archived boolean not null default false`,
  `alter table hq_chat_messages add column if not exists everyone boolean not null default false`,
  `alter table hq_chat_messages add column if not exists acks bigint[] not null default '{}'`,
  `alter table hq_chat_messages add column if not exists deleted boolean not null default false`,
  `alter table hq_chat_messages add column if not exists sys boolean not null default false`,
  `alter table hq_chat_messages add column if not exists updated_at timestamptz not null default now()`,
  `create index if not exists hq_chat_messages_changed on hq_chat_messages (channel_id, updated_at)`,
  `create table if not exists hq_chat_reads (
    user_id bigint not null references desk_users(id) on delete cascade,
    channel_id text not null references hq_chat_channels(id) on delete cascade,
    read_at timestamptz,
    muted boolean not null default false,
    primary key (user_id, channel_id)
  )`,
  /* each person's chat look: bubble colour, wallpaper, text size, what Enter does, and a status line */
  `alter table desk_users add column if not exists chat jsonb not null default '{}'`,

  /* leave and availability: requests, relief cover, public holidays (no person) and day changes (type shift) */
  `alter table desk_users add column if not exists pattern_req jsonb`,
  `alter table desk_users add column if not exists leave_days numeric`,
  `create table if not exists hq_leave (
    id text primary key,
    ${by("user_id")},
    type text not null default 'leave',
    start_date date,
    end_date date,
    ${by("relief_id")},
    relief_answer text not null default '',
    relief_note text not null default '',
    relief_at timestamptz,
    done_text text not null default '',
    todo_text text not null default '',
    handover text[] not null default '{}',
    note text not null default '',
    shift_from text not null default '',
    shift_to text not null default '',
    status text not null default 'pending',
    reply text not null default '',
    ${by("reviewed_by")},
    reviewed_at timestamptz,
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_leave_dates on hq_leave (start_date, end_date)`,

  /* attendance: one row per person per day, stamped with server time */
  `create table if not exists hq_time (
    user_id bigint not null references desk_users(id) on delete cascade,
    day date not null,
    segs jsonb not null default '[]',
    breaks jsonb not null default '[]',
    status text not null default 'out',
    late integer not null default 0,
    mode text not null default '',
    expected_min integer,
    worked_min integer,
    eod jsonb,
    closed_at timestamptz,
    created_at timestamptz not null default now(),
    ${extra},
    primary key (user_id, day)
  )`,

  /* outgoing email queue, sent by the notifications job */
  `create table if not exists hq_notify (
    id text primary key,
    ${by("to_id")},
    ${by("from_id")},
    title text not null default '',
    body text not null default '',
    link text not null default '',
    at timestamptz not null default now(),
    sent boolean not null default false,
    sent_at timestamptz,
    skipped boolean not null default false,
    ${extra}
  )`,
  `create index if not exists hq_notify_unsent on hq_notify (sent, at)`,

  /* the 12-week plan: cycles with goals, each person's weekly tactics, and weekly reviews */
  `create table if not exists hq_plan (
    id text primary key,
    name text not null default '',
    start date,
    status text not null default 'draft',
    vision text not null default '',
    target integer not null default 85,
    goals jsonb not null default '[]',
    review jsonb not null default '{}',
    ${stamps}, ${extra}
  )`,
  `create table if not exists hq_tactics (
    id text primary key,
    user_id bigint not null references desk_users(id) on delete cascade,
    cycle_id text,
    goal_id text,
    title text not null,
    weeks integer[] not null default '{}',
    done jsonb not null default '{}',
    ${by("by_id")},
    archived boolean not null default false,
    ${stamps}, ${extra}
  )`,
  `create index if not exists hq_tactics_cycle on hq_tactics (cycle_id, user_id)`,
  `create table if not exists hq_plan_reviews (
    user_id bigint not null references desk_users(id) on delete cascade,
    cycle_id text not null,
    week integer not null,
    score integer,
    wins text not null default '',
    lessons text not null default '',
    change text not null default '',
    at timestamptz not null default now(),
    ${extra},
    primary key (user_id, cycle_id, week)
  )`,
  /* a task made from a tactic ticks that tactic's week when it's done */
  `alter table hq_tasks add column if not exists tactic_week integer`,
];

export const SCHEMA: readonly string[] = [...DESK, ...PEOPLE, ...HQ];

/** A short fingerprint of the schema above, so a cold start can skip it when nothing changed. */
export const SCHEMA_VERSION = (() => {
  let h = 0x811c9dc5;
  for (const ch of SCHEMA.join(";")) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
})();

export async function applySchema(sql: Sql) {
  for (const stmt of SCHEMA) await sql.query(stmt);
  await sql.query(`create table if not exists app_meta (key text primary key, value text not null)`);
  await sql.query(`insert into app_meta (key, value) values ('schema', $1) on conflict (key) do update set value = excluded.value`, [
    SCHEMA_VERSION,
  ]);
}

/** Applies the schema unless this database already has this exact version. One query when it does. */
export async function ensureCurrentSchema(sql: Sql) {
  try {
    const rows = await sql.query(`select value from app_meta where key = 'schema'`);
    if (rows[0]?.value === SCHEMA_VERSION) return false;
  } catch {
    // no app_meta table yet: a new database, or one from before the version check
  }
  await applySchema(sql);
  return true;
}
