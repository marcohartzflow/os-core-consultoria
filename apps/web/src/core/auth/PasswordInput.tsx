"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/**
 * Longest password the API accepts, in UTF-16 units (what `maxLength` counts): 4 × 128. The password
 * policy counts Unicode code points (at most 128) and one can take two units, so the policy's limit,
 * with its own message, is the one that applies.
 */
export const PASSWORD_MAX_LENGTH = 512;

/** Password field with a show/hide toggle; the value is never logged or stored anywhere else. */
export function PasswordInput(props: Omit<React.ComponentProps<typeof InputGroupInput>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput maxLength={PASSWORD_MAX_LENGTH} {...props} type={visible ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
