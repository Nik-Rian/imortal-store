import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

const prismaClientSingleton = () => {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
  }
  
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Export the singleton instance
export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

// If we are not in production, attach it to the global object to survive HMR
if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}