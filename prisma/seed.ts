import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, OrderStatus } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  console.log("Initializing pooled database adapter...");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("Cleaning up existing data...");
  // Clean up dependent tables first to avoid foreign key constraint violations
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.drop.deleteMany();

  const now = new Date();

  console.log("Seeding Drops...");

  // 1. Active Drop
  const activeDrop = await prisma.drop.create({
    data: {
      name: "Drop 01 • Lançamento Imortal 2026",
      slug: "drop-01-2026",
      startsAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // Started 5 days ago
      endsAt: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000), // Ends in 25 days
    },
  });

  // 2. Upcoming Drop
  const upcomingDrop = await prisma.drop.create({
    data: {
      name: "Drop 02 • Edição InterAtléticas",
      slug: "drop-02-interatleticas",
      startsAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // Starts in 15 days
      endsAt: new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000), // Ends in 45 days
    },
  });

  // 3. Past Drop
  const pastDrop = await prisma.drop.create({
    data: {
      name: "Drop 00 • Edição Fundadores 2025",
      slug: "drop-00-fundadores-2025",
      startsAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), // Started 60 days ago
      endsAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // Ended 30 days ago
    },
  });

  console.log("Seeding Products and Variants...");

  const apparelSizes = ["P", "M", "G", "GG", "XGG"];

  // Active Drop Products
  const product1 = await prisma.product.create({
    data: {
      name: "Camisa Imortal Classic Oversized (Preta)",
      slug: "camisa-imortal-classic-oversized-preta",
      description:
        "Modelagem streetwear oversized com caimento estruturado. Produzida em algodão 100% penteado 220g. Estampa em silk-screen de alta densidade no peito e costas com as cores da Atlética.",
      priceCents: 8990, // R$ 89,90
      images: [
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80",
      ],
      sortOrder: 1,
      dropId: activeDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
    include: { variants: true },
  });

  const product2 = await prisma.product.create({
    data: {
      name: "Moletom Canguru Imortal Heavyweight",
      slug: "moletom-canguru-imortal-heavyweight",
      description:
        "Moletom 3 cabos flanelado de altíssima gramatura (380g). Capuz duplo reforçado, bolso frontal estilo canguru e bordado de alta precisão no peito.",
      priceCents: 21990, // R$ 219,90
      images: [
        "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&auto=format&fit=crop&q=80",
      ],
      sortOrder: 2,
      dropId: activeDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
    include: { variants: true },
  });

  const product3 = await prisma.product.create({
    data: {
      name: "Regata Atlética Imortal Dry-Fit",
      slug: "regata-atletica-imortal-dryfit",
      description:
        "Tecnologia Dry-Fit respirável com rápida evaporação de suor. Ideal para jogos, treinos e integrar a torcida nos eventos esportivos.",
      priceCents: 6990, // R$ 69,90
      images: [
        "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&auto=format&fit=crop&q=80",
      ],
      sortOrder: 3,
      dropId: activeDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
    include: { variants: true },
  });

  const product4 = await prisma.product.create({
    data: {
      name: "Boné Snapback Imortal Trucker",
      slug: "bone-snapback-imortal-trucker",
      description:
        "Boné modelo Trucker com tela respirável nas costas, fecho regulador snapback e patch frontal emborrachado com o escudo da Atlética.",
      priceCents: 5990, // R$ 59,90
      images: [
        "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&auto=format&fit=crop&q=80",
      ],
      sortOrder: 4,
      dropId: activeDrop.id,
      variants: {
        create: [
          {
            size: "Único",
            sortOrder: 1,
          },
        ],
      },
    },
    include: { variants: true },
  });

  const product5 = await prisma.product.create({
    data: {
      name: "Caneca Alumínio 850ml com Tirante Imortal",
      slug: "caneca-aluminio-850ml-com-tirante-imortal",
      description:
        "Caneca oficial em alumínio reforçado com pintura eletrostática preta e estampa em serigrafia. Acompanha tirante acetinado exclusivo de 1,40m com mosquetão metálico.",
      priceCents: 4990, // R$ 49,90
      images: [
        "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1588444839799-aea08566ef13?w=800&auto=format&fit=crop&q=80",
      ],
      sortOrder: 5,
      dropId: activeDrop.id,
      variants: {
        create: [
          {
            size: "Único",
            sortOrder: 1,
          },
        ],
      },
    },
    include: { variants: true },
  });

  // Upcoming Drop Product
  await prisma.product.create({
    data: {
      name: "Jaqueta Corta-Vento Imortal Tech",
      slug: "jaqueta-corta-vento-imortal-tech",
      description:
        "Tecido impermeável com forro interno em rede, capuz ajustável e zíper selado. Lançamento exclusivo para o próximo campeonato.",
      priceCents: 24990, // R$ 249,90
      images: [
        "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80",
      ],
      sortOrder: 1,
      dropId: upcomingDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
  });

  // Past Drop Product
  await prisma.product.create({
    data: {
      name: "Camisa Edição Especial Fundadores (Branca)",
      slug: "camisa-edicao-especial-fundadores-branca",
      description:
        "Camisa comemorativa de fundação. Tecido premium de alta densidade com detalhes dourados bordados.",
      priceCents: 9990, // R$ 99,90
      images: [
        "https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?w=800&auto=format&fit=crop&q=80",
      ],
      sortOrder: 1,
      dropId: pastDrop.id,
      variants: {
        create: apparelSizes.map((size, idx) => ({
          size,
          sortOrder: idx + 1,
        })),
      },
    },
  });

  console.log("Seeding Orders across all statuses...");

  // 1. Order Status: PENDING
  await prisma.order.create({
    data: {
      accessToken: "token_order_pending_1001",
      customerName: "Lucas Silva",
      customerEmail: "lucas.silva@gmail.com",
      customerPhone: "(85) 99123-4567",
      status: OrderStatus.PENDING,
      cancelableUntil: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
      totalPriceCents: 17980,
      items: {
        create: [
          {
            productId: product1.id,
            variantId: product1.variants.find((v) => v.size === "M")?.id,
            productName: product1.name,
            dropName: activeDrop.name,
            variantSize: "M",
            unitPriceCents: product1.priceCents,
            quantity: 2,
          },
        ],
      },
    },
  });

  // 2. Order Status: PAID
  await prisma.order.create({
    data: {
      accessToken: "token_order_paid_1002",
      customerName: "Mariana Costa",
      customerEmail: "mariana.costa@outlook.com",
      customerPhone: "(85) 98877-6655",
      status: OrderStatus.PAID,
      cancelableUntil: new Date(now.getTime() + 120 * 60 * 1000), // 2 hours from now
      totalPriceCents: 27980,
      items: {
        create: [
          {
            productId: product2.id,
            variantId: product2.variants.find((v) => v.size === "G")?.id,
            productName: product2.name,
            dropName: activeDrop.name,
            variantSize: "G",
            unitPriceCents: product2.priceCents,
            quantity: 1,
          },
          {
            productId: product4.id,
            variantId: product4.variants[0]?.id,
            productName: product4.name,
            dropName: activeDrop.name,
            variantSize: "Único",
            unitPriceCents: product4.priceCents,
            quantity: 1,
          },
        ],
      },
    },
  });

  // 3. Order Status: READY_FOR_PICKUP
  await prisma.order.create({
    data: {
      accessToken: "token_order_pickup_1003",
      customerName: "Gabriel Santos",
      customerEmail: "gabriel.santos@eng.ufc.br",
      customerPhone: "(85) 99654-3210",
      status: OrderStatus.READY_FOR_PICKUP,
      cancelableUntil: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Expired cancel window
      totalPriceCents: 16970,
      items: {
        create: [
          {
            productId: product3.id,
            variantId: product3.variants.find((v) => v.size === "GG")?.id,
            productName: product3.name,
            dropName: activeDrop.name,
            variantSize: "GG",
            unitPriceCents: product3.priceCents,
            quantity: 1,
          },
          {
            productId: product5.id,
            variantId: product5.variants[0]?.id,
            productName: product5.name,
            dropName: activeDrop.name,
            variantSize: "Único",
            unitPriceCents: product5.priceCents,
            quantity: 2,
          },
        ],
      },
    },
  });

  // 4. Order Status: COMPLETED
  await prisma.order.create({
    data: {
      accessToken: "token_order_completed_1004",
      customerName: "Beatriz Lima",
      customerEmail: "beatriz.lima@yahoo.com",
      customerPhone: "(85) 98765-4321",
      status: OrderStatus.COMPLETED,
      cancelableUntil: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      totalPriceCents: 8990,
      items: {
        create: [
          {
            productId: product1.id,
            variantId: product1.variants.find((v) => v.size === "P")?.id,
            productName: product1.name,
            dropName: activeDrop.name,
            variantSize: "P",
            unitPriceCents: product1.priceCents,
            quantity: 1,
          },
        ],
      },
    },
  });

  // 5. Order Status: CANCELLED
  await prisma.order.create({
    data: {
      accessToken: "token_order_cancelled_1005",
      customerName: "Pedro Henrique",
      customerEmail: "pedro.henrique@gmail.com",
      customerPhone: "(85) 99988-7766",
      status: OrderStatus.CANCELLED,
      cancelableUntil: new Date(now.getTime() - 10 * 60 * 1000),
      totalPriceCents: 6990,
      items: {
        create: [
          {
            productId: product3.id,
            variantId: product3.variants.find((v) => v.size === "M")?.id,
            productName: product3.name,
            dropName: activeDrop.name,
            variantSize: "M",
            unitPriceCents: product3.priceCents,
            quantity: 1,
          },
        ],
      },
    },
  });

  console.log("Seeding Admin User...");
  const { auth } = await import("../src/lib/auth");
  const adminEmail = "admin@imortalstore.com";

  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingUser) {
    try {
      await auth.api.signUpEmail({
        body: {
          email: adminEmail,
          password: "adminpassword123",
          name: "Administrador Imortal",
        },
      });
      console.log(`Admin user created successfully!`);
      console.log(`E-mail: ${adminEmail} | Senha: adminpassword123`);
    } catch (error) {
      console.error("Error creating admin user:", error);
    }
  } else {
    console.log(`Admin user (${adminEmail}) already exists.`);
  }

  console.log("✅ Seed completed successfully!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
