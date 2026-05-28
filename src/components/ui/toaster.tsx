import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Toaster() {
  const { toasts } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    });
  };

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const isError = variant === "destructive";
        const fullText = description ? `${title || ""}\n${description}` : title || "";

        return (
          <Toast key={id} {...props} variant={variant}>
            <div className="grid gap-1 flex-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <div className="flex items-start gap-2">
                  <ToastDescription className="flex-1">{description}</ToastDescription>
                  {isError && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-70 hover:opacity-100"
                      onClick={() => copyToClipboard(fullText.trim())}
                      title="Copy error message"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
