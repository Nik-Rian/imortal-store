# Imortal Store

A modern, high-performance e-commerce storefront built with the Next.js App Router, Tailwind CSS v4, shadcn/ui, and Prisma.

## Tech Stack

- **Frontend:** Next.js 15+ (App Router), React, TypeScript
- **Styling & UI:** Tailwind CSS v4, shadcn/ui (Radix Primitives)
- **Database & ORM:** PostgreSQL, Prisma ORM
- **Local Environment:** Podman & Podman Compose

---

## Getting Started

Follow these steps to set up the development environment on your local machine.

### Prerequisites

Ensure you have the following installed on your system:
- **Node.js** (v22+)
- **podman** & **podman-compose**

### 1. Clone the repository & Install Dependencies

```bash
git clone https://github.com/Nik-Rian/imortal-store.git
cd imortal-store
npm install

```

### 2. Environment Variables

Create a `.env` file in the root directory and add your local database connection string:

```env
DATABASE_URL="postgresql://postgres:supersecret@localhost:5432/imortal_store?schema=public"

```

### 3. Spin Up the Database

Start the localized PostgreSQL container using Podman Compose:

```bash
podman-compose up -d

```

*Note: Select `docker.io/library/postgres:16-alpine` if prompted for a registry.*

### 4. Run Database Migrations

Apply the Prisma schema to your local database:

```bash
npx prisma migrate dev

```

### 5. Start the Development Server

```bash
npm run dev

```

Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) with your browser to see the result.

---

## 📂 Project Structure

```text
├── prisma/             # Database schema and migrations
├── public/             # Static assets (images, icons)
└── src/
    ├── app/            # Next.js App Router (pages and layouts)
    ├── components/     # UI Components (shadcn/ui lives here)
    └── lib/            # Utility functions and shared clients