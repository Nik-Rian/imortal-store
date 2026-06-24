import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const products = [
  {
    name: 'Imortal Classic Tee',
    slug: 'imortal-classic-tee',
    description: 'The definitive classic. Made from 100% heavyweight organic cotton, featuring a minimalist screen-printed logo on the chest. Designed to last a lifetime.',
    price: 4500, // $45.00
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80'
    ],
  },
  {
    name: 'Cyberpunk Tech Hoodie',
    slug: 'cyberpunk-tech-hoodie',
    description: 'Water-resistant technical fabric meets street aesthetics. Features modular pockets, an adjustable oversized hood, and subtle geometric branding.',
    price: 11000, // $110.00
    images: [
      'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&auto=format&fit=crop&q=80'
    ],
  },
  {
    name: 'Minimalist Leather Wallet',
    slug: 'minimalist-leather-wallet',
    description: 'Full-grain vegetable-tanned leather that develops a beautiful patina over time. Holds up to 8 cards and folded bills without the bulk.',
    price: 6500, // $65.00
    images: [
      'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1588444839799-aea08566ef13?w=800&auto=format&fit=crop&q=80'
    ],
  }
];

async function main() {
  console.log('Initializing pooled database adapter...');
  
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log('Cleaning up database...');
  await prisma.product.deleteMany();

  console.log('Seeding products...');
  for (const product of products) {
    await prisma.product.create({
      data: product,
    });
  }

  console.log('Seeding completed successfully!');
  
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });