import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function SelectModelsModal({
  models = [],
  open,
  onClose,
  onSave,
  initialSelectedIds = [],
  loading = false,
}) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(Array.isArray(initialSelectedIds) ? initialSelectedIds : []);
  }, [open, initialSelectedIds]);

  const handleToggle = (modelId) => {
    setSelected((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selected);
      setSelected([]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
        <DialogContent>
        <DialogHeader>
          <DialogTitle>Selecciona los modelos a analizar</DialogTitle>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto py-4">
          {loading ? (
            <span className="text-gray-500">Cargando modelos...</span>
          ) : Array.isArray(models) && models.length > 0 ? (
            models.map((model) => (
              <label
                key={model.id}
                className="flex cursor-pointer items-center gap-3 rounded px-2 py-1 hover:bg-accent"
              >
                <Checkbox
                  id={model.id}
                  checked={selected.includes(model.id)}
                  onCheckedChange={() => handleToggle(model.id)}
                  disabled={saving}
                  className="mr-2"
                />
                <span className="font-medium">{model.name}</span>
              </label>
            ))
          ) : (
            <span className="text-gray-500">No hay modelos disponibles para seleccionar.</span>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="bg-[rgb(170,32,47)] text-white"
            disabled={selected.length === 0 || saving}
            onClick={handleSave}
          >
            {saving ? "Guardando..." : "Guardar seleccion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
