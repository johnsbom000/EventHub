import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Lightbulb, Bug, Paperclip, X, CheckCircle2, Loader2 } from "lucide-react";

type FeedbackType = "feature_request" | "bug_report";

interface FeedbackModalProps {
  open: boolean;
  type: FeedbackType;
  onOpenChange: (open: boolean) => void;
}

const config = {
  feature_request: {
    icon: Lightbulb,
    iconColor: "text-amber-500",
    title: "Request a Feature",
    description: "Have an idea that would make EventHub better? We'd love to hear it.",
    titlePlaceholder: "What feature are you requesting?",
    descriptionPlaceholder: "Describe the feature and why it would be useful…",
    submitLabel: "Submit Request",
    successTitle: "Feature request submitted!",
    successMessage: "Thanks for sharing your idea. We review every submission.",
  },
  bug_report: {
    icon: Bug,
    iconColor: "text-red-500",
    title: "Report a Bug",
    description: "Something not working right? Tell us what happened so we can fix it.",
    titlePlaceholder: "Briefly describe the bug",
    descriptionPlaceholder: "What did you expect to happen? What happened instead? Steps to reproduce…",
    submitLabel: "Submit Report",
    successTitle: "Bug report submitted!",
    successMessage: "Thanks for letting us know. We'll look into it.",
  },
};

export default function FeedbackModal({ open, type, onOpenChange }: FeedbackModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cfg = config[type];
  const Icon = cfg.icon;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/feedback/attachment", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      return data.url as string;
    },
    onSuccess: (url) => {
      setAttachmentUrl(url);
      setUploadError(null);
    },
    onError: () => {
      setUploadError("File upload failed. You can still submit without an attachment.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/feedback", {
        type,
        title: title.trim(),
        description: description.trim(),
        attachmentUrl: attachmentUrl ?? undefined,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentFile(file);
    setAttachmentUrl(null);
    setUploadError(null);
    uploadMutation.mutate(file);
  };

  const removeAttachment = () => {
    setAttachmentFile(null);
    setAttachmentUrl(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after close animation
    setTimeout(() => {
      setTitle("");
      setDescription("");
      setAttachmentFile(null);
      setAttachmentUrl(null);
      setUploadError(null);
      setSubmitted(false);
    }, 200);
  };

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    !submitMutation.isPending &&
    !uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <h3 className="text-lg font-semibold">{cfg.successTitle}</h3>
              <p className="text-sm text-muted-foreground mt-1">{cfg.successMessage}</p>
            </div>
            <Button onClick={handleClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
                {cfg.title}
              </DialogTitle>
              <DialogDescription>{cfg.description}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 pt-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="feedback-title">Title</Label>
                <Input
                  id="feedback-title"
                  placeholder={cfg.titlePlaceholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  disabled={submitMutation.isPending}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="feedback-description">Description</Label>
                <Textarea
                  id="feedback-description"
                  placeholder={cfg.descriptionPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  disabled={submitMutation.isPending}
                  className="resize-none"
                />
              </div>

              {/* Attachment */}
              <div className="flex flex-col gap-1.5">
                <Label>Attachment <span className="text-muted-foreground font-normal">(optional)</span></Label>
                {attachmentFile ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm truncate flex-1">{attachmentFile.name}</span>
                    <button
                      type="button"
                      onClick={removeAttachment}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      disabled={submitMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitMutation.isPending}
                  >
                    <Paperclip className="h-4 w-4" />
                    Attach a file
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {uploadError && (
                  <p className="text-xs text-destructive">{uploadError}</p>
                )}
              </div>

              {submitMutation.isError && (
                <p className="text-sm text-destructive">
                  Something went wrong. Please try again.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={handleClose} disabled={submitMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={!canSubmit}
                >
                  {submitMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
                  ) : cfg.submitLabel}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
