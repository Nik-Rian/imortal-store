"use client";

import { useState, ChangeEvent } from "react";
import { slugify } from "@/lib/utils";
import { Product } from "@/types";

interface ProductFormProps {
  action: (formData: FormData) => Promise<void>;
  initialData?: Product;
}

export function ProductForm({ action, initialData }: ProductFormProps) {
  const isEditMode = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    
    // In edit mode, preserve the existing slug so links don't break.
    // In creation mode, it auto-generates perfectly.
    if (!isEditMode) {
      setSlug(slugify(value));
    }
  };

  return (
    <form action={action} className="space-y-4 bg-white p-6 border rounded-md shadow-sm">
      {/* Hidden input ensures the server action still receives the slug value */}
      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-zinc-900">Nome do Produto</label>
        <input 
          type="text" id="name" name="name" required
          value={name}
          onChange={handleNameChange}
          className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
        />
        <p className="text-xs text-zinc-500 mt-1">
          Link permanente: <span className="font-mono bg-zinc-50 text-zinc-700 px-1 py-0.5 rounded">{slug || "..."}</span>
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium text-zinc-900">Descrição</label>
        <textarea 
          id="description" name="description" rows={4}
          defaultValue={initialData?.description ?? ""}
          className="w-full flex rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="price" className="text-sm font-medium text-zinc-900">Preço (em centavos)</label>
        <input 
          type="number" id="price" name="price" required
          defaultValue={initialData?.price ?? ""}
          className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
        />
        <p className="text-xs text-zinc-500">Ex: 15000 para R$ 150,00</p>
      </div>

      <div className="pt-4 flex justify-end">
        <button 
          type="submit"
          style={{ cursor: "pointer" }}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors"
        >
          {isEditMode ? "Salvar Alterações" : "Salvar Produto"}
        </button>
      </div>
    </form>
  );
}