# Woo-Let 💰

Woo-Let is a sophisticated personal finance and investment tracking application built with a modern full-stack TypeScript architecture. It helps users manage their bank accounts, track daily transactions, monitor debts and mortgages, and manage long-term investment portfolios with multi-currency support.

## 🚀 Features

-   **Dashboard**: Overview of your financial health with interactive charts and summaries.
-   **Transaction Management**: Track income and expenses with customizable categories.
-   **Investing Module**: 
    -   Portfolio tracking with stock search.
    -   Historical price charting and performance analytics.
    -   Benchmark comparisons (e.g., S&P 500).
    -   Multi-currency support for global assets.
-   **Debt & Credits**: Manage what you owe and what others owe you.
-   **Subscriptions**: Monitor recurring payments to avoid "subscription creep".
-   **Banks & Accounts**: Organize multiple bank accounts and deposits.
-   **Data Sync**: Export and import your entire financial history for backup and portability.
-   **Multi-Currency**: Automatic FX conversion for a unified view of your net worth.

## 🛠️ Tech Stack

### Frontend (`apps/web`)
-   **Framework**: [React](https://reactjs.org/) with [Vite](https://vitejs.dev/)
-   **Routing**: [TanStack Router](https://tanstack.com/router/latest)
-   **Data Fetching**: [TanStack Query](https://tanstack.com/query/latest) & [tRPC](https://trpc.io/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
-   **Charts**: [Recharts](https://recharts.org/)
-   **Authentication**: [Clerk](https://clerk.com/)

### Backend (`apps/api`)
-   **Runtime**: [Bun](https://bun.sh/)
-   **Server**: [Hono](https://hono.dev/)
-   **API**: [tRPC](https://trpc.io/)
-   **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)
-   **Caching**: [Redis](https://redis.io/)
-   **Authentication**: [Clerk Backend SDK](https://clerk.com/docs/reference/backend-api)

### Shared (`packages/shared`)
-   Zod schemas and TypeScript types shared between frontend and backend.

## 📁 Project Structure

```text
├── apps/
│   ├── api/          # Bun + Hono + tRPC backend
│   └── web/          # React + Vite + Tailwind frontend
├── packages/
│   └── shared/       # Shared Zod schemas and types
├── docs/             # Technical design documents
└── docker-compose.yml # Infrastructure (Postgres, Redis)
```

## 🏁 Getting Started

### Prerequisites
-   [Bun](https://bun.sh/) installed.
-   Docker (for running the database and Redis).

### Setup
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/woollet.git
    cd woollet
    ```

2.  **Install dependencies**:
    ```bash
    bun install
    ```

3.  **Spin up infrastructure**:
    ```bash
    docker-compose up -d
    ```

4.  **Configure environment variables**:
    Create `.env` files in `apps/api` and `apps/web` (refer to `.env.example` if available).

5.  **Run migrations**:
    ```bash
    bun run db:generate
    bun run db:migrate
    ```

6.  **Start development servers**:
    ```bash
    bun run dev
    ```

## 🤝 Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and coding standards.

## 📄 License

This project is licensed under the MIT License.
