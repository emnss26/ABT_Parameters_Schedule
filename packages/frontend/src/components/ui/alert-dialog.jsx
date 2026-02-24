import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef(function AlertDialogOverlay(
  { className, ...props },
  ref
) {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  );
});

const AlertDialogContent = React.forwardRef(function AlertDialogContent(
  { className, ...props },
  ref
) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]",
          "rounded-lg border bg-background p-6 shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
          "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
});

function AlertDialogHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className
      )}
      {...props}
    />
  );
}

const AlertDialogTitle = React.forwardRef(function AlertDialogTitle(
  { className, ...props },
  ref
) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
});

const AlertDialogDescription = React.forwardRef(function AlertDialogDescription(
  { className, ...props },
  ref
) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});

const baseBtn =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50";

const AlertDialogAction = React.forwardRef(function AlertDialogAction(
  { className, ...props },
  ref
) {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(
        baseBtn,
        "bg-primary text-primary-foreground hover:bg-primary/90",
        className
      )}
      {...props}
    />
  );
});

const AlertDialogCancel = React.forwardRef(function AlertDialogCancel(
  { className, ...props },
  ref
) {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(
        baseBtn,
        "border bg-background hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    />
  );
});

AlertDialogOverlay.displayName = "AlertDialogOverlay";
AlertDialogContent.displayName = "AlertDialogContent";
AlertDialogTitle.displayName = "AlertDialogTitle";
AlertDialogDescription.displayName = "AlertDialogDescription";
AlertDialogAction.displayName = "AlertDialogAction";
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
