# Imortal Store

A modern e-commerce application.

The project provides both a customer storefront and a protected administration panel for managing products, product media, and administrator accounts.

---

## Features

### Storefront

- Product catalog
- Product detail pages
- Interactive image gallery with thumbnail selection
- Shopping cart (client-side)
- Responsive interface

### Admin Panel

- Secure authentication with Better Auth
- Product management
  - Create, edit, and delete products
  - Integrated image uploads via Vercel Blob Storage
  - Instant upload previews and client-side removal
  - Filename normalization (`slugify` base name formatting)
  - Automated image cleanup on removal or product deletion
- Administrator management
  - Create administrators
  - Remove administrators
- Protected routes
- Server Actions for mutations

---

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- Prisma ORM
- PostgreSQL
- Better Auth
- Vercel Blob Storage
- Docker (database)

---

## Project Structure

```

src/
├── actions/          # Server Actions (products, auth, blob storage)
├── app/
│   ├── (storefront)  # Public storefront
│   ├── admin/        # Administration panel
│   └── api/
├── components/
├── context/
├── lib/
├── services/
└── types/

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

scripts/
└── create-admin.ts

```

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd imortal-store
```

### 2. Install dependencies

```bash
npm install
```

or

```bash
pnpm install
```

or

```bash
bun install
```

---

## Environment Variables

Create a `.env` file in the project root.

```env
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/imortal_store?schema=public"

BETTER_AUTH_SECRET=<your-random-secret>
BETTER_AUTH_URL=http://localhost:3000

BLOB_READ_WRITE_TOKEN=<your-vercel-blob-read-write-token>

```

---

## Database

Start PostgreSQL using Docker.

```bash
docker compose up -d
```

Run migrations.

```bash
npx prisma migrate dev
```

Generate the Prisma client.

```bash
npx prisma generate
```

Seed the database.

```bash
npx tsx prisma/seed.ts
```

---

## Create the First Administrator

There is no public registration page.

Create the initial administrator using:

```bash
npx tsx scripts/create-admin.ts admin@example.com password123 "Administrator"
```

After logging into the admin panel, additional administrator accounts can be created from the UI.

---

## Running the Development Server

```bash
npm run dev
```

Open:

```
http://localhost:3000
```

Admin login:

```
http://localhost:3000/admin/login
```
