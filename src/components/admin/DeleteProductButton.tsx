"use client";

import { useTransition } from "react";
import { deleteProduct } from "@/actions/product.actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TrashIcon, CircleNotchIcon } from "@phosphor-icons/react";

interface DeleteProductButtonProps {
  productId: string;
  productName?: string;
}

export function DeleteProductButton({ productId, productName }: DeleteProductButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteProduct(productId);
      } catch (error) {
        console.error("Erro ao excluir produto:", error);
      }
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            title="Excluir produto"
          >
            <TrashIcon className="size-4" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Excluir Produto</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o produto{" "}
            {productName ? <strong className="text-foreground">{productName}</strong> : "selecionado"}? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <CircleNotchIcon className="mr-2 size-4 animate-spin" />
                Excluindo...
              </>
            ) : (
              "Excluir"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


