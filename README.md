## Tech Stack

### Frontend

- **Next.js 16** with App Router
- **React 19** with Server Components
- **TypeScript** (strict mode)
- **TailwindCSS 4** with custom design tokens
- **Shadcn/ui** components
- **Recharts** for data visualization
- **Lucide React** for icons

### Backend

- **Drizzle ORM** for type-safe database queries
- **PostgreSQL** (Neon serverless)
- **Server Actions** for API operations
- **Zod** for validation

### Development

- **ESLint** + **Prettier** for code quality
- **pnpm** for package management
- **Next.js Turbopack** for fast development

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database (Neon recommended)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd academy
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:
   Create a `.env` file in the root directory:

```env
DATABASE_URL="your_postgresql_connection_string"
```

4. Run database migrations:

```bash
pnpm drizzle-kit push
```

5. Start the development server:

```bash
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## License

MIT
