import { Command, Sparkles } from "lucide-react";

/**
 * The portal's name and marks, in one place: a fork renames the portal here and in
 * `OS_MAIL_PORTAL_NAME` (e-mails, authenticator apps and the agent's system prompt on the API).
 * The marks are icons drawn with `currentColor`, so they follow the shadcn preset like any text.
 */

/** Name of the portal: page titles, sign-in screen, sidebar, footer. */
export const PRODUCT_NAME = "OS";

/** Mark next to the portal's name. */
export const ProductMark = Command;

/**
 * Name of the agent where it stands alone: menu, buttons, titles, labels. Sentences that mention it
 * ("o assistente quer…") are written out where they appear, for their grammar; a fork that renames
 * the agent also reviews them (search for "assistente").
 */
export const AGENT_NAME = "Assistente";

/** Mark of the agent: menu entry and the button that opens its window. */
export const AgentMark = Sparkles;
