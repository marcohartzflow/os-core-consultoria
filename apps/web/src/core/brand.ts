import { Compass, Sparkles } from "lucide-react";

/**
 * The client's brand, in one place. Re-branding the demo for another company touches only:
 *   1. COMPANY below (name, domain, logo, the person who signs in, the sign-in screen copy);
 *   2. src/app/brand.css (the brand colour);
 *   3. the logo file in public/brand/ (or `logo: null` to draw the name as text).
 * Everything else (sidebar, sign-in, page titles, the assistant's prompt, seeded e-mails) reads from here.
 */
export const COMPANY = {
  /** Short name, the way the owner says it: "Vértice", not "Vértice Consultoria Empresarial Ltda". */
  name: "CoreOS",
  /** How sentences refer to the company ("o sistema interno da sua empresa"): generic by default, the full name when branded for one client. */
  fullName: "sua empresa",
  /** One line about the company, for the assistant's prompt. */
  about: "consultoria empresarial de gestão e processos, compliance e LGPD, meio ambiente e estratégia",
  /** E-mail domain of the seeded team. */
  domain: "empresa.com.br",
  /** Logo in public/brand/ (PNG, SVG or JPG). null draws `name` as a text wordmark. */
  logo: null as string | null,
  /** True when the logo is drawn dark (black on transparent): it is inverted on dark surfaces. */
  logoIsDark: true,
  /** The person who signs in during the video: greeting, avatar, the assistant's "quem fala com você". */
  owner: { first: "User", last: "", role: "Administrador" },
  /** Sign-in screen, left panel. */
  headline: "Projetos, reuniões e horas de cada cliente num lugar só.",
  pitch: "Cada projeto com o que foi combinado em reunião, as entregas e as horas contra o orçado, e um assistente que avisa quando um pedido do cliente ficou sem dono.",
};

/** Full name of the person who signs in ("User" in the generic demo, no surname). */
export const OWNER_NAME = [COMPANY.owner.first, COMPANY.owner.last].filter(Boolean).join(" ");

/** Name of the portal: page titles, sign-in screen, sidebar, footer. */
export const PRODUCT_NAME = COMPANY.name.endsWith("OS") ? COMPANY.name : `${COMPANY.name}OS`;

/** Mark next to the portal's name where there is no logo room (favicon-sized spots). */
export const ProductMark = Compass;

/**
 * Name of the agent where it stands alone: menu, buttons, titles, labels. Sentences that mention it
 * ("o assistente quer…") are written out where they appear, for their grammar; a fork that renames
 * the agent also reviews them (search for "assistente").
 */
export const AGENT_NAME = "Assistente";

/** Mark of the agent: menu entry and the button that opens its window. */
export const AgentMark = Sparkles;
