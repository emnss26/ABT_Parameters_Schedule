import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

function TreeNode({ node, selectedId, setSelected, depth = 0 }) {
  const [open, setOpen] = useState(false);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  const handleExpand = (e) => {
    e.stopPropagation(); // Prevent selecting the radio when toggling expand/collapse
    setOpen((prev) => !prev);
  };

  return (
    <div
      style={{ marginLeft: depth * 16 }}
      className="flex items-center"
    >
      {hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={handleExpand}
          className="mr-1 flex items-center"
        >
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      ) : (
        <span style={{ width: 18 }} className="inline-block" />
      )}

      <label className="flex w-full cursor-pointer items-center gap-2 py-0.5">
        <input
          type="radio"
          checked={selectedId === node.id}
          onChange={() => setSelected(node.id)}
          className="accent-[rgb(170,32,47)]"
        />
        <Folder size={15} className="text-gray-500" />
        <span className={selectedId === node.id ? "font-bold text-[rgb(170,32,47)]" : ""}>
          {node.name}
        </span>
      </label>

      {open && hasChildren && (
        <div className="w-full">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              setSelected={setSelected}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SelectFolderModal({
  open,
  onClose,
  folderTree,
  onSave,
  selectedFolderId,
}) {
  const [selected, setSelected] = useState(selectedFolderId || null);

  useEffect(() => {
    setSelected(selectedFolderId || null);
  }, [selectedFolderId]);

  const handleSave = () => {
    if (selected) onSave(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[75vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select the folder that contains the plans</DialogTitle>
        </DialogHeader>

        <div className="rounded border bg-gray-50 p-2">
          {Array.isArray(folderTree) && folderTree.length > 0 ? (
            folderTree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                selectedId={selected}
                setSelected={setSelected}
              />
            ))
          ) : (
            <div className="p-6 text-gray-500">Loading folders...</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-[rgb(170,32,47)] text-white"
            disabled={!selected}
            onClick={handleSave}
          >
            Save selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
