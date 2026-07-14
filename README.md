# Imortal Store

A modern e-commerce application

The project provides both a customer storefront and a protected administration panel for managing products and administrator accounts.

---

## Features

### Storefront

* Product catalog
* Product detail pages
* Image gallery
* Shopping cart (client-side)
* Responsive interface.

### Admin Panel

* Secure authentication with Better Auth
* Product management

  * Create products
  * Edit products
  * Delete products
* Administrator management

  * Create administrators
  * Remove administrators
* Protected routes
* Server Actions for mutations

---

## Tech Stack

* Next.js 16 (App Router)
* React 19
* TypeScript
* Tailwind CSS 4
* shadcn/ui
* Prisma ORM
* PostgreSQL
* Better Auth
* Docker (database)

---

## Project Structure

```
src/
├── actions/          # Server Actions
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