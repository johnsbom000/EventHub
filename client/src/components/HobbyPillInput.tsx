import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  HOBBY_MAX_ITEMS,
  normalizeHobbyInput,
  normalizeHobbyLabel,
  normalizeHobbyList,
  serializeHobbyList,
} from "@shared/hobby-tags";

type HobbyPillInputProps = {
  id: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  spellCheck?: boolean;
  inputTestId?: string;
  pillClassName?: string;
  pillRemoveButtonClassName?: string;
  addButtonClassName?: string;
};

export default function HobbyPillInput({
  id,
  value,
  onChange,
  placeholder = "Add a hobby",
  disabled = false,
  spellCheck,
  inputTestId,
  pillClassName,
  pillRemoveButtonClassName,
  addButtonClassName,
}: HobbyPillInputProps) {
  const hobbies = useMemo(() => normalizeHobbyList(value), [value]);
  const [draft, setDraft] = useState("");

  const addHobby = (raw: string) => {
    if (disabled) return;
    const next = normalizeHobbyLabel(raw);
    if (!next) return;
    if (hobbies.length >= HOBBY_MAX_ITEMS) return;

    const exists = hobbies.some((entry) => entry.toLowerCase() === next.toLowerCase());
    if (exists) {
      setDraft("");
      return;
    }

    onChange(serializeHobbyList([...hobbies, next]));
    setDraft("");
  };

  const removeHobby = (index: number) => {
    if (disabled) return;
    const remaining = hobbies.filter((_, currentIndex) => currentIndex !== index);
    onChange(serializeHobbyList(remaining));
  };

  return (
    <div className="space-y-3">
      {hobbies.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {hobbies.map((hobby, index) => (
            <span
              key={`${hobby}-${index}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-[rgba(154,172,180,0.65)] bg-[#f0eee9] px-3 py-1 text-sm",
                pillClassName,
              )}
            >
              {hobby}
              <button
                type="button"
                aria-label={`Remove ${hobby}`}
                className={cn("text-muted-foreground hover:text-foreground", pillRemoveButtonClassName)}
                onClick={() => removeHobby(index)}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={spellCheck}
          data-testid={inputTestId}
          onChange={(event) => setDraft(normalizeHobbyInput(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addHobby(draft);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          className={cn(addButtonClassName)}
          disabled={disabled}
          onClick={() => addHobby(draft)}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
