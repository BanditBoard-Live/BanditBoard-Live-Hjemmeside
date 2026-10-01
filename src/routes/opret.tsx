import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { SiteShell } from "@/components/site-shell";
import { AuthCard, Field, inputClass, Submit, SwitchLink } from "@/components/auth-card";
import { authClient } from "@/lib/auth/client";
import { rememberSession } from "@/lib/remember-session";
import { saveMyProfile } from "@/lib/venues";

export const Route = createFileRoute("/opret")({ component: SignupPage });

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    venueName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    postalCode: "",
    city: "",
    password: "",
    again: "",
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Adgangskoden skal være mindst 8 tegn.");
      return;
    }
    if (form.password !== form.again) {
      setError("Adgangskoderne er ikke ens.");
      return;
    }
    setPending(true);
    const result = await authClient.signUp.email({
      name: form.venueName.trim() || form.contactName.trim() || "Min klub",
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (result.error) {
      setPending(false);
      const message = result.error.message?.trim() ?? "";
      setError(
        message && !/internal server error|failed to fetch/i.test(message)
          ? message
          : "Kontoen kunne ikke gemmes. Databasen er ikke sat op endnu.",
      );
      return;
    }
    await rememberSession(result.data?.token);
    try {
      await saveMyProfile({
        data: {
          venueName: form.venueName.trim() || form.contactName.trim() || "Min klub",
          contactName: form.contactName.trim(),
          email: form.email,
          phone: form.phone,
          address: form.address,
          postalCode: form.postalCode,
          city: form.city,
          notes: "",
          accessCode: "",
        },
      });
    } catch {
      /* profilen oprettes også når kontoen åbnes */
    }
    await navigate({ to: "/konto" });
  }

  return (
    <SiteShell>
      <AuthCard
        title="Opret bruger"
        lede="Den første bruger bliver administrator og kan oprette pubber med deres egen kode."
        footer={
          <>
            Har du allerede en kode? <SwitchLink to="/login">Log ind</SwitchLink>
          </>
        }
      >
        <form className="grid gap-4" onSubmit={onSubmit}>
          <Field label="Klub, pub eller sted">
            <input className={inputClass} required value={form.venueName} onChange={(e) => set("venueName", e.target.value)} placeholder="Sanderum Pubben" />
          </Field>
          <Field label="Kontaktperson">
            <input className={inputClass} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className={inputClass} type="email" autoComplete="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Telefon">
            <input className={inputClass} type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Adresse">
            <input className={inputClass} autoComplete="street-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label="Postnr.">
              <input className={inputClass} autoComplete="postal-code" value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
            </Field>
            <Field label="By">
              <input className={inputClass} autoComplete="address-level2" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
          </div>
          <Field label="Adgangskode">
            <input className={inputClass} type="password" autoComplete="new-password" required value={form.password} onChange={(e) => set("password", e.target.value)} />
          </Field>
          <Field label="Gentag adgangskode">
            <input className={inputClass} type="password" autoComplete="new-password" required value={form.again} onChange={(e) => set("again", e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Submit pending={pending}>Opret bruger</Submit>
        </form>
      </AuthCard>
    </SiteShell>
  );
}
